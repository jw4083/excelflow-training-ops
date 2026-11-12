// 참석 회신 후 교육 전 불참 변경(참석 취소) 검사.
// 회신 기한(R)과 참석 취소 마감(C)·교육 시작(S)의 경계 시각, 최종 확인, 중복 제출, 이력, 집계, 충원 후 복구 차단, 예전 데이터 호환을 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isNewCancel, vacancyAlert } from "@/domain/alerts";
import { capacitySummary } from "@/domain/capacity";
import { buildCourse, parseCourseForm, type CourseFormValues } from "@/domain/course";
import { buildExportRows, EXPORT_COLUMNS } from "@/domain/exportRoster";
import { actorOf } from "@/domain/historyView";
import { selfReplyMode } from "@/domain/replyRules";
import { buildReplyRows, filterReplyRows, summarizeReplies } from "@/domain/replyStatus";
import { replyLabel } from "@/domain/roster";
import type { Course, Reply, Trainee } from "@/domain/types";
import { acknowledgeCancel } from "@/lib/cancel";
import { confirmFill } from "@/lib/fill";
import { submitReply } from "@/lib/reply";
import { FileStore } from "@/store/fileStore";

const T0 = "2026-11-12T09:00:00+09:00";
const BEFORE_R = "2026-11-15T12:00:00+09:00";
const R = "2026-11-20T18:00:00+09:00"; // 과정 회신 기한
const C = "2026-11-27T18:00:00+09:00"; // 참석 취소 마감
const S = "2026-12-01T09:00:00+09:00"; // 교육 시작 (2026-12-01 09:00)
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
const BETWEEN = "2026-11-24T10:00:00+09:00"; // R과 C 사이
const AFTER_C = plus(C, 60_000);
const FUTURE = "2026-11-30T12:00:00+09:00";

const course: Course = {
  name: "테스트",
  startDate: "2026-12-01",
  startTime: "09:00",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: R,
  cancelDeadline: C,
  capacity: 2,
  updatedAt: T0,
};

