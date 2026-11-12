// 변경 이력 기록 함수 (PLAN 작업 6, DESIGN 6번 `lib/history.ts`).
// 교육생의 상태를 바꾸는 모든 기능(선별·추첨·불참·충원·수기 추가 등)은 반드시 이 함수를 거친다.
// 이 함수가 ① 전환표(작업 5)로 바꿔도 되는지 검사하고 ② 상태를 바꾸고 ③ 변경 이력(일시·변경 전·변경 후)을 만들어
// ④ 저장 창구(작업 4)에 "한 묶음"으로 저장한다. 그래서 이력을 빠뜨리는 일이 구조적으로 생기지 않는다 (PRD M1-7).
// 이력은 추가만 되고 수정·삭제하는 길이 없다.
import { randomUUID } from "node:crypto";
import {
  checkTransition,
  type Action,
  type TransitionContext,
} from "@/domain/status";
import {
  EMP_NO_PATTERN,
  type AbsentOrigin,
  type DbData,
  type History,
  type HistoryActor,
  type HistoryKind,
  type SelectedVia,
  type Status,
  type Trainee,
} from "@/domain/types";
import { applyChanges, StoreError } from "@/store/applyChanges";
import type { Store, StoreChanges } from "@/store";

/** 상태가 바뀔 때 함께 바꿀 수 있는 항목 (충원 확정 표시, 대기 순번, 개별 회신 기한 등) */
export interface StatusPatch {
  waitNo?: number; // 대기 순번 (바꿀 상태가 "대기"일 때만 저장됨)
  replacedBy?: string; // 이 자리에 충원된 교육생 id (충원 확정)
  replacedFor?: string; // 이 사람이 충원으로 들어간 대상 id
  replyDeadline?: string; // 개별 회신 기한
  absentOrigin?: AbsentOrigin; // 불참 경위 (바꿀 상태가 "불참"일 때만 저장됨)
  cancelledAt?: string; // 참석 취소 시각 (불참 경위가 "참석후취소"일 때)
}

/** 수기 추가로 새로 넣는 교육생 (PRD M1-6: 사번·이름·부서·추가 사유 모두 필수) */
export interface NewManualTrainee {
  empNo: string;
  name: string;
  dept: string;
  manualReason: string;
  replyDeadline?: string;
  replacedFor?: string;
}

/** 상태 변경 한 건 */
export interface StatusChangeInput {
  action: Action;
  traineeId?: string; // 수기추가를 뺀 모든 동작에서 필요
  newTrainee?: NewManualTrainee; // 수기추가에서만 필요
  to?: Status; // 추첨처럼 결과 상태가 여러 가지인 동작에서 필요
  patch?: StatusPatch;
  reason?: string; // 사유 (직접제외는 필수)
  byAdmin?: boolean; // 담당자가 교육생 대신 입력 (이력 종류가 "회신대리입력"이 됨)
  kind?: HistoryKind; // 이력 종류를 직접 정할 때 (참석 취소 = "참석취소")
  actor?: HistoryActor; // 누가 바꿨는지 이력에 남길 때 (회신·참석 취소)
  windowChecked?: boolean; // 기한 판단을 이미 마쳤음 (reply.ts가 참석 취소 허용 구간을 판단한 뒤 넘긴다)
  historyExtra?: { before: Record<string, unknown>; after: Record<string, unknown> }; // 상태와 함께 이력의 변경 전/후에 덧붙일 내용 (회신 내용 등)
}

export interface ChangeOptions {
  now?: string; // 변경 일시 (생략하면 지금). 테스트에서 고정할 때 쓴다
  newId?: () => string; // 번호 만들기 (생략하면 무작위). 테스트에서 고정할 때 쓴다
}

export type ChangeResult =
  | { ok: true; trainees: Trainee[]; history: History[] }
  | { ok: false; reason: string; failedIndex?: number };

