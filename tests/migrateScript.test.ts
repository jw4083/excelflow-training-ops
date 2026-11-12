// 이전 스크립트(scripts/migrate-multi-course.mjs) 예행연습: 운영 표는 건드리지 않고 임시 스키마에 가짜 예전 데이터를 만들어 돌려 본다.
// 미리 보기는 아무것도 남기지 않고, 적용은 복사·백업·검증을 하며, 다시 실행해도 안전한지 본다. DATABASE_URL이 없으면 건너뛴다.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    return readFileSync(path.resolve(__dirname, "..", ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}
const URL = databaseUrl();
const SCHEMA = `mig_test_${Math.random().toString(36).slice(2, 10)}`;
const T0 = "2026-11-12T09:00:00+09:00";

const legacy = {
  course: { name: "예전 과정", startDate: "2026-12-01", endDate: "2026-12-03", place: "교육장", notice: "", replyDeadline: "2026-11-20T18:00:00+09:00", updatedAt: T0, capacity: 5 },
  trainees: [
    { id: "t1", empNo: "001234", name: "가짜1", dept: "부서", status: "선정", isManual: false, loginFails: 3, createdAt: T0, updatedAt: T0 },
    { id: "t2", empNo: "100002", name: "가짜2", dept: "부서", status: "대기", isManual: false, waitNo: 1, loginFails: 5, lockedUntil: "2099-01-01T00:00:00.000Z", createdAt: T0, updatedAt: T0 },
  ],
  selections: [{ id: "s1", at: T0, kind: "선별", traineeIds: ["t1"] }],
  draws: [{ id: "d1", executedAt: T0, seats: 5, waitSeats: 1, selected: ["t1"], waitlist: ["t2"], rejected: [] }],
  replies: [{ traineeId: "t1", attend: true, laptop: true, submittedAt: T0, byAdmin: false }],
  history: [{ id: "h1", at: T0, kind: "추첨", before: null, after: { seats: 5 } }],
};

const run = (...args: string[]) =>
  spawnSync(process.execPath, ["scripts/migrate-multi-course.mjs", ...args], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: URL, MIGRATION_SCHEMA: SCHEMA },
    encoding: "utf8",
  });

describe.skipIf(!URL)("DB 이전 스크립트 예행연습 (임시 스키마)", () => {
  let admin: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(URL as string, { max: 1, prepare: false });
    await admin.unsafe(`create schema ${SCHEMA}`);
    await admin.unsafe(`create table ${SCHEMA}.app_state (id int primary key check (id = 1), data jsonb not null, updated_at timestamptz not null default now())`);
    await admin`insert into ${admin(SCHEMA)}.app_state (id, data) values (1, ${admin.json(legacy as never)})`;
  }, 60000);
  afterAll(async () => {
    await admin?.unsafe(`drop schema if exists ${SCHEMA} cascade`);
    await admin?.end({ timeout: 5 });
  }, 60000);

  it("미리 보기는 검증까지 하지만 DB에 아무것도 남기지 않는다", async () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("검증 통과");
    const tables = await admin`select table_name from information_schema.tables where table_schema = ${SCHEMA} order by 1`;
    expect(tables.map((x) => x.table_name)).toEqual(["app_state"]);
  }, 60000);

  it("적용하면 첫 번째 과정으로 그대로 복사되고, 백업이 남고, 예전 표는 그대로이며, 개인정보는 출력하지 않는다", async () => {
    const r = run("--apply");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("적용 완료");
    expect(r.stdout + r.stderr).not.toMatch(/가짜1|가짜2|001234/);
    const rows = await admin.unsafe(`select data from ${SCHEMA}.course_state`);
    expect(rows).toHaveLength(1);
    const { createdAt, ...copy } = rows[0].data as Record<string, unknown>;
    expect(createdAt).toBeDefined();
    expect(copy).toEqual(legacy); // 한 글자도 바뀌지 않았다
    const backup = await admin.unsafe(`select count(*)::int as n from information_schema.tables where table_schema = '${SCHEMA}' and table_name like 'app_state_backup_%'`);
    expect(backup[0].n).toBe(1);
    expect((await admin.unsafe(`select data from ${SCHEMA}.app_state`))[0].data).toEqual(legacy); // 원본 그대로
    const login = await admin.unsafe(`select emp_no, fails, locked_until is not null as locked from ${SCHEMA}.login_attempts order by emp_no`);
    expect(login.map((x) => [x.emp_no, x.fails, x.locked])).toEqual([["001234", 3, false], ["100002", 5, true]]);
  }, 60000);

  it("다시 실행해도 과정이 늘어나지 않는다", async () => {
    const r = run("--apply");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("이미 이전되어 있습니다");
    expect((await admin.unsafe(`select count(*)::int as n from ${SCHEMA}.course_state`))[0].n).toBe(1);
  }, 60000);
});
