// 작업 18 확인용 검사: 회신 입력 규칙, 기한·충원 확정 차단, 상태 변경과 이력 (PRD M2-3·M2-4·M2-6·M2-7·M2-8).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkReplyAllowed, replyFormState, replyStatusAction, validateReplyInput } from "@/domain/replyRules";
import type { Course, Trainee } from "@/domain/types";
import { submitReply } from "@/lib/reply";
import { FileStore } from "@/store/fileStore";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const DEADLINE = "2026-11-20T18:00:00+09:00";
const AFTER = "2026-11-21T09:00:00+09:00";
const DETAIL = "출장 일정과 겹쳐 참석이 어렵습니다."; // 10자 이상

describe("작업 18: 회신 입력 검사", () => {
  it("참석 여부를 고르지 않으면 거부한다", () => {
    expect(validateReplyInput({})).toMatchObject({ ok: false, errors: { attend: expect.any(String) } });
  });

  it("불참은 사유 구분과 상세(10~300자)가 모두 있어야 한다", () => {
    expect(validateReplyInput({ attend: false })).toMatchObject({
      ok: false,
      errors: { absentType: expect.any(String), absentDetail: expect.any(String) },
    });
    expect(validateReplyInput({ attend: false, absentType: "업무", absentDetail: "짧아요" })).toMatchObject({
      ok: false,
      errors: { absentDetail: expect.stringContaining("10자 이상 300자 이하") },
    });
    expect(validateReplyInput({ attend: false, absentType: "휴가", absentDetail: DETAIL })).toMatchObject({
      ok: false,
      errors: { absentType: expect.any(String) },
    });
  });

  it("상세 사유는 정확히 10자·300자까지 허용하고 301자는 거부한다 (앞뒤 공백은 세지 않는다)", () => {
    const ok = (detail: string) => validateReplyInput({ attend: false, absentType: "기타", absentDetail: detail }).ok;
    expect(ok("가".repeat(9))).toBe(false);
    expect(ok("가".repeat(10))).toBe(true);
    expect(ok("가".repeat(300))).toBe(true);
    expect(ok("가".repeat(301))).toBe(false);
    expect(ok("  " + "가".repeat(9) + "  ")).toBe(false);
  });

  it("불참이면 노트북·룸메이트 값은 저장하지 않는다", () => {
    const r = validateReplyInput({
      attend: false,
      absentType: "업무",
      absentDetail: DETAIL,
      laptop: true,
      roommateName: "홍길동",
      roommateDept: "총무부",
    });
    expect(r).toEqual({ ok: true, value: { attend: false, absentType: "업무", absentDetail: DETAIL, laptop: false } });
  });

  it("참석은 노트북 지참 여부가 필요하고, 사유 칸은 저장하지 않는다", () => {
    expect(validateReplyInput({ attend: true })).toMatchObject({ ok: false, errors: { laptop: expect.any(String) } });
    expect(validateReplyInput({ attend: true, laptop: false, absentDetail: "무시" })).toEqual({
      ok: true,
      value: { attend: true, laptop: false },
    });
  });

  it("룸메이트는 이름과 부서를 둘 다 쓰거나 둘 다 비워야 한다 (직접 입력, 앞뒤 공백 제거)", () => {
    expect(validateReplyInput({ attend: true, laptop: true, roommateName: "홍길동" })).toMatchObject({
      ok: false,
      errors: { roommate: expect.stringContaining("이름과 부서") },
    });
    expect(validateReplyInput({ attend: true, laptop: true, roommateDept: "총무부" }).ok).toBe(false);
    expect(validateReplyInput({ attend: true, laptop: true, roommateName: " 홍길동 ", roommateDept: " 총무부 " })).toEqual({
      ok: true,
      value: { attend: true, laptop: true, roommateName: "홍길동", roommateDept: "총무부" },
    });
    expect(validateReplyInput({ attend: true, laptop: true, roommateName: "가".repeat(51), roommateDept: "총무부" }).ok).toBe(false);
  });

  it("회신이 상태를 바꾸는 경우: 선정→불참, 불참→참석만", () => {
    expect(replyStatusAction("선정", false)).toBe("불참회신");
    expect(replyStatusAction("불참", true)).toBe("참석재회신");
    expect(replyStatusAction("선정", true)).toBeNull();
    expect(replyStatusAction("불참", false)).toBeNull();
  });
});

