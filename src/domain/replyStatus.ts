// 담당자 "회신 현황" 화면의 보기 규칙 (PLAN 작업 19, DESIGN 2.3 "회신 현황"): 요약 숫자, 걸러 보기, 행 만들기.
// 화면과 저장소를 모르는 순수 코드다. 회신 대상은 "선정"·"불참" 상태의 교육생이다.
import { replyDeadlineFor, type DeadlineView } from "./traineeView";
import type { Course, Reply, Trainee } from "./types";

/** 걸러 보기: 전체 / 미회신 / 참석 / 불참 (배너를 누르면 "불참"으로 열린다) */
export const REPLY_FILTERS = ["all", "none", "attend", "absent"] as const;
export type ReplyFilter = (typeof REPLY_FILTERS)[number];
export const REPLY_FILTER_LABELS: Record<ReplyFilter, string> = {
  all: "전체",
  none: "미회신",
  attend: "참석",
  absent: "불참",
};

export function parseReplyFilter(value: string | string[] | undefined): ReplyFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return (REPLY_FILTERS as readonly string[]).includes(v ?? "") ? (v as ReplyFilter) : "all";
}

export type ReplyKind = "참석" | "불참" | "미회신";

export interface ReplyRow {
  trainee: Trainee;
  reply: Reply | null;
  kind: ReplyKind; // 회신 상태
  deadline: DeadlineView | null; // 본인에게 적용되는 회신 기한
  needsFill: boolean; // 불참이고 아직 충원이 확정되지 않음 (작업 20에서 "제외하고 충원" 버튼에 쓴다)
}

export interface ReplySummary {
  total: number; // 회신 대상(선정+불참) 인원
  replied: number;
  none: number;
  attend: number;
  absent: number;
  laptop: number; // 참석자 중 노트북 지참
}

/** 회신 대상 행 만들기: 선정·불참 상태만, 사번 순 */
export function buildReplyRows(
  trainees: Trainee[],
  replies: Reply[],
  course: Pick<Course, "replyDeadline"> | null,
  now: string,
): ReplyRow[] {
  const byId = new Map(replies.map((r) => [r.traineeId, r]));
  return trainees
    .filter((t) => t.status === "선정" || t.status === "불참")
    .sort((a, b) => a.empNo.localeCompare(b.empNo))
    .map((trainee) => {
      const reply = byId.get(trainee.id) ?? null;
      // 상태가 불참이면 회신이 없어도(옛 데이터) 불참으로 본다
      const kind: ReplyKind = reply ? (reply.attend ? "참석" : "불참") : trainee.status === "불참" ? "불참" : "미회신";
      return {
        trainee,
        reply,
        kind,
        deadline: replyDeadlineFor(trainee, course, now),
        needsFill: trainee.status === "불참" && !trainee.replacedBy,
      };
    });
}

export function summarizeReplies(rows: ReplyRow[]): ReplySummary {
  const s: ReplySummary = { total: rows.length, replied: 0, none: 0, attend: 0, absent: 0, laptop: 0 };
  for (const r of rows) {
    if (r.kind === "미회신") s.none++;
    else s.replied++;
    if (r.kind === "참석") {
      s.attend++;
      if (r.reply?.laptop) s.laptop++;
    } else if (r.kind === "불참") s.absent++;
  }
  return s;
}

export function filterReplyRows(rows: ReplyRow[], filter: ReplyFilter): ReplyRow[] {
  switch (filter) {
    case "none":
      return rows.filter((r) => r.kind === "미회신");
    case "attend":
      return rows.filter((r) => r.kind === "참석");
    case "absent":
      return rows.filter((r) => r.kind === "불참");
    default:
      return rows;
  }
}
