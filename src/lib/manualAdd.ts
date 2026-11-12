// 선정 후 수기 추가 (PLAN 작업 21, PRD M1-6·M1-9·M1-10·M1-11, DESIGN 2.3 "명단").
// 사번·이름·부서·추가 사유가 모두 있어야 하고, 사번은 6자리이며 명단에 없어야 한다(검사는 lib/history.ts의 "수기추가" 동작이 한다).
// 추가된 사람은 "선정"(수기 표시)이 되고, 같은 공통 주소에서 그 사번으로 바로 로그인할 수 있다(교육생 로그인은 명단의 사번을 보므로 따로 할 일이 없다).
// 대신할 불참·제외 자리를 고르면 그 자리에 충원 확정 표시가 남아 알림에서 빠진다. 모든 변경은 한 묶음으로 저장된다.
import { randomUUID } from "node:crypto";
import { fillExceedsCapacity } from "@/domain/fill";
import { buildStatusChanges, changeStatuses, type ChangeOptions, type StatusChangeInput } from "@/lib/history";
import type { Store } from "@/store";

export interface ManualAddInput {
  empNo: string;
  name: string;
  dept: string;
  reason: string; // 추가 사유
  replyDeadline?: string; // 개별 회신 기한(ISO). 없으면 과정 기한을 따른다
  replaceTargetId?: string; // 대신할 불참·제외 자리 (선택)
  confirmOver?: boolean; // 정원을 넘어도 추가한다고 확인했는가
}

export type ManualAddResult =
  | { ok: true; traineeId: string }
  | { ok: false; reason: string; needsOverConfirm?: boolean };

async function addManualTraineeUnlocked(store: Store, input: ManualAddInput, options: ChangeOptions = {}): Promise<ManualAddResult> {
  const now = options.now ?? new Date().toISOString();
  const data = await store.readAll();

  if (input.replyDeadline !== undefined && (Number.isNaN(Date.parse(input.replyDeadline)) || Date.parse(input.replyDeadline) <= Date.parse(now))) {
    return { ok: false, reason: "회신 기한은 지금보다 뒤여야 합니다." };
  }

  let target = undefined;
  if (input.replaceTargetId) {
    target = data.trainees.find((t) => t.id === input.replaceTargetId);
    if (!target || (target.status !== "불참" && target.status !== "제외") || target.replacedBy) {
      return { ok: false, reason: "대신할 자리가 올바르지 않습니다. 화면을 새로 고쳐 다시 확인해 주세요." };
    }
  }

  // 입력 검사(필수 항목, 6자리, 중복)는 상태 변경 쪽이 하므로, 정원 경고는 입력이 올바를 때만 의미가 있다.
  // 정원 초과 확인은 여기서 먼저 하되, 잘못된 입력의 오류 메시지가 가려지지 않도록 입력 오류를 먼저 돌려준다.
  const newTraineeId = randomUUID();
  let idCall = 0;
  const newId = () => (idCall++ === 0 ? newTraineeId : randomUUID());
  const inputs: StatusChangeInput[] = [
    {
      action: "수기추가",
      newTrainee: {
        empNo: input.empNo,
        name: input.name,
        dept: input.dept,
        manualReason: input.reason,
        replyDeadline: input.replyDeadline,
        replacedFor: target?.id,
      },
    },
  ];
  if (target) {
    inputs.push({ action: "충원자리처리", traineeId: target.id, patch: { replacedBy: newTraineeId }, reason: "수기 추가로 충원" });
  }

  if (fillExceedsCapacity(data.course?.capacity, data.trainees) && !input.confirmOver) {
    // 입력 오류가 있으면 그 이유를 먼저 알려 주기 위해 시험 삼아 한 번 검사한다 (저장하지 않는다)
    const dry = buildStatusChanges(data, inputs, {}, { now, newId: () => randomUUID() });
    if (!dry.ok) return { ok: false, reason: dry.reason };
    return {
      ok: false,
      needsOverConfirm: true,
      reason: "이 사람을 추가하면 선정 인원이 정원을 넘게 됩니다. 넘는 것을 확인하고 추가해 주세요.",
    };
  }

  const result = await changeStatuses(store, inputs, {}, { ...options, now, newId });
  return result.ok ? { ok: true, traineeId: newTraineeId } : { ok: false, reason: result.reason };
}

/** 수기 추가: 읽기 → 사번 중복·정원 검사 → 저장을 한 덩어리(transaction)로 실행한다. 같은 사번이 동시에 두 번 들어가지 않는다. */
export function addManualTrainee(store: Store, input: ManualAddInput, options: ChangeOptions = {}): Promise<ManualAddResult> {
  return store.transaction(() => addManualTraineeUnlocked(store, input, options));
}
