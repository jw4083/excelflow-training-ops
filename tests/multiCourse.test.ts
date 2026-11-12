// 여러 과정 운영 검사: 과정끼리 데이터가 섞이지 않는지, 같은 직원이 여러 과정에 등록될 수 있는지, 보관, 예전 데이터 이전, 동시 요청을 본다.
// 가짜 데이터만 쓰고 임시 폴더에 저장한다 (실제 data/는 건드리지 않는다).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRosterWorkbook } from "@/domain/exportRoster";
import type { Course, DbData, Trainee } from "@/domain/types";
import { createCourseFromForm, setCourseArchived } from "@/lib/courses";
import { runDraw } from "@/lib/draw";
import { confirmFill } from "@/lib/fill";
import { importApplicants } from "@/lib/importApplicants";
import { submitReply } from "@/lib/reply";
import { selectApplicants } from "@/lib/selection";
import { findMyEnrollment } from "@/lib/traineeCourse";
import { loginTrainee } from "@/lib/auth";
import { StoreError, type Store } from "@/store";
import { isCourseId } from "@/store/courseId";
import { FileCatalog } from "@/store/fileCatalog";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const FUTURE = "2026-11-18T12:00:00+09:00";

const course = (name: string, extra: Partial<Course> = {}): Course => ({
  name,
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: T0,
  ...extra,
});
const person = (id: string, empNo: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: "부서",
  status,
  isManual: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

let dir: string;
let catalog: FileCatalog;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "multi-course-"));
  catalog = new FileCatalog(dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

async function newCourse(name: string, extra: Partial<Course> = {}): Promise<{ id: string; store: Store }> {
  const id = await catalog.createCourse(course(name, extra), T0);
  return { id, store: (await catalog.openCourse(id)) as Store };
}

describe("과정 만들기·목록·열기", () => {
  it("과정을 만들면 목록에 만든 순서대로 나오고, 번호로 열 수 있다", async () => {
    const a = await newCourse("A 과정");
    const b = await catalog.createCourse(course("B 과정"), "2026-11-13T09:00:00+09:00");
    const list = await catalog.listCourses();
    expect(list.map((c) => c.data.course?.name)).toEqual(["A 과정", "B 과정"]);
    expect(isCourseId(a.id) && isCourseId(b)).toBe(true);
    expect(await a.store.getCourse()).toMatchObject({ name: "A 과정" });
  });

  it("번호 형식이 틀리거나 없는 과정은 열리지 않는다 (경로 조작 문자열 포함)", async () => {
    await newCourse("A");
    for (const bad of ["", "abc", "../../etc/passwd", "..\\..\\db", "00000000-0000-0000-0000-000000000000", "A".repeat(36)]) {
      expect(await catalog.openCourse(bad)).toBeNull();
    }
  });

  it("과정 정보 양식으로 새 과정을 만든다 (검사에 걸리면 만들지 않는다)", async () => {
    const bad = await createCourseFromForm(catalog, { name: "", startDate: "", endDate: "", place: "", notice: "", replyDeadline: "" });
    expect(bad.ok).toBe(false);
    expect(await catalog.listCourses()).toHaveLength(0);
    const ok = await createCourseFromForm(catalog, {
      name: "새 과정",
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      place: "교육장",
      notice: "",
      replyDeadline: "2026-11-20T18:00",
      startTime: "09:00",
      cancelDeadline: "",
    });
    expect(ok.ok).toBe(true);
    expect((await catalog.listCourses())[0].data.course?.name).toBe("새 과정");
  });
});

describe("과정끼리 데이터가 섞이지 않는다", () => {
  it("같은 사번이 두 과정에 등록될 수 있고, 같은 과정 안에서는 여전히 중복이 막힌다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "신청")] });
    await b.store.commit({ upsertTrainees: [person("b1", "100001", "신청")] });
    expect((await a.store.getTraineeByEmpNo("100001"))?.id).toBe("a1");
    expect((await b.store.getTraineeByEmpNo("100001"))?.id).toBe("b1");
    await expect(a.store.commit({ upsertTrainees: [person("a2", "100001", "신청")] })).rejects.toBeInstanceOf(StoreError);
  });

  it("선정 상태와 회신은 과정별로 따로다 (A에서 불참 회신해도 B는 그대로)", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정")] });
    await b.store.commit({ upsertTrainees: [person("b1", "100001", "선정")] });

    const r = await submitReply(a.store, "a1", { attend: false, absentType: "업무", absentDetail: "출장 일정이 겹칩니다" }, { now: NOW });
    expect(r.ok).toBe(true);

    expect((await a.store.getTraineeByEmpNo("100001"))?.status).toBe("불참");
    expect((await b.store.getTraineeByEmpNo("100001"))?.status).toBe("선정");
    expect(await b.store.getReply("b1")).toBeNull();
    expect((await a.store.readAll()).history.length).toBeGreaterThan(0);
    expect((await b.store.readAll()).history).toEqual([]);
  });

  it("A에서 추첨·1차 선별·충원을 해도 B의 명단·추첨 기록·이력·대기 순번이 바뀌지 않는다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    const people = (prefix: string) => Array.from({ length: 8 }, (_, i) => person(`${prefix}${i}`, String(100000 + i), "신청"));
    await a.store.commit({ upsertTrainees: people("a") });
    await b.store.commit({ upsertTrainees: people("b") });
    const bBefore = JSON.stringify(await b.store.readAll());

    expect((await selectApplicants(a.store, ["a0"], "테스트 사유", { now: NOW })).ok).toBe(true);
    expect((await runDraw(a.store, { capacity: "4", waitSeats: "2" }, { now: NOW })).ok).toBe(true);
    const mid = await a.store.readAll();
    const absent = mid.trainees.find((t) => t.status === "선정" && t.id !== "a0")!;
    await submitReply(a.store, absent.id, { attend: false, absentType: "업무", absentDetail: "출장 일정이 겹칩니다" }, { now: NOW });
    const waiting = (await a.store.readAll()).trainees.find((t) => t.status === "대기" && t.waitNo === 1)!;
    expect((await confirmFill(a.store, { targetId: absent.id, candidateId: waiting.id, replyDeadline: FUTURE }, { now: NOW })).ok).toBe(true);

    expect(JSON.stringify(await b.store.readAll())).toBe(bBefore); // B는 한 글자도 바뀌지 않았다
    expect((await a.store.readAll()).draws).toHaveLength(1);
  });

  it("엑셀 사번 중복 검사는 과정 안에서만 한다 (다른 과정에 있는 사번도 등록된다)", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "신청")] });
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("명단");
    ws.addRow(["사번", "이름", "부서"]);
    ws.addRow(["100001", "가나다", "인재개발부"]); // 사번은 글자로 넣는다 (앞자리 0 보존)
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await importApplicants(b.store, { name: "명단.xlsx", size: buffer.length, buffer }, NOW);
    expect(r.ok && r.summary.registered).toBe(1);
    expect((await b.store.readAll()).trainees.map((t) => t.empNo)).toEqual(["100001"]);
    expect((await a.store.readAll()).trainees).toHaveLength(1);
  });

  it("내려받는 명단 파일에는 그 과정의 교육생만 들어간다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정", { name: "에이사람" })] });
    await b.store.commit({ upsertTrainees: [person("b1", "200002", "선정", { name: "비사람" })] });
    const dataA = await a.store.readAll();
    const file = await buildRosterWorkbook(dataA.trainees, dataA.replies, dataA.course?.replyDeadline);
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as never);
    const text = JSON.stringify(wb.worksheets.map((s) => s.getSheetValues()));
    expect(text).toContain("에이사람");
    expect(text).not.toContain("비사람");
  });
});

