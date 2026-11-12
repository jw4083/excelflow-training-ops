// 작업 4 확인용 검사: 저장 창구와 개발용 파일 저장이 규칙대로 동작하는지 본다.
// 실제 data/ 폴더를 건드리지 않도록 매번 임시 폴더에 저장한다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Course, DrawRecord, History, Reply, SelectionRecord, Trainee } from "@/domain/types";
import { FileStore } from "@/store/fileStore";
import { StoreError, type Store } from "@/store";

let dir: string;
let file: string;
let store: FileStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "store-test-"));
  file = path.join(dir, "db.json");
  store = new FileStore(file);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// 테스트용 가짜 데이터 만들기
const now = "2026-11-12T09:00:00+09:00";
const trainee = (id: string, empNo: string, extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `김테스트${id}`,
  dept: "인재개발부",
  status: "신청",
  isManual: false,
  loginFails: 0,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const history = (id: string, extra: Partial<History> = {}): History => ({
  id,
  at: now,
  kind: "선정",
  before: { status: "신청" },
  after: { status: "선정" },
  ...extra,
});
const course: Course = {
  name: "테스트 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "테스트 교육장",
  notice: "안내문",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: now,
};

describe("작업 4: 저장 창구", () => {
  it("처음에는 비어 있다 (파일이 없어도 오류 없이)", async () => {
    const all = await store.readAll();
    expect(all).toEqual({ course: null, trainees: [], selections: [], draws: [], replies: [], history: [] });
    expect(await store.getCourse()).toBeNull();
  });

  it("저장한 내용은 파일에 남아, 새 저장소로 다시 열어도 그대로 읽힌다", async () => {
    await store.commit({ course, upsertTrainees: [trainee("t1", "001234")] });
    const reopened = new FileStore(file);
    expect(await reopened.getCourse()).toEqual(course);
    expect((await reopened.readAll()).trainees[0].empNo).toBe("001234"); // 앞자리 0 유지
  });

  it("저장 파일의 사번도 글자 그대로 들어간다 (숫자로 바뀌지 않음)", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "001234")] });
    expect(await readFile(file, "utf8")).toContain('"empNo": "001234"');
  });

  it("교육생: 같은 id로 저장하면 수정, 새 id면 추가 (지우지 않고 상태만 바뀜)", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "100001"), trainee("t2", "100002")] });
    await store.commit({ upsertTrainees: [trainee("t1", "100001", { status: "선정" })] });
    const { trainees } = await store.readAll();
    expect(trainees).toHaveLength(2);
    expect(trainees.find((t) => t.id === "t1")?.status).toBe("선정");
  });

  it("같은 사번 두 명은 거부한다 (글자 완전 일치: 001234와 1234는 다른 값이라 사번 규칙에서 거부)", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "100001")] });
    await expect(store.commit({ upsertTrainees: [trainee("t2", "100001")] })).rejects.toThrow(StoreError);
    await expect(store.commit({ upsertTrainees: [trainee("t3", "1234")] })).rejects.toThrow(/6자리/);
  });

  it("6자리 숫자가 아닌 사번은 거부한다", async () => {
    for (const bad of ["12345", "1234567", "12A456", ""]) {
      await expect(store.commit({ upsertTrainees: [trainee("x", bad)] })).rejects.toThrow(StoreError);
    }
  });

  it("규칙 위반이 한 건이라도 있으면 묶음 전체가 저장되지 않는다", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "100001")] });
    await expect(
      store.commit({
        course,
        upsertTrainees: [trainee("t2", "100002")], // 정상
        appendHistory: [history("h1"), history("h1")], // 같은 번호 두 번 → 위반
      }),
    ).rejects.toThrow(StoreError);
    const all = await store.readAll();
    expect(all.course).toBeNull();
    expect(all.trainees).toHaveLength(1); // t2도 저장되지 않음
    expect(all.history).toHaveLength(0);
  });

  it("변경 이력·추첨 기록·선별 기록은 추가만 되고, 같은 번호로 다시 저장(수정)하면 거부한다", async () => {
    const selection: SelectionRecord = { id: "s1", at: now, kind: "선별", traineeIds: ["t1"] };
    const draw: DrawRecord = {
      id: "d1",
      executedAt: now,
      seats: 20,
      waitSeats: 5,
      selected: [],
      waitlist: [],
      rejected: [],
    };
    await store.commit({ appendHistory: [history("h1")], appendSelections: [selection], appendDraws: [draw] });
    await store.commit({ appendHistory: [history("h2")] });
    expect((await store.readAll()).history.map((h) => h.id)).toEqual(["h1", "h2"]); // 쌓이기만 한다

    await expect(store.commit({ appendHistory: [history("h1", { reason: "고침" })] })).rejects.toThrow(/수정할 수 없습니다/);
    await expect(store.commit({ appendDraws: [{ ...draw, seats: 99 }] })).rejects.toThrow(/수정할 수 없습니다/);
    await expect(store.commit({ appendSelections: [{ ...selection, kind: "선별취소" }] })).rejects.toThrow(/수정할 수 없습니다/);
    expect((await store.readAll()).draws[0].seats).toBe(20); // 원래 값 그대로
  });

  it("저장소에는 삭제·기록 수정용 메서드가 없다 (PRD M1-4, M1-7)", () => {
    const methods = Object.getOwnPropertyNames(FileStore.prototype).filter((n) => n !== "constructor");
    expect(methods.sort()).toEqual(["commit", "getCourse", "getReply", "getTraineeByEmpNo", "load", "readAll", "save"].sort());
    for (const name of methods) expect(name).not.toMatch(/delete|remove|update|clear|drop/i);
  });

  it("교육생용 조회는 사번으로 본인 1명만 돌려주고, 없는 사번은 null이다", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "100001"), trainee("t2", "100002")] });
    const me = await store.getTraineeByEmpNo("100002");
    expect(me?.id).toBe("t2");
    expect(Array.isArray(me)).toBe(false);
    expect(await store.getTraineeByEmpNo("999999")).toBeNull();
    expect(await store.getTraineeByEmpNo("1002")).toBeNull();
  });

  it("조회한 결과를 고쳐도 저장된 내용은 바뀌지 않는다", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "100001")] });
    const all = await store.readAll();
    all.trainees[0].name = "바뀌면 안 됨";
    all.trainees.length = 0;
    expect((await store.readAll()).trainees[0].name).toBe("김테스트t1");
  });

  it("회신: 교육생당 최신 1건만 남고, 없는 교육생의 회신은 거부한다", async () => {
    await store.commit({ upsertTrainees: [trainee("t1", "100001")] });
    const reply: Reply = { traineeId: "t1", attend: true, laptop: true, submittedAt: now, byAdmin: false };
    await store.commit({ upsertReplies: [reply] });
    await store.commit({ upsertReplies: [{ ...reply, attend: false, absentType: "업무", absentDetail: "업무 일정으로 불참합니다" }] });
    const all = await store.readAll();
    expect(all.replies).toHaveLength(1);
    expect((await store.getReply("t1"))?.attend).toBe(false);
    expect(await store.getReply("없는사람")).toBeNull();
    await expect(store.commit({ upsertReplies: [{ ...reply, traineeId: "없는사람" }] })).rejects.toThrow(StoreError);
  });

  it("동시에 여러 번 저장해도 하나도 사라지지 않는다", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.commit({ upsertTrainees: [trainee(`t${i}`, String(100000 + i))], appendHistory: [history(`h${i}`)] }),
      ),
    );
    const all = await store.readAll();
    expect(all.trainees).toHaveLength(20);
    expect(all.history).toHaveLength(20);
  });

  it("앱이 쓰는 저장소는 Store 모양이다 (구현을 바꿔도 같은 모양)", () => {
    const asStore: Store = store; // 타입 검사용: FileStore가 Store 모양을 지키는지
    expect(typeof asStore.commit).toBe("function");
  });
});
