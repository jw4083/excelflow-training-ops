"use server";
// 교육생 회신 제출 서버 처리 (PLAN 작업 18). 누구의 회신인지는 화면이 보낸 값이 아니라 **로그인 쿠키의 사번**으로만 정한다 (PRD M2-1).
import { revalidatePath } from "next/cache";
import type { ReplyField } from "@/domain/replyRules";
import { getTraineeEmpNo } from "@/lib/auth";
import { TRAINEE_PATH } from "@/lib/paths";
import { submitReply } from "@/lib/reply";
import { findMyEnrollment } from "@/lib/traineeCourse";
import { getCatalog } from "@/store";

export interface ReplyFormState {
  ok?: boolean;
  message?: string; // 성공 또는 실패 안내
  errors?: Partial<Record<ReplyField, string>>;
  needsConfirm?: boolean; // 참석 → 불참 변경에 최종 확인이 필요함 (화면이 확인 단계를 보여 준다)
}

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
};
const yesNo = (v: string | undefined) => (v === "yes" ? true : v === "no" ? false : undefined);

export async function submitReplyAction(_prev: ReplyFormState, formData: FormData): Promise<ReplyFormState> {
  const empNo = await getTraineeEmpNo();
  if (!empNo) return { message: "로그인이 풀렸습니다. 새로고침해서 다시 로그인해 주세요." };
  // 어느 과정의 회신인지는 화면이 보낸 번호로 정하되, 이 사번이 그 과정(보관되지 않은 과정)에 실제로 등록돼 있을 때만 받는다
  const courseId = text(formData, "courseId");
  const catalog = getCatalog();
  const mine = courseId ? await findMyEnrollment(catalog, empNo, courseId) : null;
  const store = mine ? await catalog.openCourse(mine.courseId) : null;
  if (!mine || !store) return { message: "이 과정을 찾을 수 없습니다. 내 과정 목록에서 다시 선택해 주세요." };

  const result = await submitReply(store, mine.trainee.id, {
    attend: yesNo(text(formData, "attend")),
    absentType: text(formData, "absentType"),
    absentDetail: text(formData, "absentDetail"),
    laptop: yesNo(text(formData, "laptop")),
    roommateName: text(formData, "roommateName"),
    roommateDept: text(formData, "roommateDept"),
  }, { confirmed: text(formData, "confirm") === "yes" });
  if (!result.ok) return { message: result.reason, errors: result.errors, needsConfirm: result.needsConfirm };

  revalidatePath(TRAINEE_PATH, "layout");
  if (result.cancelled) {
    return { ok: true, message: result.unchanged ? "이미 불참으로 변경되어 있습니다." : "불참으로 변경되었습니다. 담당자에게 바로 전달됩니다." };
  }
  return { ok: true, message: "회신이 저장되었습니다. 기한 전에는 언제든 다시 고칠 수 있습니다." };
}
