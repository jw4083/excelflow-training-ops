// 회신 규칙 (PLAN 작업 18, PRD M2-3·M2-4·M2-6·M2-7·M2-8, 참석 취소). 화면·저장소를 모르는 순수 코드.
// ① 입력 검사(불참 사유 10~300자, 룸메이트 이름·부서) ② 지금 회신·참석 취소를 할 수 있는 상태·기한인지 ③ 회신이 상태를 어떻게 바꾸는지를 정한다.
// 회신 기한(R)과 참석 취소 마감(C)·교육 시작(S)의 판단은 이 파일 한 곳에서만 한다 (화면과 서버가 같은 함수를 쓴다).
import { cancelDeadlineFor, courseStartIso, replyDeadlineFor } from "./traineeView";
import { ABSENT_TYPES, type AbsentOrigin, type AbsentType, type Course, type Reply, type Status, type Trainee } from "./types";

export const ABSENT_DETAIL_MIN = 10;
export const ABSENT_DETAIL_MAX = 300;
export const ROOMMATE_FIELD_MAX = 50;

/** 화면에서 받은 그대로의 입력 (아직 검사 전) */
export interface ReplyInput {
  attend?: boolean; // 고르지 않았으면 undefined
  absentType?: string;
  absentDetail?: string;
  laptop?: boolean;
  roommateName?: string;
  roommateDept?: string;
}

/** 검사를 통과해 저장 모양으로 다듬어진 회신 내용 */
export type ReplyContent = Pick<Reply, "attend" | "laptop"> &
  Partial<Pick<Reply, "absentType" | "absentDetail" | "roommateName" | "roommateDept">>;

export type ReplyField = "attend" | "absentType" | "absentDetail" | "laptop" | "roommate";
export type ReplyValidation =
  | { ok: true; value: ReplyContent }
  | { ok: false; errors: Partial<Record<ReplyField, string>> };

/** 글자 수 (한글·이모지도 한 글자로 센다) */
const length = (s: string) => [...s].length;

/**
 * 입력을 검사하고 저장 모양으로 다듬는다.
 * - 불참: 사유 구분(업무/기타)과 상세(10~300자)가 모두 있어야 한다. 노트북·룸메이트는 받지 않는다(저장하지 않음).
 * - 참석: 노트북 지참 여부가 필요하다. 룸메이트는 선택이지만, 쓰려면 이름과 부서를 둘 다 직접 입력해야 한다 (다른 교육생 선택 없음).
 */
