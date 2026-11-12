// 최종 안내 저장·교육생 확인 처리 (화면과 무관하게 자동 검사할 수 있도록 따로 두었다).
// 모두 읽기 → 규칙 검사 → 저장을 `store.transaction` 한 덩어리로 실행한다: 교육생 여러 명이 동시에 확인해도 서로의 기록을 덮어쓰지 않는다.
// 이 안내는 앱 안의 게시 기능이다. 교육생에게 카톡·문자·메일을 보내지 않는다.
import { randomUUID } from "node:crypto";
import {
  canViewGuides,
  contentChanged,
  guideState,
  parseGuideForm,
  sortGuides,
  type GuideFormErrors,
  type GuideFormValues,
  type GuideState,
} from "@/domain/guides";
import type { Guide, GuideProgress } from "@/domain/types";
import { StoreError } from "@/store/applyChanges";
import type { Store } from "@/store";

export type SaveGuideResult =
  | { ok: true; guide: Guide; changedAfterPublish: boolean }
  | { ok: false; reason: string; errors?: GuideFormErrors };

/**
 * 안내 등록(guideId 없음) 또는 수정. 공개 중인 안내의 내용이 바뀌면 안내 번호가 올라가 교육생에게 "변경된 안내"로 보인다.
 * 공개 전(비공개) 수정이나 공개 여부만 바꾸는 것은 번호를 올리지 않는다.
 */
export function saveGuide(store: Store, guideId: string | undefined, values: GuideFormValues, now: string = new Date().toISOString()): Promise<SaveGuideResult> {
  return store.transaction(async () => {
    const parsed = parseGuideForm(values);
    if (!parsed.ok) return { ok: false, reason: "입력한 내용을 확인해 주세요.", errors: parsed.errors } as const;
    const data = await store.readAll();
    const guides = data.guides ?? [];
    const existing = guideId ? guides.find((g) => g.id === guideId) : undefined;
    if (guideId && !existing) return { ok: false, reason: "안내를 찾을 수 없습니다." } as const;

    let next: Guide;
    let changedAfterPublish = false;
    if (existing) {
      changedAfterPublish = existing.published && contentChanged(existing, parsed.content);
      const { linkUrl: _l, linkLabel: _ll, dueAt: _d, ...rest } = existing; // 비워진 선택 항목은 지운다
      void _l; void _ll; void _d;
      next = {
        ...rest,
        ...parsed.content,
        published: parsed.published,
        revision: changedAfterPublish ? existing.revision + 1 : existing.revision,
        updatedAt: contentChanged(existing, parsed.content) ? now : existing.updatedAt,
        publishedAt: existing.publishedAt ?? (parsed.published ? now : undefined),
      };
      if (next.publishedAt === undefined) delete next.publishedAt;
    } else {
      next = {
        id: randomUUID(),
        ...parsed.content,
        published: parsed.published,
        revision: 1,
        order: guides.reduce((max, g) => Math.max(max, g.order), 0) + 1,
        createdAt: now,
        updatedAt: now,
        ...(parsed.published ? { publishedAt: now } : {}),
      };
    }
    try {
      await store.commit({ upsertGuides: [next] });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message } as const;
      throw error;
    }
    return { ok: true, guide: next, changedAfterPublish } as const;
  });
}

/** 공개 / 비공개 전환 (내용은 바뀌지 않으므로 "변경된 안내"가 되지 않는다) */
export function setGuidePublished(store: Store, guideId: string, published: boolean, now: string = new Date().toISOString()) {
  return store.transaction(async () => {
    const guide = (await store.readAll()).guides?.find((g) => g.id === guideId);
    if (!guide) return { ok: false, reason: "안내를 찾을 수 없습니다." } as const;
    if (guide.published === published) return { ok: true, changed: false } as const;
    try {
      await store.commit({ upsertGuides: [{ ...guide, published, publishedAt: guide.publishedAt ?? (published ? now : undefined) }] });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message } as const;
      throw error;
    }
    return { ok: true, changed: true } as const;
  });
}

// ───────────────────────── 교육생 쪽 ─────────────────────────

