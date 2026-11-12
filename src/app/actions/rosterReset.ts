"use server";
// 교육생 명단 초기화 서버 처리 (담당자 전용, 한 과정만). 규칙은 lib/rosterReset.ts. 성공하면 비어 있는 명단 화면으로 돌아간다.
import { revalidatePath } from "next/cache";
import { COURSE_NOT_FOUND, openAdminCourseFromForm } from "@/lib/adminCourse";
import { resetRoster } from "@/lib/rosterReset";

export interface ResetFormState {
  status?: "done" | "error";
  message?: string;
}

export async function resetRosterAction(_prev: ResetFormState, formData: FormData): Promise<ResetFormState> {
  const store = await openAdminCourseFromForm(formData); // 로그인 확인 + 이 과정의 저장소만 연다
  if (!store) return { status: "error", message: COURSE_NOT_FOUND };
  const result = await resetRoster(store, {
    expectedCount: Number(formData.get("expectedCount")),
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout");
  return { status: "done", message: `명단을 초기화했습니다. 교육생 ${result.removed}명과 연결된 회신·추첨·이력을 지웠습니다.` };
}
