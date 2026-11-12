// 과정 정보 입력 규칙 (PLAN 작업 9, DESIGN 2.3 "과정 정보"). 화면·저장과 무관한 순수 코드.
// 입력값 검사, 입력 양식 ↔ 저장 모양 변환, "내용이 바뀌었을 때만 최종 수정 일시 갱신"을 여기서 판단한다.
import { z } from "zod";
import { formatKst, isValidDate, isoToKstLocal, kstLocalToIso } from "@/lib/datetime";
import { courseStartIso } from "./traineeView";
import type { Course } from "./types";

/**
 * 입력 양식의 칸들 (모두 글자로 받는다). 회신 기한·참석 취소 마감은 한국 시간의 "YYYY-MM-DDTHH:mm", 시작 시각은 "HH:mm".
 * 시작 시각과 참석 취소 마감은 선택 칸이다 (비워 두면 예전과 똑같이 동작한다).
 */
export interface CourseFormValues {
  name: string;
  startDate: string;
  endDate: string;
  place: string;
  notice: string;
  replyDeadline: string;
  startTime?: string;
  cancelDeadline?: string;
}
export type CourseFormField = keyof CourseFormValues;
export type CourseFormErrors = Partial<Record<CourseFormField, string>>;

export const EMPTY_COURSE_FORM: CourseFormValues = {
  name: "",
  startDate: "",
  endDate: "",
  place: "",
  notice: "",
  replyDeadline: "",
  startTime: "09:00", // 새 과정은 오전 9시 시작을 기본값으로 채워 둔다
  cancelDeadline: "",
};

/** 시작 시각 "HH:mm" (00:00~23:59) */
export const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// 오류 문구는 "○○ 칸"을 주어로 써서 받침 유무와 상관없이 조사가 항상 맞게 한다 (예: "장소 칸을", "과정명 칸은")
const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} 칸을 입력해 주세요.`)
    .max(max, `${label} 칸은 ${max}자 이하로 입력해 주세요.`);

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} 칸을 입력해 주세요.`)
    .refine(isValidDate, `${label} 칸의 날짜가 올바르지 않습니다.`);

const schema = z
  .object({
    name: text("과정명", 100),
    startDate: dateField("시작일"),
    endDate: dateField("종료일"),
    place: text("장소", 100),
    // 안내문은 비워 둘 수 있다 (나중에 채워도 됨). 길이만 제한한다
    notice: z.string().trim().max(5000, "안내문 칸은 5,000자 이하로 입력해 주세요."),
    replyDeadline: z
      .string()
      .trim()
      .min(1, "회신 기한 칸을 입력해 주세요.")
      .refine((v) => kstLocalToIso(v) !== null, "회신 기한 칸의 날짜·시각이 올바르지 않습니다."),
    startTime: z
      .string()
      .trim()
      .refine((v) => v === "" || START_TIME_PATTERN.test(v), "시작 시각 칸의 시각이 올바르지 않습니다."),
    cancelDeadline: z
      .string()
      .trim()
      .refine((v) => v === "" || kstLocalToIso(v) !== null, "참석 취소 마감 칸의 날짜·시각이 올바르지 않습니다."),
  })
  .refine((v) => !isValidDate(v.startDate) || !isValidDate(v.endDate) || v.endDate >= v.startDate, {
    message: "종료일은 시작일과 같거나 그 이후여야 합니다.",
    path: ["endDate"],
  })
  // 참석 취소 마감: 회신 기한 ≤ 취소 마감 ≤ 교육 시작 (같은 시각은 허용, 한국 시간 기준으로 "같은 순간인가"를 비교)
  .superRefine((v, ctx) => {
    if (v.cancelDeadline === "") return;
    const cancel = kstLocalToIso(v.cancelDeadline);
    if (!cancel) return; // 형식 오류는 위에서 이미 알렸다
    if (v.startTime === "") {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "참석 취소 마감을 쓰려면 시작 시각 칸을 입력해 주세요." });
      return;
    }
    const reply = kstLocalToIso(v.replyDeadline);
    if (reply && Date.parse(cancel) < Date.parse(reply)) {
      ctx.addIssue({ code: "custom", path: ["cancelDeadline"], message: "참석 취소 마감은 회신 기한과 같거나 그 이후여야 합니다." });
    }
    const start = isValidDate(v.startDate) && START_TIME_PATTERN.test(v.startTime) ? courseStartIso(v) : null;
    if (start && Date.parse(cancel) > Date.parse(start)) {
      ctx.addIssue({
        code: "custom",
        path: ["cancelDeadline"],
        message: `참석 취소 마감은 교육 시작(${formatKst(start)})을 넘을 수 없습니다.`,
      });
    }
  });

