// 미선정·제외의 네 가지 경우(사전 미선정 / 추첨 미선정 / 선정 취소 / 불참 후 충원 완료)를
// 재추첨·충원 후보·빈자리 계산·복구·화면 표시 기준으로 각각 검증한다. 예전(경위 필드 이전) 데이터와 이력 보존도 본다.
// 가짜 데이터만 쓰고 임시 폴더에 저장한다 (실제 data/는 건드리지 않는다).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { vacancyAlert } from "@/domain/alerts";
import { drawPool } from "@/domain/draw";
import { buildExportRows } from "@/domain/exportRoster";
import { fillCandidates, openVacancies } from "@/domain/fill";
import { removalIndex, removalOf, statusView } from "@/domain/roster";
import type { Course, History, Trainee } from "@/domain/types";
import { runDraw } from "@/lib/draw";
import { confirmFill, excludeSelected } from "@/lib/fill";
import { rejectApplicants, restoreRejected } from "@/lib/rejection";
import { submitReply } from "@/lib/reply";
import { selectApplicants } from "@/lib/selection";
import type { Store } from "@/store";
import { FileCatalog } from "@/store/fileCatalog";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const DEADLINE = "2026-11-30T12:00:00+09:00";
const course: Course = {
  name: "검증 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: T0,
};
const person = (n: number, status: Trainee["status"] = "신청", extra: Partial<Trainee> = {}): Trainee => ({
  id: `t${n}`,
  empNo: String(100000 + n),
  name: `이름${n}`,
  dept: "부서",
  status,
  isManual: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

let dir: string;
let store: Store;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "removal-cases-"));
  const catalog = new FileCatalog(dir);
  store = (await catalog.openCourse(await catalog.createCourse(course, T0))) as Store;
  await store.commit({ upsertTrainees: Array.from({ length: 8 }, (_, i) => person(i + 1)) });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const get = async (id: string) => (await store.readAll()).trainees.find((t) => t.id === id)!;
const vacancies = async () => vacancyAlert((await store.readAll()).trainees);

describe("① 사전 미선정", () => {
  it("첫 추첨·재추첨·충원 후보에 들어가지 않고, 빈자리로도 세지 않는다", async () => {
    await rejectApplicants(store, ["t1"], "대상 아님", { now: NOW });
    expect(await vacancies()).toMatchObject({ total: 0, excluded: 0, newCancels: 0 }); // 빈자리 없음
    expect(openVacancies((await store.readAll()).trainees)).toHaveLength(0);
    expect(drawPool((await store.readAll()).trainees, 0).map((t) => t.id)).not.toContain("t1");

    await runDraw(store, { capacity: "2", waitSeats: "1" }, { now: NOW });
    expect(drawPool((await store.readAll()).trainees, 1).map((t) => t.id)).not.toContain("t1"); // 재추첨 대상 아님
    const found = fillCandidates((await store.readAll()).trainees);
    if (found.mode === "pool") expect(found.pool.map((t) => t.id)).not.toContain("t1"); // 충원 후보 아님
    expect(await vacancies()).toMatchObject({ total: 0 });
    expect(statusView(await get("t1"))).toEqual({ label: "미선정", note: "사전 미선정 · 대상 아님" });
  });

  it("추첨 전에는 신청으로 복구되고, 추첨 후에는 복구되지 않는다", async () => {
    await rejectApplicants(store, ["t1", "t2"], "대상 아님");
    expect((await restoreRejected(store, ["t1"])).ok).toBe(true);
    expect((await get("t1")).status).toBe("신청");
    await runDraw(store, { capacity: "2", waitSeats: "0" }, { now: NOW });
    expect((await restoreRejected(store, ["t2"])).ok).toBe(false);
    expect((await get("t2")).status).toBe("미선정");
  });
});

describe("② 추첨 미선정", () => {
  it("재추첨 대상과 충원 후보(대기자가 없을 때)에 포함되고, 빈자리가 아니며, 복구 대상이 아니다", async () => {
    await runDraw(store, { capacity: "2", waitSeats: "0" }, { now: NOW });
    const data = await store.readAll();
    const lost = data.trainees.filter((t) => t.status === "미선정");
    expect(lost.length).toBeGreaterThan(0);
    expect(drawPool(data.trainees, 1).map((t) => t.id)).toEqual(expect.arrayContaining(lost.map((t) => t.id)));
    const found = fillCandidates(data.trainees);
    expect(found.mode).toBe("pool");
    expect(await vacancies()).toMatchObject({ total: 0 });
    expect(statusView(lost[0])).toEqual({ label: "미선정", note: "추첨 미선정" });
    expect((await restoreRejected(store, [lost[0].id])).ok).toBe(false);
  });
});

