// 작업 20 확인용 검사: 충원 후보 제시, 정원 초과 경고, 충원 확정(한 묶음 저장), 직접 제외 (PRD M1-5·M1-10·M1-11, M2-7).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultFillDeadline, fillCandidates, fillExceedsCapacity, isAllowedCandidate, openVacancies } from "@/domain/fill";
import { checkReplyAllowed } from "@/domain/replyRules";
import type { Course, Trainee } from "@/domain/types";
import { confirmFill, excludeSelected } from "@/lib/fill";
import { FileStore } from "@/store/fileStore";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const FUTURE = "2026-11-18T12:00:00+09:00";

let seq = 0;
const t = (id: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo: String(100000 + ++seq),
  name: `이름${id}`,
  dept: "부서",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

describe("작업 20: 충원 후보 규칙", () => {
  it("대기자가 있으면 가장 앞 순번 한 명만 제시한다 (순번이 비어 있어도 가장 작은 번호)", () => {
    const list = [t("w3", "대기", { waitNo: 3 }), t("w2", "대기", { waitNo: 2 }), t("m", "미선정")];
    const c = fillCandidates(list);
    expect(c).toMatchObject({ mode: "waitlist", candidate: { id: "w2" } });
    expect(isAllowedCandidate(list, "w2")).toBe(true);
    expect(isAllowedCandidate(list, "w3")).toBe(false); // 순번 건너뛰기 금지
    expect(isAllowedCandidate(list, "m")).toBe(false); // 대기자가 남아 있으면 미선정자 불가
  });

  it("대기자가 없으면 미선정자 중에서 고른다", () => {
    const list = [t("m2", "미선정"), t("m1", "미선정"), t("s", "선정")];
    const c = fillCandidates(list);
    expect(c.mode).toBe("pool");
    expect(isAllowedCandidate(list, "m1")).toBe(true);
    expect(isAllowedCandidate(list, "s")).toBe(false);
  });

  it("후보가 없으면 none", () => {
    expect(fillCandidates([t("s", "선정")])).toEqual({ mode: "none" });
    expect(isAllowedCandidate([t("s", "선정")], "s")).toBe(false);
  });

  it("충원이 필요한 자리는 불참·제외 중 충원 미확정이고 오래 기다린 순이다", () => {
    const list = [
      t("b", "불참", { updatedAt: "2026-11-14T00:00:00Z" }),
      t("a", "제외", { updatedAt: "2026-11-13T00:00:00Z" }),
      t("c", "불참", { replacedBy: "x" }),
      t("d", "선정"),
    ];
    expect(openVacancies(list).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("정원 초과 판단: 충원자가 선정이 되면 1명 늘어난다. 정원이 없으면 초과 아님", () => {
    const sel = (n: number) => Array.from({ length: n }, () => ({ status: "선정" as const }));
    expect(fillExceedsCapacity(10, sel(9))).toBe(false);
    expect(fillExceedsCapacity(10, sel(10))).toBe(true);
    expect(fillExceedsCapacity(undefined, sel(50))).toBe(false);
  });

  it("기본 회신 기한은 지금부터 3일 후", () => {
    expect(defaultFillDeadline("2026-11-15T03:00:00.000Z")).toBe("2026-11-18T03:00:00.000Z");
  });
});

describe("작업 20: 충원 확정·직접 제외 저장", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(async () => {
    seq = 0;
    dir = await mkdtemp(path.join(tmpdir(), "fill-test-"));
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
  const opts = { now: NOW };

  it("불참 자리에 대기 1번을 충원: 불참자는 제외+충원 확정, 후보는 선정(충원·개별 기한)이고 이력 2건이 남는다", async () => {
    await seed(10, t("abs", "불참"), t("w1", "대기", { waitNo: 1 }), t("w2", "대기", { waitNo: 2 }));
    const r = await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, opts);
    expect(r).toEqual({ ok: true });
    const d = await store.readAll();
    const get = (id: string) => d.trainees.find((x) => x.id === id)!;
    expect(get("abs")).toMatchObject({ status: "제외", replacedBy: "w1" });
    expect(get("w1")).toMatchObject({ status: "선정", selectedVia: "충원", replacedFor: "abs", replyDeadline: FUTURE });
    expect(get("w1").waitNo).toBeUndefined();
    expect(get("w2")).toMatchObject({ status: "대기", waitNo: 2 }); // 다른 대기자는 그대로
    expect(d.history.map((h) => h.kind).sort()).toEqual(["제외", "충원"]);
  });

  it("충원 확정 뒤 그 불참자는 참석으로 바꿀 수 없고, 알림 목록에서도 빠진다", async () => {
    await seed(10, t("abs", "불참"), t("w1", "대기", { waitNo: 1 }));
    await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, opts);
    const d = await store.readAll();
    expect(openVacancies(d.trainees)).toEqual([]);
    const abs = d.trainees.find((x) => x.id === "abs")!;
    expect(checkReplyAllowed(abs, d.course, true, NOW, true).ok).toBe(false); // 제외 상태라 회신 대상이 아님
  });

  it("직접 제외한 자리(제외 상태)도 같은 방식으로 충원되고 상태는 제외 그대로, 충원 확정만 기록된다", async () => {
    await seed(10, t("ex", "제외"), t("w1", "대기", { waitNo: 1 }));
    expect((await confirmFill(store, { targetId: "ex", candidateId: "w1", replyDeadline: FUTURE }, opts)).ok).toBe(true);
    const d = await store.readAll();
    expect(d.trainees.find((x) => x.id === "ex")).toMatchObject({ status: "제외", replacedBy: "w1" });
  });

  it("대기자가 없으면 미선정자를 골라 충원할 수 있다", async () => {
    await seed(10, t("abs", "불참"), t("m1", "미선정"));
    expect((await confirmFill(store, { targetId: "abs", candidateId: "m1", replyDeadline: FUTURE }, opts)).ok).toBe(true);
    expect((await store.readAll()).trainees.find((x) => x.id === "m1")?.status).toBe("선정");
  });

  it("대기자가 남아 있으면 미선정자·뒷 순번 충원은 거부되고 아무것도 바뀌지 않는다", async () => {
    await seed(10, t("abs", "불참"), t("w1", "대기", { waitNo: 1 }), t("w2", "대기", { waitNo: 2 }), t("m", "미선정"));
    for (const id of ["w2", "m"]) {
      const r = await confirmFill(store, { targetId: "abs", candidateId: id, replyDeadline: FUTURE }, opts);
      expect(r.ok).toBe(false);
    }
    const d = await store.readAll();
    expect(d.trainees.find((x) => x.id === "abs")).toMatchObject({ status: "불참" });
    expect(d.history).toEqual([]);
  });

  it("정원을 넘게 되면 확인 없이는 거부(needsOverConfirm)하고, 확인하면 확정한다", async () => {
    await seed(1, t("abs", "불참"), t("s", "선정"), t("w1", "대기", { waitNo: 1 }));
    const first = await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, opts);
    expect(first).toMatchObject({ ok: false, needsOverConfirm: true });
    expect((await store.readAll()).history).toEqual([]);
    const second = await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE, confirmOver: true }, opts);
    expect(second.ok).toBe(true);
  });

  it("이미 충원된 자리·불참/제외가 아닌 사람·잘못된 기한은 거부한다", async () => {
    await seed(10, t("abs", "불참"), t("sel", "선정"), t("w1", "대기", { waitNo: 1 }), t("w2", "대기", { waitNo: 2 }));
    expect((await confirmFill(store, { targetId: "sel", candidateId: "w1", replyDeadline: FUTURE }, opts)).ok).toBe(false);
    expect((await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: "2026-11-14T00:00:00+09:00" }, opts)).ok).toBe(false); // 과거
    expect((await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: "아무거나" }, opts)).ok).toBe(false);
    await confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, opts);
    expect(await confirmFill(store, { targetId: "abs", candidateId: "w2", replyDeadline: FUTURE }, opts)).toMatchObject({ ok: false });
  });

  it("직접 제외: 사유가 있어야 하고 선정자만 가능하며 제외 이력(사유 포함)이 남는다", async () => {
    await seed(10, t("s", "선정"), t("n", "신청"));
    expect(await excludeSelected(store, "s", "  ", opts)).toMatchObject({ ok: false });
    expect((await excludeSelected(store, "n", "사유", opts)).ok).toBe(false);
    expect((await excludeSelected(store, "s", "부서 사정으로 제외", opts)).ok).toBe(true);
    const d = await store.readAll();
    expect(d.trainees.find((x) => x.id === "s")?.status).toBe("제외");
    expect(d.history[0]).toMatchObject({ kind: "제외", reason: "부서 사정으로 제외" });
    expect(openVacancies(d.trainees)).toHaveLength(1);
  });
});