describe("작업 18: 기한·상태·충원 확정 검사", () => {
  const course = { replyDeadline: DEADLINE };
  it("기한 전 선정·불참은 가능, 기한이 지나면 교육생은 불가·담당자 대리는 가능", () => {
    expect(checkReplyAllowed({ status: "선정" }, course, true, NOW).ok).toBe(true);
    expect(checkReplyAllowed({ status: "선정" }, course, true, AFTER)).toMatchObject({ ok: false, reason: expect.stringContaining("담당자에게 문의") });
    expect(checkReplyAllowed({ status: "선정" }, course, true, AFTER, true).ok).toBe(true);
  });

  it("개별 기한이 우선한다", () => {
    expect(checkReplyAllowed({ status: "선정", replyDeadline: "2026-11-30T18:00:00+09:00" }, course, true, AFTER).ok).toBe(true);
  });

  it("충원이 확정된 불참자는 참석으로 못 바꾼다 (담당자 대리도 불가), 불참 유지 수정은 가능", () => {
    const t = { status: "불참" as const, replacedBy: "x" };
    expect(checkReplyAllowed(t, course, true, NOW)).toMatchObject({ ok: false, reason: expect.stringContaining("충원") });
    expect(checkReplyAllowed(t, course, true, NOW, true).ok).toBe(false);
    expect(checkReplyAllowed(t, course, false, NOW).ok).toBe(true);
    expect(replyFormState(t, course, NOW)).toMatchObject({ open: false });
  });

  it("선정·불참이 아니면 회신할 수 없고, 기한이 정해져 있지 않아도 막는다", () => {
    for (const status of ["신청", "대기", "미선정", "제외"] as const) {
      expect(checkReplyAllowed({ status }, course, true, NOW).ok).toBe(false);
    }
    expect(checkReplyAllowed({ status: "선정" }, null, true, NOW).ok).toBe(false);
  });

  it("양식 상태: 기한 전이면 열려 있고 지나면 닫힌다", () => {
    expect(replyFormState({ status: "선정" }, course, NOW)).toEqual({ open: true });
    expect(replyFormState({ status: "선정" }, course, AFTER)).toMatchObject({ open: false, reason: expect.stringContaining("기한") });
  });
});

