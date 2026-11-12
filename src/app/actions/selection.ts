"use server";
// 1차 선별·선별 취소 서버 처리 (PLAN 작업 12). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import { COURSE_NOT_FOUND, openAdminCourseFromForm } from "@/lib/adminCourse";
import { rejectApplicants, restoreRejected } from "@/lib/rejection";
import { cancelSelection, selectApplicants } from "@/lib/selection";

export interface SelectionState {
  status?: "success" | "error";
  message?: string;
}

const idsOf = (formData: FormData): string[] => formData.getAll("traineeId").map(String);

/** 체크한 신청자를 "선정"으로 바꾼다 (1차 선별) */
export async function selectApplicantsAction(_prev: SelectionState | undefined, formData: FormData): Promise<SelectionState> {
  const store = await openAdminCourseFromForm(formData); // 로그인 확인 + 이 과정의 저장소만 연다
  if (!store) return { status: "error", message: COURSE_NOT_FOUND };
  const result = await selectApplicants(store, idsOf(formData), String(formData.get("selectReason") ?? ""));
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout"); // 명단 표·정원 요약·메뉴를 새 내용으로 다시 그린다
  return { status: "success", message: `신청자 ${result.count}명을 우선 선정했습니다.` };
}

/** 체크한 신청자를 사유와 함께 "미선정"으로 처리한다 (담당자 직접 처리 — 추첨·충원 대상에서 빠진다) */
export async function rejectApplicantsAction(_prev: SelectionState | undefined, formData: FormData): Promise<SelectionState> {
  const store = await openAdminCourseFromForm(formData);
  if (!store) return { status: "error", message: COURSE_NOT_FOUND };
  const result = await rejectApplicants(store, idsOf(formData), String(formData.get("rejectReason") ?? ""));
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout");
  return { status: "success", message: `${result.count}명을 미선정 처리했습니다. 이 사람들은 추첨·충원 대상에서 빠집니다.` };
}

/** 담당자가 직접 미선정 처리한 사람을 추첨 전에 "신청"으로 되돌린다 */
export async function restoreRejectedAction(_prev: SelectionState | undefined, formData: FormData): Promise<SelectionState> {
  const store = await openAdminCourseFromForm(formData);
  if (!store) return { status: "error", message: COURSE_NOT_FOUND };
  const result = await restoreRejected(store, idsOf(formData));
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout");
  return { status: "success", message: `${result.count}명을 "신청" 상태로 되돌렸습니다.` };
}

/** 1차 선별로 선정된 사람을 "신청"으로 되돌린다 (2차 추첨 전까지) */
export async function cancelSelectionAction(_prev: SelectionState | undefined, formData: FormData): Promise<SelectionState> {
  const store = await openAdminCourseFromForm(formData);
  if (!store) return { status: "error", message: COURSE_NOT_FOUND };
  const result = await cancelSelection(store, idsOf(formData));
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout");
  return { status: "success", message: `${result.count}명의 선별을 취소했습니다.` };
}
