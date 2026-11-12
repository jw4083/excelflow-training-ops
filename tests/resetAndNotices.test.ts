// 명단 초기화·회신 알림 검사: 한 과정만 비워지는지, 확인 절차가 지켜지는지, 알림이 중복 없이 쌓이고 읽음 처리되는지를 본다.
// 가짜 데이터만 쓰고 임시 폴더에 저장한다 (실제 data/는 건드리지 않는다).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Course, Trainee } from "@/domain/types";
import { listNotices, markAllNoticesRead, markNoticesRead, summarizeNotices } from "@/lib/notices";
import { submitReply } from "@/lib/reply";
import { resetRoster, resetScope } from "@/lib/rosterReset";
import { setCourseArchived } from "@/lib/courses";
import type { Store } from "@/store";
import { FileCatalog } from "@/store/fileCatalog";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const course = (name: string): Course => ({
  name,
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  updatedAt: T0,
  capacity: 5,
});
const person = (id: string, empNo: string, status: Trainee["status"] = "선정"): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: "부서",
  status,
  isManual: false,
  selectedVia: "추첨",
  createdAt: T0,
  updatedAt: T0,
});
const attendReply = { attend: true, laptop: true } as const;
const absentReply = { attend: false, absentType: "업무", absentDetail: "업무 일정이 겹쳐 참석이 어렵습니다.", laptop: false } as const;

