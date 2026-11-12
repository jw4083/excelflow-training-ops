// 작업 21 확인용 검사: 수기 추가의 필수 입력·사번 형식·중복 거부·정원 경고·대신할 자리·개별 기한 (PRD M1-6·M1-9·M1-10·M1-11).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openVacancies } from "@/domain/fill";
import type { Course, Trainee } from "@/domain/types";
import { addManualTrainee } from "@/lib/manualAdd";
import { FileStore } from "@/store/fileStore";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const FUTURE = "2026-11-18T12:00:00+09:00";
const opts = { now: NOW };

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
const input = { empNo: "001234", name: "홍길동", dept: "총무부", reason: "임원 추천" };

describe("작업 21: 수기 추가", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "manual-test-"));
    store = new FileStore(path.join(dir, "db.json"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const course = (capacity?: number): Course => ({
    name: "테스트",
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    place: "교육장",
    notice: "안내",
    replyDeadline: "2026-11-20T18:00:00+09:00",
    capacity,
    updatedAt: T0,
  });
  const seed = (capacity: number | undefined, ...list: Trainee[]) => store.commit({ course: course(capacity), upsertTrainees: list });

  it("추가하면 '선정'+수기 표시로 들어가고 사유가 저장되며 앞자리 0이 보존되고 이력이 남는다", async () => {
    await seed(10, t("a", "100001", "선정"));
    const r = await addManualTrainee(store, input, opts);
    expect(r.ok).toBe(true);
    const d = await store.readAll();
    const added = d.trainees.find((x) => x.empNo === "001234")!;
    expect(added).toMatchObject({ name: "홍길동", dept: "총무부", status: "선정", isManual: true, manualReason: "임원 추천", selectedVia: "수기" });
    expect(d.history).toHaveLength(1);
    expect(d.history[0]).toMatchObject({ kind: "수기추가", traineeId: added.id, before: null });
  });

  it("사번·이름·부서·사유 중 하나라도 비면 거부하고 저장하지 않는다", async () => {
    await seed(10);
    for (const key of ["empNo", "name", "dept", "reason"] as const) {
      const r = await addManualTrainee(store, { ...input, [key]: "  " }, opts);
      expect(r.ok).toBe(false);
    }
    expect((await store.readAll()).trainees).toEqual([]);
  });

  it("사번이 6자리 숫자가 아니면 거부한다", async () => {
    await seed(10);
    for (const empNo of ["12345", "1234567", "12345a", "１２３４５６"]) {
      expect((await addManualTrainee(store, { ...input, empNo }, opts)).ok).toBe(false);
    }
  });

  it("이미 명단에 있는 사번은 거부한다", async () => {
    await seed(10, t("a", "001234", "신청"));
    expect(await addManualTrainee(store, input, opts)).toMatchObject({ ok: false, reason: expect.stringContaining("이미 명단") });
    expect((await store.readAll()).trainees).toHaveLength(1);
  });

  it("개별 회신 기한을 저장하고, 과거 기한이나 엉뚱한 값은 거부한다. 비우면 과정 기한을 따른다", async () => {
    await seed(10);
    expect((await addManualTrainee(store, { ...input, replyDeadline: "2026-11-14T00:00:00+09:00" }, opts)).ok).toBe(false);
    expect((await addManualTrainee(store, { ...input, replyDeadline: "엉뚱" }, opts)).ok).toBe(false);
    await addManualTrainee(store, { ...input, replyDeadline: FUTURE }, opts);
    await addManualTrainee(store, { ...input, empNo: "001235" }, opts);
    const d = await store.readAll();
    expect(d.trainees.find((x) => x.empNo === "001234")?.replyDeadline).toBe(FUTURE);
    expect(d.trainees.find((x) => x.empNo === "001235")?.replyDeadline).toBeUndefined();
  });

  it("정원을 넘게 되면 확인 없이는 거부(needsOverConfirm)하고 확인하면 추가한다. 입력 오류는 경고보다 먼저 알려 준다", async () => {
    await seed(1, t("a", "100001", "선정"));
    expect(await addManualTrainee(store, input, opts)).toMatchObject({ ok: false, needsOverConfirm: true });
    expect((await store.readAll()).trainees).toHaveLength(1);
    const bad = await addManualTrainee(store, { ...input, name: "" }, opts);
    expect(bad.ok).toBe(false);
    expect(bad).not.toHaveProperty("needsOverConfirm");
    expect((await addManualTrainee(store, { ...input, confirmOver: true }, opts)).ok).toBe(true);
  });

  it("대신할 자리를 고르면 그 자리는 제외+충원 확정이 되어 알림에서 빠지고, 추가된 사람에는 대신한 자리가 기록된다", async () => {
    await seed(10, t("abs", "100001", "불참"));
    const r = await addManualTrainee(store, { ...input, replaceTargetId: "abs" }, opts);
    expect(r.ok).toBe(true);
    const d = await store.readAll();
    const added = d.trainees.find((x) => x.empNo === "001234")!;
    expect(d.trainees.find((x) => x.id === "abs")).toMatchObject({ status: "제외", replacedBy: added.id });
    expect(added.replacedFor).toBe("abs");
    expect(openVacancies(d.trainees)).toEqual([]);
    expect(d.history.map((h) => h.kind).sort()).toEqual(["수기추가", "제외"]);
  });

  it("이미 충원된 자리·불참/제외가 아닌 사람을 대신할 자리로 고르면 거부하고 아무것도 저장하지 않는다", async () => {
    await seed(10, t("done", "100001", "제외", { replacedBy: "x" }), t("sel", "100002", "선정"));
    for (const id of ["done", "sel", "없는사람"]) {
      expect((await addManualTrainee(store, { ...input, replaceTargetId: id }, opts)).ok).toBe(false);
    }
    expect((await store.readAll()).trainees).toHaveLength(2);
  });

  it("추가된 사람은 명단의 사번으로 바로 조회된다 (로그인 가능)", async () => {
    await seed(10);
    await addManualTrainee(store, input, opts);
    expect(await store.getTraineeByEmpNo("001234")).toMatchObject({ name: "홍길동", status: "선정" });
  });
});
