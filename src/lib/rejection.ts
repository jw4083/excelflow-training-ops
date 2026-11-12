// 담당자 직접 "미선정" 처리와 복구 (추첨 전 신청자). 화면과 무관하게 자동 검사할 수 있도록 따로 두었다.
//  - 미선정 처리: "신청" 상태인 사람을 사유와 함께 "미선정"으로 바꾼다. 이력("미선정처리")에 일시·사유가 남고, 명단에는 기록이 남는다.
//    처리된 사람은 rejectedBy="담당자" 표시를 갖고, 추첨·재추첨·충원 후보에서 항상 빠진다 (domain/draw.ts·fill.ts·status.ts).
//  - 복구: 추첨 전에만, 담당자가 직접 미선정 처리한 사람을 "신청"으로 되돌린다. 이력("미선정복구")에 남는다. 추첨 결과 미선정은 복구 대상이 아니다.
// 상태 변경·이력은 changeStatuses로 한 묶음에 저장되므로 중간까지만 저장되는 일이 없고, 한 명이라도 규칙에 어긋나면 아무도 바뀌지 않는다.
import { randomUUID } from "node:crypto";
import { changeStatuses, type ChangeOptions } from "@/lib/history";
import type { Store } from "@/store";

export const MAX_REJECT_BATCH = 1000;
export const MAX_REJECT_REASON = 300;

export type RejectionResult = { ok: true; count: number } | { ok: false; reason: string };

const uniqueIds = (ids: string[]) => [...new Set(ids.filter((id) => typeof id === "string" && id !== ""))];

async function run(
  store: Store,
  action: "미선정처리" | "미선정복구",
  traineeIds: string[],
  reason: string | undefined,
  options: ChangeOptions,
): Promise<RejectionResult> {
  const ids = uniqueIds(traineeIds);
  const verb = action === "미선정처리" ? "미선정 처리할" : "되돌릴";
  if (ids.length === 0) return { ok: false, reason: `${verb} 사람을 먼저 골라 주세요.` };
  if (ids.length > MAX_REJECT_BATCH) return { ok: false, reason: `한 번에 ${MAX_REJECT_BATCH.toLocaleString("ko-KR")}명까지만 처리할 수 있습니다.` };
  const text = reason?.trim();
  if (action === "미선정처리") {
    if (!text) return { ok: false, reason: "미선정 사유를 입력해 주세요." };
    if (text.length > MAX_REJECT_REASON) return { ok: false, reason: `미선정 사유는 ${MAX_REJECT_REASON}자까지 입력할 수 있습니다.` };
  }

  const newId = options.newId ?? (() => randomUUID());
  const result = await changeStatuses(
    store,
    ids.map((traineeId) => ({ action, traineeId, ...(action === "미선정처리" ? { reason: text } : {}) })),
    {},
    { ...options, newId },
  );
  if (result.ok) return { ok: true, count: ids.length };

  const who = result.failedIndex === undefined ? undefined : (await store.readAll()).trainees.find((t) => t.id === ids[result.failedIndex as number]);
  const prefix = who ? `${who.name}(${who.empNo}): ` : "";
  return { ok: false, reason: `${prefix}${result.reason} 아무도 변경되지 않았습니다.` };
}

/** 체크한 신청자를 사유와 함께 "미선정"으로 처리한다 */
export function rejectApplicants(store: Store, traineeIds: string[], reason: string, options: ChangeOptions = {}): Promise<RejectionResult> {
  return run(store, "미선정처리", traineeIds, reason, options);
}

/** 담당자가 직접 미선정 처리한 사람을 추첨 전에 "신청"으로 되돌린다 */
export function restoreRejected(store: Store, traineeIds: string[], options: ChangeOptions = {}): Promise<RejectionResult> {
  return run(store, "미선정복구", traineeIds, undefined, options);
}
