// 담당자 직접 "미선정" 처리 검사: 추첨 전 처리·복구, 추첨·충원에서 빠지는지, 사유 구분, 이력, 교육생 안내, 다른 과정 영향 없음.
// 가짜 데이터만 쓰고 임시 폴더에 저장한다 (실제 data/는 건드리지 않는다).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describeMyStatus } from "@/domain/traineeView";
import { drawPool } from "@/domain/draw";
import { fillCandidates, isAllowedCandidate } from "@/domain/fill";
import { checkTransition } from "@/domain/status";
import { countByStatus, statusView, visibleTrainees } from "@/domain/roster";
import type { Course, Trainee } from "@/domain/types";
import { buildExportRows } from "@/domain/exportRoster";
import { runDraw } from "@/lib/draw";
import { confirmFill, excludeSelected } from "@/lib/fill";
import { rejectApplicants, restoreRejected } from "@/lib/rejection";
import { selectApplicants } from "@/lib/selection";
import type { Store } from "@/store";
import { FileCatalog } from "@/store/fileCatalog";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const course = (name: string): Course => ({
  name,
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: T0,
});
const person = (n: number, status: Trainee["status"] = "신청"): Trainee => ({
  id: `t${n}`,
  empNo: String(100000 + n),
  name: `이름${n}`,
  dept: "부서",
  status,
  isManual: false,
  createdAt: T0,
  updatedAt: T0,
});

let dir: string;
let catalog: FileCatalog;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "admin-reject-"));
  catalog = new FileCatalog(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function newCourse(name: string, count: number): Promise<Store> {
  const id = await catalog.createCourse(course(name), T0);
  const store = (await catalog.openCourse(id)) as Store;
  await store.commit({ upsertTrainees: Array.from({ length: count }, (_, i) => person(i + 1)) });
  return store;
}
const statusOf = async (store: Store, id: string) => (await store.readAll()).trainees.find((t) => t.id === id)!;

describe("미선정 처리 (추첨 전)", () => {
  it("여러 명을 사유와 함께 미선정으로 바꾸고, 이력(일시·사유)과 담당자 표시를 남긴다", async () => {
    const store = await newCourse("A", 4);
    const r = await rejectApplicants(store, ["t1", "t2"], "대상 직급이 아님", { now: NOW });
    expect(r).toEqual({ ok: true, count: 2 });
    const t1 = await statusOf(store, "t1");
    expect(t1).toMatchObject({ status: "미선정", rejectedBy: "담당자", rejectReason: "대상 직급이 아님", rejectedAt: NOW });
    expect((await statusOf(store, "t3")).status).toBe("신청");
    const history = (await store.readAll()).history.filter((h) => h.kind === "미선정처리");
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ at: NOW, reason: "대상 직급이 아님", traineeId: "t1" });
  });

  it("사유가 없거나 너무 길면 거부하고, 신청이 아닌 사람이 섞이면 아무도 바꾸지 않는다", async () => {
    const store = await newCourse("A", 3);
    expect(await rejectApplicants(store, ["t1"], "   ")).toMatchObject({ ok: false });
    expect(await rejectApplicants(store, ["t1"], "가".repeat(301))).toMatchObject({ ok: false });
    expect(await rejectApplicants(store, [], "사유")).toMatchObject({ ok: false });
    await selectApplicants(store, ["t2"], "테스트 사유");
    const mixed = await rejectApplicants(store, ["t1", "t2"], "사유");
    expect(mixed).toMatchObject({ ok: false });
    expect((await statusOf(store, "t1")).status).toBe("신청");
    expect((await statusOf(store, "t2")).status).toBe("선정");
  });

  it("같은 사람을 두 번 체크해도 한 번만 처리하고, 이미 처리된 사람을 다시 처리하면 거부한다", async () => {
    const store = await newCourse("A", 2);
    expect(await rejectApplicants(store, ["t1", "t1"], "사유")).toEqual({ ok: true, count: 1 });
    expect(await rejectApplicants(store, ["t1"], "사유")).toMatchObject({ ok: false });
  });
});

