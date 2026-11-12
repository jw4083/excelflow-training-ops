// 작업 23: 핵심 규칙 통합 검사 (DESIGN 8.1). 규칙마다 흩어진 단위 검사와 달리, 실제 저장소(FileStore)에 여러 기능을 이어 붙여
// "불참 → 알림 → 충원 → 참석 재회신" 같은 흐름이 규칙대로 이어지는지 본다. 가짜 데이터만 쓴다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { vacancyAlert } from "@/domain/alerts";
import { capacitySummary, seatsToDraw } from "@/domain/capacity";
import { fillCandidates } from "@/domain/fill";
import type { Course, Trainee } from "@/domain/types";
import { confirmFill, excludeSelected } from "@/lib/fill";
import { addManualTrainee } from "@/lib/manualAdd";
import { submitReply } from "@/lib/reply";
import { FileStore } from "@/store/fileStore";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const AFTER_COURSE_DEADLINE = "2026-11-22T12:00:00+09:00";
const COURSE_DEADLINE = "2026-11-20T18:00:00+09:00";
const absent = { attend: false, absentType: "업무", absentDetail: "출장 일정이 겹쳐 참석이 어렵습니다" };
const attend = { attend: true, laptop: true };

let dir: string;
let store: FileStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "core-rules-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const t = (id: string, empNo: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: `부서${id}`,
  status,
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const course = (capacity?: number): Course => ({
  name: "테스트 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: COURSE_DEADLINE,
  capacity,
  updatedAt: T0,
});
const seed = (capacity: number | undefined, ...list: Trainee[]) => store.commit({ course: course(capacity), upsertTrainees: list });
const alertOf = async () => vacancyAlert((await store.readAll()).trainees);

describe("작업 23: 불참 → 알림 → 충원 → 재회신 흐름 (#26 #27 #31 #12 #22)", () => {
  it("알림 건수: 불참자 없음 0 → 불참 2명 2 → 1명 충원 확정 1 → 나머지 참석 재회신 0 → 대리 입력 불참으로 다시 1", async () => {
    await seed(10, t("s1", "100001", "선정"), t("s2", "100002", "선정"), t("w1", "100003", "대기", { waitNo: 1 }));
    expect((await alertOf()).total).toBe(0);

    await submitReply(store, "s1", absent, { now: NOW });
    await submitReply(store, "s2", absent, { now: NOW });
    expect(await alertOf()).toMatchObject({ total: 2, absent: 2 });

    await confirmFill(store, { targetId: "s1", candidateId: "w1", replyDeadline: "2026-11-18T12:00:00+09:00" }, { now: NOW });
    expect((await alertOf()).total).toBe(1);

    await submitReply(store, "s2", attend, { now: NOW }); // 충원 전이라 참석으로 복귀 가능
    expect((await alertOf()).total).toBe(0);

    // 참석 → 불참은 참석 취소라 최종 확인이 필요하다 (담당자 대리 입력도 같음)
    await submitReply(store, "s2", absent, { now: AFTER_COURSE_DEADLINE, byAdmin: true, confirmed: true });
    expect((await alertOf()).total).toBe(1);
  });

  it("충원 확정된 불참자만 남으면 알림 0 (#27)", async () => {
    await seed(10, t("abs", "100001", "불참", { replacedBy: "x" }));
    expect((await alertOf()).total).toBe(0);
  });

  it("제외 직후 알림 +1, 후보는 대기 앞 순번, 확정하면 replacedBy 기록 + 알림 −1 (#31)", async () => {
    await seed(10, t("s", "100001", "선정"), t("w2", "100003", "대기", { waitNo: 2 }), t("w1", "100002", "대기", { waitNo: 1 }));
    await excludeSelected(store, "s", "부서 사정", { now: NOW });
    expect((await alertOf()).excluded).toBe(1);
    const data = await store.readAll();
    expect(fillCandidates(data.trainees)).toMatchObject({ mode: "waitlist", candidate: { id: "w1" } });
    await confirmFill(store, { targetId: "s", candidateId: "w1", replyDeadline: "2026-11-18T12:00:00+09:00" }, { now: NOW });
    const after = await store.readAll();
    expect(after.trainees.find((x) => x.id === "s")?.replacedBy).toBe("w1");
    expect((await alertOf()).total).toBe(0);
  });

  it("후보를 제시(조회)만 해서는 상태가 바뀌지 않고, 두 번째 충원은 남은 대기자 중 가장 앞 순번을 제시한다 (#12 #22)", async () => {
    await seed(10, t("a1", "100001", "불참"), t("a2", "100002", "불참"), t("w1", "100003", "대기", { waitNo: 1 }), t("w2", "100004", "대기", { waitNo: 2 }));
    const before = JSON.stringify((await store.readAll()).trainees);
    fillCandidates((await store.readAll()).trainees);
    expect(JSON.stringify((await store.readAll()).trainees)).toBe(before); // 제시만으로는 변화 없음

    await confirmFill(store, { targetId: "a1", candidateId: "w1", replyDeadline: "2026-11-18T12:00:00+09:00" }, { now: NOW });
    const second = fillCandidates((await store.readAll()).trainees);
    expect(second).toMatchObject({ mode: "waitlist", candidate: { id: "w2", waitNo: 2 } }); // 번호를 당기지 않음
  });
});

