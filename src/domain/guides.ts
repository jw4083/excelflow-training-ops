// 최종 선정자 전용 안내의 규칙 (화면·저장소를 모르는 순수 코드).
// 이 안내는 로그인한 교육생이 앱에서 확인하는 게시 기능이다. 카카오톡·문자·메일 자동 발송과는 관계가 없다.
//  - 누가 볼 수 있나: 상태가 "선정"이고 최신 회신이 "참석"인 교육생만. 대기·미선정·불참(참석 취소 포함)·선정 취소·미회신은 볼 수 없다.
//  - 변경된 안내: 공개한 뒤 내용이 바뀌면 안내 번호(revision)가 올라가고, 이전 번호로 확인했던 교육생에게 "변경된 안내"로 표시된다.
import { kstLocalToIso } from "@/lib/datetime";
import type { DbData, Guide, GuideProgress, Reply, Trainee } from "./types";

export const MAX_GUIDE_TITLE = 100;
export const MAX_GUIDE_BODY = 3000;
export const MAX_GUIDE_LINK = 500;
export const MAX_GUIDE_LINK_LABEL = 30;

/** 최종 안내를 볼 수 있는가: "선정"이면서 "참석"으로 회신한 사람만 (참석 취소는 상태가 "불참"이 되므로 즉시 막힌다) */
export function canViewGuides(
  trainee: Pick<Trainee, "status"> | null | undefined,
  reply: Pick<Reply, "attend"> | null | undefined,
): boolean {
  return trainee?.status === "선정" && reply?.attend === true;
}

// ───────────────────────── 입력 검사 ─────────────────────────

export interface GuideFormValues {
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  dueAt: string; // 한국 시간 "YYYY-MM-DDTHH:mm" (비어 있을 수 있음)
  needsPrep: boolean;
  published: boolean;
}
export type GuideFormField = keyof GuideFormValues;
export type GuideFormErrors = Partial<Record<GuideFormField, string>>;

