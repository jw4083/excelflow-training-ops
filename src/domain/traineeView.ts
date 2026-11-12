// 교육생 화면에 보여줄 내용을 정하는 규칙 (PLAN 작업 17, PRD M2-1·M2-5·M2-7, DESIGN 2.3 "교육생 화면"). 화면·저장소를 모르는 순수 코드.
// 입력은 "로그인한 본인 1명"과 과정 정보뿐이다. 다른 교육생의 정보는 이 함수가 받지도 않으므로 결과에 섞일 수 없다.
import { formatKst } from "@/lib/datetime";
import type { Course, Status, Trainee } from "./types";

/** 상태 안내의 분위기 (화면의 색·아이콘을 고르는 데만 쓴다. 색만으로 구분하지 않고 항상 글로도 설명한다) */
export type StatusTone = "good" | "wait" | "neutral" | "bad";

export interface StatusMessage {
  tone: StatusTone;
  title: string; // 한 줄 결과 (예: "교육 대상자로 선정되었습니다")
  detail: string; // 쉬운 풀이와 앞으로 할 일
}

/**
 * 내 상태를 교육생이 이해하기 쉬운 말로 바꾼다 (DESIGN 2.3).
 * - 대기는 본인의 대기 순번만 알려 준다. 다른 사람의 순번·이름은 알 수 없다.
 * - 충원이 확정된 불참자(`replacedBy`가 있음)는 참석으로 바꿀 수 없다고 안내한다 (PRD M2-7). 누구로 충원됐는지는 보여주지 않는다.
 */
export function describeMyStatus(
  trainee: Pick<Trainee, "status" | "waitNo" | "replacedBy"> & Partial<Pick<Trainee, "absentOrigin" | "excludedFrom">>,
  /** 저장된 상태 "제외"의 경위를 화면이 따로 알고 있으면 넘긴다 (예전 데이터는 불참 회신 흔적으로 정한 값). 없으면 저장된 값으로 정한다 */
  removal?: "선정취소" | "불참" | null,
): StatusMessage {
  switch (trainee.status) {
    case "신청":
      return {
        tone: "neutral",
        title: "신청이 접수되었습니다",
        detail: "선정 결과를 기다려 주세요. 결과가 나오면 이 화면에서 확인할 수 있습니다.",
      };
    case "선정":
      return {
        tone: "good",
        title: "교육 대상자로 선정되었습니다",
        detail: "아래 「회신」에서 회신 기한 안에 참석 여부를 알려 주세요.",
      };
    case "대기":
      return {
        tone: "wait",
        title: trainee.waitNo ? `대기 ${trainee.waitNo}번입니다` : "대기자로 등록되었습니다",
        detail: "선정된 분 중에 참석하지 못하는 분이 생기면 대기 순번대로 안내드립니다. 이 화면에서 결과를 확인해 주세요.",
      };
    case "미선정":
      return {
        tone: "neutral",
        title: "이번 교육에는 선정되지 않았습니다",
        detail: "궁금한 점은 교육 담당자에게 문의해 주세요.",
      };
    case "불참":
      return trainee.replacedBy
        ? {
            tone: "bad",
            title: "불참으로 처리되었고 자리가 충원되었습니다",
            detail: "이미 충원되어 참석으로 바꿀 수 없습니다. 담당자에게 문의해 주세요.",
          }
        : trainee.absentOrigin === "참석후취소"
          ? {
              tone: "bad",
              title: "참석을 취소하여 불참으로 처리되었습니다",
              detail: "회신 기한 전이라면 아래 「회신」에서 다시 참석으로 바꿀 수 있습니다. 기한이 지났다면 담당자에게 문의해 주세요.",
            }
          : {
            tone: "bad",
            title: "불참으로 처리되어 있습니다",
            detail: "참석할 수 있게 되었다면 회신 기한 안에 다시 회신해 주세요.",
          };
    case "제외":
      // 화면에서 "제외"라는 말은 쓰지 않는다. 불참 후 충원된 자리는 불참 처리 안내, 선정됐다가 담당자가 취소한 사람은 "선정이 취소되었습니다"
      return (removal ?? trainee.excludedFrom ?? (trainee.absentOrigin ? "불참" : "선정취소")) === "불참"
        ? {
            tone: "bad",
            title: "불참으로 처리되었고 자리가 충원되었습니다",
            detail: "궁금한 점은 교육 담당자에게 문의해 주세요.",
          }
        : {
            tone: "bad",
            title: "선정이 취소되었습니다",
            detail: "궁금한 점은 교육 담당자에게 문의해 주세요.",
          };
  }
}