describe("복구 (추첨 전)", () => {
  it("추첨 전에는 신청으로 되돌릴 수 있고, 되돌리면 담당자 표시가 지워지며 이력이 남는다", async () => {
    const store = await newCourse("A", 2);
    await rejectApplicants(store, ["t1"], "잘못 처리");
    const r = await restoreRejected(store, ["t1"], { now: NOW });
    expect(r).toEqual({ ok: true, count: 1 });
    const t1 = await statusOf(store, "t1");
    expect(t1.status).toBe("신청");
    expect(t1.rejectedBy).toBeUndefined();
    expect(t1.rejectReason).toBeUndefined();
    const kinds = (await store.readAll()).history.map((h) => h.kind);
    expect(kinds).toEqual(["미선정처리", "미선정복구"]);
  });

  it("추첨이 끝난 뒤에는 복구할 수 없다", async () => {
    const store = await newCourse("A", 4);
    await rejectApplicants(store, ["t1"], "사유");
    expect((await runDraw(store, { capacity: "2", waitSeats: "0" }, { now: NOW })).ok).toBe(true);
    expect(await restoreRejected(store, ["t1"])).toMatchObject({ ok: false });
    expect((await statusOf(store, "t1")).status).toBe("미선정");
  });

  it("추첨 결과 미선정(담당자 표시 없음)은 복구 대상이 아니다", async () => {
    const store = await newCourse("A", 4);
    await runDraw(store, { capacity: "1", waitSeats: "0" }, { now: NOW });
    const lost = (await store.readAll()).trainees.find((t) => t.status === "미선정")!;
    expect(checkTransition("미선정복구", lost, undefined, { drawCount: 0 }).ok).toBe(false);
    expect(await restoreRejected(store, [lost.id])).toMatchObject({ ok: false });
  });
});