describe("교육생: 본인이 등록된 과정만 보인다", () => {
  it("같은 직원이 등록된 과정만 목록에 나오고, 그 안의 본인 레코드만 돌려준다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    const c = await newCourse("C");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정"), person("a2", "100002", "선정")] });
    await b.store.commit({ upsertTrainees: [person("b1", "100001", "대기", { waitNo: 1 })] });
    await c.store.commit({ upsertTrainees: [person("c2", "100002", "선정")] });

    const mine = await catalog.findEnrollments("100001");
    expect(mine.map((e) => e.courseId).sort()).toEqual([a.id, b.id].sort());
    expect(mine.find((e) => e.courseId === a.id)?.trainee.status).toBe("선정");
    expect(mine.find((e) => e.courseId === b.id)?.trainee.status).toBe("대기"); // 과정마다 상태가 다르다
    expect(mine.every((e) => e.trainee.empNo === "100001")).toBe(true);
    expect(await catalog.findEnrollments("999999")).toEqual([]);
  });

  it("등록되지 않은 과정·없는 과정·형식이 틀린 번호는 모두 똑같이 null이다", async () => {
    const a = await newCourse("A");
    const c = await newCourse("C");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정")] });
    await c.store.commit({ upsertTrainees: [person("c2", "100002", "선정")] });
    expect((await findMyEnrollment(catalog, "100001", a.id))?.courseId).toBe(a.id);
    expect(await findMyEnrollment(catalog, "100001", c.id)).toBeNull(); // 다른 사람의 과정
    expect(await findMyEnrollment(catalog, "100001", "11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(await findMyEnrollment(catalog, "100001", "../x")).toBeNull();
  });
});