describe("작업 18: 회신 제출 저장", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "reply-test-"));
    store = new FileStore(path.join(dir, "db.json"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const trainee = (id: string, extra: Partial<Trainee> = {}): Trainee => ({
    id,
    empNo: id === "t1" ? "100001" : "100002",
    name: `김테스트${id}`,
    dept: "인재개발부",
    status: "선정",
    isManual: false,
    loginFails: 0,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  });
  const course: Course = {
    name: "테스트 과정",
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    place: "교육장",
    notice: "안내",
    replyDeadline: DEADLINE,
    updatedAt: T0,
  };
  const seed = (...t: Trainee[]) => store.commit({ course, upsertTrainees: t });
  const attend = { attend: true, laptop: true, roommateName: "홍길동", roommateDept: "총무부" };
  const absent = { attend: false, absentType: "업무", absentDetail: DETAIL };

  it("선정자의 참석 회신은 저장되고 상태는 그대로이며 회신 이력이 남는다", async () => {
    await seed(trainee("t1"));
    const r = await submitReply(store, "t1", attend, { now: NOW });
    expect(r.ok).toBe(true);
    const data = await store.readAll();
    expect(data.trainees[0].status).toBe("선정");
    expect(data.replies).toEqual([{ traineeId: "t1", attend: true, laptop: true, roommateName: "홍길동", roommateDept: "총무부", submittedAt: NOW, byAdmin: false }]);
    expect(data.history).toHaveLength(1);
    expect(data.history[0]).toMatchObject({ kind: "회신", traineeId: "t1", before: null });
  });

  it("몇 번이든 수정할 수 있고 마지막 제출이 기준이다 (바뀐 항목만 이력에 남는다)", async () => {
    await seed(trainee("t1"));
    await submitReply(store, "t1", attend, { now: NOW });
    await submitReply(store, "t1", { ...attend, laptop: false }, { now: "2026-11-16T09:00:00+09:00" });
    const data = await store.readAll();
    expect(data.replies).toHaveLength(1);
    expect(data.replies[0].laptop).toBe(false);
    expect(data.history).toHaveLength(2);
    expect(data.history[1]).toMatchObject({ before: { laptop: true }, after: { laptop: false } });
  });

  it("같은 내용을 다시 내면 이력은 늘지 않고 제출 시각만 갱신된다", async () => {
    await seed(trainee("t1"));
    await submitReply(store, "t1", attend, { now: NOW });
    await submitReply(store, "t1", attend, { now: "2026-11-16T09:00:00+09:00" });
    const data = await store.readAll();
    expect(data.history).toHaveLength(1);
    expect(data.replies[0].submittedAt).toBe("2026-11-16T09:00:00+09:00");
  });

  it("불참 회신: 상태가 불참이 되고 상태 이력과 회신 이력이 함께 남는다", async () => {
    await seed(trainee("t1"));
    expect((await submitReply(store, "t1", absent, { now: NOW })).ok).toBe(true);
    const data = await store.readAll();
    expect(data.trainees[0].status).toBe("불참");
    expect(data.replies[0]).toMatchObject({ attend: false, absentType: "업무", absentDetail: DETAIL });
    expect(data.history.map((h) => h.kind).sort()).toEqual(["불참", "회신"]);
  });

  it("불참 후 충원 전이면 참석으로 다시 회신할 수 있다 (불참 → 선정)", async () => {
    await seed(trainee("t1", { status: "불참" }));
    expect((await submitReply(store, "t1", attend, { now: NOW })).ok).toBe(true);
    expect((await store.readAll()).trainees[0].status).toBe("선정");
  });

  it("충원이 확정된 불참자의 참석 회신은 거부되고 아무것도 저장되지 않는다", async () => {
    await seed(trainee("t1", { status: "불참", replacedBy: "t2" }), trainee("t2"));
    const r = await submitReply(store, "t1", attend, { now: NOW });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("충원") });
    const data = await store.readAll();
    expect(data.replies).toEqual([]);
    expect(data.history).toEqual([]);
    expect(data.trainees.find((t) => t.id === "t1")?.status).toBe("불참");
  });

  it("기한이 지나면 거부되고, 담당자 대리 입력은 기한 후에도 저장되며 이력이 '회신대리입력'이다", async () => {
    await seed(trainee("t1"));
    expect(await submitReply(store, "t1", attend, { now: AFTER })).toMatchObject({ ok: false, reason: expect.stringContaining("기한") });
    expect((await store.readAll()).replies).toEqual([]);
    expect((await submitReply(store, "t1", attend, { now: AFTER, byAdmin: true })).ok).toBe(true);
    const data = await store.readAll();
    expect(data.replies[0].byAdmin).toBe(true);
    expect(data.history[0].kind).toBe("회신대리입력");
  });

  it("입력이 틀리면 칸별 오류를 돌려주고 저장하지 않는다", async () => {
    await seed(trainee("t1"));
    const r = await submitReply(store, "t1", { attend: false, absentType: "업무", absentDetail: "짧음" }, { now: NOW });
    expect(r).toMatchObject({ ok: false, errors: { absentDetail: expect.any(String) } });
    expect((await store.readAll()).replies).toEqual([]);
  });

  it("선정·불참이 아닌 교육생(대기 등)이나 없는 교육생은 거부한다", async () => {
    await seed(trainee("t1", { status: "대기" }));
    expect((await submitReply(store, "t1", attend, { now: NOW })).ok).toBe(false);
    expect((await submitReply(store, "nobody", attend, { now: NOW })).ok).toBe(false);
  });

  it("다른 사람의 회신은 건드리지 않는다", async () => {
    await seed(trainee("t1"), trainee("t2"));
    await submitReply(store, "t1", attend, { now: NOW });
    await submitReply(store, "t2", absent, { now: NOW });
    const data = await store.readAll();
    expect(data.replies.find((r) => r.traineeId === "t1")?.attend).toBe(true);
    expect(data.trainees.find((t) => t.id === "t1")?.status).toBe("선정");
    expect(data.trainees.find((t) => t.id === "t2")?.status).toBe("불참");
  });
});