describe("추첨·충원에서 빠진다", () => {
  it("첫 추첨 대상에서 빠지고, 재추첨 대상(대기·미선정)에도 들어가지 않는다", async () => {
    const store = await newCourse("A", 6);
    await rejectApplicants(store, ["t1", "t2"], "사유");
    const data = await store.readAll();
    expect(drawPool(data.trainees, 0).map((t) => t.id)).toEqual(["t3", "t4", "t5", "t6"]);
    await runDraw(store, { capacity: "1", waitSeats: "1" }, { now: NOW });
    const after = await store.readAll();
    expect(after.trainees.filter((t) => t.rejectedBy).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(drawPool(after.trainees, 1).some((t) => t.rejectedBy)).toBe(false);
    // 재추첨: 정원을 크게 늘려도 담당자 미선정자는 선정되지 않는다
    const redraw = await runDraw(store, { capacity: "10", waitSeats: "0" }, { now: "2026-11-16T12:00:00+09:00" });
    expect(redraw.ok).toBe(true);
    const finalData = await store.readAll();
    for (const id of ["t1", "t2"]) expect(finalData.trainees.find((t) => t.id === id)).toMatchObject({ status: "미선정", rejectedBy: "담당자" });
  });

  it("전환 검사가 담당자 미선정자의 추첨·충원 선정을 직접 막는다", () => {
    const rejected = { status: "미선정" as const, rejectedBy: "담당자" as const };
    expect(checkTransition("추첨", rejected, "선정", { drawCount: 1 }).ok).toBe(false);
    expect(checkTransition("충원선정", rejected, undefined, { waitlistCount: 0 }).ok).toBe(false);
    expect(checkTransition("충원선정", { status: "미선정" }, undefined, { waitlistCount: 0 }).ok).toBe(true); // 추첨 결과 미선정은 그대로 후보
  });

  it("충원 후보(미선정 풀)에서 빠지고 후보로 지정해도 거부된다 — 추첨 결과 미선정자는 후보가 된다", async () => {
    const store = await newCourse("A", 5);
    await rejectApplicants(store, ["t1"], "사유");
    await runDraw(store, { capacity: "2", waitSeats: "0" }, { now: NOW }); // 선정 2, 추첨 미선정 2, 담당자 미선정 1
    const data = await store.readAll();
    const pool = fillCandidates(data.trainees);
    expect(pool.mode).toBe("pool");
    if (pool.mode !== "pool") return;
    expect(pool.pool.every((t) => !t.rejectedBy)).toBe(true);
    expect(pool.pool).toHaveLength(2);
    expect(isAllowedCandidate(data.trainees, "t1")).toBe(false);

    const selected = data.trainees.find((t) => t.status === "선정")!;
    expect((await excludeSelected(store, selected.id, "사유", { now: NOW })).ok).toBe(true);
    const deadline = "2026-11-30T12:00:00+09:00";
    const blocked = await confirmFill(store, { targetId: selected.id, candidateId: "t1", replyDeadline: deadline }, { now: NOW });
    expect(blocked.ok).toBe(false);
    expect((await statusOf(store, "t1")).status).toBe("미선정");
    const ok = await confirmFill(store, { targetId: selected.id, candidateId: pool.pool[0].id, replyDeadline: deadline }, { now: NOW });
    expect(ok.ok).toBe(true);
  });
});

describe("화면 표시와 사유 구분", () => {
  it("사전 미선정·추첨 미선정은 같은 '미선정'이지만 처리 사유가 다르게 표시된다", () => {
    expect(statusView({ id: "a", status: "미선정" })).toEqual({ label: "미선정", note: "추첨 미선정" });
    expect(statusView({ id: "a", status: "미선정", rejectedBy: "담당자", rejectReason: "대상 아님" })).toEqual({
      label: "미선정",
      note: "사전 미선정 · 대상 아님",
    });
    expect(statusView({ id: "a", status: "선정" })).toEqual({ label: "선정", note: "" });
  });

  it("미선정 탭에는 사전·추첨 미선정만, 제외 상태는 별도 탭에 센다", () => {
    const list = [person(1, "미선정"), person(2, "제외"), person(3, "신청")];
    expect(countByStatus(list)).toMatchObject({ 전체: 3, 미선정: 1, 신청: 1, "선정 취소·충원 완료": 1 });
    expect(visibleTrainees(list, "미선정")).toHaveLength(1);
  });

  it("교육생 화면: 사전·추첨 미선정은 '선정되지 않았습니다', 선정 취소는 '선정이 취소되었습니다', 불참 후 충원은 별도 안내", () => {
    expect(describeMyStatus({ status: "미선정" }).title).toBe("이번 교육에는 선정되지 않았습니다");
    expect(describeMyStatus({ status: "제외" }, "선정취소").title).toBe("선정이 취소되었습니다");
    expect(describeMyStatus({ status: "제외" }, "불참").title).toBe("불참으로 처리되었고 자리가 충원되었습니다");
    expect(describeMyStatus({ status: "제외", excludedFrom: "불참" }).title).toBe("불참으로 처리되었고 자리가 충원되었습니다");
    expect(describeMyStatus({ status: "제외", excludedFrom: "선정취소" }).title).toBe("선정이 취소되었습니다");
  });

  it("내려받는 엑셀에도 같은 상태 이름과 처리 사유가 들어간다", () => {
    const t = { ...person(1, "미선정"), rejectedBy: "담당자" as const, rejectReason: "대상 아님" };
    const [row] = buildExportRows([t], []);
    expect(row[3]).toBe("미선정");
    expect(row.at(-1)).toBe("사전 미선정 · 대상 아님");
  });
});

describe("다른 과정에 영향이 없다", () => {
  it("한 과정에서 미선정 처리해도 같은 사번의 다른 과정 신청 상태는 그대로다", async () => {
    const a = await newCourse("A", 2);
    const b = await newCourse("B", 2);
    await rejectApplicants(a, ["t1"], "사유");
    expect((await statusOf(a, "t1")).status).toBe("미선정");
    expect((await statusOf(b, "t1")).status).toBe("신청");
    expect((await b.readAll()).history).toHaveLength(0);
  });
});
