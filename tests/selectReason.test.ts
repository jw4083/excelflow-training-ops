// 우선 선정(1차 선별) 사유 검사: 필수 입력, 여러 명에게 공통 사유 기록, 이력(일시·대상자·사유), 관리자 표시, 예전 데이터 "미기록", 교육생 화면 비공개.
// 가짜 데이터만 쓰고 임시 폴더에 저장한다 (실제 data/는 건드리지 않는다).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildExportRows } from "@/domain/exportRoster";
import { statusView } from "@/domain/roster";
import { describeMyStatus } from "@/domain/traineeView";
import type { Course, Trainee } from "@/domain/types";
import { cancelSelection, selectApplicants } from "@/lib/selection";
import type { Store } from "@/store";
import { FileCatalog } from "@/store/fileCatalog";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const course: Course = {
  name: "검증 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: T0,
};
const person = (n: number, extra: Partial<Trainee> = {}): Trainee => ({
  id: `t${n}`,
  empNo: String(100000 + n),
  name: `이름${n}`,
  dept: "부서",
  status: "신청",
  isManual: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

let dir: string;
let store: Store;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "select-reason-"));
  const catalog = new FileCatalog(dir);
  store = (await catalog.openCourse(await catalog.createCourse(course, T0))) as Store;
  await store.commit({ upsertTrainees: [person(1), person(2), person(3)] });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("우선 선정 사유", () => {
  it("사유가 없거나 공백이면 선정되지 않고, 너무 길어도 거부한다", async () => {
    for (const bad of ["", "   "]) {
      const r = await selectApplicants(store, ["t1"], bad, { now: NOW });
      expect(r).toMatchObject({ ok: false });
    }
    expect(await selectApplicants(store, ["t1"], "가".repeat(301))).toMatchObject({ ok: false });
    const data = await store.readAll();
    expect(data.trainees.every((t) => t.status === "신청")).toBe(true);
    expect(data.history).toHaveLength(0);
    expect(data.selections).toHaveLength(0);
  });

  it("여러 명을 선정하면 공통 사유가 각 대상자·선별 기록·이력에 기록된다 (일시·대상자·사유)", async () => {
    const r = await selectApplicants(store, ["t1", "t2"], "  직무 필수 교육 대상  ", { now: NOW });
    expect(r).toMatchObject({ ok: true, count: 2 });
    const data = await store.readAll();
    for (const id of ["t1", "t2"]) {
      expect(data.trainees.find((t) => t.id === id)).toMatchObject({ status: "선정", selectedVia: "선별", selectReason: "직무 필수 교육 대상" });
    }
    expect(data.trainees.find((t) => t.id === "t3")?.selectReason).toBeUndefined();
    expect(data.selections[0]).toMatchObject({ kind: "선별", at: NOW, reason: "직무 필수 교육 대상", traineeIds: ["t1", "t2"] });
    const entries = data.history.filter((h) => h.kind === "선정");
    expect(entries.map((h) => h.traineeId).sort()).toEqual(["t1", "t2"]);
    for (const h of entries) expect(h).toMatchObject({ at: NOW, reason: "직무 필수 교육 대상" });
  });

  it("관리자 명단·엑셀에는 사유가 보이고, 예전 데이터(사유 없음)는 '미기록'으로 두며 채우지 않는다", async () => {
    await selectApplicants(store, ["t1"], "직무 필수", { now: NOW });
    const legacy = person(9, { status: "선정", selectedVia: "선별" }); // 사유 필드가 생기기 전에 선별된 사람
    const data = await store.readAll();
    expect(statusView(data.trainees.find((t) => t.id === "t1")!).note).toBe("우선 선정 · 직무 필수");
    expect(statusView(legacy)).toEqual({ label: "선정", note: "우선 선정 · 미기록" });
    // 선별이 아닌 선정(추첨·충원·수기)에는 우선 선정 표시가 붙지 않는다
    expect(statusView(person(8, { status: "선정", selectedVia: "추첨" })).note).toBe("");
    const rows = buildExportRows([legacy, data.trainees.find((t) => t.id === "t1")!], []);
    expect(rows.map((r) => r.at(-1))).toEqual(["우선 선정 · 직무 필수", "우선 선정 · 미기록"]);
    // 저장된 예전 데이터는 그대로다 (임의로 사유를 쓰지 않는다)
    expect(legacy.selectReason).toBeUndefined();
  });

  it("선별을 취소하면 사유 표시는 사라지지만 이력에는 그대로 남는다", async () => {
    await selectApplicants(store, ["t1"], "직무 필수", { now: NOW });
    expect((await cancelSelection(store, ["t1"], { now: NOW })).ok).toBe(true);
    const data = await store.readAll();
    expect(data.trainees.find((t) => t.id === "t1")).toMatchObject({ status: "신청" });
    expect(data.trainees.find((t) => t.id === "t1")?.selectReason).toBeUndefined();
    expect(data.history.filter((h) => h.kind === "선정")[0]).toMatchObject({ reason: "직무 필수" });
  });

  it("교육생 화면 안내는 일반 선정 결과와 똑같고 사유·우선 선정 여부를 담지 않는다", () => {
    const general = describeMyStatus({ status: "선정" });
    const priority = describeMyStatus({ status: "선정", selectReason: "직무 필수 교육 대상", selectedVia: "선별" } as never);
    expect(priority).toEqual(general);
    expect(JSON.stringify(priority)).not.toContain("직무 필수");
    expect(JSON.stringify(priority)).not.toContain("우선");
  });
});
