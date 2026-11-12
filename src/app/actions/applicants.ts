"use server";
// 신청자 엑셀 업로드 서버 처리 (PLAN 작업 10). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import type { UploadSummary } from "@/domain/applicants";
import { COURSE_NOT_FOUND, openAdminCourseFromForm } from "@/lib/adminCourse";
import { importApplicants } from "@/lib/importApplicants";

export interface UploadState {
  status?: "success" | "none" | "error"; // 등록됨 / 올렸지만 새로 등록된 사람 없음 / 거부됨
  message?: string;
  summary?: UploadSummary; // 파일을 읽은 경우의 결과 (등록·중복·오류·복원·건너뜀 목록)
}

export async function uploadApplicants(_prev: UploadState | undefined, formData: FormData): Promise<UploadState> {
  const store = await openAdminCourseFromForm(formData); // 로그인 확인 + 이 과정의 저장소만 연다
  if (!store) return { status: "error", message: COURSE_NOT_FOUND };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "올릴 엑셀 파일을 선택해 주세요." };
  }

  const result = await importApplicants(store, {
    name: file.name,
    size: file.size,
    buffer: Buffer.from(await file.arrayBuffer()),
  });
  if (!result.ok) return { status: "error", message: result.error };

  const { summary } = result;
  if (summary.registered === 0) {
    return { status: "none", message: "새로 등록된 신청자가 없습니다. 아래 내용을 확인해 주세요.", summary };
  }
  revalidatePath("/admin", "layout"); // 등록 인원 수 등을 새 내용으로 다시 그린다
  return { status: "success", message: `신청자 ${summary.registered}명을 등록했습니다.`, summary };
}