const t = (id: string, empNo: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: "부서",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const attend = { attend: true, laptop: true };
const absent = { attend: false, absentType: "업무", absentDetail: "긴급 감사 대응으로 참석이 어렵습니다" };

let dir: string;
let store: FileStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "cancel-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const seed = (c: Course | null, ...list: Trainee[]) => store.commit({ ...(c ? { course: c } : {}), upsertTrainees: list });
const get = async (id: string) => (await store.readAll()).trainees.find((x) => x.id === id)!;

/** 선정자 a가 기한 전에 참석으로 회신해 둔 상태 (대기 w 1명) */
async function attendedBeforeR(c: Course = course) {
  await seed(c, t("a", "100001", "선정"), t("b", "100002", "선정"), t("w", "100003", "대기", { waitNo: 1 }));
  const r = await submitReply(store, "a", attend, { now: BEFORE_R });
  expect(r.ok).toBe(true);
}

// ───────────────────────── 과정 입력: 시작 시각·참석 취소 마감 ─────────────────────────

describe("과정 정보: 참석 취소 마감은 회신 기한 ≤ 취소 마감 ≤ 교육 시작 (한국 시간)", () => {
  const valid: CourseFormValues = {
    name: "과정",
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    place: "교육장",
    notice: "",
    replyDeadline: "2026-11-20T18:00",
    startTime: "09:00",
    cancelDeadline: "2026-11-27T18:00",
  };
  const errorsOf = (v: Partial<CourseFormValues>) => {
    const r = parseCourseForm({ ...valid, ...v });
    return r.ok ? {} : r.errors;
  };

  it("올바른 값은 통과하고 +09:00으로 저장된다", () => {
    const r = parseCourseForm(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { course: c } = buildCourse(r.values, null, T0);
    expect(c).toMatchObject({ startTime: "09:00", cancelDeadline: "2026-11-27T18:00:00+09:00" });
  });

  it("취소 마감은 비워 둘 수 있고, 그러면 저장하지 않는다(예전 동작)", () => {
    const r = parseCourseForm({ ...valid, cancelDeadline: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(buildCourse(r.values, null, T0).course.cancelDeadline).toBeUndefined();
  });

  it("경계: 회신 기한과 같거나 교육 시작과 같으면 허용, 1분이라도 벗어나면 거부", () => {
    expect(errorsOf({ cancelDeadline: "2026-11-20T18:00" })).toEqual({});
    expect(errorsOf({ cancelDeadline: "2026-12-01T09:00" })).toEqual({});
    expect(errorsOf({ cancelDeadline: "2026-11-20T17:59" }).cancelDeadline).toContain("회신 기한과 같거나 그 이후");
    expect(errorsOf({ cancelDeadline: "2026-12-01T09:01" }).cancelDeadline).toBe(
      "참석 취소 마감은 교육 시작(2026-12-01 09:00)을 넘을 수 없습니다.",
    );
  });

  it("취소 마감을 쓰려면 시작 시각이 필요하고, 시작 시각 형식도 검사한다", () => {
    expect(errorsOf({ startTime: "" }).startTime).toContain("시작 시각 칸을 입력");
    expect(errorsOf({ startTime: "25:00" }).startTime).toContain("올바르지 않습니다");
    expect(errorsOf({ cancelDeadline: "2026-11-31T18:00" }).cancelDeadline).toContain("올바르지 않습니다"); // 없는 날짜
  });

  it("같은 순간이면(+00:00 표기라도) 바뀐 것으로 보지 않는다", () => {
    const r = parseCourseForm(valid);
    if (!r.ok) throw new Error("검사 실패");
    const stored: Course = { ...buildCourse(r.values, null, T0).course, cancelDeadline: "2026-11-27T09:00:00Z" };
    expect(buildCourse(r.values, stored, BEFORE_R).changed).toBe(false);
    expect(buildCourse({ ...r.values, startTime: "10:00" }, stored, BEFORE_R).changed).toBe(true);
  });
});

// ───────────────────────── 경계 시각 ─────────────────────────

describe("교육생 본인이 할 수 있는 회신 (경계 시각은 그 시각까지 포함)", () => {
  const sel = { status: "선정" as const };
  const attended: Pick<Reply, "attend"> = { attend: true };

  it("회신 기한 정각까지는 자유 회신, 1ms 뒤부터 참석자는 불참 변경만", () => {
    expect(selfReplyMode(sel, course, attended, R)).toEqual({ mode: "full" });
    expect(selfReplyMode(sel, course, attended, plus(R, 1))).toEqual({ mode: "cancelOnly" });
  });

  it("취소 마감 정각까지는 불참 변경 가능, 1ms 뒤부터 막고 담당자 문의 안내", () => {
    expect(selfReplyMode(sel, course, attended, C)).toEqual({ mode: "cancelOnly" });
    const after = selfReplyMode(sel, course, attended, plus(C, 1));
    expect(after).toMatchObject({ mode: "closed", reason: expect.stringContaining("참석 취소 마감(2026-11-27 18:00)이 지났습니다") });
    expect(after.mode === "closed" && after.reason).toContain("담당자에게 문의");
  });

  it("취소 마감 = 교육 시작이면 시작 1ms 전까지만 되고 시작 순간부터 막힌다", () => {
    const c2 = { ...course, cancelDeadline: S };
    expect(selfReplyMode(sel, c2, attended, plus(S, -1))).toEqual({ mode: "cancelOnly" });
    expect(selfReplyMode(sel, c2, attended, S)).toMatchObject({ mode: "closed", reason: expect.stringContaining("교육이 시작") });
  });

  it("개별 회신 기한이 교육 시작보다 늦어도 시작 순간부터 본인 변경은 막힌다", () => {
    expect(selfReplyMode({ status: "선정", replyDeadline: "2026-12-05T18:00:00+09:00" }, course, null, S)).toMatchObject({ mode: "closed" });
    expect(selfReplyMode({ status: "선정", replyDeadline: "2026-12-05T18:00:00+09:00" }, course, null, plus(S, -1))).toEqual({ mode: "full" });
  });

  it("회신 기한 뒤: 미회신자·처음부터 불참한 사람은 바꿀 수 없다", () => {
    expect(selfReplyMode(sel, course, null, BETWEEN)).toMatchObject({ mode: "closed", reason: expect.stringContaining("회신 기한이 지났습니다") });
    expect(selfReplyMode({ status: "불참", absentOrigin: "회신불참" }, course, { attend: false }, BETWEEN)).toMatchObject({ mode: "closed" });
  });

  it("참석 후 취소한 사람은 회신 기한 뒤에는 본인이 다시 참석할 수 없다 (담당자 문의)", () => {
    expect(selfReplyMode({ status: "불참", absentOrigin: "참석후취소" }, course, { attend: false }, BETWEEN)).toMatchObject({
      mode: "closed",
      reason: expect.stringContaining("다시 참석하려면 담당자에게 문의"),
    });
  });

  it("취소 마감이 없는 예전 과정은 회신 기한 뒤 모두 막힌다 (예전 동작)", () => {
    const legacy: Course = { ...course, cancelDeadline: undefined, startTime: undefined };
    expect(selfReplyMode(sel, legacy, attended, plus(R, 1))).toMatchObject({ mode: "closed", reason: expect.stringContaining("회신 기한") });
  });

  it("다른 시간대 표기(+00:00)로 저장된 기한도 같은 순간으로 비교한다", () => {
    const utc = { ...course, replyDeadline: "2026-11-20T09:00:00Z", cancelDeadline: "2026-11-27T09:00:00Z" };
    expect(selfReplyMode(sel, utc, attended, R)).toEqual({ mode: "full" }); // 한국 18:00 = UTC 09:00
    expect(selfReplyMode(sel, utc, attended, C)).toEqual({ mode: "cancelOnly" });
    expect(selfReplyMode(sel, utc, attended, plus(C, 1))).toMatchObject({ mode: "closed" });
  });
});

// ───────────────────────── 참석 취소 제출 ─────────────────────────

describe("참석 취소: 사유 필수, 최종 확인, 즉시 반영, 이력", () => {
  it("최종 확인 없이 보내면 저장하지 않고 확인을 요구한다", async () => {
    await attendedBeforeR();
    const r = await submitReply(store, "a", absent, { now: BETWEEN });
    expect(r).toMatchObject({ ok: false, needsConfirm: true });
    expect((await get("a")).status).toBe("선정");
    expect((await store.readAll()).history).toHaveLength(1); // 처음 참석 회신 1건만
  });

  it("사유가 없거나 10자 미만이면 확인 단계 전에 거부한다", async () => {
    await attendedBeforeR();
    const r = await submitReply(store, "a", { attend: false, absentType: "업무", absentDetail: "짧음" }, { now: BETWEEN, confirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors?.absentDetail).toBeDefined();
      expect(r.needsConfirm).toBeUndefined();
    }
    const r2 = await submitReply(store, "a", { attend: false, absentDetail: "긴급 감사 대응으로 참석이 어렵습니다" }, { now: BETWEEN, confirmed: true });
    expect(r2.ok === false && r2.errors?.absentType).toBeTruthy();
  });

  it("확인하면 즉시 불참이 되고, 경위·취소 시각과 이력 1건(변경 전후·시각·사유·본인)이 남는다", async () => {
    await attendedBeforeR();
    const r = await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    expect(r).toMatchObject({ ok: true, cancelled: true });
    const a = await get("a");
    expect(a).toMatchObject({ status: "불참", absentOrigin: "참석후취소", cancelledAt: BETWEEN, updatedAt: BETWEEN });
    expect(a.cancelSeenAt).toBeUndefined();

    const history = (await store.readAll()).history;
    expect(history).toHaveLength(2); // 처음 참석 회신 + 참석 취소 (회신 이력을 따로 만들지 않는다)
    const entry = history[1];
    expect(entry).toMatchObject({
      kind: "참석취소",
      traineeId: "a",
      at: BETWEEN,
      actor: "본인",
      reason: "업무: 긴급 감사 대응으로 참석이 어렵습니다",
      before: { status: "선정", attend: true, laptop: true },
      after: { status: "불참", absentOrigin: "참석후취소", cancelledAt: BETWEEN, attend: false, absentType: "업무", laptop: false },
    });
    expect(actorOf(entry)).toBe("본인");
  });

  it("회신 기한 뒤에는 참석자의 다른 수정(노트북 등)은 막는다", async () => {
    await attendedBeforeR();
    const r = await submitReply(store, "a", { attend: true, laptop: false }, { now: BETWEEN });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("불참으로 바꾸는 것만") });
  });

  it("취소 마감이 지나면 본인은 막히고, 담당자 대리 입력은 된다 (담당자 표시)", async () => {
    await attendedBeforeR();
    const self = await submitReply(store, "a", absent, { now: AFTER_C, confirmed: true });
    expect(self).toMatchObject({ ok: false, reason: expect.stringContaining("담당자에게 문의") });

    const admin = await submitReply(store, "a", absent, { now: AFTER_C, byAdmin: true, confirmed: true });
    expect(admin).toMatchObject({ ok: true, cancelled: true });
    const entry = (await store.readAll()).history.at(-1)!;
    expect(entry).toMatchObject({ kind: "참석취소", actor: "담당자" });
    expect((await get("a")).absentOrigin).toBe("참석후취소");
  });

  it("교육 시작 이후 담당자가 불참 처리하면 '시작후불참'으로 따로 분류되고 새 취소로 세지 않는다", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: plus(S, 60_000), byAdmin: true, confirmed: true });
    const a = await get("a");
    expect(a.absentOrigin).toBe("시작후불참");
    expect(isNewCancel(a)).toBe(false);
  });

  it("처음부터 불참으로 회신하면 '회신불참'이고 확인 단계가 없다 (예전과 같은 이력 종류)", async () => {
    await seed(course, t("a", "100001", "선정"));
    const r = await submitReply(store, "a", absent, { now: BEFORE_R });
    expect(r.ok).toBe(true);
    const a = await get("a");
    expect(a).toMatchObject({ status: "불참", absentOrigin: "회신불참" });
    expect(a.cancelledAt).toBeUndefined();
    const kinds = (await store.readAll()).history.map((h) => h.kind);
    expect(kinds).toEqual(["회신", "불참"]);
  });

  it("회신 기한 전에 참석 → 불참으로 바꿔도 '참석 후 취소'로 구분된다 (확인 필요)", async () => {
    await attendedBeforeR();
    expect(await submitReply(store, "a", absent, { now: BEFORE_R })).toMatchObject({ ok: false, needsConfirm: true });
    await submitReply(store, "a", absent, { now: BEFORE_R, confirmed: true });
    expect((await get("a")).absentOrigin).toBe("참석후취소");
  });
});