/** 회신을 할 수 있는(해야 하는) 상태: 선정, 그리고 불참으로 회신한 사람(기한 전이면 다시 참석으로 바꿀 수 있다) */
export function hasReplySection(status: Status): boolean {
  return status === "선정" || status === "불참";
}

export interface DeadlineView {
  iso: string;
  text: string; // "2026-11-20 18:00"
  passed: boolean; // 지금 기준으로 기한이 지났는가
  personal: boolean; // 개별 기한인가 (아니면 과정 전체 기한)
  remaining: string; // 남은 시간을 쉬운 말로: "5일 6시간 남음", "3시간 남음", "20분 남음", 지났으면 "기한이 지났습니다"
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 기한까지 남은 시간을 쉬운 말로 (큰 단위부터 두 단계까지만, 마지막 1분 미만은 1분으로 센다) */
export function remainingLabel(deadlineIso: string, nowIso: string): string {
  const ms = Date.parse(deadlineIso) - Date.parse(nowIso);
  if (ms < 0) return "기한이 지났습니다";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  if (days >= 1) return hours > 0 ? `${days}일 ${hours}시간 남음` : `${days}일 남음`;
  if (hours >= 1) return `${hours}시간 남음`;
  return `${Math.max(1, Math.ceil(ms / MINUTE_MS))}분 남음`;
}

/**
 * 이 교육생에게 적용되는 회신 기한: 개별 기한이 있으면 그것, 없으면 과정 기한 (PRD M1-11, M2-4).
 * 기한을 알 수 없으면(과정 정보 미입력) null.
 */
export function replyDeadlineFor(
  trainee: Pick<Trainee, "replyDeadline">,
  course: Pick<Course, "replyDeadline"> | null,
  now: string,
): DeadlineView | null {
  const iso = trainee.replyDeadline ?? course?.replyDeadline;
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return {
    iso,
    text: formatKst(iso),
    passed: Date.parse(now) > Date.parse(iso),
    personal: trainee.replyDeadline !== undefined,
    remaining: remainingLabel(iso, now),
  };
}

/**
 * 교육 시작 순간 (한국 시간 시작일 + 시작 시각, "+09:00" ISO). 시작 시각이 없는 예전 과정이거나 값이 잘못되었으면 null.
 * 교육생 본인 변경은 이 순간부터 막고, 참석 취소 마감은 이 순간을 넘을 수 없다.
 */
export function courseStartIso(course: Partial<Pick<Course, "startDate" | "startTime">> | null): string | null {
  if (!course?.startDate || !course.startTime) return null;
  const iso = `${course.startDate}T${course.startTime}:00+09:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** 참석 취소 마감의 화면 표시 (과정에 취소 마감이 없으면 null) */
export function cancelDeadlineFor(course: Partial<Pick<Course, "cancelDeadline">> | null, now: string): DeadlineView | null {
  const iso = course?.cancelDeadline;
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return { iso, text: formatKst(iso), passed: Date.parse(now) > Date.parse(iso), personal: false, remaining: remainingLabel(iso, now) };
}

/** 맨 위에 보여줄 "최종 수정 일시" (PRD M2-5): 교육 안내(과정 정보)를 마지막으로 고친 시각. 아직 없으면 null */
export function lastUpdatedText(course: Pick<Course, "updatedAt"> | null): string | null {
  return course ? formatKst(course.updatedAt) : null;
}
