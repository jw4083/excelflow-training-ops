// 회신 제출 (PLAN 작업 18, PRD M2-3~M2-8). 교육생 본인 제출과 담당자 대리 입력(작업 19)이 같은 길을 쓴다.
// 순서: ① 입력 검사 ② 상태·기한 검사 ③ (필요하면) 상태 변경 + 이력 ④ 회신 저장 + 회신 이력을 한 묶음으로 저장.
import { randomUUID } from "node:crypto";
import { checkReplyAllowed, replyStatusAction, validateReplyInput, type ReplyField, type ReplyInput } from "@/domain/replyRules";
import type { History, Reply } from "@/domain/types";
import { buildStatusChanges } from "@/lib/history";
import { StoreError } from "@/store/applyChanges";
import type { Store, StoreChanges } from "@/store";

export interface SubmitReplyOptions {
  byAdmin?: boolean; // 담당자 대리 입력 (기한이 지나도 가능, 기록에 "담당자 입력" 표시)
  now?: string;
}

export type SubmitReplyResult =
  | { ok: true; reply: Reply }
  | { ok: false; reason: string; errors?: Partial<Record<ReplyField, string>> };

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

export async function submitReply(
  store: Store,
  traineeId: string,
  input: ReplyInput,
  options: SubmitReplyOptions = {},
): Promise<SubmitReplyResult> {
  const now = options.now ?? new Date().toISOString();
  const byAdmin = options.byAdmin === true;

  const checked = validateReplyInput(input);
  if (!checked.ok) return { ok: false, reason: "입력한 내용을 확인해 주세요.", errors: checked.errors };
  const content = checked.value;

  const data = await store.readAll();
  const trainee = data.trainees.find((t) => t.id === traineeId);
  if (!trainee) return { ok: false, reason: "교육생을 찾을 수 없습니다." };

  const allowed = checkReplyAllowed(trainee, data.course, content.attend, now, byAdmin);
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const previous = data.replies.find((r) => r.traineeId === traineeId) ?? null;
  const reply: Reply = { traineeId, ...content, submittedAt: now, byAdmin };
  const diff = replyDiff(previous, reply);

  const extra: StoreChanges = { upsertReplies: [reply] };
  const historyEntries: History[] = [];
  if (!previous || Object.keys(diff.after).length > 0 || Object.keys(diff.before ?? {}).length > 0) {
    historyEntries.push({
      id: randomUUID(),
      at: now,
      kind: byAdmin ? "회신대리입력" : "회신",
      traineeId,
      before: diff.before,
      after: diff.after,
    });
  }

  const action = replyStatusAction(trainee.status, content.attend);
  let changes: StoreChanges;
  if (action) {
    // 상태가 바뀌는 회신: 상태 변경(전환표 검사 + 이력)과 회신 저장을 한 묶음으로
    const built = buildStatusChanges(
      data,
      [{ action, traineeId, byAdmin }],
      { ...extra, appendHistory: historyEntries },
      { now },
    );
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
  return { ok: true, reply };
}