describe("보관: 조회만 가능하고 교육생에게 보이지 않는다", () => {
  it("보관하면 어떤 변경도 거부되지만 조회는 된다", async () => {
    const a = await newCourse("A");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정")] });
    expect(await setCourseArchived(a.store, true, NOW)).toEqual({ ok: true, changed: true });

    await expect(a.store.commit({ upsertTrainees: [person("a2", "100002", "신청")] })).rejects.toThrow(/보관된 과정/);
    await expect(a.store.commit({ course: course("바뀐 이름") })).rejects.toThrow(/보관된 과정/);
    const reply = await submitReply(a.store, "a1", { attend: true, laptop: true }, { now: NOW });
    expect(reply).toMatchObject({ ok: false });
    expect((await runDraw(a.store, { capacity: "3", waitSeats: "0" }, { now: NOW })).ok).toBe(false);
    expect((await selectApplicants(a.store, ["a1"], "테스트 사유", { now: NOW })).ok).toBe(false);

    const data = await a.store.readAll();
    expect(data.trainees).toHaveLength(1); // 과거 명단과 이력은 그대로 조회된다
    expect(data.archivedAt).toBe(NOW);
    expect(data.course?.name).toBe("A");
  });

  it("보관된 과정은 교육생 과정 목록·열기에서 사라지고, 보관을 풀면 돌아온다", async () => {
    const a = await newCourse("A");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정")] });
    await setCourseArchived(a.store, true, NOW);
    expect(await catalog.findEnrollments("100001")).toEqual([]);
    expect(await findMyEnrollment(catalog, "100001", a.id)).toBeNull();
    // 담당자 목록에는 보관된 과정도 나온다
    expect((await catalog.listCourses())[0].data.archivedAt).toBe(NOW);

    expect(await setCourseArchived(a.store, false, NOW)).toEqual({ ok: true, changed: true });
    expect((await catalog.findEnrollments("100001")).map((e) => e.courseId)).toEqual([a.id]);
    await a.store.commit({ upsertTrainees: [person("a2", "100002", "신청")] }); // 다시 바꿀 수 있다
  });

  it("보관·해제를 두 번 눌러도 안전하다", async () => {
    const a = await newCourse("A");
    expect(await setCourseArchived(a.store, true, NOW)).toEqual({ ok: true, changed: true });
    expect(await setCourseArchived(a.store, true, "2026-11-16T09:00:00+09:00")).toEqual({ ok: true, changed: false });
    expect((await a.store.readAll()).archivedAt).toBe(NOW); // 처음 보관한 시각이 유지된다
    expect(await setCourseArchived(a.store, false, NOW)).toEqual({ ok: true, changed: true });
    expect(await setCourseArchived(a.store, false, NOW)).toEqual({ ok: true, changed: false });
  });

  it("한 과정을 보관해도 다른 과정은 그대로 바꿀 수 있다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    await setCourseArchived(a.store, true, NOW);
    await b.store.commit({ upsertTrainees: [person("b1", "100001", "신청")] });
    expect((await b.store.readAll()).trainees).toHaveLength(1);
  });

  it("보관된 과정에서는 보관 해제만 빼고 빈 묶음도 거부하지 않는다 (로그인 기록 같은 빈 쓰기)", async () => {
    const a = await newCourse("A");
    await setCourseArchived(a.store, true, NOW);
    await expect(a.store.commit({})).resolves.toBeUndefined();
    await expect(a.store.commit({ upsertTrainees: [], appendHistory: [] })).resolves.toBeUndefined();
  });
});