// 상태와 함께 이력에 "변경 전 → 변경 후"로 남기는 항목
const TRACKED = [
  "status",
  "waitNo",
  "selectedVia",
  "replacedBy",
  "replacedFor",
  "replyDeadline",
  "absentOrigin",
  "cancelledAt",
  "cancelSeenAt",
  "rejectedBy",
] as const;

// 선정이 되는 동작의 기본 "선정 경로"
const VIA_BY_ACTION: Partial<Record<Action, SelectedVia>> = {
  선별: "선별",
  추첨: "추첨",
  충원선정: "충원",
  수기추가: "수기",
};

/** 동작 → 이력 종류 (DESIGN 3.1의 kind 9종) */
function kindFor(action: Action, byAdmin: boolean): HistoryKind {
  switch (action) {
    case "선별":
      return "선정";
    case "선별취소":
      return "선별취소";
    case "추첨":
      return "추첨";
    case "불참회신":
      return byAdmin ? "회신대리입력" : "불참";
    case "참석재회신":
      return byAdmin ? "회신대리입력" : "회신";
    case "직접제외":
    case "충원자리처리":
      return "제외";
    case "충원선정":
      return "충원";
    case "수기추가":
      return "수기추가";
    case "미선정처리":
      return "미선정처리";
    case "미선정복구":
      return "미선정복구";
  }
}

type BuildOne = { ok: true; trainee: Trainee; entry: History } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** 값이 없는(undefined) 항목은 빼고 보기 좋은 모양으로 만든다 */
function pick(t: Trainee | null): Record<string, unknown> | null {
  if (!t) return null;
  const out: Record<string, unknown> = {};
  for (const key of TRACKED) if (t[key] !== undefined) out[key] = t[key];
  return out;
}

/** 바뀐 항목만 골라 "변경 전 / 변경 후"를 만든다 */
function diff(before: Trainee | null, after: Trainee) {
  const b = pick(before);
  const a = pick(after) as Record<string, unknown>;
  if (!b) return { before: null, after: a };
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of TRACKED) {
    if (b[key] !== a[key]) {
      if (b[key] !== undefined) changedBefore[key] = b[key];
      if (a[key] !== undefined) changedAfter[key] = a[key];
    }
  }
  return { before: changedBefore, after: changedAfter };
}

