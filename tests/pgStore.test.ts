// Supabase(Postgres) 저장소 검사: 파일 저장소와 같은 약속(저장·조회·규칙 거부·동시 요청 보호)을 지키는지 본다.
// 운영 표(app_state)는 건드리지 않고, 이 검사만 쓰는 임시 표(app_state_test_*)를 만들었다가 지운다.
// `.env`에 DATABASE_URL이 없으면(예: 접속 정보가 없는 환경) 이 검사는 건너뛴다. 가짜 데이터만 쓴다.
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Course, Trainee } from "@/domain/types";
import { confirmFill } from "@/lib/fill";
import { submitReply } from "@/lib/reply";
import { StoreError } from "@/store/applyChanges";
import { PgStore } from "@/store/pgStore";

function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(path.resolve(__dirname, "..", ".env"), "utf8");
    return env.match(/^DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const URL = databaseUrl();
const TABLE = `app_state_test_${Math.random().toString(36).slice(2, 10)}`;
const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const FUTURE = "2026-11-18T12:00:00+09:00";

const t = (id: string, empNo: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: `부서${id}`,
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

describe.skipIf(!URL)("Supabase 저장소 (PgStore)", () => {
  let admin: postgres.Sql;
  let store: PgStore;

  beforeAll(async () => {
    admin = postgres(URL as string, { max: 1, prepare: false });
    await admin.unsafe(
      `create table ${TABLE} (id int primary key default 1 check (id = 1), data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now())`,
    );
    await admin.unsafe(`insert into ${TABLE} (id) values (1)`);
    store = new PgStore(URL as string, { table: TABLE });
  }, 60000);

  afterAll(async () => {
    await store?.close();
    await admin?.unsafe(`drop table if exists ${TABLE}`);
    await admin?.end({ timeout: 5 });
  }, 60000);

  const reset = () => admin.unsafe(`update ${TABLE} set data = '{}'::jsonb`);
  const seed = (...list: Trainee[]) => store.commit({ course, upsertTrainees: list });

  it("저장한 내용을 다시 읽으면 그대로 나온다 (사번 앞자리 0 포함), 비어 있으면 빈 데이터", async () => {
    await reset();
    expect((await store.readAll()).trainees).toEqual([]);
    await seed(t("a", "001234", "선정"));
    const d = await store.readAll();
    expect(d.trainees[0].empNo).toBe("001234");
    expect(d.course?.name).toBe("테스트");
    expect(await store.getTraineeByEmpNo("001234")).toMatchObject({ id: "a" });
    expect(await store.getTraineeByEmpNo("999999")).toBeNull();
  }, 30000);

  it("규칙 위반(같은 사번 두 명)은 거부되고 아무것도 저장되지 않는다", async () => {
    await reset();
    await seed(t("a", "100001", "신청"));
    await expect(store.commit({ upsertTrainees: [t("b", "100002", "신청"), t("c", "100001", "신청")] })).rejects.toBeInstanceOf(StoreError);
    expect((await store.readAll()).trainees.map((x) => x.id)).toEqual(["a"]);
  }, 30000);

  it("transaction 안에서 오류가 나면 그 안의 저장은 모두 취소된다", async () => {
    await reset();
    await seed(t("a", "100001", "선정"));
    await expect(
      store.transaction(async () => {
        await store.commit({ upsertTrainees: [t("b", "100002", "신청")] });
        throw new Error("중간 실패");
      }),
    ).rejects.toThrow("중간 실패");
    expect((await store.readAll()).trainees.map((x) => x.id)).toEqual(["a"]);
  }, 30000);

  it("transaction 안에서 다시 transaction을 불러도 멈추지 않는다", async () => {
    expect(await store.transaction(async () => store.transaction(async () => "안쪽"))).toBe("안쪽");
  }, 30000);

  it("transaction들은 한 번에 하나씩 들어온 순서대로 실행된다", async () => {
    const order: string[] = [];
    const slow = store.transaction(async () => {
      order.push("1 시작");
      await new Promise((r) => setTimeout(r, 300));
      order.push("1 끝");
    });
    await new Promise((r) => setTimeout(r, 50));
    const fast = store.transaction(async () => {
      order.push("2 시작");
      order.push("2 끝");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["1 시작", "1 끝", "2 시작", "2 끝"]);
  }, 30000);

  it("같은 자리를 동시에 두 번 충원하면 한 번만 성공한다", async () => {
    await reset();
    await seed(t("abs", "100001", "불참"), t("w1", "100002", "대기", { waitNo: 1 }));
    const results = await Promise.all([
      confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, { now: NOW }),
      confirmFill(store, { targetId: "abs", candidateId: "w1", replyDeadline: FUTURE }, { now: NOW }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await store.readAll()).trainees.filter((x) => x.status === "선정")).toHaveLength(1);
  }, 60000);

  it("재회신과 충원 확정이 겹쳐도 '선정인데 충원 확정됨' 같은 모순이 생기지 않는다", async () => {
    await reset();
    await seed(t("a", "100001", "선정"), t("w", "100002", "대기", { waitNo: 1 }));
    await submitReply(store, "a", { attend: false, absentType: "업무", absentDetail: "출장 일정이 겹칩니다" }, { now: NOW });
    await Promise.all([
      submitReply(store, "a", { attend: true, laptop: true }, { now: NOW }),
      confirmFill(store, { targetId: "a", candidateId: "w", replyDeadline: FUTURE }, { now: NOW }),
    ]);
    const d = await store.readAll();
    const a = d.trainees.find((x) => x.id === "a")!;
    expect(a.status === "선정" && a.replacedBy).toBeFalsy();
    expect(d.trainees.find((x) => x.id === "w")?.status).toBe(a.status === "제외" ? "선정" : "대기");
  }, 60000);
});