describe("작업 23: 회신·기한·충원 확정 (#10 #15 #17 #30)", () => {
  it("충원 확정 뒤에는 그 불참자가 참석으로 바꿀 수 없다 (#10)", async () => {
    await seed(10, t("a", "100001", "선정"), t("w", "100002", "대기", { waitNo: 1 }));
    await submitReply(store, "a", absent, { now: NOW });
    await confirmFill(store, { targetId: "a", candidateId: "w", replyDeadline: "2026-11-18T12:00:00+09:00" }, { now: NOW });
    // 충원이 확정되면 불참자는 "제외"가 되어 더 이상 회신 대상이 아니므로 참석 회신은 어떤 방법으로도 거부된다
    expect((await submitReply(store, "a", attend, { now: NOW })).ok).toBe(false);
    expect((await submitReply(store, "a", attend, { now: NOW, byAdmin: true })).ok).toBe(false);
  });

  it("불참 → 기한 전·충원 전 참석 재제출은 허용되고 상태가 불참 → 선정 (#15)", async () => {
    await seed(10, t("a", "100001", "선정"));
    await submitReply(store, "a", absent, { now: NOW });
    expect((await store.readAll()).trainees[0].status).toBe("불참");
    expect((await submitReply(store, "a", attend, { now: NOW })).ok).toBe(true);
    expect((await store.readAll()).trainees[0].status).toBe("선정");
  });

  it("같은 사람이 3번 제출하면 마지막 제출본이 기준이다 (#17)", async () => {
    await seed(10, t("a", "100001", "선정"));
    await submitReply(store, "a", { attend: true, laptop: true }, { now: NOW });
    await submitReply(store, "a", { attend: true, laptop: false, roommateName: "갑", roommateDept: "을부" }, { now: "2026-11-16T09:00:00+09:00" });
    await submitReply(store, "a", { attend: true, laptop: true, roommateName: "병", roommateDept: "정부" }, { now: "2026-11-17T09:00:00+09:00" });
    const reply = await store.getReply("a");
    expect(reply).toMatchObject({ laptop: true, roommateName: "병", submittedAt: "2026-11-17T09:00:00+09:00" });
    expect((await store.readAll()).replies).toHaveLength(1);
  });

  it("과정 기한이 지난 뒤 충원된 사람은 개별 기한이 남았으면 제출 가능, 개별 기한도 지나면 거부 + 담당자 문의 (#30)", async () => {
    await seed(10, t("a", "100001", "불참"), t("w", "100002", "대기", { waitNo: 1 }));
    const personal = "2026-11-25T18:00:00+09:00";
    await confirmFill(store, { targetId: "a", candidateId: "w", replyDeadline: personal }, { now: AFTER_COURSE_DEADLINE });
    expect((await submitReply(store, "w", attend, { now: AFTER_COURSE_DEADLINE })).ok).toBe(true);
    const late = await submitReply(store, "w", attend, { now: "2026-11-26T09:00:00+09:00" });
    expect(late).toMatchObject({ ok: false, reason: expect.stringContaining("담당자에게 문의") });
  });

  it("개별 기한이 없는 사람은 과정 기한이 적용된다 (#30)", async () => {
    await seed(10, t("a", "100001", "선정"));
    expect((await submitReply(store, "a", attend, { now: AFTER_COURSE_DEADLINE })).ok).toBe(false);
    expect((await submitReply(store, "a", attend, { now: NOW })).ok).toBe(true);
  });
});