describe("③ 선정 취소", () => {
  it("선정 인원이 줄어 충원이 필요한 자리로 계산되고, 재추첨·충원 후보에는 들어가지 않으며, 충원되면 빈자리에서 빠진다", async () => {
    await selectApplicants(store, ["t1", "t2"], "테스트 사유");
    await runDraw(store, { capacity: "3", waitSeats: "0" }, { now: NOW }); // 나머지는 추첨 미선정이 되어 충원 후보 풀이 생긴다
    expect((await excludeSelected(store, "t1", "사정 변경", { now: NOW })).ok).toBe(true);
    const t1 = await get("t1");
    expect(t1).toMatchObject({ status: "제외", excludedFrom: "선정취소" });
    expect((await vacancies()).total).toBe(1); // 선정이 실제로 줄어 빈자리로 계산
    expect(drawPool((await store.readAll()).trainees, 0).map((t) => t.id)).not.toContain("t1");
    expect(statusView(t1, removalIndex((await store.readAll()).history))).toEqual({
      label: "선정 취소",
      note: "선정 취소 · 사정 변경 · 충원 필요",
    });

    const found = fillCandidates((await store.readAll()).trainees);
    expect(found.mode).toBe("pool");
    const candidate = found.mode === "pool" ? found.pool[0].id : "";
    expect(candidate).not.toBe("t1");
    expect((await confirmFill(store, { targetId: "t1", candidateId: candidate, replyDeadline: DEADLINE }, { now: NOW })).ok).toBe(true);
    expect((await vacancies()).total).toBe(0);
    const after = await get("t1");
    expect(statusView(after, removalIndex((await store.readAll()).history)).note).toBe("선정 취소 · 사정 변경 · 충원 완료");
  });

  it("선정 취소한 사람은 복구 대상이 아니다", async () => {
    await selectApplicants(store, ["t1"], "테스트 사유");
    await excludeSelected(store, "t1", "사유");
    expect((await restoreRejected(store, ["t1"])).ok).toBe(false);
  });
});

describe("④ 불참 후 충원 완료", () => {
  async function absentThenFill() {
    await selectApplicants(store, ["t1"], "테스트 사유");
    await runDraw(store, { capacity: "2", waitSeats: "0" }, { now: NOW }); // 추첨 미선정자가 충원 후보 풀이 된다
    const replied = await submitReply(store, "t1", { attend: false, absentType: "업무", absentDetail: "업무 일정이 겹쳐 참석이 어렵습니다.", laptop: false }, { now: NOW });
    expect(replied.ok).toBe(true);
    expect((await vacancies()).total).toBe(1); // 불참이면 충원이 필요한 자리
    const found = fillCandidates((await store.readAll()).trainees);
    const candidate = found.mode === "pool" ? found.pool[0].id : "";
    expect((await confirmFill(store, { targetId: "t1", candidateId: candidate, replyDeadline: DEADLINE }, { now: NOW })).ok).toBe(true);
    return candidate;
  }

  it("충원이 끝난 자리는 다시 충원 대상으로 세지 않고, 재추첨·충원 후보에도 들어가지 않는다", async () => {
    await absentThenFill();
    const t1 = await get("t1");
    expect(t1).toMatchObject({ status: "제외", excludedFrom: "불참" });
    expect((await vacancies()).total).toBe(0);
    expect(openVacancies((await store.readAll()).trainees)).toHaveLength(0);
    expect(drawPool((await store.readAll()).trainees, 1).map((t) => t.id)).not.toContain("t1");
    expect(statusView(t1)).toEqual({ label: "불참 후 충원", note: "불참 후 충원 완료" });
    // 같은 자리를 다시 충원하려 해도 거부된다
    const again = await confirmFill(store, { targetId: "t1", candidateId: "t3", replyDeadline: DEADLINE }, { now: NOW });
    expect(again.ok).toBe(false);
  });
});

describe("예전 데이터와 이력 보존", () => {
  const hist = (over: Partial<History>): History => ({ id: `h${Math.random()}`, at: T0, kind: "제외", before: null, after: null, ...over });

  it("경위 필드가 없는 예전 제외 데이터는 변경 이력으로 선정 취소 / 불참 후 충원을 가른다", () => {
    const history = [
      hist({ traineeId: "a", before: { status: "선정" }, after: { status: "제외" }, reason: "사정 변경" }), // 직접 제외 → 선정 취소
      hist({ traineeId: "b", before: { status: "불참" }, after: { status: "제외", replacedBy: "x" }, reason: "충원 확정" }), // 불참 후 충원
      hist({ traineeId: "a", before: {}, after: { replacedBy: "y" }, reason: "충원 확정" }), // 이미 제외인 자리의 충원 확정 (경위를 바꾸지 않는다)
    ];
    const index = removalIndex(history);
    const a = person(1, "제외", { id: "a", replacedBy: "y" });
    const b = person(2, "제외", { id: "b", replacedBy: "x" }); // 경위 미기록 불참자였던 예전 데이터: absentOrigin 없음
    expect(removalOf(a, index).origin).toBe("선정취소");
    expect(removalOf(b, index).origin).toBe("불참");
    expect(statusView(a, index).note).toBe("선정 취소 · 사정 변경 · 충원 완료");
    expect(statusView(b, index)).toEqual({ label: "불참 후 충원", note: "불참 후 충원 완료" });
  });

  it("이력에서도 알 수 없으면 틀린 말을 하지 않고 '경위 미기록'으로 보인다", () => {
    expect(statusView(person(3, "제외", { id: "c" }), removalIndex([]))).toEqual({ label: "처리 완료", note: "경위 미기록" });
    // 교육생 화면처럼 이력이 없을 때는 불참 회신 흔적(attend=false)으로 불참 후 충원을 알아본다
    expect(removalOf(person(3, "제외", { id: "c" }), undefined, { attend: false }).origin).toBe("불참");
  });

  it("엑셀·명단 계산은 이력을 바꾸지 않는다 (읽기만 한다)", async () => {
    await selectApplicants(store, ["t1"], "테스트 사유");
    await excludeSelected(store, "t1", "사유", { now: NOW });
    const before = JSON.stringify((await store.readAll()).history);
    const data = await store.readAll();
    const rows = buildExportRows(data.trainees, data.replies, undefined, data.history);
    const row = rows.find((r) => r[0] === "100001")!;
    expect(row[3]).toBe("선정 취소");
    expect(String(row.at(-1))).toContain("선정 취소 · 사유");
    expect(JSON.stringify((await store.readAll()).history)).toBe(before);
  });
});
