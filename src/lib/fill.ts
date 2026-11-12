// 충원 확정과 직접 제외 처리 (PLAN 작업 20, PRD M1-5·M1-10·M1-11, DESIGN 4.4).
// 충원 확정 = 비는 자리의 사람을 "제외"로(불참이면 바꾸고, 이미 제외면 그대로) 하고 충원 확정 표시(replacedBy)를 남기며,
// 후보를 "선정"으로 바꾼다(개별 회신 기한 저장). 상태 변경 2건과 이력 2건이 한 묶음으로 저장되어 중간까지만 저장되지 않는다.
import { fillCandidates, fillExceedsCapacity, isAllowedCandidate } from "@/domain/fill";
import { changeStatus, changeStatuses, type ChangeOptions } from "@/lib/history";
import type { Store } from "@/store";

export type FillResult =
  | { ok: true }
  | { ok: false; reason: string; needsOverConfirm?: boolean };

export interface FillInput {
  targetId: string; // 비는 자리의 사람 (불참 또는 제외)
  candidateId: string; // 충원되는 사람
  replyDeadline: string; // 충원되는 사람의 개별 회신 기한 (ISO, 지금보다 뒤)
  confirmOver?: boolean; // 정원을 넘어도 확정한다고 담당자가 확인했는가
}

async function confirmFillUnlocked(store: Store, input: FillInput, options: ChangeOptions = {}): Promise<FillResult> {
  const now = options.now ?? new Date().toISOString();
  const data = await store.readAll();

  const target = data.trainees.find((t) => t.id === input.targetId);
  if (!target) return { ok: false, reason: "충원할 자리를 찾을 수 없습니다." };
  if (target.status !== "불참" && target.status !== "제외") {
    return { ok: false, reason: `"${target.status}" 상태에서는 충원할 수 없습니다. 화면을 새로 고쳐 다시 확인해 주세요.` };
  }
  if (target.replacedBy) return { ok: false, reason: "이미 충원이 확정된 자리입니다." };

  if (!isAllowedCandidate(data.trainees, input.candidateId)) {
    const c = fillCandidates(data.trainees);
    return {
      ok: false,
      reason:
        c.mode === "waitlist"
          ? "대기자가 남아 있으면 대기 순번이 가장 빠른 사람부터 충원해야 합니다. 화면을 새로 고쳐 주세요."
          : c.mode === "pool"
            ? "충원할 수 있는 사람이 아닙니다. 미선정자 중에서 골라 주세요."
            : "충원할 대기자도 미선정자도 없습니다.",
    };
  }

  if (Number.isNaN(Date.parse(input.replyDeadline)) || Date.parse(input.replyDeadline) <= Date.parse(now)) {
    return { ok: false, reason: "충원되는 사람의 회신 기한은 지금보다 뒤여야 합니다." };
  }

  if (fillExceedsCapacity(data.course?.capacity, data.trainees) && !input.confirmOver) {
    return {
      ok: false,
      needsOverConfirm: true,
      reason: "이 충원을 확정하면 정원을 넘게 됩니다. 넘는 것을 확인하고 확정해 주세요.",
    };
  }

  const result = await changeStatuses(
    store,
    [
      { action: "충원자리처리", traineeId: target.id, patch: { replacedBy: input.candidateId }, reason: "충원 확정" },
      { action: "충원선정", traineeId: input.candidateId, patch: { replacedFor: target.id, replyDeadline: input.replyDeadline } },
    ],
    {},
    { ...options, now },
  );
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** 담당자가 선정자를 직접 "제외"한다 (사유 필수). 이후 충원이 필요한 자리로 알림에 잡힌다. */
export async function excludeSelected(
  store: Store,
  traineeId: string,
  reason: string,
  options: ChangeOptions = {},
): Promise<FillResult> {
  const text = reason.trim();
  if (!text) return { ok: false, reason: "제외 사유를 입력해 주세요." };
  const result = await changeStatus(store, { action: "직접제외", traineeId, reason: text }, {}, options);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** 충원 확정: 읽기 → 후보·정원 검사 → 저장을 한 덩어리(transaction)로 실행한다. 같은 자리에 두 번 충원되거나 재회신과 겹치는 일을 막는다. */
export function confirmFill(store: Store, input: FillInput, options: ChangeOptions = {}): Promise<FillResult> {
  return store.transaction(() => confirmFillUnlocked(store, input, options));
}
