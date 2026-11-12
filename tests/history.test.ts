// 작업 6 확인용 검사: 상태 변경이 항상 변경 이력과 함께, 한 묶음으로 저장되는지 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Course, DrawRecord, Trainee } from "@/domain/types";
import { changeStatus, changeStatuses } from "@/lib/history";
import { FileStore } from "@/store/fileStore";

let dir: string;
let store: FileStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "history-test-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const COURSE_DEADLINE_OK = "2026-11-20T18:00:00+09:00";
const COURSE_DEADLINE_PAST = "2026-11-10T18:00:00+09:00";

const trainee = (id: string, empNo: string, extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `김테스트${id}`,
  dept: "인재개발부",
  status: "신청",
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const course = (replyDeadline: string): Course => ({
  name: "테스트 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "테스트 교육장",
  notice: "안내문",
  replyDeadline,
  updatedAt: T0,
});

// 고정된 일시·번호로 결과를 예측할 수 있게 한다
let n = 0;
const opts = () => ({ now: NOW, newId: () => `id${++n}` });

async function seed(trainees: Trainee[], deadline = COURSE_DEADLINE_OK) {
  await store.commit({ course: course(deadline), upsertTrainees: trainees });
}

describe("작업 6: 변경 이력 기록 함수", () => {
  it("상태를 바꾸면 이력이 자동으로 남는다 (일시·변경 전·변경 후)", async () => {
    await seed([trainee("t1", "100001")]);
    const r = await changeStatus(store, { action: "선별", traineeId: "t1" }, {}, opts());
    expect(r.ok).toBe(true);

    const all = await store.readAll();
    expect(all.trainees[0]).toMatchObject({ status: "선정", selectedVia: "선별", updatedAt: NOW });
    expect(all.history).toHaveLength(1);
    expect(all.history[0]).toMatchObject({
      at: NOW,
      kind: "선정",
      traineeId: "t1",
      before: { status: "신청" },
      after: { status: "선정", selectedVia: "선별" },
    });
  });

  it("규칙에 어긋나면 상태도 이력도 저장되지 않고, 이유를 돌려준다", async () => {
    await seed([trainee("t1", "100001", { status: "제외" })]);
    const r = await changeStatus(store, { action: "선별", traineeId: "t1" }, {}, opts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("선별");
    const all = await store.readAll();
    expect(all.trainees[0].status).toBe("제외");
    expect(all.history).toHaveLength(0);
  });

  it("없는 교육생은 거부한다", async () => {
    const r = await changeStatus(store, { action: "선별", traineeId: "없음" }, {}, opts());
    expect(r).toMatchObject({ ok: false, reason: "교육생을 찾을 수 없습니다." });
  });

  it("선별 취소: 신청으로 돌아가고 선정 경로가 지워지며 이력은 '선별취소'로 남는다", async () => {
    await seed([trainee("t1", "100001", { status: "선정", selectedVia: "선별" })]);
    const r = await changeStatus(store, { action: "선별취소", traineeId: "t1" }, {}, opts());
    expect(r.ok).toBe(true);
    const all = await store.readAll();
    expect(all.trainees[0].status).toBe("신청");
    expect(all.trainees[0].selectedVia).toBeUndefined();
    expect(all.history[0].kind).toBe("선별취소");
  });

  it("추첨 후에는 선별 취소가 거부된다 (추첨 기록이 있으면)", async () => {
    await seed([trainee("t1", "100001", { status: "선정", selectedVia: "선별" })]);
    const draw: DrawRecord = { id: "d1", executedAt: T0, seats: 5, waitSeats: 2, selected: [], waitlist: [], rejected: [] };
    await store.commit({ appendDraws: [draw] });
    const r = await changeStatus(store, { action: "선별취소", traineeId: "t1" }, {}, opts());
    expect(r.ok).toBe(false);
  });

  it("추첨 결과: 대기 순번은 대기일 때만 갖고, 선정이 되면 사라진다", async () => {
    await seed([trainee("t1", "100001"), trainee("t2", "100002")]);
    await changeStatuses(
      store,
      [
        { action: "추첨", traineeId: "t1", to: "대기", patch: { waitNo: 1 } },
        { action: "추첨", traineeId: "t2", to: "미선정" },
      ],
      {},
      opts(),
    );
    let all = await store.readAll();
    expect(all.trainees.find((t) => t.id === "t1")).toMatchObject({ status: "대기", waitNo: 1 });
    expect(all.trainees.find((t) => t.id === "t1")?.selectedVia).toBeUndefined(); // 대기는 선정이 아니므로 선정 경로 없음
    expect(all.history.map((h) => h.kind)).toEqual(["추첨", "추첨"]);

    // 추첨 기록이 생긴 뒤의 재추첨: 대기 → 선정이 되면 순번이 지워진다
    const draw: DrawRecord = { id: "d1", executedAt: T0, seats: 1, waitSeats: 1, selected: [], waitlist: ["t1"], rejected: ["t2"] };
    await store.commit({ appendDraws: [draw] });
    await changeStatus(store, { action: "추첨", traineeId: "t1", to: "선정" }, {}, opts());
    all = await store.readAll();
    expect(all.trainees.find((t) => t.id === "t1")).toMatchObject({ status: "선정", selectedVia: "추첨" });
    expect(all.trainees.find((t) => t.id === "t1")?.waitNo).toBeUndefined();
  });

  it("불참 회신: 교육생 본인은 '불참', 담당자 대리 입력은 '회신대리입력'이고 기한 후에도 가능", async () => {
    await seed([trainee("t1", "100001", { status: "선정" }), trainee("t2", "100002", { status: "선정" })], COURSE_DEADLINE_PAST);
    const mine = await changeStatus(store, { action: "불참회신", traineeId: "t1" }, {}, opts());
    expect(mine.ok).toBe(false); // 기한이 지나서 교육생은 못 함
    const byAdmin = await changeStatus(store, { action: "불참회신", traineeId: "t2", byAdmin: true }, {}, opts());
    expect(byAdmin.ok).toBe(true);
    const all = await store.readAll();
    expect(all.history).toHaveLength(1);
    expect(all.history[0].kind).toBe("회신대리입력");
  });

  it("개별 회신 기한이 있으면 과정 기한이 지났어도 회신할 수 있다", async () => {
    await seed([trainee("t1", "100001", { status: "선정", replyDeadline: COURSE_DEADLINE_OK })], COURSE_DEADLINE_PAST);
    const r = await changeStatus(store, { action: "불참회신", traineeId: "t1" }, {}, opts());
    expect(r.ok).toBe(true);
    expect((await store.readAll()).history[0].kind).toBe("불참");
  });

  it("불참 → 참석 재회신: 선정 경로는 그대로 유지되고 이력은 '회신'", async () => {
    await seed([trainee("t1", "100001", { status: "불참", selectedVia: "추첨" })]);
    const r = await changeStatus(store, { action: "참석재회신", traineeId: "t1" }, {}, opts());
    expect(r.ok).toBe(true);
    const all = await store.readAll();
    expect(all.trainees[0]).toMatchObject({ status: "선정", selectedVia: "추첨" });
    expect(all.history[0]).toMatchObject({ kind: "회신", before: { status: "불참" }, after: { status: "선정" } });
  });

  it("직접 제외는 사유가 꼭 있어야 하고, 사유는 이력에 남는다", async () => {
    await seed([trainee("t1", "100001", { status: "선정" })]);
    expect((await changeStatus(store, { action: "직접제외", traineeId: "t1" }, {}, opts())).ok).toBe(false);
    expect((await changeStatus(store, { action: "직접제외", traineeId: "t1", reason: "  " }, {}, opts())).ok).toBe(false);
    const r = await changeStatus(store, { action: "직접제외", traineeId: "t1", reason: "업무 사정으로 제외" }, {}, opts());
    expect(r.ok).toBe(true);
    const all = await store.readAll();
    expect(all.history[0]).toMatchObject({ kind: "제외", reason: "업무 사정으로 제외" });
  });

  it("충원 확정: 자리 처리와 새 선정이 이력 2건과 함께 한 묶음으로 저장된다", async () => {
    await seed([
      trainee("slot", "100001", { status: "불참", selectedVia: "추첨" }),
      trainee("w1", "100002", { status: "대기", waitNo: 1 }),
    ]);
    const r = await changeStatuses(
      store,
      [
        { action: "충원자리처리", traineeId: "slot", patch: { replacedBy: "w1" }, reason: "충원 확정" },
        { action: "충원선정", traineeId: "w1", patch: { replacedFor: "slot", replyDeadline: COURSE_DEADLINE_OK } },
      ],
      {},
      opts(),
    );
    expect(r.ok).toBe(true);
    const all = await store.readAll();
    expect(all.trainees.find((t) => t.id === "slot")).toMatchObject({ status: "제외", replacedBy: "w1" });
    expect(all.trainees.find((t) => t.id === "w1")).toMatchObject({
      status: "선정",
      selectedVia: "충원",
      replacedFor: "slot",
      replyDeadline: COURSE_DEADLINE_OK,
    });
    expect(all.trainees.find((t) => t.id === "w1")?.waitNo).toBeUndefined();
    expect(all.history.map((h) => h.kind)).toEqual(["제외", "충원"]);
  });

  it("묶음 중 한 건이 규칙에 어긋나면 앞의 변경도 저장되지 않는다", async () => {
    await seed([
      trainee("slot", "100001", { status: "불참" }),
      trainee("w1", "100002", { status: "대기", waitNo: 1 }),
      trainee("u1", "100003", { status: "미선정" }),
    ]);
    // 대기자가 남아 있는데 미선정자를 충원하려는 잘못된 요청
    const r = await changeStatuses(
      store,
      [
        { action: "충원자리처리", traineeId: "slot", patch: { replacedBy: "u1" } },
        { action: "충원선정", traineeId: "u1" },
      ],
      {},
      opts(),
    );
    expect(r).toMatchObject({ ok: false, failedIndex: 1 });
    const all = await store.readAll();
    expect(all.trainees.find((t) => t.id === "slot")).toMatchObject({ status: "불참" }); // 그대로
    expect(all.trainees.find((t) => t.id === "slot")?.replacedBy).toBeUndefined();
    expect(all.history).toHaveLength(0);
  });

  it("함께 저장할 변경(추첨 기록·정원)도 같은 묶음이라, 상태 변경이 실패하면 같이 저장되지 않는다", async () => {
    await seed([trainee("t1", "100001", { status: "제외" })]);
    const draw: DrawRecord = { id: "d1", executedAt: NOW, seats: 5, waitSeats: 0, selected: [], waitlist: [], rejected: [] };
    const bad = await changeStatus(
      store,
      { action: "선별", traineeId: "t1" },
      { appendDraws: [draw], course: { ...course(COURSE_DEADLINE_OK), capacity: 5 } },
      opts(),
    );
    expect(bad.ok).toBe(false);
    let all = await store.readAll();
    expect(all.draws).toHaveLength(0);
    expect(all.course?.capacity).toBeUndefined();

    await seed([trainee("t2", "100002")]);
    const good = await changeStatus(
      store,
      { action: "선별", traineeId: "t2" },
      { appendDraws: [draw], course: { ...course(COURSE_DEADLINE_OK), capacity: 5 } },
      opts(),
    );
    expect(good.ok).toBe(true);
    all = await store.readAll();
    expect(all.draws).toHaveLength(1);
    expect(all.course?.capacity).toBe(5);
  });

  it("수기 추가: 선정 + 수기 표시로 들어가고 이력('수기추가', 변경 전 없음)이 남는다", async () => {
    await seed([]);
    const r = await changeStatus(
      store,
      {
        action: "수기추가",
        newTrainee: { empNo: "001234", name: "박테스트", dept: "정보화부", manualReason: "추가 요청", replyDeadline: COURSE_DEADLINE_OK },
      },
      {},
      opts(),
    );
    expect(r.ok).toBe(true);
    const all = await store.readAll();
    expect(all.trainees[0]).toMatchObject({
      empNo: "001234", // 앞자리 0 유지
      status: "선정",
      isManual: true,
      manualReason: "추가 요청",
      selectedVia: "수기",
      replyDeadline: COURSE_DEADLINE_OK,
      loginFails: 0,
    });
    expect(all.history[0]).toMatchObject({ kind: "수기추가", before: null });
    expect(all.history[0].traineeId).toBe(all.trainees[0].id);
  });

  it("수기 추가는 입력이 모자라거나 사번이 틀리거나 이미 있으면 거부한다 (PRD M1-6, M1-9)", async () => {
    await seed([trainee("t1", "100001")]);
    const base = { empNo: "100009", name: "박테스트", dept: "정보화부", manualReason: "추가 요청" };
    const run = (newTrainee: typeof base) => changeStatus(store, { action: "수기추가", newTrainee }, {}, opts());

    expect(await run({ ...base, manualReason: "" })).toMatchObject({ ok: false });
    expect(await run({ ...base, name: " " })).toMatchObject({ ok: false });
    expect(await run({ ...base, empNo: "12345" })).toMatchObject({ ok: false, reason: "사번은 숫자 6자리입니다." });
    expect(await run({ ...base, empNo: "100001" })).toMatchObject({ ok: false, reason: "이미 명단에 있는 사번입니다." });
    expect((await store.readAll()).trainees).toHaveLength(1);
    expect((await store.readAll()).history).toHaveLength(0);
  });

  it("이력은 쌓이기만 한다: 여러 번 바꿔도 이전 이력이 그대로 남고 순서대로 늘어난다", async () => {
    await seed([trainee("t1", "100001")]);
    await changeStatus(store, { action: "선별", traineeId: "t1" }, {}, opts());
    await changeStatus(store, { action: "불참회신", traineeId: "t1" }, {}, opts());
    await changeStatus(store, { action: "참석재회신", traineeId: "t1" }, {}, opts());
    const { history } = await store.readAll();
    expect(history.map((h) => h.kind)).toEqual(["선정", "불참", "회신"]);
    expect(new Set(history.map((h) => h.id)).size).toBe(3); // 번호는 모두 다름
  });

  it("바뀐 항목만 변경 전·후에 기록한다", async () => {
    await seed([trainee("t1", "100001", { status: "불참", selectedVia: "추첨" })]);
    await changeStatus(store, { action: "충원자리처리", traineeId: "t1", patch: { replacedBy: "x" } }, {}, opts());
    const [h] = (await store.readAll()).history;
    expect(h.before).toEqual({ status: "불참" }); // 선정 경로(추첨)는 안 바뀌었으므로 기록하지 않음
    expect(h.after).toEqual({ status: "제외", replacedBy: "x" });
  });

  it("일시를 따로 넘기지 않으면 지금 시각이 기록된다", async () => {
    await seed([trainee("t1", "100001")]);
    const before = Date.now();
    await changeStatus(store, { action: "선별", traineeId: "t1" });
    const at = Date.parse((await store.readAll()).history[0].at);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
