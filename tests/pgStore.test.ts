// Supabase(Postgres) 저장소 검사: 파일 저장소와 같은 약속(저장·조회·규칙 거부·동시 요청 보호)을 지키고,
// 과정끼리 섞이지 않으며(과정마다 한 행·한 잠금), 보관·교육생 등록 조회·사번별 로그인 기록이 맞게 동작하는지 본다.
// 운영 표(course_state, login_attempts)는 건드리지 않고, 이 검사만 쓰는 임시 표(*_test_*)를 만들었다가 지운다.
// `.env`에 DATABASE_URL이 없으면(예: 접속 정보가 없는 환경) 이 검사는 건너뛴다. 가짜 데이터만 쓴다.
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Course, Trainee } from "@/domain/types";
import { setCourseArchived } from "@/lib/courses";
import { confirmFill } from "@/lib/fill";
import { submitReply } from "@/lib/reply";
import type { Store } from "@/store";
import { StoreError } from "@/store/applyChanges";
import { PgCatalog } from "@/store/pgCatalog";

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
const SUFFIX = Math.random().toString(36).slice(2, 10);
const COURSE_TABLE = `course_state_test_${SUFFIX}`;
const LOGIN_TABLE = `login_attempts_test_${SUFFIX}`;
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
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const course = (name: string): Course => ({
  name,
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  capacity: 50,
  updatedAt: T0,
});

