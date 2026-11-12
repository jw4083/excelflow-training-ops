// 저장 규칙 적용 (저장 방식과 무관한 순수 코드: 파일·데이터베이스 어느 쪽 구현이든 이 함수를 그대로 쓴다).
// 변경 묶음을 현재 데이터에 적용해 "새 데이터"를 돌려준다. 규칙에 어긋나면 StoreError를 던지고, 원본은 건드리지 않는다.
import { EMP_NO_PATTERN, type DbData } from "@/domain/types";
import type { StoreChanges } from "./index";

/** 저장 규칙 위반 */
export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

/** 아무것도 저장되지 않은 처음 상태 */
export function emptyData(): DbData {
  return { course: null, trainees: [], selections: [], draws: [], replies: [], history: [] };
}

export function applyChanges(current: DbData, changes: StoreChanges): DbData {
  // 원본을 건드리지 않도록 복사본에서 작업한다 (규칙 위반 시 그대로 버리면 "아무것도 저장 안 됨"이 된다)
  const data: DbData = structuredClone(current);

  // 보관된 과정은 바꿀 수 없다 (보관 해제만 가능). 화면 버튼을 숨기는 것과 별개로 저장 단계에서 막는다
  if (current.archivedAt && hasContentChanges(changes)) {
    throw new StoreError("보관된 과정은 바꿀 수 없습니다. 보관을 해제한 뒤 다시 시도해 주세요.");
  }
  if (changes.archivedAt !== undefined) data.archivedAt = changes.archivedAt;

  if (changes.course) data.course = structuredClone(changes.course);

  // 교육생: 있으면 수정, 없으면 추가. 지우는 방법은 없다 (PRD M1-7)
  for (const incoming of changes.upsertTrainees ?? []) {
    if (!EMP_NO_PATTERN.test(incoming.empNo)) {
      throw new StoreError(`사번은 숫자 6자리여야 합니다: "${incoming.empNo}"`);
    }
    const copy = structuredClone(incoming);
    const index = data.trainees.findIndex((t) => t.id === copy.id);
    if (index >= 0) data.trainees[index] = copy;
    else data.trainees.push(copy);
  }
  // 같은 사번은 한 명만 (PRD M1-2). 글자 완전 일치로 비교하므로 "001234"와 "1234"는 서로 다르다
  const seen = new Set<string>();
  for (const t of data.trainees) {
    if (seen.has(t.empNo)) throw new StoreError(`이미 등록된 사번입니다: "${t.empNo}"`);
    seen.add(t.empNo);
  }

  // 회신: 교육생당 최신 1건
  for (const incoming of changes.upsertReplies ?? []) {
    if (!data.trainees.some((t) => t.id === incoming.traineeId)) {
      throw new StoreError(`회신 대상 교육생이 없습니다: ${incoming.traineeId}`);
    }
    const copy = structuredClone(incoming);
    const index = data.replies.findIndex((r) => r.traineeId === copy.traineeId);
    if (index >= 0) data.replies[index] = copy;
    else data.replies.push(copy);
  }

  // 선별 기록·추첨 기록·변경 이력: 추가만 가능. 이미 있는 id를 다시 저장하면 수정이 되므로 거부한다 (PRD M1-4, M1-7)
  appendOnly(data.selections, changes.appendSelections, "선별 기록");
  appendOnly(data.draws, changes.appendDraws, "추첨 기록");
  appendOnly(data.history, changes.appendHistory, "변경 이력");

  return data;
}

/** 보관 표시(archivedAt) 말고 실제 내용을 바꾸는 변경이 들어 있는가 (빈 묶음·빈 목록은 바꾸는 것이 아니다) */
function hasContentChanges(changes: StoreChanges): boolean {
  return Object.entries(changes).some(
    ([key, value]) => key !== "archivedAt" && value !== undefined && !(Array.isArray(value) && value.length === 0),
  );
}

function appendOnly<T extends { id: string }>(existing: T[], incoming: T[] | undefined, label: string) {
  for (const item of incoming ?? []) {
    if (existing.some((e) => e.id === item.id)) {
      throw new StoreError(`${label}은(는) 수정할 수 없습니다 (이미 있는 번호: ${item.id})`);
    }
    existing.push(structuredClone(item));
  }
}