export interface GuideContent {
  title: string;
  body: string;
  linkUrl?: string;
  linkLabel?: string;
  dueAt?: string;
  needsPrep: boolean;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseGuideForm(
  v: GuideFormValues,
): { ok: true; content: GuideContent; published: boolean } | { ok: false; errors: GuideFormErrors } {
  const errors: GuideFormErrors = {};
  const title = v.title.trim();
  const body = v.body.trim();
  const linkUrl = v.linkUrl.trim();
  const linkLabel = v.linkLabel.trim();
  if (!title) errors.title = "안내 제목을 입력해 주세요.";
  else if (title.length > MAX_GUIDE_TITLE) errors.title = `제목은 ${MAX_GUIDE_TITLE}자까지 입력할 수 있습니다.`;
  if (!body && !linkUrl) errors.body = "내용이나 링크 중 하나는 입력해 주세요.";
  else if (body.length > MAX_GUIDE_BODY) errors.body = `내용은 ${MAX_GUIDE_BODY.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`;
  if (linkUrl) {
    if (linkUrl.length > MAX_GUIDE_LINK) errors.linkUrl = `링크는 ${MAX_GUIDE_LINK}자까지 입력할 수 있습니다.`;
    else if (!isHttpsUrl(linkUrl)) errors.linkUrl = "링크는 https:// 로 시작하는 주소만 넣을 수 있습니다.";
  }
  if (linkLabel.length > MAX_GUIDE_LINK_LABEL) errors.linkLabel = `버튼 글은 ${MAX_GUIDE_LINK_LABEL}자까지 입력할 수 있습니다.`;
  let dueAt: string | undefined;
  if (v.dueAt.trim()) {
    const iso = kstLocalToIso(v.dueAt.trim());
    if (!iso) errors.dueAt = "준비 기한의 날짜·시각이 올바르지 않습니다.";
    else if (!v.needsPrep) errors.dueAt = "준비 기한은 '준비가 필요한 안내'로 체크했을 때만 정할 수 있습니다.";
    else dueAt = iso;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    published: v.published,
    content: {
      title,
      body,
      ...(linkUrl ? { linkUrl } : {}),
      ...(linkUrl && linkLabel ? { linkLabel } : {}),
      ...(dueAt ? { dueAt } : {}),
      needsPrep: v.needsPrep,
    },
  };
}

/** 안내 내용(교육생이 읽는 것)이 바뀌었는가. 공개 여부·순서 같은 관리용 값은 보지 않는다 */
export function contentChanged(before: GuideContent, after: GuideContent): boolean {
  return (
    before.title !== after.title ||
    before.body !== after.body ||
    (before.linkUrl ?? "") !== (after.linkUrl ?? "") ||
    (before.linkLabel ?? "") !== (after.linkLabel ?? "") ||
    (before.dueAt ?? "") !== (after.dueAt ?? "") ||
    before.needsPrep !== after.needsPrep
  );
}

// ───────────────────────── 교육생별 진행 상태 ─────────────────────────

export interface GuideState {
  confirmed: boolean; // 지금 안내 번호로 "확인 완료"했는가
  changed: boolean; // 이전 번호로 확인했는데 그 뒤 내용이 바뀜 → "변경된 안내"
  prepared: boolean; // "준비 완료"를 체크했는가 (준비가 필요한 안내만 의미가 있다)
  confirmedAt?: string;
  preparedAt?: string;
}

export function guideState(guide: Pick<Guide, "revision" | "needsPrep">, progress: GuideProgress | undefined): GuideState {
  const confirmedRev = progress?.confirmedAt ? (progress.confirmedRevision ?? 1) : undefined;
  return {
    confirmed: confirmedRev !== undefined && confirmedRev >= guide.revision,
    changed: confirmedRev !== undefined && confirmedRev < guide.revision,
    prepared: guide.needsPrep && Boolean(progress?.preparedAt),
    confirmedAt: progress?.confirmedAt,
    preparedAt: progress?.preparedAt,
  };
}

export const sortGuides = <T extends Pick<Guide, "order" | "createdAt">>(guides: T[]): T[] =>
  [...guides].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

// ───────────────────────── 담당자 현황 ─────────────────────────

export interface GuideStatusRow {
  trainee: Pick<Trainee, "id" | "empNo" | "name" | "dept">;
  state: GuideState;
  incomplete: boolean; // 확인 전이거나(변경 후 재확인 포함) 준비가 필요한데 준비 전
}

export interface GuideStatus {
  rows: GuideStatusRow[];
  total: number;
  confirmed: number;
  prepared: number;
  changedUnconfirmed: number;
  incomplete: number;
}

/** 한 안내의 교육생별 확인·준비 현황. 대상은 "선정 + 참석 회신"인 교육생뿐이다 (다른 사람은 현황에도 나오지 않는다) */
export function guideStatus(data: Pick<DbData, "trainees" | "replies" | "guideProgress">, guide: Pick<Guide, "id" | "revision" | "needsPrep">): GuideStatus {
  const replies = new Map(data.replies.map((r) => [r.traineeId, r]));
  const progress = new Map((data.guideProgress ?? []).filter((p) => p.guideId === guide.id).map((p) => [p.traineeId, p]));
  const rows = data.trainees
    .filter((t) => canViewGuides(t, replies.get(t.id)))
    .sort((a, b) => a.empNo.localeCompare(b.empNo))
    .map((t): GuideStatusRow => {
      const state = guideState(guide, progress.get(t.id));
      return {
        trainee: { id: t.id, empNo: t.empNo, name: t.name, dept: t.dept },
        state,
        incomplete: !state.confirmed || (guide.needsPrep && !state.prepared),
      };
    });
  return {
    rows,
    total: rows.length,
    confirmed: rows.filter((r) => r.state.confirmed).length,
    prepared: rows.filter((r) => r.state.prepared).length,
    changedUnconfirmed: rows.filter((r) => r.state.changed).length,
    incomplete: rows.filter((r) => r.incomplete).length,
  };
}
