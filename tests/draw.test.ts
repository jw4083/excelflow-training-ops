// 작업 13 확인용 검사: 2차 랜덤 추첨 규칙(PRD M1-3·M1-4·M1-10)을 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { currentDrawId, drawLots, drawPool, parseDrawCounts } from "@/domain/draw";
import type { Course, Status, Trainee } from "@/domain/types";
import { runDraw } from "@/lib/draw";
import { FileStore } from "@/store/fileStore";

// 정해진 순서로 난수를 내는 함수 (같은 씨앗이면 항상 같은 결과 → 결과를 예측해 검사할 수 있다)
function seeded(seed: number) {
  let a = seed;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (max: number) => Math.floor(rand() * max);
}

const ids = (n: number, prefix = "t") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("작업 13: 추첨 대상", () => {
  const t = (status: Status) => ({ status });
  const list = [t("신청"), t("신청"), t("선정"), t("대기"), t("미선정"), t("불참"), t("제외")];

  it("첫 추첨은 '신청'인 사람만 대상이다", () => {
    expect(drawPool(list, 0)).toHaveLength(2);
  });

  it("재추첨은 직전 결과의 '대기·미선정'만 대상이다 (선정·불참·제외·신청은 아님)", () => {
    expect(drawPool(list, 1).map((x) => x.status)).toEqual(["대기", "미선정"]);
  });
});

describe("작업 13: 무작위 뽑기", () => {
  it("선정·대기·미선정으로 나뉘고, 모든 후보가 정확히 한 곳에만 들어간다", () => {
    const r = drawLots(ids(20), 5, 4, seeded(1));
    expect(r.selected).toHaveLength(5);
    expect(r.waitlist).toHaveLength(4);
    expect(r.rejected).toHaveLength(11);
    const all = [...r.selected, ...r.waitlist, ...r.rejected];
    expect(new Set(all).size).toBe(20); // 겹침 없음
    expect(all.sort()).toEqual(ids(20).sort()); // 빠진 사람 없음
  });

  it("같은 난수 순서면 결과가 같고, 다르면 결과가 달라진다", () => {
    expect(drawLots(ids(30), 10, 5, seeded(7))).toEqual(drawLots(ids(30), 10, 5, seeded(7)));
    expect(drawLots(ids(30), 10, 5, seeded(7)).selected).not.toEqual(drawLots(ids(30), 10, 5, seeded(8)).selected);
  });

  it("원래 목록 순서와 상관없이 섞인다 (앞쪽 사람이 유리하지 않다)", () => {
    const r = drawLots(ids(30), 10, 0, seeded(3));
    expect(r.selected).not.toEqual(ids(30).slice(0, 10));
  });

  it("후보가 뽑을 인원보다 적으면 모두 선정되고 대기·미선정은 비어 있다", () => {
    expect(drawLots(ids(3), 5, 2, seeded(1))).toMatchObject({ selected: expect.any(Array), waitlist: [], rejected: [] });
    expect(drawLots(ids(3), 5, 2, seeded(1)).selected).toHaveLength(3);
  });

  it("대기 인원이 남은 인원보다 많아도 남은 만큼만 대기가 된다", () => {
    const r = drawLots(ids(8), 5, 10, seeded(1));
    expect(r.waitlist).toHaveLength(3);
    expect(r.rejected).toHaveLength(0);
  });

  it("기본 난수(암호용)로 여러 번 뽑으면 모든 사람의 당첨 확률이 고르다 (10명 중 3명, 5,000번)", () => {
    const counts = new Map<string, number>();
    const random = (max: number) => Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * max);
    for (let i = 0; i < 5000; i++) {
      for (const id of drawLots(ids(10), 3, 0, random).selected) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of ids(10)) {
      const rate = (counts.get(id) ?? 0) / 5000;
      expect(rate).toBeGreaterThan(0.25); // 기대값 0.30
      expect(rate).toBeLessThan(0.35);
    }
  });

  it("가장 최근 추첨 기록만 '현재 반영'으로 본다", () => {
    expect(currentDrawId([])).toBeNull();
    expect(currentDrawId([{ id: "d1" }, { id: "d2" }, { id: "d3" }])).toBe("d3");
  });
});

