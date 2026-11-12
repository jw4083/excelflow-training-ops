// 참석 취소 "확인" 처리: 담당자가 새 취소 건을 봤다고 표시한다 (담당자 화면의 "새 취소" 표시를 끈다).
// 상태·빈자리·충원 대기 순서(updatedAt)는 바꾸지 않고 확인 시각만 남긴다. 읽기 → 검사 → 저장을 한 덩어리(transaction)로 실행한다.
import { isNewCancel } from "@/domain/alerts";
import { StoreError } from "@/store/applyChanges";
import type { Store } from "@/store";

export type AcknowledgeResult = { ok: true; unchanged?: boolean } | { ok: false; reason: string };

export function acknowledgeCancel(store: Store, traineeId: string, now = new Date().toISOString()): Promise<AcknowledgeResult> {
  return store.transaction(async () => {
    const data = await store.readAll();
    const trainee = data.trainees.find((t) => t.id === traineeId);
    if (!trainee) return { ok: false, reason: "교육생을 찾을 수 없습니다." };
    if (!isNewCancel(trainee)) return { ok: true, unchanged: true }; // 이미 확인했거나(두 번 누름) 충원·재참석으로 끝난 건
    try {
      await store.commit({ upsertTrainees: [{ ...trainee, cancelSeenAt: now }] });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message };
      throw error;
    }
    return { ok: true };
  });
}