describe("교육생 로그인: 여러 과정", () => {
  it("로그인은 보관되지 않은 과정에 등록된 사번만 된다", async () => {
    vi.stubEnv("TRAINEE_TEST_PASSWORD", "test-trainee-pass");
    vi.stubEnv("SESSION_SECRET", "x".repeat(64));
    const a = await newCourse("A");
    const b = await newCourse("B");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정")] });
    await b.store.commit({ upsertTrainees: [person("b1", "100001", "선정")] });
    expect(await loginTrainee(catalog, { empNo: "100001", password: "test-trainee-pass" })).toMatchObject({ ok: true });
    await setCourseArchived(a.store, true, NOW);
    expect(await loginTrainee(catalog, { empNo: "100001", password: "test-trainee-pass" })).toMatchObject({ ok: true }); // B가 남아 있다
    await setCourseArchived(b.store, true, NOW);
    expect(await loginTrainee(catalog, { empNo: "100001", password: "test-trainee-pass" })).toMatchObject({ ok: false });
  });
});

describe("동시 요청: 과정마다 따로 잠긴다", () => {
  it("서로 다른 과정의 transaction은 서로를 기다리지 않는다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    const order: string[] = [];
    const slow = a.store.transaction(async () => {
      order.push("A 시작");
      await new Promise((r) => setTimeout(r, 300));
      order.push("A 끝");
    });
    await new Promise((r) => setTimeout(r, 50));
    await b.store.transaction(async () => {
      order.push("B 시작·끝");
    });
    await slow;
    expect(order).toEqual(["A 시작", "B 시작·끝", "A 끝"]); // B는 A가 끝나기를 기다리지 않았다
  });

  it("같은 과정의 transaction은 여전히 한 번에 하나씩이다", async () => {
    const a = await newCourse("A");
    const order: string[] = [];
    const first = a.store.transaction(async () => {
      order.push("1 시작");
      await new Promise((r) => setTimeout(r, 200));
      order.push("1 끝");
    });
    await new Promise((r) => setTimeout(r, 30));
    const second = a.store.transaction(async () => {
      order.push("2 시작");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["1 시작", "1 끝", "2 시작"]);
  });

  it("두 과정에 동시에 저장해도 서로를 덮어쓰지 않는다", async () => {
    const a = await newCourse("A");
    const b = await newCourse("B");
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => [
        a.store.commit({ upsertTrainees: [person(`a${i}`, String(100000 + i), "신청")] }),
        b.store.commit({ upsertTrainees: [person(`b${i}`, String(200000 + i), "신청")] }),
      ]).flat(),
    );
    const [da, db] = [await a.store.readAll(), await b.store.readAll()];
    expect(da.trainees).toHaveLength(15);
    expect(db.trainees).toHaveLength(15);
    expect(da.trainees.every((t) => t.id.startsWith("a"))).toBe(true);
    expect(db.trainees.every((t) => t.id.startsWith("b"))).toBe(true);
  });

  it("보관과 동시에 들어온 회신은 둘 중 하나로 정리되고 모순이 생기지 않는다", async () => {
    const a = await newCourse("A");
    await a.store.commit({ upsertTrainees: [person("a1", "100001", "선정")] });
    const [archive, reply] = await Promise.all([
      setCourseArchived(a.store, true, NOW),
      submitReply(a.store, "a1", { attend: true, laptop: true }, { now: NOW }),
    ]);
    expect(archive.ok).toBe(true);
    const data = await a.store.readAll();
    expect(data.archivedAt).toBe(NOW);
    // 회신이 보관보다 먼저면 저장돼 있고, 나중이면 거부됐다 — 어느 쪽이든 결과와 저장 내용이 일치한다
    expect(Boolean(data.replies.length)).toBe(reply.ok);
  });
});

