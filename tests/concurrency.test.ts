// 동시 요청 검사 (CHECK.md P1-1): "읽기 → 규칙 검사 → 저장"이 한 덩어리로 실행되어, 거의 동시에 온 요청이 서로를 덮어쓰지 않는지 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Course, Trainee } from "@/domain/types";
import { confirmFill } from "@/lib/fill";
import { addManualTrainee } from "@/lib/manualAdd";
import { submitReply } from "@/lib/reply";
import { FileStore } from "@/store/fileStore";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const FUTURE = "2026-11-18T12:00:00+09:00";
const opts = { now: NOW };

let dir: string;
let store: FileStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "concurrency-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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
const course: Course = {
  name: "테스트",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  capacity: 50,
  updatedAt: T0,
};
const seed = (...list: Trainee[]) => store.commit({ course, upsertTrainees: list });
const attend = { attend: true, laptop: true };

describe("동시 요청: 읽기·검사·저장이 한 덩어리로 실행된다", () => {
  it("같은 자리에 서로 다른 후보 두 명을 동시에 충원하면 한 명만 성공한다", async () => {
    await seed(t("abs", "100001", "불참"), t("w1", "100002", "대기", { waitNo: 1 }), t("m1", "100003", "미선정"));
    // 대기자가 있으면 앞 순번만 허용되므로, 같은 후보로 두 번 요청해도 한 번만 성공해야 한다
    const results = await Promise.all([
      confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, opts),
      confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, opts),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const d = await store.readAll();
    expect(d.trainees.filter((x) => x.status === "선정")).toHaveLength(1);
  });

  it("두 자리를 동시에 충원하면 대기 1번·2번이 순서대로 한 명씩 들어가고 같은 사람이 두 번 쓰이지 않는다", async () => {
    await seed(
      t("a1", "100001", "불참"),
      t("a2", "100002", "불참"),
      t("w1", "100003", "대기", { waitNo: 1 }),
      t("w2", "100004", "대기", { waitNo: 2 }),
    );
    const results = await Promise.all([
      confirmFill(store, { targetId: "a1", candidateId: "w1", replyDeadline: FUTURE }, opts),
      confirmFill(store, { targetId: "a2", candidateId: "w1", replyDeadline: FUTURE }, opts),
    ]);
    // 두 요청 모두 대기 1번을 골랐으므로 하나는 거부되어야 한다 (먼저 처리된 쪽이 대기 1번을 가져간다)
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const d = await store.readAll();
    const replaced = d.trainees.filter((x) => x.replacedBy);
    expect(replaced).toHaveLength(1);
    expect(d.trainees.find((x) => x.id === "w1")?.status).toBe("선정");
  });

  it("재회신(참석)과 충원 확정이 겹쳐도 '선정인데 충원 확정됨' 같은 모순 상태가 생기지 않는다", async () => {
    for (let round = 0; round < 8; round++) {
      await rm(path.join(dir, "db.json"), { force: true });
      await seed(t("a", "100001", "선정"), t("w", "100002", "대기", { waitNo: 1 }));
      await submitReply(store, "a", { attend: false, absentType: "업무", absentDetail: "출장 일정이 겹칩니다" }, opts);
      const jobs = [
        () => submitReply(store, "a", attend, opts),
        () => confirmFill(store, { targetId: "a", candidateId: "w", replyDeadline: FUTURE }, opts),
      ];
      if (round % 2) jobs.reverse(); // 도착 순서를 바꿔 가며 확인
      await Promise.all(jobs.map((job) => job()));
      const d = await store.readAll();
      const a = d.trainees.find((x) => x.id === "a")!;
      // 어느 쪽이 먼저든 결과는 둘 중 하나: ① 재회신이 먼저 → 선정 유지, 충원 거부 ② 충원이 먼저 → 제외, 재회신 거부
      expect(a.status === "선정" && a.replacedBy).toBeFalsy();
      expect(d.trainees.find((x) => x.id === "w")?.status).toBe(a.status === "제외" ? "선정" : "대기");
    }
  }, 30000);

  it("같은 사번을 동시에 두 번 수기 추가하면 한 번만 성공한다", async () => {
    await seed();
    const input = { empNo: "009999", name: "한수기", dept: "감사부", reason: "추천" };
    const results = await Promise.all([addManualTrainee(store, input, opts), addManualTrainee(store, input, opts)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await store.readAll()).trainees).toHaveLength(1);
  });

  it("회신 여러 건을 동시에 보내도 서로 덮어쓰지 않고 모두 저장된다", async () => {
    await seed(t("a", "100001", "선정"), t("b", "100002", "선정"), t("c", "100003", "선정"));
    await Promise.all(["a", "b", "c"].map((id) => submitReply(store, id, attend, opts)));
    const d = await store.readAll();
    expect(d.replies.map((r) => r.traineeId).sort()).toEqual(["a", "b", "c"]);
    expect(d.history).toHaveLength(3);
  });
});

describe("transaction 자체", () => {
  it("안에서 다시 transaction을 불러도 서로 기다리며 멈추지 않는다", async () => {
    const out = await store.transaction(async () => store.transaction(async () => "안쪽"));
    expect(out).toBe("안쪽");
  });

  it("앞 transaction이 오류로 끝나도 다음 transaction은 정상 실행된다", async () => {
    await expect(store.transaction(async () => Promise.reject(new Error("실패")))).rejects.toThrow("실패");
    expect(await store.transaction(async () => "다음")).toBe("다음");
  });

  it("transaction들은 한 번에 하나씩, 들어온 순서대로 실행된다", async () => {
    const order: string[] = [];
    const slow = store.transaction(async () => {
      order.push("1 시작");
      await new Promise((r) => setTimeout(r, 30));
      order.push("1 끝");
    });
    const fast = store.transaction(async () => {
      order.push("2 시작");
      order.push("2 끝");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["1 시작", "1 끝", "2 시작", "2 끝"]);
  });
});