describe("작업 13: 입력 검사 (선발 인원·대기 인원)", () => {
  it("올바른 숫자는 통과한다 (대기 인원 0도 가능)", () => {
    expect(parseDrawCounts({ capacity: "20", waitSeats: "5" })).toEqual({ ok: true, capacity: 20, waitSeats: 5 });
    expect(parseDrawCounts({ capacity: " 20 ", waitSeats: "0" })).toEqual({ ok: true, capacity: 20, waitSeats: 0 });
  });

  it("빈 칸·숫자가 아닌 값·범위를 벗어난 값은 칸마다 오류가 나온다", () => {
    const r = parseDrawCounts({ capacity: "", waitSeats: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.capacity).toBe("선발 인원 칸을 입력해 주세요.");
      expect(r.errors.waitSeats).toContain("0을 입력합니다");
    }
    for (const bad of ["12명", "-1", "1.5", "1e3", "abc", "0", "1001"]) {
      expect(parseDrawCounts({ capacity: bad, waitSeats: "0" }).ok).toBe(false);
    }
    expect(parseDrawCounts({ capacity: "10", waitSeats: "1001" }).ok).toBe(false);
    expect(parseDrawCounts({ capacity: "1", waitSeats: "0" }).ok).toBe(true); // 경계값
    expect(parseDrawCounts({ capacity: "1000", waitSeats: "1000" }).ok).toBe(true);
  });

  it("오류 문구는 조사가 맞는 문장이다", () => {
    const r = parseDrawCounts({ capacity: "abc", waitSeats: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) for (const m of Object.values(r.errors)) expect(m).not.toContain("(를)");
  });
});

// ─────────────────────── 저장까지 포함한 추첨 ───────────────────────

let dir: string;
let store: FileStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "draw-test-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T10:00:00+09:00";
const course: Course = {
  name: "테스트 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "테스트 교육장",
  notice: "안내문",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: T0,
};
const person = (i: number, status: Status = "신청", extra: Partial<Trainee> = {}): Trainee => ({
  id: `p${i}`,
  empNo: String(100000 + i),
  name: `김테스트${i}`,
  dept: "인재개발부",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
let n = 0;
const opts = (seed = 1) => ({ now: NOW, newId: () => `id${++n}`, randomInt: seeded(seed) });
const seed = async (trainees: Trainee[], c: Course | null = course) =>
  store.commit({ ...(c ? { course: c } : {}), upsertTrainees: trainees });
const count = (list: Trainee[], status: Status) => list.filter((t) => t.status === status).length;

describe("작업 13: 첫 추첨 실행", () => {
  it("정원 − 현재 선정 수만큼 뽑아 선정·대기(1번부터)·미선정으로 저장한다", async () => {
    // 신청 10명 + 1차 선별로 이미 선정된 3명. 정원 8 → 새로 뽑을 인원 5, 대기 3, 나머지 2는 미선정
    await seed([...Array.from({ length: 10 }, (_, i) => person(i)), ...[100, 101, 102].map((i) => person(i, "선정", { selectedVia: "선별" }))]);
    const r = await runDraw(store, { capacity: "8", waitSeats: "3" }, opts());
    expect(r).toMatchObject({ ok: true, selected: 5, waitlist: 3, rejected: 2, shortage: 0, redraw: false });

    const { trainees } = await store.readAll();
    expect(count(trainees, "선정")).toBe(8); // 3(선별) + 5(추첨) = 정원
    expect(count(trainees, "대기")).toBe(3);
    expect(count(trainees, "미선정")).toBe(2);
    expect(count(trainees, "신청")).toBe(0); // 신청자는 모두 결과가 나왔다
    expect(trainees.filter((t) => t.status === "대기").map((t) => t.waitNo).sort()).toEqual([1, 2, 3]);
    expect(trainees.filter((t) => t.selectedVia === "추첨")).toHaveLength(5);
    // 이미 선정된 사람은 그대로
    for (const i of [100, 101, 102]) expect(trainees.find((t) => t.id === `p${i}`)).toMatchObject({ status: "선정", selectedVia: "선별" });
  });

  it("추첨 기록(실행 일시·정원·결과)이 저장되고, 기록의 목록이 실제 상태와 일치한다", async () => {
    await seed(Array.from({ length: 10 }, (_, i) => person(i)));
    await runDraw(store, { capacity: "4", waitSeats: "2" }, opts());
    const { draws, trainees } = await store.readAll();

    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ executedAt: NOW, seats: 4, waitSeats: 2 });
    expect(draws[0].selected).toHaveLength(4);
    expect(draws[0].waitlist).toHaveLength(2);
    expect(draws[0].rejected).toHaveLength(4);
    for (const id of draws[0].selected) expect(trainees.find((t) => t.id === id)?.status).toBe("선정");
    draws[0].waitlist.forEach((id, i) => expect(trainees.find((t) => t.id === id)).toMatchObject({ status: "대기", waitNo: i + 1 }));
    for (const id of draws[0].rejected) expect(trainees.find((t) => t.id === id)?.status).toBe("미선정");
  });

  it("정원이 과정에 저장되지만, 과정 정보의 '최종 수정 일시'는 바뀌지 않는다", async () => {
    await seed(Array.from({ length: 5 }, (_, i) => person(i)));
    await runDraw(store, { capacity: "3", waitSeats: "0" }, opts());
    const saved = await store.getCourse();
    expect(saved?.capacity).toBe(3);
    expect(saved?.updatedAt).toBe(T0);
    expect(saved?.name).toBe("테스트 과정"); // 다른 항목은 그대로
  });

  it("사람마다 '추첨' 이력이 남고, 추첨 전체를 요약하는 이력 1건(정원 변경 포함)도 남는다", async () => {
    await seed(Array.from({ length: 6 }, (_, i) => person(i)));
    await runDraw(store, { capacity: "2", waitSeats: "2" }, opts());
    const { history } = await store.readAll();

    const perPerson = history.filter((h) => h.traineeId);
    const summary = history.filter((h) => !h.traineeId);
    expect(perPerson).toHaveLength(6);
    expect(perPerson.every((h) => h.kind === "추첨" && h.at === NOW && (h.before as { status: string }).status === "신청")).toBe(true);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ kind: "추첨", before: { capacity: null }, after: { capacity: 2, redraw: false, 선정: 2, 대기: 2, 미선정: 2 } });
  });

  it("같은 난수 순서로 실행하면 결과가 같다 (결과를 검사로 재현할 수 있다)", async () => {
    const run = async (seedNo: number) => {
      const s = new FileStore(path.join(dir, `db-${seedNo}-${Math.random()}.json`));
      await s.commit({ course, upsertTrainees: Array.from({ length: 12 }, (_, i) => person(i)) });
      const r = await runDraw(s, { capacity: "4", waitSeats: "3" }, opts(seedNo));
      return r.ok ? r.record.selected : [];
    };
    expect(await run(5)).toEqual(await run(5));
  });

  it("새로 선정되는 사람에게만 개별 회신 기한이 저장된다 (대기·미선정에는 없음)", async () => {
    await seed(Array.from({ length: 6 }, (_, i) => person(i)));
    const r = await runDraw(store, { capacity: "2", waitSeats: "2", replyDeadline: "2026-11-25T18:00" }, opts());
    expect(r.ok).toBe(true);
    const { trainees } = await store.readAll();
    for (const t of trainees) {
      if (t.status === "선정") expect(t.replyDeadline).toBe("2026-11-25T18:00:00+09:00");
      else expect(t.replyDeadline).toBeUndefined();
    }
  });

  it("대상자가 뽑을 인원보다 적으면 모두 선정하고, 못 채운 자리 수를 알려 준다", async () => {
    await seed([person(0), person(1)]);
    const r = await runDraw(store, { capacity: "5", waitSeats: "2" }, opts());
    expect(r).toMatchObject({ ok: true, selected: 2, waitlist: 0, rejected: 0, shortage: 3 });
  });
});

