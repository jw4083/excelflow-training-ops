// 1차 선별과 선별 취소 처리 (PLAN 작업 12, PRD M1-3, DESIGN 4.2).
//  - 선별: 체크한 "신청" 상태의 사람을 바로 "선정"으로 바꾸고, 선별 기록(일시·인원)을 남긴다.
//  - 선별 취소: 2차 추첨 전까지, 1차 선별로 선정된 사람만 "신청"으로 되돌리고, 취소도 새 기록으로 남긴다.
// 상태 변경·교육생별 변경 이력·선별 기록은 changeStatuses로 "한 묶음"에 저장되므로, 중간까지만 저장되는 일이 없다.
// 체크한 사람 중 한 명이라도 규칙에 어긋나면 아무것도 바꾸지 않고 이유를 돌려준다.
import { randomUUID } from "node:crypto";
import type { SelectionRecord } from "@/domain/types";
import { changeStatuses, type ChangeOptions } from "@/lib/history";
import type { Store } from "@/store";

/** 한 번에 처리할 수 있는 최대 인원 (엑셀 한 번에 받는 최대 행 수와 같다) */
export const MAX_SELECTION_BATCH = 1000;
export const MAX_SELECT_REASON = 300;

export type SelectionResult =
  | { ok: true; count: number; record: SelectionRecord }
  | { ok: false; reason: string };

type Kind = SelectionRecord["kind"];

async function run(store: Store, kind: Kind, traineeIds: string[], reasonInput: string | undefined, options: ChangeOptions): Promise<SelectionResult> {
  const ids = [...new Set(traineeIds.filter((id) => typeof id === "string" && id !== ""))]; // 같은 사람을 두 번 체크해도 한 번만
  if (ids.length === 0) {
    return { ok: false, reason: kind === "선별" ? "선정할 신청자를 먼저 체크해 주세요." : "선별을 취소할 사람을 골라 주세요." };
  }
  if (ids.length > MAX_SELECTION_BATCH) {
    return { ok: false, reason: `한 번에 ${MAX_SELECTION_BATCH.toLocaleString("ko-KR")}명까지만 처리할 수 있습니다.` };
  }

  // 우선 선정(선별)은 사유가 필수다: 여러 명이면 같은 공통 사유가 각 대상자에게 기록된다
  const text = reasonInput?.trim();
  if (kind === "선별") {
    if (!text) return { ok: false, reason: "선정 사유를 입력해 주세요." };
    if (text.length > MAX_SELECT_REASON) return { ok: false, reason: `선정 사유는 ${MAX_SELECT_REASON}자까지 입력할 수 있습니다.` };
  }

  const now = options.now ?? new Date().toISOString();
  const newId = options.newId ?? (() => randomUUID());
  const record: SelectionRecord = { id: newId(), at: now, kind, traineeIds: ids, ...(kind === "선별" ? { reason: text } : {}) };

  const result = await changeStatuses(
    store,
    ids.map((traineeId) => ({
      action: kind === "선별" ? ("선별" as const) : ("선별취소" as const),
      traineeId,
      ...(kind === "선별" ? { reason: text } : {}),
    })),
    { appendSelections: [record] },
    { now, newId },
  );
  if (result.ok) return { ok: true, count: ids.length, record };

  // 어느 사람 때문에 거부됐는지 이름과 사번을 붙여서 알려 준다
  const who = result.failedIndex === undefined ? undefined : (await store.readAll()).trainees.find((t) => t.id === ids[result.failedIndex as number]);
  const prefix = who ? `${who.name}(${who.empNo}): ` : "";
  // 화면을 연 뒤 다른 곳에서 상태가 바뀐 경우(가장 흔한 거부 이유)는 같은 말을 두 번 하지 않고 한 문장으로 안내한다
  const reason =
    kind === "선별" && who && who.status !== "신청"
      ? `이미 "${who.status}" 상태입니다. 화면을 새로 고쳐 다시 확인해 주세요.`
      : result.reason;
  return { ok: false, reason: `${prefix}${reason} 아무도 변경되지 않았습니다.` };
}

/** 체크한 신청자를 "선정"으로 바꾼다 (1차 선별 = 우선 선정). 사유는 필수이고 모든 대상자에게 같은 사유가 기록된다 */
export function selectApplicants(store: Store, traineeIds: string[], reason: string, options: ChangeOptions = {}): Promise<SelectionResult> {
  return run(store, "선별", traineeIds, reason, options);
}

/** 1차 선별로 선정된 사람을 "신청"으로 되돌린다 (2차 추첨 전까지) */
export function cancelSelection(store: Store, traineeIds: string[], options: ChangeOptions = {}): Promise<SelectionResult> {
  return run(store, "선별취소", traineeIds, undefined, options);
}