// ───────────────────────── 중복 제출 ─────────────────────────

describe("중복 제출", () => {
  it("같은 취소를 두 번 보내면 두 번째는 '이미 반영'으로 끝나고 이력이 늘지 않는다", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    const second = await submitReply(store, "a", absent, { now: plus(BETWEEN, 1000), confirmed: true });
    expect(second).toMatchObject({ ok: true, cancelled: true, unchanged: true });
    const d = await store.readAll();
    expect(d.history.filter((h) => h.kind === "참석취소")).toHaveLength(1);
    expect(d.trainees.find((x) => x.id === "a")?.cancelledAt).toBe(BETWEEN); // 처음 취소 시각 유지
  });

  it("사유를 바꿔 다시 보내면 회신 기한 뒤에는 막힌다 (이미 불참)", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    const r = await submitReply(store, "a", { ...absent, absentDetail: "다른 사유로 다시 적어 봅니다" }, { now: BETWEEN, confirmed: true });
    expect(r.ok).toBe(false);
  });
});

// ───────────────────────── 집계·알림·충원 ─────────────────────────

describe("집계와 새 취소 표시, 자동 충원 없음", () => {
  it("취소 즉시 선정 수 −1, 빈자리 +1, 충원 알림 +1, 새 취소 +1. 대기자는 그대로 대기 (자동 충원 없음)", async () => {
    await attendedBeforeR();
    const before = await store.readAll();
    expect(capacitySummary(2, before.trainees)).toMatchObject({ selected: 2, vacancies: 0 });

    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    const d = await store.readAll();
    expect(capacitySummary(2, d.trainees)).toMatchObject({ selected: 1, vacancies: 1 });
    expect(vacancyAlert(d.trainees)).toMatchObject({ total: 1, absent: 1, newCancels: 1 });
    expect(d.trainees.find((x) => x.id === "w")).toMatchObject({ status: "대기", waitNo: 1 });

    const rows = buildReplyRows(d.trainees, d.replies, d.course, BETWEEN);
    expect(summarizeReplies(rows)).toMatchObject({ attend: 0, absent: 1, cancelled: 1, newCancels: 1 });
    expect(filterReplyRows(rows, "cancelled").map((r) => r.trainee.id)).toEqual(["a"]);
  });

  it("담당자가 '확인'하면 새 취소만 사라지고 빈자리·충원 대기 순서(updatedAt)는 그대로다. 두 번 눌러도 같다", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    expect(await acknowledgeCancel(store, "a", FUTURE)).toEqual({ ok: true });
    expect(await acknowledgeCancel(store, "a", FUTURE)).toEqual({ ok: true, unchanged: true });
    const d = await store.readAll();
    const a = d.trainees.find((x) => x.id === "a")!;
    expect(a).toMatchObject({ cancelSeenAt: FUTURE, updatedAt: BETWEEN, status: "불참" });
    expect(vacancyAlert(d.trainees)).toMatchObject({ total: 1, newCancels: 0 });
  });

  it("담당자가 기존 충원 기능으로 확정하면 자리가 제외로 바뀌고, 경위는 남으며 새 취소에서 빠진다", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    expect(await confirmFill(store, { targetId: "a", candidateId: "w", replyDeadline: FUTURE }, { now: BETWEEN })).toEqual({ ok: true });
    const d = await store.readAll();
    expect(d.trainees.find((x) => x.id === "a")).toMatchObject({ status: "제외", replacedBy: "w", absentOrigin: "참석후취소" });
    expect(vacancyAlert(d.trainees)).toMatchObject({ total: 0, newCancels: 0 });
  });
});