let dir: string;
let catalog: FileCatalog;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "reset-notice-"));
  catalog = new FileCatalog(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function newCourse(name: string, ...trainees: Trainee[]): Promise<{ id: string; store: Store }> {
  const id = await catalog.createCourse(course(name), T0);
  const store = (await catalog.openCourse(id)) as Store;
  if (trainees.length) await store.commit({ upsertTrainees: trainees });
  return { id, store };
}

describe("교육생 회신 알림", () => {
  it("첫 회신은 '신규', 응답을 바꾸면 '변경'으로 변경 전·후와 함께 쌓인다", async () => {
    const { store } = await newCourse("A", person("t1", "100001"));
    await submitReply(store, "t1", attendReply, { now: NOW });
    await submitReply(store, "t1", { ...attendReply, laptop: false }, { now: "2026-11-15T13:00:00+09:00" });
    const notices = (await store.readAll()).notices ?? [];
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({ change: "신규", attend: true, before: null });
    expect(notices[1]).toMatchObject({ change: "변경", attend: true, before: { laptop: true }, after: { laptop: false } });
  });

  it("참석을 불참으로 바꾸면 변경 알림이 불참으로 구분된다", async () => {
    const { store } = await newCourse("A", person("t1", "100001"));
    await submitReply(store, "t1", attendReply, { now: NOW });
    const r = await submitReply(store, "t1", absentReply, { now: "2026-11-15T13:00:00+09:00", confirmed: true });
    expect(r.ok).toBe(true);
    const last = ((await store.readAll()).notices ?? []).at(-1)!;
    expect(last).toMatchObject({ change: "변경", attend: false, before: { attend: true }, after: { attend: false } });
  });

  it("같은 내용을 다시 제출하거나 담당자가 대신 입력하면 알림이 생기지 않는다 (중복 방지)", async () => {
    const { store } = await newCourse("A", person("t1", "100001"));
    await submitReply(store, "t1", attendReply, { now: NOW });
    await submitReply(store, "t1", attendReply, { now: "2026-11-15T13:00:00+09:00" });
    await submitReply(store, "t1", { ...attendReply, laptop: false }, { now: "2026-11-15T14:00:00+09:00", byAdmin: true });
    expect((await store.readAll()).notices).toHaveLength(1);
  });

  it("알림은 과정끼리 섞이지 않고, 목록은 과정명·교육생과 함께 최신순이다", async () => {
    const a = await newCourse("A 과정", person("t1", "100001"));
    const b = await newCourse("B 과정", person("t2", "100001"));
    await submitReply(a.store, "t1", attendReply, { now: NOW });
    await submitReply(b.store, "t2", absentReply, { now: "2026-11-15T13:00:00+09:00" });
    expect((await a.store.readAll()).notices).toHaveLength(1);
    expect((await b.store.readAll()).notices).toHaveLength(1);
    const items = await listNotices(catalog);
    expect(items.map((i) => i.courseName)).toEqual(["B 과정", "A 과정"]);
    expect(summarizeNotices(items)).toMatchObject({ unread: 2, unreadAttend: 1, unreadAbsent: 1 });
  });

  it("읽음 처리는 그 과정의 그 알림만 바꾸고, 두 번 해도 읽은 시각이 바뀌지 않는다", async () => {
    const a = await newCourse("A", person("t1", "100001"), person("t2", "100002"));
    const b = await newCourse("B", person("t3", "100003"));
    await submitReply(a.store, "t1", attendReply, { now: NOW });
    await submitReply(a.store, "t2", attendReply, { now: NOW });
    await submitReply(b.store, "t3", attendReply, { now: NOW });
    const [first] = (await a.store.readAll()).notices!;
    await markNoticesRead(a.store, [first.id], "2026-11-16T09:00:00+09:00");
    await markNoticesRead(a.store, [first.id], "2026-11-17T09:00:00+09:00");
    const aNotices = (await a.store.readAll()).notices!;
    expect(aNotices[0].readAt).toBe("2026-11-16T09:00:00+09:00");
    expect(aNotices[1].readAt).toBeUndefined();
    expect((await b.store.readAll()).notices![0].readAt).toBeUndefined();
    await markAllNoticesRead(a.store, "2026-11-18T09:00:00+09:00");
    expect(summarizeNotices(await listNotices(catalog)).unread).toBe(1);
  });

  it("보관된 과정의 알림도 읽음 처리할 수 있다 (내용을 바꾸는 일이 아니다)", async () => {
    const a = await newCourse("A", person("t1", "100001"));
    await submitReply(a.store, "t1", attendReply, { now: NOW });
    await setCourseArchived(a.store, true);
    const [n] = (await a.store.readAll()).notices!;
    await markNoticesRead(a.store, [n.id]);
    expect((await a.store.readAll()).notices![0].readAt).toBeDefined();
  });
});

describe("교육생 명단 초기화", () => {
  async function seeded() {
    const a = await newCourse("A 과정", person("t1", "100001"), person("t2", "100002"));
    const b = await newCourse("B 과정", person("t3", "100001"));
    await submitReply(a.store, "t1", attendReply, { now: NOW });
    await submitReply(b.store, "t3", attendReply, { now: NOW });
    return { a, b };
  }

  it("그 과정의 명단·회신·알림·이력·정원만 지우고 과정 정보와 다른 과정은 그대로 둔다", async () => {
    const { a, b } = await seeded();
    const beforeB = JSON.stringify(await b.store.readAll());
    const result = await resetRoster(a.store, { expectedCount: 2, confirmName: "A 과정" }, "2026-11-16T09:00:00+09:00");
    expect(result).toEqual({ ok: true, removed: 2 });
    const data = await a.store.readAll();
    expect(data.trainees).toEqual([]);
    expect(data.replies).toEqual([]);
    expect(data.notices).toEqual([]);
    expect(data.selections).toEqual([]);
    expect(data.draws).toEqual([]);
    expect(data.course).toMatchObject({ name: "A 과정", place: "교육장" });
    expect(data.course?.capacity).toBeUndefined();
    expect(data.history).toHaveLength(1);
    expect(data.history[0]).toMatchObject({ kind: "명단초기화", actor: "담당자" });
    expect(JSON.stringify(await b.store.readAll())).toBe(beforeB);
  });

  it("과정명이 다르거나, 화면에서 본 인원과 지금 인원이 다르면 아무것도 지우지 않는다", async () => {
    const { a } = await seeded();
    const before = JSON.stringify(await a.store.readAll());
    expect(await resetRoster(a.store, { expectedCount: 2, confirmName: "B 과정" })).toMatchObject({ ok: false });
    expect(await resetRoster(a.store, { expectedCount: 2, confirmName: "" })).toMatchObject({ ok: false });
    expect(await resetRoster(a.store, { expectedCount: 1, confirmName: "A 과정" })).toMatchObject({ ok: false });
    expect(JSON.stringify(await a.store.readAll())).toBe(before);
  });

  it("보관된 과정은 초기화할 수 없고, 비어 있는 명단은 초기화할 게 없다고 알린다", async () => {
    const { a } = await seeded();
    await setCourseArchived(a.store, true);
    expect(await resetRoster(a.store, { expectedCount: 2, confirmName: "A 과정" })).toMatchObject({ ok: false });
    expect((await a.store.readAll()).trainees).toHaveLength(2);
    const empty = await newCourse("빈 과정");
    expect(await resetRoster(empty.store, { expectedCount: 0, confirmName: "빈 과정" })).toMatchObject({ ok: false });
  });

  it("초기화 뒤 같은 사번을 다시 올릴 수 있고, 비어 있으면 다시 초기화되지 않는다", async () => {
    const { a } = await seeded();
    await resetRoster(a.store, { expectedCount: 2, confirmName: "A 과정" });
    expect(await resetRoster(a.store, { expectedCount: 0, confirmName: "A 과정" })).toMatchObject({ ok: false, reason: expect.stringContaining("") });
    await a.store.commit({ upsertTrainees: [person("n1", "100001")] });
    expect((await a.store.readAll()).trainees).toHaveLength(1);
  });

  it("지워지는 범위 개수를 정확히 센다", async () => {
    const { a } = await seeded();
    expect(resetScope(await a.store.readAll())).toMatchObject({ courseName: "A 과정", trainees: 2, replies: 1, notices: 1 });
  });
});
