// 회신 제출 (PLAN 작업 18, PRD M2-3~M2-8). 교육생 본인 제출과 담당자 대리 입력(작업 19)이 같은 길을 쓴다.
// 순서: ① 입력 검사 ② 상태·기한(회신 기한·참석 취소 마감·교육 시작) 검사 ③ (필요하면) 상태 변경 + 이력 ④ 회신 저장 + 회신 이력을 한 묶음으로 저장.
// 참석 취소(참석 회신 → 불참)도 이 길을 쓴다: 사유(구분 + 10~300자) 필수, 최종 확인 필수, 불참 경위·취소 시각 저장, 이력 종류 "참석취소".
// 취소해도 자동 충원은 하지 않는다: 빈자리 알림에 잡히고 담당자가 기존 충원 기능으로 정한다.
import { randomUUID } from "node:crypto";
import {
  absentOriginFor,
  checkReplyAllowed,
  isAttendanceCancel,
  replyStatusAction,
  validateReplyInput,
  type ReplyField,
  type ReplyInput,
} from "@/domain/replyRules";
import type { History, Reply } from "@/domain/types";
import { buildStatusChanges, type StatusChangeInput } from "@/lib/history";
import { StoreError } from "@/store/applyChanges";
import type { Store, StoreChanges } from "@/store";

export interface SubmitReplyOptions {
  byAdmin?: boolean; // 담당자 대리 입력 (기한이 지나도 가능, 기록에 "담당자 입력" 표시)
  confirmed?: boolean; // 참석 → 불참 변경(참석 취소)을 화면에서 최종 확인했는가. 확인 없이 온 참석 취소는 저장하지 않는다
  now?: string;
}

export type SubmitReplyResult =
  | { ok: true; reply: Reply; cancelled?: boolean; unchanged?: boolean }
  | { ok: false; reason: string; errors?: Partial<Record<ReplyField, string>>; needsConfirm?: boolean };

const REPLY_KEYS = ["attend", "absentType", "absentDetail", "laptop", "roommateName", "roommateDept"] as const;

/** 이력에 남길 "바뀐 항목만 변경 전/후" 계산 */
function replyDiff(before: Reply | null, after: Reply) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of REPLY_KEYS) {
    if (before?.[key] === after[key]) continue;
    if (before?.[key] !== undefined) b[key] = before[key];
    if (after[key] !== undefined) a[key] = after[key];
  }
  return { before: before ? b : null, after: a };
}

const sameContent = (a: Reply, b: Reply) => REPLY_KEYS.every((key) => a[key] === b[key]);

async function submitReplyUnlocked(
  store: Store,
  traineeId: string,
  input: ReplyInput,
  options: SubmitReplyOptions = {},
): Promise<SubmitReplyResult> {
  const now = options.now ?? new Date().toISOString();
  const byAdmin = options.byAdmin === true;
  const actor = byAdmin ? "담당자" : "본인";

  const checked = validateReplyInput(input);
  if (!checked.ok) return { ok: false, reason: "입력한 내용을 확인해 주세요.", errors: checked.errors };
  const content = checked.value;

  const data = await store.readAll();
  const trainee = data.trainees.find((t) => t.id === traineeId);
  if (!trainee) return { ok: false, reason: "교육생을 찾을 수 없습니다." };

  const previous = data.replies.find((r) => r.traineeId === traineeId) ?? null;
  const reply: Reply = { traineeId, ...content, submittedAt: now, byAdmin };

  // 같은 참석 취소가 두 번 들어온 경우(더블 클릭·재전송): 이미 반영되어 있으면 아무것도 저장하지 않고 성공으로 알린다 (이력이 두 번 남지 않는다)
  if (
    previous &&
    !content.attend &&
    trainee.status === "불참" &&
    trainee.absentOrigin === "참석후취소" &&
    sameContent(previous, reply)
  ) {
    return { ok: true, reply: previous, cancelled: true, unchanged: true };
  }

  const allowed = checkReplyAllowed(trainee, data.course, content.attend, now, byAdmin, previous);
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  // 참석 취소(참석 회신 → 불참)는 최종 확인을 거친 요청만 받는다
  const cancel = isAttendanceCancel(trainee.status, previous, content.attend);
  if (cancel && !options.confirmed) {
    return { ok: false, needsConfirm: true, reason: "참석을 불참으로 바꾸려면 최종 확인이 필요합니다." };
  }

  const diff = replyDiff(previous, reply);
  const extra: StoreChanges = { upsertReplies: [reply] };
  const historyEntries: History[] = [];
  // 참석 취소는 상태 변경 이력 한 건에 회신 내용을 합쳐 남기므로 회신 이력을 따로 만들지 않는다
  if (!cancel && (!previous || Object.keys(diff.after).length > 0 || Object.keys(diff.before ?? {}).length > 0)) {
    historyEntries.push({
      id: randomUUID(),
      at: now,
      kind: byAdmin ? "회신대리입력" : "회신",
      traineeId,
      before: diff.before,
      after: diff.after,
      actor,
    });
  }

  const action = replyStatusAction(trainee.status, content.attend);
  let changes: StoreChanges;
  if (action) {
    // 기한·취소 마감 판단은 위 checkReplyAllowed에서 끝냈으므로 전환표가 회신 기한을 다시 검사하지 않게 한다
    const change: StatusChangeInput = { action, traineeId, byAdmin, actor, windowChecked: true };
    if (action === "불참회신") {
      const origin = absentOriginFor(trainee.status, previous, data.course, now);
      change.patch = { absentOrigin: origin, ...(origin === "참석후취소" ? { cancelledAt: now } : {}) };
      if (cancel) {
        change.kind = "참석취소";
        change.reason = `${content.absentType}: ${content.absentDetail}`;
        change.historyExtra = { before: diff.before ?? {}, after: diff.after };
      }
    }
    // 상태가 바뀌는 회신: 상태 변경(전환표 검사 + 이력)과 회신 저장을 한 묶음으로
    const built = buildStatusChanges(data, [change], { ...extra, appendHistory: historyEntries }, { now });
    if (!built.ok || !built.changes) return { ok: false, reason: built.ok ? "저장하지 못했습니다." : built.reason };
    changes = built.changes;
  } else {
    changes = { ...extra, appendHistory: historyEntries };
  }

  try {
    await store.commit(changes);
  } catch (error) {
    if (error instanceof StoreError) return { ok: false, reason: error.message };
    throw error;
  }
  return cancel ? { ok: true, reply, cancelled: true } : { ok: true, reply };
}

/** 회신 제출: 읽기 → 기한·충원 확정 검사 → 저장을 한 덩어리(transaction)로 실행한다. 재회신과 충원 확정이 겹쳐도 서로를 덮어쓰지 않는다. */
export function submitReply(
  store: Store,
  traineeId: string,
  input: ReplyInput,
  options: SubmitReplyOptions = {},
): Promise<SubmitReplyResult> {
  return store.transaction(() => submitReplyUnlocked(store, traineeId, input, options));
}
