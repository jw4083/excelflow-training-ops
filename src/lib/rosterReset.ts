// 교육생 명단 초기화 (한 과정만). 화면과 무관하게 자동 검사할 수 있도록 따로 두었다.
// 지워지는 것: 교육생 명단, 1차 선별·추첨 기록, 회신 내용, 회신 알림, 변경 이력, 정원(추첨으로 정해진 값).
// 남는 것: 과정 정보(과정명·일정·장소·안내문·회신 기한), 그리고 "명단초기화" 이력 한 건(언제 몇 명을 지웠는지).
// 안전장치: ① 화면에 보여 준 인원과 지금 인원이 같을 때만 ② 과정명을 그대로 입력했을 때만 ③ 보관된 과정은 저장소가 거부.
// 이 과정의 저장소만 열려 있으므로 다른 과정의 명단·회신에는 영향을 주지 않는다. 읽기 → 검사 → 저장은 한 덩어리(transaction)로 실행한다.
import { randomUUID } from "node:crypto";
import type { DbData } from "@/domain/types";
import { StoreError } from "@/store/applyChanges";
import type { Store } from "@/store";

/** 초기화 확인창에 보여 줄 "지워지는 것"의 개수 */
export interface ResetScope {
  courseName: string | null;
  trainees: number;
  selections: number;
  draws: number;
  replies: number;
  notices: number;
  history: number;
}

export function resetScope(data: DbData): ResetScope {
  return {
    courseName: data.course?.name ?? null,
    trainees: data.trainees.length,
    selections: data.selections.length,
    draws: data.draws.length,
    replies: data.replies.length,
    notices: data.notices?.length ?? 0,
    history: data.history.length,
  };
}

export type ResetResult = { ok: true; removed: number } | { ok: false; reason: string };

export interface ResetInput {
  expectedCount: number; // 화면에서 확인한 교육생 수
  confirmName: string; // 사용자가 직접 입력한 과정명
}

export function resetRoster(store: Store, input: ResetInput, now: string = new Date().toISOString()): Promise<ResetResult> {
  return store.transaction(async () => {
    const data = await store.readAll();
    if (data.archivedAt) return { ok: false, reason: "보관된 과정은 바꿀 수 없습니다. 보관을 해제한 뒤 다시 시도해 주세요." } as const;
    const scope = resetScope(data);
    if (scope.trainees === 0) return { ok: false, reason: "초기화할 명단이 없습니다." } as const;
    if (scope.trainees !== input.expectedCount) {
      return { ok: false, reason: `그사이 명단이 바뀌었습니다(현재 ${scope.trainees}명). 내용을 다시 확인한 뒤 진행해 주세요.` } as const;
    }
    const expectedName = data.course?.name ?? "";
    if (input.confirmName.trim() !== expectedName.trim() || expectedName.trim() === "") {
      return { ok: false, reason: "입력한 과정명이 일치하지 않아 초기화하지 않았습니다." } as const;
    }

    try {
      await store.commit({
        resetRoster: true,
        appendHistory: [
          {
            id: randomUUID(),
            at: now,
            kind: "명단초기화",
            before: { 교육생: `${scope.trainees}명`, 회신: `${scope.replies}건`, 추첨: `${scope.draws}건`, 이력: `${scope.history}건` },
            after: null,
            reason: "담당자가 명단을 초기화함",
            actor: "담당자",
          },
        ],
      });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message } as const;
      throw error;
    }
    return { ok: true, removed: scope.trainees } as const;
  });
}