function buildOne(data: DbData, input: StatusChangeInput, now: string, newId: () => string): BuildOne {
  const { action } = input;
  const isNew = action === "수기추가";
  const existing = isNew ? null : (data.trainees.find((t) => t.id === input.traineeId) ?? null);
  if (!isNew && !existing) return fail("교육생을 찾을 수 없습니다.");

  if (action === "직접제외" && !input.reason?.trim()) return fail("선정 취소 사유를 입력해야 합니다.");
  if (action === "선별" && !input.reason?.trim()) return fail("선정 사유를 입력해야 합니다.");
  if (action === "미선정처리" && !input.reason?.trim()) return fail("미선정 사유를 입력해야 합니다.");

  // 수기 추가는 사번·이름·부서·사유가 모두 있어야 하고, 사번은 6자리이며 이미 명단에 없어야 한다 (PRD M1-6, M1-9)
  const manual = input.newTrainee;
  if (isNew) {
    if (!manual) return fail("추가할 교육생 정보가 없습니다.");
    const empNo = manual.empNo.trim();
    if (!empNo || !manual.name.trim() || !manual.dept.trim() || !manual.manualReason.trim()) {
      return fail("사번, 이름, 부서와 추가 사유를 모두 입력해야 합니다.");
    }
    if (!EMP_NO_PATTERN.test(empNo)) return fail("사번은 숫자 6자리입니다.");
    if (data.trainees.some((t) => t.empNo === empNo)) return fail("이미 명단에 있는 사번입니다.");
  }

  // 전환표 검사 (작업 5). 회신 기한은 개별 기한이 있으면 그것, 없으면 과정 기한
  const context: TransitionContext = {
    now,
    replyDeadline: existing?.replyDeadline ?? manual?.replyDeadline ?? data.course?.replyDeadline,
    drawCount: data.draws.length,
    waitlistCount: data.trainees.filter((t) => t.status === "대기").length,
    byAdmin: input.byAdmin,
    windowChecked: input.windowChecked,
  };
  const result = checkTransition(action, existing, input.to, context);
  if (!result.ok) return fail(result.reason);

  // 새 교육생 정보 만들기
  let next: Trainee;
  if (isNew && manual) {
    next = {
      id: newId(),
      empNo: manual.empNo.trim(),
      name: manual.name.trim(),
      dept: manual.dept.trim(),
      status: result.to,
      isManual: true,
      manualReason: manual.manualReason.trim(),
      selectedVia: "수기",
      createdAt: now,
      updatedAt: now,
    };
    if (manual.replyDeadline) next.replyDeadline = manual.replyDeadline;
    if (manual.replacedFor) next.replacedFor = manual.replacedFor;
  } else if (existing) {
    next = { ...existing, status: result.to, updatedAt: now };
    const patch = input.patch ?? {};
    if (patch.replacedBy !== undefined) next.replacedBy = patch.replacedBy;
    if (patch.replacedFor !== undefined) next.replacedFor = patch.replacedFor;
    if (patch.replyDeadline !== undefined) next.replyDeadline = patch.replyDeadline;
    // 대기 순번은 "대기" 상태일 때만 가진다
    if (result.to === "대기") {
      const waitNo = patch.waitNo ?? existing.waitNo;
      if (waitNo !== undefined) next.waitNo = waitNo;
    } else {
      delete next.waitNo;
    }
    // 불참 경위·참석 취소 표시: 불참이 될 때 새로 정하고, 다시 선정 등으로 돌아가면 지운다.
    // 제외(충원 확정 포함)로 갈 때는 남겨 두어 "어떤 불참 자리였는지"를 명단에서 볼 수 있게 한다
    if (result.to === "불참") {
      delete next.absentOrigin;
      delete next.cancelledAt;
      delete next.cancelSeenAt;
      if (patch.absentOrigin) next.absentOrigin = patch.absentOrigin;
      if (patch.cancelledAt) next.cancelledAt = patch.cancelledAt;
    } else if (result.to !== "제외") {
      delete next.absentOrigin;
      delete next.cancelledAt;
      delete next.cancelSeenAt;
    }
    // "제외"가 된 경위: 선정자를 직접 제외하면 "선정취소", 불참자의 자리를 충원 처리하면 "불참". 이미 제외인 자리의 충원 확정은 처음 경위를 그대로 둔다
    if (result.to === "제외") {
      if (action === "직접제외") next.excludedFrom = "선정취소";
      else if (existing.status === "불참") next.excludedFrom = "불참";
    } else {
      delete next.excludedFrom;
    }
    // 담당자 미선정 표시: 미선정 처리 때 붙이고(사유·일시 포함), 복구·그 밖의 상태 변경에서는 지운다
    if (action === "미선정처리") {
      next.rejectedBy = "담당자";
      next.rejectReason = input.reason?.trim();
      next.rejectedAt = now;
    } else {
      delete next.rejectedBy;
      delete next.rejectReason;
      delete next.rejectedAt;
    }
    // 선정 경로: 선정이 되는 동작이면 새로 기록하고, 선별 취소·추첨에서 선정이 아니게 되면 지운다.
    // 불참·제외·참석 재회신은 원래 경로를 그대로 둔다 (불참 후 다시 선정되어도 원래 경로 유지)
    const via = VIA_BY_ACTION[action];
    // 우선 선정(1차 선별) 사유는 선별 때 저장하고, 선별을 취소하면 지운다 (사유는 변경 이력에 그대로 남는다)
    if (action === "선별") next.selectReason = input.reason?.trim();
    else if (action === "선별취소") delete next.selectReason;
    if (via && result.to === "선정") next.selectedVia = via;
    else if (action === "선별취소" || (action === "추첨" && result.to !== "선정")) delete next.selectedVia;
  } else {
    return fail("교육생을 찾을 수 없습니다.");
  }

  const { before, after } = diff(existing, next);
  const extraBefore = input.historyExtra?.before ?? {};
  const extraAfter = input.historyExtra?.after ?? {};
  const entry: History = {
    id: newId(),
    at: now,
    kind: input.kind ?? kindFor(action, input.byAdmin === true),
    traineeId: next.id,
    before: before === null && Object.keys(extraBefore).length === 0 ? null : { ...(before ?? {}), ...extraBefore },
    after: { ...after, ...extraAfter },
  };
  if (input.reason?.trim()) entry.reason = input.reason.trim();
  if (input.actor) entry.actor = input.actor;
  return { ok: true, trainee: next, entry };
}

