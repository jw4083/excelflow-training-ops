// 여러 과정 운영으로 바꾸기 위한 DB 이전 스크립트 (Supabase/Postgres). 예전(과정 1개) 데이터를 "첫 번째 과정"으로 그대로 옮긴다.
//
// 실행:
//   node scripts/migrate-multi-course.mjs            ← 미리 보기: 전부 실행해 본 뒤 되돌린다 (DB에 아무것도 남기지 않음)
//   node scripts/migrate-multi-course.mjs --apply    ← 실제 적용
//
// 하는 일 (모두 한 거래 안에서 — 중간에 실패하면 아무것도 바뀌지 않는다):
//   1. 새 표 만들기: course_state(과정마다 한 행), login_attempts(사번별 로그인 실패 기록) + 행 접근 규칙(RLS) 켜기
//   2. 예전 표 app_state 를 app_state_backup_<날짜> 로 복사해 백업 (원본 app_state 는 지우지 않고 그대로 둔다)
//   3. 예전 데이터를 새 과정 한 행으로 "그대로" 복사 (내용은 한 글자도 바꾸지 않고 만든 일시만 붙인다)
//   4. 예전 교육생의 로그인 실패 기록(잠금 중인 것)을 사번별 기록으로 옮기기
//   5. 검증: 복사본이 원본과 완전히 같은지, 교육생·선별·추첨·회신·이력 개수가 같은지 확인 — 다르면 거부하고 되돌린다
// 이미 이전했으면(course_state 에 과정이 있으면) 아무것도 하지 않는다 (다시 실행해도 안전).
// 접속 정보(DATABASE_URL)는 환경 변수나 .env 에서 읽고, 화면에 출력하지 않는다. 개인정보도 출력하지 않고 개수만 보여 준다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const apply = process.argv.includes("--apply");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    return readFileSync(path.join(root, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const url = databaseUrl();
if (!url) {
  console.error("DATABASE_URL이 없습니다 (.env 또는 환경 변수). 이전할 DB를 알 수 없어 중단합니다.");
  process.exit(1);
}

class DryRun extends Error {}
// MIGRATION_SCHEMA: 검사용. 운영 표(public)를 건드리지 않고 임시 스키마에서 예행연습할 때만 쓴다.
const schema = process.env.MIGRATION_SCHEMA;
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, ...(schema ? { connection: { search_path: schema } } : {}) });
const COUNT_KEYS = ["trainees", "selections", "draws", "replies", "history"];
const counts = (data) => Object.fromEntries(COUNT_KEYS.map((k) => [k, Array.isArray(data?.[k]) ? data[k].length : 0]));

try {
  await sql.begin(async (tx) => {
    // 1. 새 표 (없을 때만)
    await tx`create table if not exists course_state (
      course_id uuid primary key default gen_random_uuid(),
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
    await tx`create table if not exists login_attempts (
      emp_no text primary key,
      fails int not null default 0,
      locked_until timestamptz,
      updated_at timestamptz not null default now()
    )`;
    await tx`alter table course_state enable row level security`;
    await tx`alter table login_attempts enable row level security`;

    const [{ n: existing }] = await tx`select count(*)::int as n from course_state`;
    if (existing > 0) {
      console.log(`이미 이전되어 있습니다 (과정 ${existing}개). 아무것도 바꾸지 않았습니다.`);
      if (!apply) throw new DryRun();
      return;
    }

    // 2. 예전 표 확인
    const [{ has }] = await tx`select to_regclass('app_state') is not null as has`;
    const legacy = has ? (await tx`select data from app_state where id = 1`)[0]?.data : undefined;
    if (!legacy) {
      console.log("예전 데이터(app_state)가 없습니다. 새 표만 만들었고, 과정은 앱의 「새 과정 만들기」로 만들면 됩니다.");
      if (!apply) throw new DryRun();
      return;
    }
    const before = counts(legacy);
    console.log("예전 데이터:", JSON.stringify(before), legacy.course ? "(과정 정보 있음)" : "(과정 정보 아직 없음)");

    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const backup = `app_state_backup_${stamp}`;
    await tx.unsafe(`create table if not exists ${backup} as select * from app_state`); // 이름은 위에서 만든 고정 형식이다
    console.log(`백업: ${backup} (원본 app_state 는 그대로 남겨 둠)`);

    // 3. 첫 번째 과정으로 복사 (내용은 그대로, 만든 일시만 추가)
    const createdAt = legacy.course?.updatedAt ?? new Date().toISOString();
    const [{ course_id: courseId }] = await tx`
      insert into course_state (data) values (${tx.json({ ...legacy, createdAt })}) returning course_id
    `;

    // 4. 로그인 실패 기록: 잠금 중이거나 실패 횟수가 남은 교육생만 사번별 기록으로
    let moved = 0;
    for (const t of legacy.trainees ?? []) {
      if (!(t.loginFails > 0) && !t.lockedUntil) continue;
      await tx`
        insert into login_attempts (emp_no, fails, locked_until) values (${t.empNo}, ${t.loginFails ?? 0}, ${t.lockedUntil ?? null})
        on conflict (emp_no) do update set fails = greatest(login_attempts.fails, excluded.fails),
          locked_until = coalesce(excluded.locked_until, login_attempts.locked_until)
      `;
      moved++;
    }

    // 5. 검증: 원본과 복사본이 완전히 같은지 (만든 일시만 뺀다)
    const [check] = await tx`
      select (c.data - 'createdAt') = a.data as same, c.data as copy
      from course_state c, app_state a where c.course_id = ${courseId} and a.id = 1
    `;
    const after = counts(check.copy);
    if (!check.same || JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Error(`검증 실패: 복사본이 원본과 다릅니다 (원본 ${JSON.stringify(before)}, 복사본 ${JSON.stringify(after)}). 아무것도 적용하지 않고 되돌립니다.`);
    }
    console.log(`검증 통과: 복사본이 원본과 같습니다 ${JSON.stringify(after)}, 로그인 실패 기록 ${moved}건 이전`);
    if (!apply) throw new DryRun();
    console.log(`적용 완료: 첫 번째 과정 번호 ${courseId}`);
  });
  if (!apply) console.log("\n(미리 보기였습니다. 실제로 적용하려면 --apply 를 붙여 다시 실행하세요.)");
} catch (error) {
  if (error instanceof DryRun) {
    console.log("\n미리 보기 완료: 모두 정상이었고 DB에는 아무것도 남기지 않았습니다. 실제 적용은 --apply 를 붙여 실행하세요.");
  } else {
    console.error("이전 실패 — 아무것도 바뀌지 않았습니다:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