describe("작업 23: 정원 계산 (#32 #33)", () => {
  it("정원 20, 선정 18이면 빈자리 2 / 수기 추가로 21명이 되면 정원 초과 1명", () => {
    const sel = (n: number) => Array.from({ length: n }, () => ({ status: "선정" as const }));
    expect(capacitySummary(20, sel(18))).toMatchObject({ capacity: 20, selected: 18, vacancies: 2, over: 0 });
    expect(capacitySummary(20, sel(21))).toMatchObject({ vacancies: 0, over: 1 });
  });

  it("추첨 인원: 정원 20, 1차 선별 8명이면 12명 / 정원 8, 선별 8명이면 0명(추첨 불가)", () => {
    const sel = Array.from({ length: 8 }, () => ({ status: "선정" as const }));
    expect(seatsToDraw(20, sel)).toBe(12);
    expect(seatsToDraw(8, sel)).toBe(0);
  });

  it("수기 추가로 정원을 넘으면 확인 후에만 추가되고 요약에 '정원 초과'가 반영된다", async () => {
    await seed(1, t("a", "100001", "선정"));
    expect(await addManualTrainee(store, { empNo: "100002", name: "추가", dept: "부서", reason: "사유" }, { now: NOW })).toMatchObject({ ok: false, needsOverConfirm: true });
    await addManualTrainee(store, { empNo: "100002", name: "추가", dept: "부서", reason: "사유", confirmOver: true }, { now: NOW });
    const d = await store.readAll();
    expect(capacitySummary(d.course?.capacity, d.trainees).over).toBe(1);
  });
});

describe("작업 23: 교육생 조회·저장 창구 (#16 #18 #23)", () => {
  it("교육생용 조회는 본인 한 명의 자료만 돌려준다 (다른 교육생 이름·부서가 없다) (#16 #23)", async () => {
    await seed(10, t("a", "100001", "선정"), t("b", "100002", "선정"), t("c", "100003", "대기", { waitNo: 1 }));
    const me = await store.getTraineeByEmpNo("100001");
    expect(me?.id).toBe("a");
    const json = JSON.stringify(me);
    for (const other of ["이름b", "부서b", "이름c", "부서c", "100002", "100003"]) expect(json).not.toContain(other);
    expect(await store.getTraineeByEmpNo("999999")).toBeNull();
  });

  it("저장 창구에는 추첨 기록·이력·교육생의 수정·삭제 메서드가 없다 (#18)", () => {
    const methods = Object.getOwnPropertyNames(FileStore.prototype).filter((n) => n !== "constructor");
    expect(methods.filter((n) => /delete|remove|destroy|clear|drop|truncate|update/i.test(n))).toEqual([]);
  });

  it("이력은 추가만 된다: 같은 id를 다시 저장하면 거부되고 기존 이력은 그대로다", async () => {
    await seed(10, t("a", "100001", "선정"));
    await submitReply(store, "a", absent, { now: NOW });
    const first = (await store.readAll()).history[0];
    await expect(store.commit({ appendHistory: [{ ...first, kind: "추첨" }] })).rejects.toThrow();
    expect((await store.readAll()).history[0]).toEqual(first);
  });
});

describe("작업 23: 실습용 비밀번호는 코드에 없다 (#29)", () => {
  /** 소스·검사 파일 전체에서 `.env`의 비밀 값이 글자 그대로 쓰였는지 찾는다. 값은 화면에 출력하지 않고 파일 이름만 알린다. */
  async function filesContaining(needle: string): Promise<string[]> {
    const root = path.resolve(__dirname, "..");
    const hits: string[] = [];
    async function walk(d: string) {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else if (/\.(ts|tsx|mjs|mts|json|md)$/.test(e.name) && (await readFile(p, "utf8")).includes(needle)) hits.push(path.relative(root, p));
      }
    }
    await walk(path.join(root, "src"));
    await walk(path.join(root, "tests"));
    return hits;
  }

  it(".env의 비밀번호 값이 src·tests 어디에도 글자 그대로 들어 있지 않다", async () => {
    let env = "";
    try {
      env = await readFile(path.resolve(__dirname, "..", ".env"), "utf8");
    } catch {
      return; // .env가 없는 환경(CI 등)에서는 비교할 값이 없다
    }
    for (const key of ["TRAINEE_TEST_PASSWORD", "ADMIN_PASSWORD", "SESSION_SECRET"]) {
      const m = env.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "m"));
      const value = m?.[1].trim().replace(/^["']|["']$/g, "");
      if (!value) continue;
      // 값이 8글자 이상이면 src·tests 전체에서, 더 짧으면(흔한 글자와 겹칠 수 있어) 로그인·인증을 다루는 파일에서 따옴표 글자 값("값")으로 쓰였는지 본다
      if (value.length >= 8) {
        expect(await filesContaining(value), `${key} 값이 코드에 직접 쓰여 있습니다`).toEqual([]);
      } else {
        const authFiles = ["src/lib/auth.ts", "src/app/actions/auth.ts", "src/app/actions/trainee.ts", "src/app/trainee/trainee-login-form.tsx", "src/app/login-form.tsx", "src/proxy.ts"];
        for (const f of authFiles) {
          const text = await readFile(path.resolve(__dirname, "..", f), "utf8");
          for (const quote of ["\"", "'", "`"]) {
            expect(text.includes(quote + value + quote), `${key} 값이 ${f}에 직접 쓰여 있습니다`).toBe(false);
          }
        }
      }
    }
  });
});
