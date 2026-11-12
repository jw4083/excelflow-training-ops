"use server";
// 충원 확정·직접 제외 서버 처리 (PLAN 작업 20). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { kstLocalToIso } from "@/lib/datetime";
import { COURSE_NOT_FOUND, courseBase, openAdminCourseFromForm } from "@/lib/adminCourse";
import { confirmFill, excludeSelected } from "@/lib/fill";

export interface FillState {
  message?: string;
  needsOver?: boolean; // 정원을 넘는다는 경고를 보여 주고 다시 확인받아야 함
}

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

/** 충원 확정: 확정 버튼을 눌러야만 실행된다. 성공하면 결과 안내와 함께 회신 현황으로 돌아간다 */
export async function confirmFillAction(_prev: FillState | undefined, formData: FormData): Promise<FillState> {
  const store = await openAdminCourseFromForm(formData);
  if (!store) return { message: COURSE_NOT_FOUND };
  const candidateId = text(formData, "candidateId");
  const replyDeadline = kstLocalToIso(text(formData, "replyDeadline"));
  if (!candidateId) return { message: "충원할 사람을 골라 주세요." };
  if (!replyDeadline) return { message: "회신 기한을 날짜와 시간으로 입력해 주세요." };

  const result = await confirmFill(store, {
    targetId: text(formData, "targetId"),
    candidateId,
    replyDeadline,
    confirmOver: text(formData, "confirmOver") === "yes",
  });
  if (!result.ok) return { message: result.reason, needsOver: result.needsOverConfirm };

  revalidatePath("/admin", "layout"); // 알림 배너·메뉴 배지·명단을 새 내용으로 다시 그린다
  redirect(`${courseBase(text(formData, "courseId"))}/replies?filled=${encodeURIComponent(candidateId)}`);
}

/** 선정자 직접 제외. next=fill 이면 제외한 자리를 바로 충원하는 창으로 이어진다 */
export async function excludeAction(_prev: FillState | undefined, formData: FormData): Promise<FillState> {
  const store = await openAdminCourseFromForm(formData);
  if (!store) return { message: COURSE_NOT_FOUND };
  const traineeId = text(formData, "traineeId");
  const result = await excludeSelected(store, traineeId, text(formData, "reason"));
  if (!result.ok) return { message: result.reason };

  revalidatePath("/admin", "layout");
  if (text(formData, "next") === "fill") redirect(`${courseBase(text(formData, "courseId"))}/replies?open=${encodeURIComponent(traineeId)}`);
  return { message: "제외했습니다. 충원이 필요한 자리로 알림에 표시됩니다." };
}