// ───────────────────────── 참석 복구 ─────────────────────────

describe("참석 복구 범위", () => {
  it("회신 기한 전에는 본인이 다시 참석으로 바꿀 수 있고, 경위 표시가 지워진다", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BEFORE_R, confirmed: true });
    expect((await submitReply(store, "a", attend, { now: BEFORE_R })).ok).toBe(true);
    const a = await get("a");
    expect(a.status).toBe("선정");
    expect(a.absentOrigin).toBeUndefined();
    expect(a.cancelledAt).toBeUndefined();
  });

  it("회신 기한 뒤에는 본인 복구는 막히고 담당자 대리 입력으로만 복구된다", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    expect((await submitReply(store, "a", attend, { now: BETWEEN })).ok).toBe(false);
    const admin = await submitReply(store, "a", attend, { now: BETWEEN, byAdmin: true });
    expect(admin.ok).toBe(true);
    expect((await get("a")).status).toBe("선정");
  });

  it("충원이 확정된 뒤에는 본인도 담당자도 참석으로 되돌릴 수 없다 (기존 규칙 유지)", async () => {
    await attendedBeforeR();
    await submitReply(store, "a", absent, { now: BEFORE_R, confirmed: true });
    await confirmFill(store, { targetId: "a", candidateId: "w", replyDeadline: FUTURE }, { now: BEFORE_R });
    expect((await submitReply(store, "a", attend, { now: BEFORE_R })).ok).toBe(false);
    expect((await submitReply(store, "a", attend, { now: BEFORE_R, byAdmin: true })).ok).toBe(false);
    expect((await get("a")).status).toBe("제외");
  });
});

