// 최종 선정자 전용 안내 검사: 접근 규칙(선정 + 참석 회신만), 등록·수정·공개, 변경된 안내(번호), 확인·준비 표시, 담당자 현황, 과정 격리.
// 가짜 데이터만 쓰고 임시 폴더에 저장한다 (실제 data/는 건드리지 않는다).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canViewGuides, guideStatus, parseGuideForm, type GuideFormValues } from "@/domain/guides";
import type { Course, Status, Trainee } from "@/domain/types";
import { loadMyGuides, markGuide, saveGuide, setGuidePublished } from "@/lib/guides";
import { submitReply } from "@/lib/reply";
import { setCourseArchived } from "@/lib/courses";
import { resetRoster } from "@/lib/rosterReset";
import type { Store } from "@/store";
import { FileCatalog } from "@/store/fileCatalog";

const T0 = "2026-11-12T09:00:00+09:00";
const NOW = "2026-11-15T12:00:00+09:00";
const LATER = "2026-11-16T12:00:00+09:00";
const course = (name: string): Course => ({
  name,
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "교육장",
  notice: "안내",
  replyDeadline: "2026-11-20T18:00:00+09:00",
  cancelDeadline: "2026-11-28T18:00:00+09:00",
  updatedAt: T0,
});
const person = (n: number, status: Status = "선정"): Trainee => ({
  id: `t${n}`,
  empNo: String(100000 + n),
  name: `이름${n}`,
  dept: "부서",
  status,
  isManual: false,
  selectedVia: "추첨",
  createdAt: T0,
  updatedAt: T0,
});
const values = (over: Partial<GuideFormValues> = {}): GuideFormValues => ({
  title: "카톡방 입장 안내",
  body: "아래 링크로 입장해 주세요.",
  linkUrl: "https://open.kakao.com/o/test",
  linkLabel: "입장하기",
  dueAt: "",
  needsPrep: false,
  published: true,
  ...over,
});
const attend = { attend: true, laptop: true } as const;
const absent = { attend: false, absentType: "업무", absentDetail: "업무 일정이 겹쳐 참석이 어렵습니다.", laptop: false } as const;

