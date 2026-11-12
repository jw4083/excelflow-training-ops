// 회신 규칙 (PLAN 작업 18, PRD M2-3·M2-4·M2-6·M2-7·M2-8). 화면·저장소를 모르는 순수 코드.
// ① 입력 검사(불참 사유 10~300자, 룸메이트 이름·부서) ② 지금 회신할 수 있는 상태·기한인지 ③ 회신이 상태를 어떻게 바꾸는지를 정한다.
import { replyDeadlineFor } from "./traineeView";
import { ABSENT_TYPES, type AbsentType, type Course, type Reply, type Status, type Trainee } from "./types";

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

/**
 * 지금 이 교육생이 이 회신을 낼 수 있는가.
 * - 선정·불참 상태만 회신한다.
 * - 충원이 확정된 불참자는 참석으로 바꿀 수 없다 (담당자 대리 입력도 마찬가지, PRD M2-7).
 * - 회신 기한이 지나면 교육생은 낼 수 없고, 담당자 대리 입력은 기한이 지나도 가능하다 (PRD M2-4, M2-8).
 */
export function checkReplyAllowed(
  trainee: Pick<Trainee, "status" | "replacedBy" | "replyDeadline">,
  course: Pick<Course, "replyDeadline"> | null,
  attend: boolean,
  now: string,
  byAdmin = false,
): ReplyAllowed {
  if (trainee.status !== "선정" && trainee.status !== "불참") {
    return { ok: false, reason: "지금은 회신할 수 없는 상태입니다. 담당자에게 문의하세요." };
  }
  if (attend && trainee.status === "불참" && trainee.replacedBy) {
    return { ok: false, reason: "충원이 확정되어 참석으로 바꿀 수 없습니다. 담당자에게 문의하세요." };
  }
  if (!byAdmin) {
    const deadline = replyDeadlineFor(trainee, course, now);
    if (!deadline) return { ok: false, reason: "회신 기한이 정해져 있지 않습니다. 담당자에게 문의하세요." };
    if (deadline.passed) return { ok: false, reason: "회신 기한이 지났습니다. 담당자에게 문의하세요." };
  }
  return { ok: true };
}

/** 화면에서 회신 양식을 열어 둘 수 있는가 (선정·불참, 기한 전, 충원 확정 전). 닫힌 이유는 `reason`으로 알려 준다 */
export function replyFormState(
  trainee: Pick<Trainee, "status" | "replacedBy" | "replyDeadline">,
  course: Pick<Course, "replyDeadline"> | null,
  now: string,
): { open: true } | { open: false; reason: string } {
  if (trainee.status === "불참" && trainee.replacedBy) {
    return { open: false, reason: "충원이 확정되어 참석으로 바꿀 수 없습니다. 담당자에게 문의하세요." };
  }
  const check = checkReplyAllowed(trainee, course, true, now);
  return check.ok ? { open: true } : { open: false, reason: check.reason };
}