describe("작업 13: 추첨이 거부되는 경우 (아무것도 저장되지 않는다)", () => {
  const nothingSaved = async (before: number) => {
    const all = await store.readAll();
    expect(all.draws).toHaveLength(0);
    expect(all.history).toHaveLength(0);
    expect(all.trainees.filter((t) => t.status === "신청")).toHaveLength(before);
    expect(all.course?.capacity).toBeUndefined();
  };

  it("과정 정보가 없으면 거부한다 (정원은 과정에 저장되므로)", async () => {
    await seed([person(0)], null);
    const r = await runDraw(store, { capacity: "1", waitSeats: "0" }, opts());
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.reason).toContain("과정 정보");
    expect((await store.readAll()).draws).toHaveLength(0);
  });

  it("이미 정원이 찼으면 거부하고 이유를 알려 준다 (정원 8·선정 8)", async () => {
    await seed([...Array.from({ length: 3 }, (_, i) => person(i)), ...Array.from({ length: 8 }, (_, i) => person(100 + i, "선정", { selectedVia: "선별" }))]);
    const r = await runDraw(store, { capacity: "8", waitSeats: "0" }, opts());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("이미 정원이 찼습니다");
      expect(r.reason).toContain("정원 8명, 현재 선정 8명");
      expect(r.errors?.capacity).toBeDefined();
    }
    await nothingSaved(3);
  });

  it("정원이 현재 선정 수보다 작아도 거부한다", async () => {
    await seed([person(0), ...Array.from({ length: 5 }, (_, i) => person(100 + i, "선정", { selectedVia: "선별" }))]);
    expect((await runDraw(store, { capacity: "3", waitSeats: "0" }, opts())).ok).toBe(false);
    await nothingSaved(1);
  });

  it("추첨 대상(신청자)이 없으면 거부한다", async () => {
    await seed([person(0, "선정", { selectedVia: "선별" })]);
    const r = await runDraw(store, { capacity: "5", waitSeats: "0" }, opts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("신청");
  });

  it("입력이 틀리면 칸마다 오류를 돌려주고 저장하지 않는다", async () => {
    await seed(Array.from({ length: 4 }, (_, i) => person(i)));
    const r = await runDraw(store, { capacity: "abc", waitSeats: "" }, opts());
    expect(r).toMatchObject({ ok: false, errors: { capacity: expect.any(String), waitSeats: expect.any(String) } });
    await nothingSaved(4);
  });

  it("회신 기한이 올바르지 않거나 지금보다 앞이면 거부한다", async () => {
    await seed(Array.from({ length: 4 }, (_, i) => person(i)));
    const bad = await runDraw(store, { capacity: "2", waitSeats: "0", replyDeadline: "2026-02-31T10:00" }, opts());
    expect(bad).toMatchObject({ ok: false, errors: { replyDeadline: expect.stringContaining("올바르지") } });
    const past = await runDraw(store, { capacity: "2", waitSeats: "0", replyDeadline: "2026-11-10T10:00" }, opts());
    expect(past).toMatchObject({ ok: false, errors: { replyDeadline: expect.stringContaining("지금보다 뒤") } });
    await nothingSaved(4);
  });
});