let dir: string;
let catalog: FileCatalog;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "guides-"));
  catalog = new FileCatalog(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function newCourse(name = "A 과정", count = 3): Promise<Store> {
  const store = (await catalog.openCourse(await catalog.createCourse(course(name), T0))) as Store;
  await store.commit({ upsertTrainees: Array.from({ length: count }, (_, i) => person(i + 1)) });
  return store;
}
const guideOf = async (store: Store, id: string) => (await store.readAll()).guides!.find((g) => g.id === id)!;

describe("접근 규칙: 선정 + 참석 회신만", () => {
  it("경우별로 볼 수 있는지", () => {
    const yes = { attend: true };
    const no = { attend: false };
    expect(canViewGuides({ status: "선정" }, yes)).toBe(true);
    expect(canViewGuides({ status: "선정" }, null)).toBe(false); // 선정 미회신
    expect(canViewGuides({ status: "선정" }, no)).toBe(false);
    for (const status of ["신청", "대기", "미선정", "불참", "제외"] as Status[]) {
      expect(canViewGuides({ status }, yes)).toBe(false); // 참석 회신 흔적이 있어도 선정이 아니면 못 본다 (참석 취소 포함)
    }
    expect(canViewGuides(null, yes)).toBe(false);
  });

  it("교육생에게 넘기는 안내 목록: 미회신·대기·미선정·불참은 빈 목록이고, 참석 회신자만 공개된 안내를 받는다", async () => {
    const store = await newCourse("A", 0);
    await store.commit({ upsertTrainees: [person(1), person(2), person(3, "대기"), person(4, "미선정"), person(5)] });
    const saved = await saveGuide(store, undefined, values(), NOW);
    expect(saved.ok).toBe(true);
    await saveGuide(store, undefined, values({ title: "비공개 안내", published: false }), NOW);
    await submitReply(store, "t1", attend, { now: NOW });
    await submitReply(store, "t2", absent, { now: NOW });
    // t5는 선정이지만 미회신
    expect((await loadMyGuides(store, "t1")).map((g) => g.title)).toEqual(["카톡방 입장 안내"]); // 비공개 안내는 안 보인다
    for (const id of ["t2", "t3", "t4", "t5"]) expect(await loadMyGuides(store, id)).toEqual([]);
  });

  it("참석을 취소하면 즉시 접근이 막히고, 다시 참석으로 회신하면 이전 확인·준비 기록이 그대로 돌아온다", async () => {
    const store = await newCourse("A", 1);
    const g = (await saveGuide(store, undefined, values({ needsPrep: true }), NOW)) as { ok: true; guide: { id: string } };
    await submitReply(store, "t1", attend, { now: NOW });
    expect((await markGuide(store, "t1", g.guide.id, "확인", NOW)).ok).toBe(true);
    expect((await markGuide(store, "t1", g.guide.id, "준비", NOW)).ok).toBe(true);

    expect((await submitReply(store, "t1", absent, { now: NOW, confirmed: true })).ok).toBe(true); // 참석 취소 → 불참
    expect(await loadMyGuides(store, "t1")).toEqual([]);
    expect(await markGuide(store, "t1", g.guide.id, "확인취소", LATER)).toMatchObject({ ok: false }); // 서버도 막는다

    expect((await submitReply(store, "t1", attend, { now: LATER })).ok).toBe(true); // 기한 안에 다시 참석
    const back = await loadMyGuides(store, "t1");
    expect(back[0].state).toMatchObject({ confirmed: true, prepared: true });
  });
});

describe("안내 등록·수정·공개", () => {
  it("입력 검사: 제목 필수, 내용·링크 중 하나, https 링크만, 준비 기한은 준비 필요 안내만", () => {
    expect(parseGuideForm(values({ title: " " }))).toMatchObject({ ok: false });
    expect(parseGuideForm(values({ body: "", linkUrl: "" }))).toMatchObject({ ok: false });
    expect(parseGuideForm(values({ linkUrl: "javascript:alert(1)" }))).toMatchObject({ ok: false });
    expect(parseGuideForm(values({ linkUrl: "http://example.com" }))).toMatchObject({ ok: false });
    expect(parseGuideForm(values({ dueAt: "2026-11-25T18:00", needsPrep: false }))).toMatchObject({ ok: false });
    expect(parseGuideForm(values({ body: "", linkUrl: "https://example.com" }))).toMatchObject({ ok: true });
    const ok = parseGuideForm(values({ dueAt: "2026-11-25T18:00", needsPrep: true }));
    expect(ok.ok && ok.content.dueAt).toBe("2026-11-25T18:00:00+09:00");
  });

  it("여러 안내를 등록하면 등록한 순서대로 정렬되고, 여러 종류(카톡방·구독·노트북)를 담을 수 있다", async () => {
    const store = await newCourse("A", 1);
    for (const title of ["카톡방 입장 안내", "Claude Pro 구독 안내", "노트북 준비"]) await saveGuide(store, undefined, values({ title }), NOW);
    expect((await store.readAll()).guides!.map((g) => [g.title, g.order, g.revision])).toEqual([
      ["카톡방 입장 안내", 1, 1],
      ["Claude Pro 구독 안내", 2, 1],
      ["노트북 준비", 3, 1],
    ]);
  });

  it("변경된 안내: 공개 후 내용이 바뀔 때만 번호가 오르고, 비공개 중 수정·공개 전환·같은 내용 저장은 오르지 않는다", async () => {
    const store = await newCourse("A", 1);
    const first = (await saveGuide(store, undefined, values({ published: false }), NOW)) as { ok: true; guide: { id: string } };
    const id = first.guide.id;
    await saveGuide(store, id, values({ published: false, body: "비공개 중 수정" }), NOW);
    expect((await guideOf(store, id)).revision).toBe(1);
    await setGuidePublished(store, id, true, NOW);
    expect(await guideOf(store, id)).toMatchObject({ revision: 1, published: true });
    await saveGuide(store, id, values({ body: "비공개 중 수정" }), LATER); // 같은 내용
    expect((await guideOf(store, id)).revision).toBe(1);
    const changed = await saveGuide(store, id, values({ body: "공개 후 수정" }), LATER);
    expect(changed).toMatchObject({ ok: true, changedAfterPublish: true });
    expect(await guideOf(store, id)).toMatchObject({ revision: 2, updatedAt: LATER });
    await setGuidePublished(store, id, false, LATER);
    await setGuidePublished(store, id, true, LATER);
    expect((await guideOf(store, id)).revision).toBe(2);
  });

  it("비워 둔 선택 항목(링크·기한)은 수정하면 지워진다", async () => {
    const store = await newCourse("A", 1);
    const saved = (await saveGuide(store, undefined, values({ needsPrep: true, dueAt: "2026-11-25T18:00" }), NOW)) as { ok: true; guide: { id: string } };
    await saveGuide(store, saved.guide.id, values({ linkUrl: "", linkLabel: "", dueAt: "" }), NOW);
    const g = await guideOf(store, saved.guide.id);
    expect(g.linkUrl).toBeUndefined();
    expect(g.dueAt).toBeUndefined();
  });
});

describe("확인 완료·준비 완료와 변경된 안내", () => {
  async function ready() {
    const store = await newCourse("A", 2);
    await submitReply(store, "t1", attend, { now: NOW });
    await submitReply(store, "t2", attend, { now: NOW });
    const g = (await saveGuide(store, undefined, values({ needsPrep: true, dueAt: "2026-11-25T18:00" }), NOW)) as { ok: true; guide: { id: string } };
    return { store, id: g.guide.id };
  }

  it("확인·준비를 따로 표시하고 해제할 수 있고, 두 번 눌러도 안전하다", async () => {
    const { store, id } = await ready();
    expect(await markGuide(store, "t1", id, "확인", NOW)).toEqual({ ok: true, changed: true });
    expect(await markGuide(store, "t1", id, "확인", NOW)).toEqual({ ok: true, changed: false });
    expect((await loadMyGuides(store, "t1"))[0].state).toMatchObject({ confirmed: true, prepared: false });
    await markGuide(store, "t1", id, "준비", NOW);
    expect((await loadMyGuides(store, "t1"))[0].state).toMatchObject({ confirmed: true, prepared: true });
    await markGuide(store, "t1", id, "준비취소", NOW);
    await markGuide(store, "t1", id, "확인취소", NOW);
    expect((await loadMyGuides(store, "t1"))[0].state).toMatchObject({ confirmed: false, prepared: false, changed: false });
    expect((await loadMyGuides(store, "t2"))[0].state.confirmed).toBe(false); // 다른 교육생 기록은 따로
  });

  it("준비가 필요 없는 안내에는 준비 표시를 할 수 없고, 비공개·없는 안내는 표시할 수 없다", async () => {
    const store = await newCourse("A", 1);
    await submitReply(store, "t1", attend, { now: NOW });
    const plain = (await saveGuide(store, undefined, values(), NOW)) as { ok: true; guide: { id: string } };
    const draft = (await saveGuide(store, undefined, values({ published: false }), NOW)) as { ok: true; guide: { id: string } };
    expect(await markGuide(store, "t1", plain.guide.id, "준비", NOW)).toMatchObject({ ok: false });
    expect(await markGuide(store, "t1", draft.guide.id, "확인", NOW)).toMatchObject({ ok: false });
    expect(await markGuide(store, "t1", "없는안내", "확인", NOW)).toMatchObject({ ok: false });
  });

  it("공개 후 내용이 바뀌면 확인했던 교육생에게 '변경된 안내'로 보이고 확인 완료가 풀리며, 준비 완료는 유지된다. 다시 확인하면 해소된다", async () => {
    const { store, id } = await ready();
    await markGuide(store, "t1", id, "확인", NOW);
    await markGuide(store, "t1", id, "준비", NOW);
    await saveGuide(store, id, values({ needsPrep: true, dueAt: "2026-11-25T18:00", body: "내용이 바뀌었습니다" }), LATER);
    const mine = (await loadMyGuides(store, "t1"))[0];
    expect(mine.state).toMatchObject({ confirmed: false, changed: true, prepared: true });
    expect((await loadMyGuides(store, "t2"))[0].state).toMatchObject({ confirmed: false, changed: false }); // 확인한 적 없는 사람은 '변경'이 아니라 그냥 미확인
    await markGuide(store, "t1", id, "확인", LATER);
    expect((await loadMyGuides(store, "t1"))[0].state).toMatchObject({ confirmed: true, changed: false });
  });

  it("여러 교육생이 동시에 확인해도 기록이 서로를 덮어쓰지 않는다", async () => {
    const store = await newCourse("A", 0);
    const ids = Array.from({ length: 8 }, (_, i) => `t${i + 1}`);
    await store.commit({ upsertTrainees: ids.map((_, i) => person(i + 1)) });
    for (const id of ids) await submitReply(store, id, attend, { now: NOW });
    const g = (await saveGuide(store, undefined, values(), NOW)) as { ok: true; guide: { id: string } };
    await Promise.all(ids.map((id) => markGuide(store, id, g.guide.id, "확인", NOW)));
    expect(guideStatus(await store.readAll(), (await guideOf(store, g.guide.id))).confirmed).toBe(8);
  });

  it("교육생에게 넘기는 안내에는 관리용 값(공개 여부·번호·순서)이 없다", async () => {
    const { store } = await ready();
    expect(Object.keys((await loadMyGuides(store, "t1"))[0]).sort()).toEqual(
      ["body", "dueAt", "id", "linkLabel", "linkUrl", "needsPrep", "state", "title", "updatedAt"].sort(),
    );
  });
});

describe("담당자 현황", () => {
  it("대상은 선정 + 참석 회신 교육생뿐이고, 확인·준비·미완료·변경 후 미확인을 센다", async () => {
    const store = await newCourse("A", 0);
    await store.commit({ upsertTrainees: [person(1), person(2), person(3), person(4, "대기")] });
    for (const id of ["t1", "t2"]) await submitReply(store, id, attend, { now: NOW });
    await submitReply(store, "t3", absent, { now: NOW });
    const g = (await saveGuide(store, undefined, values({ needsPrep: true }), NOW)) as { ok: true; guide: { id: string } };
    await markGuide(store, "t1", g.guide.id, "확인", NOW);
    await markGuide(store, "t1", g.guide.id, "준비", NOW);
    await markGuide(store, "t2", g.guide.id, "확인", NOW);
    await saveGuide(store, g.guide.id, values({ needsPrep: true, body: "바뀜" }), LATER);

    const status = guideStatus(await store.readAll(), await guideOf(store, g.guide.id));
    expect(status.rows.map((r) => r.trainee.id)).toEqual(["t1", "t2"]); // t3(불참), t4(대기)는 대상이 아니다
    expect(status).toMatchObject({ total: 2, confirmed: 0, prepared: 1, changedUnconfirmed: 2, incomplete: 2 });
  });
});

describe("과정 격리·보관·초기화", () => {
  it("한 과정의 안내와 확인 기록은 다른 과정에 없다", async () => {
    const a = await newCourse("A", 1);
    const b = await newCourse("B", 1);
    await submitReply(a, "t1", attend, { now: NOW });
    await submitReply(b, "t1", attend, { now: NOW });
    const g = (await saveGuide(a, undefined, values(), NOW)) as { ok: true; guide: { id: string } };
    await markGuide(a, "t1", g.guide.id, "확인", NOW);
    expect(await loadMyGuides(b, "t1")).toEqual([]);
    expect((await b.readAll()).guides).toBeUndefined();
    expect(await markGuide(b, "t1", g.guide.id, "확인", NOW)).toMatchObject({ ok: false });
  });

  it("보관된 과정은 안내 저장·공개·확인 표시를 거부한다", async () => {
    const store = await newCourse("A", 1);
    await submitReply(store, "t1", attend, { now: NOW });
    const g = (await saveGuide(store, undefined, values(), NOW)) as { ok: true; guide: { id: string } };
    await setCourseArchived(store, true);
    expect(await saveGuide(store, undefined, values({ title: "새 안내" }), LATER)).toMatchObject({ ok: false });
    expect(await setGuidePublished(store, g.guide.id, false, LATER)).toMatchObject({ ok: false });
    expect(await markGuide(store, "t1", g.guide.id, "확인", LATER)).toMatchObject({ ok: false });
  });

  it("명단 초기화는 확인·준비 기록만 지우고 안내는 남긴다", async () => {
    const store = await newCourse("A", 1);
    await submitReply(store, "t1", attend, { now: NOW });
    const g = (await saveGuide(store, undefined, values(), NOW)) as { ok: true; guide: { id: string } };
    await markGuide(store, "t1", g.guide.id, "확인", NOW);
    expect((await resetRoster(store, { expectedCount: 1, confirmName: "A" }, LATER)).ok).toBe(true);
    const data = await store.readAll();
    expect(data.guides).toHaveLength(1);
    expect(data.guideProgress).toEqual([]);
  });
});