export type ParseResult =
  | { ok: true; values: CourseFormValues }
  | { ok: false; errors: CourseFormErrors };

/**
 * 입력 양식의 값을 검사한다. 앞뒤 공백은 제거하고, 칸마다 첫 번째 오류만 돌려준다.
 * 안내문의 줄바꿈은 "\n"으로 통일한다: 브라우저는 줄바꿈을 "\r\n"으로 보내므로, 그대로 저장하면
 * 줄바꿈 표기 차이만으로 "내용이 바뀌었다"고 판단되거나 글자 수가 다르게 세어질 수 있다.
 */
export function parseCourseForm(raw: CourseFormValues): ParseResult {
  const result = schema.safeParse({
    ...raw,
    notice: raw.notice.replace(/\r\n?/g, "\n"),
    startTime: raw.startTime ?? "", // 선택 칸이 아예 없으면(예전 양식) 빈칸으로 본다
    cancelDeadline: raw.cancelDeadline ?? "",
  });
  if (result.success) return { ok: true, values: result.data };

  const errors: CourseFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as CourseFormField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/** 저장된 과정 → 입력 양식 값 (회신 기한은 한국 시간으로 바꿔 보여 준다) */
export function courseToFormValues(course: Course | null): CourseFormValues {
  if (!course) return { ...EMPTY_COURSE_FORM };
  return {
    name: course.name,
    startDate: course.startDate,
    endDate: course.endDate,
    place: course.place,
    notice: course.notice,
    replyDeadline: isoToKstLocal(course.replyDeadline),
    startTime: course.startTime ?? "", // 예전 과정은 비어 있다 (기본값을 채우면 저장만 눌러도 "바뀜"이 되므로 채우지 않는다)
    cancelDeadline: course.cancelDeadline ? isoToKstLocal(course.cancelDeadline) : "",
  };
}

/**
 * 검사를 통과한 입력으로 저장할 과정을 만든다.
 * - 내용이 하나라도 바뀌었을 때만 `updatedAt`(최종 수정 일시)을 now로 갱신한다.
 *   바뀐 게 없는데 갱신하면 교육생이 "새 안내가 올라왔다"고 오해하기 때문이다 (PRD M2-5).
 * - 정원(capacity)은 추첨 때 정해지는 값이라 과정 정보를 수정해도 그대로 둔다.
 */
export function buildCourse(
  values: CourseFormValues,
  existing: Course | null,
  now: string,
): { course: Course; changed: boolean } {
  const replyDeadline = kstLocalToIso(values.replyDeadline);
  if (!replyDeadline) throw new Error("검사를 통과하지 않은 회신 기한입니다."); // parseCourseForm을 먼저 거쳐야 한다
  const startTime = values.startTime?.trim() ?? "";
  const cancelText = values.cancelDeadline?.trim() ?? "";
  const cancelDeadline = cancelText ? kstLocalToIso(cancelText) : null;
  if (cancelText && !cancelDeadline) throw new Error("검사를 통과하지 않은 참석 취소 마감입니다.");

  const next: Course = {
    name: values.name,
    startDate: values.startDate,
    endDate: values.endDate,
    place: values.place,
    notice: values.notice,
    replyDeadline,
    updatedAt: now,
  };
  if (startTime) next.startTime = startTime;
  if (cancelDeadline) next.cancelDeadline = cancelDeadline;
  if (existing?.capacity !== undefined) next.capacity = existing.capacity;

  // 기한은 글자가 아니라 "같은 순간인가"로 비교한다 (+00:00과 +09:00 표기 차이는 변경이 아님). 둘 다 없으면 같다
  const sameInstant = (a?: string, b?: string) => (a === undefined || b === undefined ? a === b : Date.parse(a) === Date.parse(b));

  const changed =
    !existing ||
    existing.name !== next.name ||
    existing.startDate !== next.startDate ||
    existing.endDate !== next.endDate ||
    existing.place !== next.place ||
    existing.notice !== next.notice ||
    existing.startTime !== next.startTime ||
    !sameInstant(existing.replyDeadline, next.replyDeadline) ||
    !sameInstant(existing.cancelDeadline, next.cancelDeadline);

  if (existing && !changed) return { course: existing, changed: false };
  return { course: next, changed: true };
}
