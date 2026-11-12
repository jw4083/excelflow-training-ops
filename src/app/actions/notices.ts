"use server";
// 회신 알림 읽음 처리 서버 처리 (담당자 전용). 과정 번호로 그 과정의 저장소만 열어 그 과정의 알림만 바꾼다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { courseBase, openAdminCourseById } from "@/lib/adminCourse";
import { markAllNoticesRead, markNoticesRead } from "@/lib/notices";

/** 알림을 눌렀을 때: 읽음 처리하고 그 과정의 회신 현황(해당 교육생 카드 위치)으로 이동 */
export async function openNoticeAction(courseId: string, noticeId: string, traineeId: string): Promise<void> {
  const store = await openAdminCourseById(courseId);
  if (!store) return;
  await markNoticesRead(store, [noticeId]);
  revalidatePath("/admin", "layout");
  redirect(`${courseBase(courseId)}/replies?trainee=${encodeURIComponent(traineeId)}#trainee-${traineeId}`);
}

/** 이 과정의 알림을 모두 읽음으로 */
export async function markAllReadAction(courseId: string): Promise<void> {
  const store = await openAdminCourseById(courseId);
  if (!store) return;
  await markAllNoticesRead(store);
  revalidatePath("/admin", "layout");
}