describe("작업 13: 재추첨 (이전 기록은 그대로, 새 기록 추가)", () => {
  /** 첫 추첨: 신청 12명, 정원 4, 대기 3 → 선정 4·대기 3·미선정 5 */
  async function firstDraw() {
    await seed(Array.from({ length: 12 }, (_, i) => person(i)));
    const r = await runDraw(store, { capacity: "4", waitSeats: "3" }, opts(1));
    if (!r.ok) throw new Error(r.reason);
    return r.record;
  }

  it("선정자는 그대로 두고, 대기·미선정자 중에서 빈자리만큼 다시 뽑는다", async () => {
    const first = await firstDraw();
    // 선정자 2명이 불참·제외로 빠져서 빈자리 2개가 생겼다고 가정
    await store.commit({
      upsertTrainees: first.selected.slice(0, 2).map((id, i) => ({ ...person(Number(id.slice(1))), status: (i === 0 ? "불참" : "제외") as Status })),
    });
    const stayers = first.selected.slice(2);

    const r = await runDraw(store, { capacity: "4", waitSeats: "2" }, opts(2));
    expect(r).toMatchObject({ ok: true, redraw: true, selected: 2, waitlist: 2 });

    const { trainees, draws } = await store.readAll();
    for (const id of stayers) expect(trainees.find((t) => t.id === id)?.status).toBe("선정"); // 선정자는 그대로
    expect(count(trainees, "선정")).toBe(4); // 정원이 다시 찼다
    // 재추첨의 대상은 첫 추첨의 대기·미선정자뿐이다
    const pool = new Set([...first.waitlist, ...first.rejected]);
    for (const id of draws[1].selected) expect(pool.has(id)).toBe(true);
    for (const id of draws[1].waitlist) expect(pool.has(id)).toBe(true);
  });

  it("추첨 기록은 쌓이기만 한다: 이전 기록은 그대로 남고, 가장 최근 기록만 '현재 반영'이다", async () => {
    const first = await firstDraw();
    await store.commit({ upsertTrainees: [{ ...person(Number(first.selected[0].slice(1))), status: "제외" as Status }] });
    await runDraw(store, { capacity: "4", waitSeats: "3" }, opts(2));
    const { draws } = await store.readAll();

    expect(draws).toHaveLength(2);
    expect(draws[0]).toEqual(first); // 첫 기록은 한 글자도 바뀌지 않았다
    expect(currentDrawId(draws)).toBe(draws[1].id);
  });

  it("대기 순번은 새 기록 기준으로 1번부터 다시 매겨진다", async () => {
    const first = await firstDraw();
    await store.commit({ upsertTrainees: [{ ...person(Number(first.selected[0].slice(1))), status: "제외" as Status }] });
    await runDraw(store, { capacity: "4", waitSeats: "3" }, opts(3));
    const { trainees, draws } = await store.readAll();
    const waiting = trainees.filter((t) => t.status === "대기").map((t) => t.waitNo).sort();
    expect(waiting).toEqual([1, 2, 3]);
    draws[1].waitlist.forEach((id, i) => expect(trainees.find((t) => t.id === id)?.waitNo).toBe(i + 1));
  });

  it("재추첨에서 정원을 바꾸면 새 값이 저장되고, 요약 이력에 변경 전·후가 남는다", async () => {
    await firstDraw();
    const r = await runDraw(store, { capacity: "6", waitSeats: "2" }, opts(4)); // 정원 4 → 6
    expect(r).toMatchObject({ ok: true, redraw: true, selected: 2 });
    expect((await store.getCourse())?.capacity).toBe(6);
    const summary = (await store.readAll()).history.filter((h) => !h.traineeId).at(-1);
    expect(summary).toMatchObject({ before: { capacity: 4 }, after: { capacity: 6, redraw: true } });
  });

  it("재추첨에서 계속 미선정인 사람은 이력이 새로 생기지 않는다 (바뀐 것이 없으므로)", async () => {
    await firstDraw();
    const before = (await store.readAll()).history.length;
    await runDraw(store, { capacity: "5", waitSeats: "3" }, opts(5)); // 선정 4 → 5 (1명만 새로 선정)
    const { history } = await store.readAll();
    const added = history.length - before;
    // 새로 선정된 1명 + 순번이 바뀐 대기자 + 요약 1건. 계속 미선정인 사람(최대 5명)의 이력은 없다
    expect(added).toBeLessThan(8);
    expect(history.at(-1)).toMatchObject({ kind: "추첨" });
  });

  it("재추첨 대상이 없으면 거부한다 (대기·미선정이 없을 때)", async () => {
    await seed(Array.from({ length: 4 }, (_, i) => person(i)));
    await runDraw(store, { capacity: "4", waitSeats: "0" }, opts()); // 전원 선정, 대기·미선정 없음
    await store.commit({ upsertTrainees: [{ ...person(0), status: "제외" as Status }] });
    const r = await runDraw(store, { capacity: "4", waitSeats: "0" }, opts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("재추첨 대상이 없습니다");
  });
});

describe("작업 13: 많은 인원", () => {
  it("1,000명을 추첨해도 빠르게 끝나고 결과가 정확하다", async () => {
    await seed(Array.from({ length: 1000 }, (_, i) => person(i)));
    const started = Date.now();
    const r = await runDraw(store, { capacity: "300", waitSeats: "200" }, opts());
    const seconds = (Date.now() - started) / 1000;
    expect(r).toMatchObject({ ok: true, selected: 300, waitlist: 200, rejected: 500 });
    const all = await store.readAll();
    expect(count(all.trainees, "선정")).toBe(300);
    expect(count(all.trainees, "대기")).toBe(200);
    expect(all.history).toHaveLength(1001); // 1,000명 + 요약 1건
    expect(seconds).toBeLessThan(20); // 혼자 돌리면 약 5초지만, 다른 검사와 동시에 돌 때 느려질 수 있어 여유를 둔다
  }, 30000);
});