describe("예전(과정 1개) 데이터를 첫 번째 과정으로 이전한다", () => {
  const legacy: DbData = {
    course: course("예전 과정", { capacity: 5 }),
    trainees: [person("t1", "100001", "선정", { loginFails: 3 }), person("t2", "100002", "대기", { waitNo: 1 })],
    selections: [{ id: "s1", at: T0, kind: "선별", traineeIds: ["t1"] }],
    draws: [{ id: "d1", executedAt: T0, seats: 5, waitSeats: 1, selected: ["t1"], waitlist: ["t2"], rejected: [] }],
    replies: [{ traineeId: "t1", attend: true, laptop: true, submittedAt: T0, byAdmin: false }],
    history: [{ id: "h1", at: T0, kind: "추첨", before: null, after: { seats: 5 } }],
  };

  it("db.json이 있고 과정이 없으면 첫 번째 과정으로 그대로 옮기고, 원본은 .v1.bak로 남긴다", async () => {
    await writeFile(path.join(dir, "db.json"), JSON.stringify(legacy), "utf8");
    const migrated = new FileCatalog(dir, path.join(dir, "db.json"));
    const list = await migrated.listCourses();
    expect(list).toHaveLength(1);
    const { createdAt, ...rest } = list[0].data;
    expect(createdAt).toBeDefined();
    expect(rest).toEqual(legacy); // 내용은 한 글자도 바뀌지 않는다
    expect((await readdir(dir)).sort()).toEqual(["courses", "db.json.v1.bak", "login-attempts.json"].sort());
    expect(JSON.parse(await readFile(path.join(dir, "db.json.v1.bak"), "utf8"))).toEqual(JSON.parse(JSON.stringify(legacy)));
  });

  it("이전은 한 번만 일어난다 (다시 열어도 과정이 늘어나지 않는다)", async () => {
    await writeFile(path.join(dir, "db.json"), JSON.stringify(legacy), "utf8");
    await new FileCatalog(dir, path.join(dir, "db.json")).listCourses();
    const again = await new FileCatalog(dir, path.join(dir, "db.json")).listCourses();
    expect(again).toHaveLength(1);
  });

  it("예전 로그인 실패 기록은 사번 기준 기록으로 옮겨진다", async () => {
    await writeFile(path.join(dir, "db.json"), JSON.stringify(legacy), "utf8");
    const migrated = new FileCatalog(dir, path.join(dir, "db.json"));
    await migrated.listCourses();
    expect(await migrated.loginAttempts.update("100001", (c) => ({ next: c, result: c }))).toEqual({ fails: 3 });
    expect(await migrated.loginAttempts.update("100002", (c) => ({ next: c, result: c }))).toBeNull();
  });

  it("이미 과정이 있으면 예전 파일이 있어도 건드리지 않는다", async () => {
    const existing = new FileCatalog(dir, path.join(dir, "db.json"));
    await existing.createCourse(course("이미 있음"), T0);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "db.json"), JSON.stringify(legacy), "utf8");
    const reopened = new FileCatalog(dir, path.join(dir, "db.json"));
    expect((await reopened.listCourses()).map((c) => c.data.course?.name)).toEqual(["이미 있음"]);
  });
});