describe.skipIf(!URL)("Supabase 저장소 (PgCatalog)", () => {
  let admin: postgres.Sql;
  let catalog: PgCatalog;
  let store: Store; // 첫 번째 과정
  let storeId: string;

  beforeAll(async () => {
    admin = postgres(URL as string, { max: 1, prepare: false });
    await admin.unsafe(
      `create table ${COURSE_TABLE} (course_id uuid primary key, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    );
    await admin.unsafe(
      `create table ${LOGIN_TABLE} (emp_no text primary key, fails int not null default 0, locked_until timestamptz, updated_at timestamptz not null default now())`,
    );
    catalog = new PgCatalog(URL as string, { table: COURSE_TABLE, loginTable: LOGIN_TABLE });
    storeId = await catalog.createCourse(course("첫 과정"), T0);
    store = (await catalog.openCourse(storeId)) as Store;
  }, 60000);

  afterAll(async () => {
    await catalog?.close();
    await admin?.unsafe(`drop table if exists ${COURSE_TABLE}`);
    await admin?.unsafe(`drop table if exists ${LOGIN_TABLE}`);
    await admin?.end({ timeout: 5 });
  }, 60000);

  /** 첫 과정의 내용을 비운다 (과정 정보·보관 표시는 남긴다) */
  const reset = () =>
    admin.unsafe(
      `update ${COURSE_TABLE} set data = jsonb_build_object('course', data->'course', 'createdAt', data->'createdAt', 'trainees','[]'::jsonb,'selections','[]'::jsonb,'draws','[]'::jsonb,'replies','[]'::jsonb,'history','[]'::jsonb) where course_id = '${storeId}'`,
    );
  const seed = (...list: Trainee[]) => store.commit({ upsertTrainees: list });

  it("저장한 내용을 다시 읽으면 그대로 나온다 (사번 앞자리 0 포함), 없는 사번은 null", async () => {
    await reset();
    expect((await store.readAll()).trainees).toEqual([]);
    await seed(t("a", "001234", "선정"));
    const d = await store.readAll();
    expect(d.trainees[0].empNo).toBe("001234");
    expect(d.course?.name).toBe("첫 과정");
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

  it("같은 과정의 transaction들은 한 번에 하나씩 들어온 순서대로 실행된다", async () => {
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

  it("서로 다른 과정의 transaction은 서로를 기다리지 않는다 (과정마다 따로 잠긴다)", async () => {
    const otherId = await catalog.createCourse(course("둘째 과정"), T0);
    const other = (await catalog.openCourse(otherId)) as Store;
    const order: string[] = [];
    const slow = store.transaction(async () => {
      order.push("A 시작");
      await new Promise((r) => setTimeout(r, 400));
      order.push("A 끝");
    });
    await new Promise((r) => setTimeout(r, 100));
    await other.transaction(async () => {
      order.push("B");
    });
    await slow;
    expect(order).toEqual(["A 시작", "B", "A 끝"]);
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

  it("같은 사번이 두 과정에 등록되고, 한 과정의 변경이 다른 과정에 닿지 않는다", async () => {
    await reset();
    const otherId = await catalog.createCourse(course("셋째 과정"), T0);
    const other = (await catalog.openCourse(otherId)) as Store;
    await seed(t("a1", "100001", "선정"));
    await other.commit({ upsertTrainees: [t("b1", "100001", "대기", { waitNo: 1 })] });
    await submitReply(store, "a1", { attend: false, absentType: "업무", absentDetail: "출장 일정이 겹칩니다" }, { now: NOW });
    expect((await store.getTraineeByEmpNo("100001"))?.status).toBe("불참");
    expect((await other.getTraineeByEmpNo("100001"))?.status).toBe("대기");
    expect((await other.readAll()).history).toEqual([]);
  }, 30000);

  it("교육생 등록 조회: 이 사번이 들어 있는 과정만 나오고 본인 레코드만 돌려준다", async () => {
    await reset();
    const otherId = await catalog.createCourse(course("넷째 과정"), T0);
    const other = (await catalog.openCourse(otherId)) as Store;
    const noneId = await catalog.createCourse(course("다섯째 과정"), T0);
    const none = (await catalog.openCourse(noneId)) as Store;
    await seed(t("a1", "100777", "선정"), t("a2", "100778", "선정"));
    await other.commit({ upsertTrainees: [t("b1", "100777", "대기", { waitNo: 2 })] });
    await none.commit({ upsertTrainees: [t("c1", "100999", "선정")] });
    const mine = await catalog.findEnrollments("100777");
    expect(mine.map((e) => e.courseId).sort()).toEqual([storeId, otherId].sort());
    expect(mine.every((e) => e.trainee.empNo === "100777")).toBe(true);
    expect(await catalog.findEnrollments("123456")).toEqual([]);
  }, 30000);

  it("보관하면 변경이 거부되고 조회·교육생 목록 제외가 되며, 해제하면 돌아온다", async () => {
    await reset();
    await seed(t("a1", "100555", "선정"));
    expect(await setCourseArchived(store, true, NOW)).toEqual({ ok: true, changed: true });
    await expect(store.commit({ upsertTrainees: [t("a2", "100556", "신청")] })).rejects.toThrow(/보관된 과정/);
    expect((await store.readAll()).trainees).toHaveLength(1);
    expect(await catalog.findEnrollments("100555")).toEqual([]);
    expect((await catalog.listCourses()).find((c) => c.id === storeId)?.data.archivedAt).toBe(NOW);
    expect(await setCourseArchived(store, false, NOW)).toEqual({ ok: true, changed: true });
    expect((await catalog.findEnrollments("100555")).map((e) => e.courseId)).toEqual([storeId]);
  }, 30000);

  it("형식이 틀리거나 없는 과정 번호는 열리지 않는다", async () => {
    for (const bad of ["", "abc", "'; drop table x; --", "00000000-0000-0000-0000-000000000000"]) {
      expect(await catalog.openCourse(bad)).toBeNull();
    }
  }, 30000);

  it("로그인 실패 기록: 사번별로 저장·삭제되고, 동시에 20번 시도해도 정확히 센다", async () => {
    const read = (empNo: string) => catalog.loginAttempts.update(empNo, (c) => ({ next: c, result: c }));
    const fail = (empNo: string) =>
      catalog.loginAttempts.update(empNo, (current) => ({ next: { fails: (current?.fails ?? 0) + 1 }, result: undefined }));
    expect(await read("300001")).toBeNull();
    await Promise.all(Array.from({ length: 20 }, () => fail("300001")));
    expect(await read("300001")).toEqual({ fails: 20 });
    await catalog.loginAttempts.update("300001", () => ({ next: { fails: 5, lockedUntil: "2026-11-15T10:15:00.000Z" }, result: undefined }));
    expect(await read("300001")).toEqual({ fails: 5, lockedUntil: "2026-11-15T10:15:00.000Z" });
    await catalog.loginAttempts.update("300001", () => ({ next: null, result: undefined }));
    expect(await read("300001")).toBeNull();
    await catalog.loginAttempts.update("300002", () => ({ next: null, result: undefined })); // 없는 기록 지우기는 오류 없이 지나간다
  }, 60000);
});
