// 작업 12 확인용 검사: 1차 선별과 선별 취소가 규칙(PRD M1-3)대로, 한 묶음으로 저장되는지 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DrawRecord, Status, Trainee } from "@/domain/types";
import { MAX_SELECTION_BATCH, cancelSelection, selectApplicants } from "@/lib/selection";
import { FileStore } from "@/store/fileStore";

let dir: string;
let store: FileStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "selection-test-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-13T10:00:00+09:00";
const trainee = (id: string, empNo: string, status: Status = "신청", extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `김테스트${id}`,
  dept: "인재개발부",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
let n = 0;
const opts = () => ({ now: NOW, newId: () => `id${++n}` });
const seed = (list: Trainee[]) => store.commit({ upsertTrainees: list });
const draw: DrawRecord = { id: "d1", executedAt: T0, seats: 5, waitSeats: 0, selected: [], waitlist: [], rejected: [] };

describe("작업 12: 1차 선별", () => {
  it("체크한 신청자는 바로 '선정'이 되고, 체크하지 않은 사람은 '신청' 그대로다", async () => {
    await seed([trainee("a", "100001"), trainee("b", "100002"), trainee("c", "100003")]);
    const r = await selectApplicants(store, ["a", "c"], opts());
    expect(r).toMatchObject({ ok: true, count: 2 });

    const { trainees } = await store.readAll();
    const by = (id: string) => trainees.find((t) => t.id === id);
    expect(by("a")).toMatchObject({ status: "선정", selectedVia: "선별", updatedAt: NOW });
    expect(by("c")).toMatchObject({ status: "선정", selectedVia: "선별" });
    expect(by("b")?.status).toBe("신청"); // 2차 추첨 대상으로 남는다
  });

  it("선별 기록(일시·인원)이 남고, 교육생마다 변경 이력(변경 전·후)도 남는다 — 모두 한 묶음", async () => {
    await seed([trainee("a", "100001"), trainee("b", "100002")]);
    await selectApplicants(store, ["a", "b"], opts());
    const { selections, history } = await store.readAll();

    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({ kind: "선별", at: NOW, traineeIds: ["a", "b"] });
    expect(history).toHaveLength(2);
    for (const h of history) {
      expect(h).toMatchObject({ kind: "선정", at: NOW, before: { status: "신청" }, after: { status: "선정", selectedVia: "선별" } });
    }
  });

  it("같은 사람을 두 번 체크해도 한 번만 처리한다", async () => {
    await seed([trainee("a", "100001")]);
    const r = await selectApplicants(store, ["a", "a", "a"], opts());
    expect(r).toMatchObject({ ok: true, count: 1 });
    expect((await store.readAll()).history).toHaveLength(1);
  });

  it("아무도 체크하지 않으면 거부한다", async () => {
    await seed([trainee("a", "100001")]);
    expect(await selectApplicants(store, [], opts())).toMatchObject({ ok: false, reason: "선정할 신청자를 먼저 체크해 주세요." });
    expect(await selectApplicants(store, ["", ""], opts())).toMatchObject({ ok: false });
  });

  it("체크한 사람 중 한 명이라도 신청 상태가 아니면 전체를 취소하고 누구 때문인지 알려 준다", async () => {
    await seed([trainee("a", "100001"), trainee("b", "100002", "선정"), trainee("c", "100003")]);
    const r = await selectApplicants(store, ["a", "b", "c"], opts());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("김테스트b(100002)");
      expect(r.reason).toContain('이미 "선정" 상태');
      expect(r.reason).toContain("아무도 변경되지 않았습니다");
      expect(r.reason).not.toContain("(를)");
    }
    const all = await store.readAll();
    expect(all.trainees.filter((t) => t.status === "신청").map((t) => t.id)).toEqual(["a", "c"]); // 바뀐 사람 없음
    expect(all.selections).toHaveLength(0); // 선별 기록도 없음
    expect(all.history).toHaveLength(0);
  });

  it("없는 교육생이 섞여 있어도 전체를 취소한다", async () => {
    await seed([trainee("a", "100001")]);
    expect((await selectApplicants(store, ["a", "없는사람"], opts())).ok).toBe(false);
    expect((await store.readAll()).trainees[0].status).toBe("신청");
  });

  it("제외·불참·대기 등 다른 상태의 사람은 선별할 수 없다", async () => {
    for (const status of ["제외", "불참", "대기", "미선정"] as const) {
      await seed([trainee("x" + status, "20" + String(n++).padStart(4, "0"), status)]);
    }
    const ids = (await store.readAll()).trainees.map((t) => t.id);
    for (const id of ids) expect((await selectApplicants(store, [id], opts())).ok).toBe(false);
  });

  it(`한 번에 ${MAX_SELECTION_BATCH}명까지만 처리한다`, async () => {
    const ids = Array.from({ length: MAX_SELECTION_BATCH + 1 }, (_, i) => `t${i}`);
    expect(await selectApplicants(store, ids, opts())).toMatchObject({ ok: false });
  });
});