/**
 * 순수 계산: 현재 데이터와 상태 변경 목록을 받아 "저장할 변경 묶음"을 만든다 (저장은 하지 않는다).
 * 변경은 순서대로 적용되며, 한 건이라도 규칙에 어긋나면 전체가 실패한다.
 * `extra`는 같은 묶음으로 함께 저장할 변경(추첨 기록, 정원 저장 등)이다.
 */
export function buildStatusChanges(
  data: DbData,
  inputs: StatusChangeInput[],
  extra: StoreChanges = {},
  options: ChangeOptions = {},
): ChangeResult & { changes?: StoreChanges } {
  const now = options.now ?? new Date().toISOString();
  const newId = options.newId ?? (() => randomUUID());
  let working = data;
  const trainees: Trainee[] = [];
  const history: History[] = [];

  for (const [index, input] of inputs.entries()) {
    const built = buildOne(working, input, now, newId);
    if (!built.ok) return { ok: false, reason: built.reason, failedIndex: index };
    try {
      // 앞 변경이 반영된 상태에서 다음 변경을 검사한다 (사번 중복 등 저장 규칙도 여기서 함께 확인)
      working = applyChanges(working, { upsertTrainees: [built.trainee], appendHistory: [built.entry] });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message, failedIndex: index };
      throw error;
    }
    trainees.push(built.trainee);
    history.push(built.entry);
  }

  const changes: StoreChanges = {
    ...extra,
    upsertTrainees: [...(extra.upsertTrainees ?? []), ...trainees],
    appendHistory: [...(extra.appendHistory ?? []), ...history],
  };
  return { ok: true, trainees, history, changes };
}

/**
 * 상태 변경 여러 건 + 함께 저장할 변경(`extra`)을 **한 번에** 저장한다.
 * 예: 충원 확정 = 불참자 "제외" + 후보 "선정" + 이력 2건 → 중간까지만 저장되는 일이 없다.
 */
export async function changeStatuses(
  store: Store,
  inputs: StatusChangeInput[],
  extra: StoreChanges = {},
  options: ChangeOptions = {},
): Promise<ChangeResult> {
  // 읽기 → 전환표 검사 → 저장을 한 덩어리로: 그 사이에 다른 요청이 같은 교육생을 바꾸지 못한다
  return store.transaction(async () => {
    const built = buildStatusChanges(await store.readAll(), inputs, extra, options);
    if (!built.ok || !built.changes) return built;
    try {
      await store.commit(built.changes);
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message } as const;
      throw error;
    }
    return { ok: true, trainees: built.trainees, history: built.history } as const;
  });
}

/** 상태 변경 한 건을 저장한다 (`changeStatuses`의 한 건짜리). */
export function changeStatus(
  store: Store,
  input: StatusChangeInput,
  extra: StoreChanges = {},
  options: ChangeOptions = {},
): Promise<ChangeResult> {
  return changeStatuses(store, [input], extra, options);
}