export function validateReplyInput(input: ReplyInput): ReplyValidation {
  const errors: Partial<Record<ReplyField, string>> = {};

  if (input.attend === undefined) {
    return { ok: false, errors: { attend: "참석 여부를 선택해 주세요." } };
  }

  if (!input.attend) {
    const type = (input.absentType ?? "").trim();
    const detail = (input.absentDetail ?? "").replace(/\r\n/g, "\n").trim();
    if (!(ABSENT_TYPES as readonly string[]).includes(type)) errors.absentType = "불참 사유 구분을 선택해 주세요.";
    if (length(detail) < ABSENT_DETAIL_MIN || length(detail) > ABSENT_DETAIL_MAX) {
      errors.absentDetail = `상세 사유 칸을 ${ABSENT_DETAIL_MIN}자 이상 ${ABSENT_DETAIL_MAX}자 이하로 써 주세요. (지금 ${length(detail)}자)`;
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, value: { attend: false, absentType: type as AbsentType, absentDetail: detail, laptop: false } };
  }

  if (input.laptop === undefined) errors.laptop = "노트북 지참 여부를 선택해 주세요.";
  const name = (input.roommateName ?? "").trim();
  const dept = (input.roommateDept ?? "").trim();
  if ((name && !dept) || (!name && dept)) errors.roommate = "룸메이트는 이름과 부서를 모두 써 주세요. 없으면 두 칸을 비워 두세요.";
  else if (length(name) > ROOMMATE_FIELD_MAX || length(dept) > ROOMMATE_FIELD_MAX) {
    errors.roommate = `룸메이트 이름과 부서는 각각 ${ROOMMATE_FIELD_MAX}자 이하로 써 주세요.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const value: ReplyContent = { attend: true, laptop: input.laptop === true };
  if (name && dept) {
    value.roommateName = name;
    value.roommateDept = dept;
  }
  return { ok: true, value };
}

/** 회신이 상태를 바꾸는 방식: 선정에서 불참 → "불참회신", 불참에서 참석 → "참석재회신", 그 밖에는 상태 그대로 */
export function replyStatusAction(status: Status, attend: boolean): "불참회신" | "참석재회신" | null {
  if (status === "선정" && !attend) return "불참회신";
  if (status === "불참" && attend) return "참석재회신";
  return null;
}

export type ReplyAllowed = { ok: true } | { ok: false; reason: string };

/** 판단에 필요한 과정 정보 (회신 기한은 필수, 시작 시각·참석 취소 마감은 없을 수 있다) */
export type CourseTiming = Pick<Course, "replyDeadline"> & Partial<Pick<Course, "startDate" | "startTime" | "cancelDeadline">>;
/** 판단에 필요한 교육생 정보 */
export type TraineeTiming = Pick<Trainee, "status"> & Partial<Pick<Trainee, "replacedBy" | "replyDeadline" | "absentOrigin">>;

/**
 * 교육생 본인이 지금 할 수 있는 회신 (담당자 대리 입력은 이 판단을 쓰지 않는다).
 * 기한은 모두 "그 시각까지 포함"이다: 18:00 기한이면 18:00:00.000까지 되고 1ms만 지나도 막힌다. 교육 시작은 그 순간부터 막는다.
 * - full: 회신 기한(R) 전 → 참석·불참을 자유롭게 바꿀 수 있다 (예전과 같다)
 * - cancelOnly: R이 지났지만 참석 취소 마감(C) 전이고, 지금 "선정"이며 마지막 회신이 "참석" → 불참 변경만 할 수 있다 (사유 필수)
 * - closed: 그 밖 (이유를 함께 돌려준다)
 * 교육이 시작되면(개별 기한이 더 늦어도) 본인 변경은 모두 막는다.
 */
export type SelfReplyMode =
  | { mode: "full" }
  | { mode: "cancelOnly" }
  | { mode: "closed"; reason: string };

export const MSG_CONTACT = "담당자에게 문의하세요.";

export function selfReplyMode(
  trainee: TraineeTiming,
  course: CourseTiming | null,
  lastReply: Pick<Reply, "attend"> | null | undefined,
  now: string,
): SelfReplyMode {
  const closed = (reason: string): SelfReplyMode => ({ mode: "closed", reason });
  if (trainee.status !== "선정" && trainee.status !== "불참") return closed(`지금은 회신할 수 없는 상태입니다. ${MSG_CONTACT}`);
  if (trainee.status === "불참" && trainee.replacedBy) return closed(`충원이 확정되어 참석으로 바꿀 수 없습니다. ${MSG_CONTACT}`);

  const nowMs = Date.parse(now);
  const start = courseStartIso(course);
  if (start && nowMs >= Date.parse(start)) return closed(`교육이 시작되어 직접 바꿀 수 없습니다. ${MSG_CONTACT}`);

  const deadline = replyDeadlineFor(trainee, course, now);
  if (!deadline) return closed(`회신 기한이 정해져 있지 않습니다. ${MSG_CONTACT}`);
  if (!deadline.passed) return { mode: "full" };

  const cancel = cancelDeadlineFor(course, now);
  if (cancel && !cancel.passed) {
    if (trainee.status === "선정" && lastReply?.attend === true) return { mode: "cancelOnly" };
    if (trainee.status === "불참" && trainee.absentOrigin === "참석후취소") {
      return closed(`참석 취소가 접수되었습니다. 다시 참석하려면 ${MSG_CONTACT}`);
    }
  }
  if (cancel && cancel.passed && trainee.status === "선정" && lastReply?.attend === true) {
    return closed(`참석 취소 마감(${cancel.text})이 지났습니다. ${MSG_CONTACT}`);
  }
  return closed(`회신 기한이 지났습니다. ${MSG_CONTACT}`);
}

/**
 * 지금 이 교육생이 이 회신을 낼 수 있는가.
 * - 선정·불참 상태만 회신한다.
 * - 충원이 확정된 불참자는 참석으로 바꿀 수 없다 (담당자 대리 입력도 마찬가지, PRD M2-7).
 * - 교육생 본인: `selfReplyMode`를 따른다. 회신 기한 뒤 취소 마감 전에는 "참석 → 불참" 변경만 된다.
 * - 담당자 대리 입력은 기한·취소 마감과 상관없이 가능하다 (PRD M2-8).
 */
export function checkReplyAllowed(
  trainee: TraineeTiming,
  course: CourseTiming | null,
  attend: boolean,
  now: string,
  byAdmin = false,
  lastReply?: Pick<Reply, "attend"> | null,
): ReplyAllowed {
  if (trainee.status !== "선정" && trainee.status !== "불참") {
    return { ok: false, reason: `지금은 회신할 수 없는 상태입니다. ${MSG_CONTACT}` };
  }
  if (attend && trainee.status === "불참" && trainee.replacedBy) {
    return { ok: false, reason: `충원이 확정되어 참석으로 바꿀 수 없습니다. ${MSG_CONTACT}` };
  }
  if (byAdmin) return { ok: true };

  // 충원이 확정된 불참자가 "불참" 그대로 다시 내는 것(사유 고치기)은 예전처럼 기한만 본다
  const subject = !attend && trainee.status === "불참" ? { ...trainee, replacedBy: undefined } : trainee;
  const mode = selfReplyMode(subject, course, lastReply, now);
  if (mode.mode === "full") return { ok: true };
  if (mode.mode === "cancelOnly") {
    return attend
      ? { ok: false, reason: `회신 기한이 지나 지금은 불참으로 바꾸는 것만 할 수 있습니다. 다른 내용은 ${MSG_CONTACT}` }
      : { ok: true };
  }
  // 불참자가 불참 그대로 다시 내는 경우는 위에서 걸리지 않으므로 여기서 막힌다
  return { ok: false, reason: mode.reason };
}

/**
 * 이 회신이 "참석으로 회신한 뒤 불참으로 바꾸는" 참석 취소인가.
 * 회신 기한 전이든 후든, 직전 회신이 참석이고 지금 선정 상태에서 불참을 내면 참석 취소다 (처음부터 불참은 "회신불참").
 */
export function isAttendanceCancel(status: Status, lastReply: Pick<Reply, "attend"> | null | undefined, attend: boolean): boolean {
  return status === "선정" && lastReply?.attend === true && !attend;
}

/** 불참이 되는 회신의 경위: 교육 시작 이후(담당자만 가능) → 시작후불참, 참석 후 취소 → 참석후취소, 그 밖 → 회신불참 */
export function absentOriginFor(
  status: Status,
  lastReply: Pick<Reply, "attend"> | null | undefined,
  course: CourseTiming | null,
  now: string,
): AbsentOrigin {
  const start = courseStartIso(course);
  if (start && Date.parse(now) >= Date.parse(start)) return "시작후불참";
  return isAttendanceCancel(status, lastReply, false) ? "참석후취소" : "회신불참";
}

/** 화면에서 회신 양식을 열어 둘 수 있는가 (예전 호출 모양 유지용: 참석 회신이 가능한지로 판단). 새 화면은 `selfReplyMode`를 쓴다 */
export function replyFormState(
  trainee: TraineeTiming,
  course: CourseTiming | null,
  now: string,
  lastReply?: Pick<Reply, "attend"> | null,
): { open: true } | { open: false; reason: string } {
  const mode = selfReplyMode(trainee, course, lastReply, now);
  if (mode.mode === "full") return { open: true };
  if (mode.mode === "cancelOnly") return { open: false, reason: "회신 기한이 지나 지금은 불참으로 바꾸는 것만 할 수 있습니다." };
  return { open: false, reason: mode.reason };
}