describe("작업 12: 선별 취소", () => {
  it("2차 추첨 전에는 선별로 선정된 사람을 '신청'으로 되돌릴 수 있다 (선정 경로도 지워진다)", async () => {
    await seed([trainee("a", "100001"), trainee("b", "100002")]);
    await selectApplicants(store, ["a", "b"], opts());
    const r = await cancelSelection(store, ["a"], opts());
    expect(r).toMatchObject({ ok: true, count: 1 });

    const all = await store.readAll();
    const a = all.trainees.find((t) => t.id === "a");
    expect(a?.status).toBe("신청");
    expect(a?.selectedVia).toBeUndefined();
    expect(all.trainees.find((t) => t.id === "b")?.status).toBe("선정"); // 취소하지 않은 사람은 그대로
  });

  it("취소도 지우지 않고 새 기록과 이력으로 남는다 (선별 기록은 쌓이기만 한다)", async () => {
    await seed([trainee("a", "100001")]);
    await selectApplicants(store, ["a"], opts());
    await cancelSelection(store, ["a"], opts());
    await selectApplicants(store, ["a"], opts()); // 다시 선별해도 된다

    const { selections, history, trainees } = await store.readAll();
    expect(selections.map((s) => s.kind)).toEqual(["선별", "선별취소", "선별"]);
    expect(new Set(selections.map((s) => s.id)).size).toBe(3);
    expect(history.map((h) => h.kind)).toEqual(["선정", "선별취소", "선정"]);
    expect(history[1]).toMatchObject({ before: { status: "선정", selectedVia: "선별" }, after: { status: "신청" } });
    expect(trainees[0]).toMatchObject({ status: "선정", selectedVia: "선별" });
  });

  it("2차 추첨이 끝난 뒤에는 취소할 수 없다", async () => {
    await seed([trainee("a", "100001")]);
    await selectApplicants(store, ["a"], opts());
    await store.commit({ appendDraws: [draw] });
    const r = await cancelSelection(store, ["a"], opts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("2차 추첨이 끝난 뒤에는");
    expect((await store.readAll()).trainees[0].status).toBe("선정");
  });

  it("추첨·충원·수기로 선정된 사람은 선별 취소 대상이 아니다", async () => {
    await seed([
      trainee("a", "100001", "선정", { selectedVia: "추첨" }),
      trainee("b", "100002", "선정", { selectedVia: "수기", isManual: true }),
      trainee("c", "100003", "선정", { selectedVia: "충원" }),
    ]);
    for (const id of ["a", "b", "c"]) {
      const r = await cancelSelection(store, [id], opts());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("1차 선별로 선정된 사람만");
    }
  });

  it("취소할 사람이 한 명이라도 규칙에 어긋나면 전체가 취소되지 않는다", async () => {
    await seed([trainee("a", "100001"), trainee("b", "100002", "선정", { selectedVia: "추첨" })]);
    await selectApplicants(store, ["a"], opts());
    expect((await cancelSelection(store, ["a", "b"], opts())).ok).toBe(false);
    expect((await store.readAll()).trainees.find((t) => t.id === "a")?.status).toBe("선정"); // a도 그대로
  });

  it("신청 상태인 사람은 취소할 수 없고, 아무도 고르지 않으면 거부한다", async () => {
    await seed([trainee("a", "100001")]);
    expect((await cancelSelection(store, ["a"], opts())).ok).toBe(false);
    expect(await cancelSelection(store, [], opts())).toMatchObject({ ok: false, reason: "선별을 취소할 사람을 골라 주세요." });
  });
});