// ───────────────────────── 화면 표시·호환 ─────────────────────────

describe("표시와 예전 데이터 호환", () => {
  it("명단 회신 칸과 엑셀에 불참 경위가 구분되어 나온다", async () => {
    await attendedBeforeR();
    await seed(null, t("c", "100004", "선정"));
    await submitReply(store, "c", absent, { now: BEFORE_R });
    await submitReply(store, "a", absent, { now: BETWEEN, confirmed: true });
    const d = await store.readAll();
    const a = d.trainees.find((x) => x.id === "a")!;
    expect(replyLabel(a.status, { attend: false }, a.absentOrigin)).toBe("불참(참석 후 취소)");
    expect(replyLabel("불참", { attend: false }, "회신불참")).toBe("불참");

    const rows = buildExportRows(d.trainees, d.replies, d.course?.replyDeadline);
    const col = (name: string) => EXPORT_COLUMNS.findIndex((c) => c.header === name);
    const byEmp = new Map(rows.map((r) => [r[0], r]));
    expect(byEmp.get("100001")?.[col("불참 경위")]).toBe("참석 후 취소");
    expect(byEmp.get("100001")?.[col("참석 취소 일시")]).toBe("2026-11-24 10:00");
    expect(byEmp.get("100004")?.[col("불참 경위")]).toBe("처음부터 불참");
  });

  it("경위가 없는 예전 불참자는 '경위 미기록'으로 보이고 새 취소로 세지 않는다", async () => {
    await seed(course, t("old", "100009", "불참"));
    const d = await store.readAll();
    expect(vacancyAlert(d.trainees)).toMatchObject({ total: 1, newCancels: 0 });
    const rows = buildExportRows(d.trainees, d.replies, d.course?.replyDeadline);
    expect(rows[0][EXPORT_COLUMNS.findIndex((c) => c.header === "불참 경위")]).toBe("경위 미기록");
  });

  it("예전 이력(actor 없음)은 종류로 본인/담당자를 추정한다", () => {
    expect(actorOf({ kind: "회신" })).toBe("본인");
    expect(actorOf({ kind: "회신대리입력" })).toBe("담당자");
    expect(actorOf({ kind: "추첨" })).toBeNull();
  });
});