/** 교육생 화면에 넘기는 안내 한 건: 이 교육생이 봐도 되는 값만 담는다 (관리용 값·다른 교육생 기록은 없다) */
export interface MyGuide {
  id: string;
  title: string;
  body: string;
  linkUrl?: string;
  linkLabel?: string;
  dueAt?: string;
  needsPrep: boolean;
  updatedAt: string;
  state: GuideState;
}

/**
 * 내가 볼 수 있는 최종 안내 목록. "선정 + 참석 회신"이 아니면 빈 목록(안내가 있다는 사실도 알 수 없다).
 * 공개된 안내만, 순서대로. 내 확인·준비 기록만 담는다.
 */
export async function loadMyGuides(store: Store, traineeId: string): Promise<MyGuide[]> {
  const data = await store.readAll();
  const me = data.trainees.find((t) => t.id === traineeId);
  const reply = data.replies.find((r) => r.traineeId === traineeId);
  if (!canViewGuides(me, reply)) return [];
  const mine = new Map((data.guideProgress ?? []).filter((p) => p.traineeId === traineeId).map((p) => [p.guideId, p]));
  return sortGuides((data.guides ?? []).filter((g) => g.published)).map((g) => ({
    id: g.id,
    title: g.title,
    body: g.body,
    linkUrl: g.linkUrl,
    linkLabel: g.linkLabel,
    dueAt: g.dueAt,
    needsPrep: g.needsPrep,
    updatedAt: g.updatedAt,
    state: guideState(g, mine.get(g.id)),
  }));
}

export type GuideMark = "확인" | "확인취소" | "준비" | "준비취소";
export type MarkGuideResult = { ok: true; changed: boolean } | { ok: false; reason: string };

/**
 * 교육생이 안내별로 "확인 완료" / "준비 완료"를 표시하거나 해제한다.
 * 서버에서 다시 검사한다: 지금도 "선정 + 참석 회신"인가, 공개된 안내인가, 준비 표시는 준비가 필요한 안내인가.
 * 확인할 때는 지금의 안내 번호를 함께 저장해 두어, 나중에 내용이 바뀌면 "변경된 안내"를 알 수 있다.
 */
export function markGuide(store: Store, traineeId: string, guideId: string, mark: GuideMark, now: string = new Date().toISOString()): Promise<MarkGuideResult> {
  return store.transaction(async () => {
    const data = await store.readAll();
    const me = data.trainees.find((t) => t.id === traineeId);
    const reply = data.replies.find((r) => r.traineeId === traineeId);
    if (!canViewGuides(me, reply)) return { ok: false, reason: "참석으로 회신한 최종 선정자만 확인할 수 있습니다." } as const;
    const guide = data.guides?.find((g) => g.id === guideId && g.published);
    if (!guide) return { ok: false, reason: "안내를 찾을 수 없습니다. 화면을 새로 고쳐 주세요." } as const;
    if ((mark === "준비" || mark === "준비취소") && !guide.needsPrep) return { ok: false, reason: "준비가 필요한 안내가 아닙니다." } as const;

    const current: GuideProgress = (data.guideProgress ?? []).find((p) => p.guideId === guideId && p.traineeId === traineeId) ?? { guideId, traineeId };
    const next: GuideProgress = { ...current };
    if (mark === "확인") {
      if (guideState(guide, current).confirmed) return { ok: true, changed: false } as const; // 두 번 눌러도 안전
      next.confirmedAt = now;
      next.confirmedRevision = guide.revision;
    } else if (mark === "확인취소") {
      if (!current.confirmedAt) return { ok: true, changed: false } as const;
      delete next.confirmedAt;
      delete next.confirmedRevision;
    } else if (mark === "준비") {
      if (current.preparedAt) return { ok: true, changed: false } as const;
      next.preparedAt = now;
    } else {
      if (!current.preparedAt) return { ok: true, changed: false } as const;
      delete next.preparedAt;
    }
    try {
      await store.commit({ upsertGuideProgress: [next] });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message } as const;
      throw error;
    }
    return { ok: true, changed: true } as const;
  });
}
