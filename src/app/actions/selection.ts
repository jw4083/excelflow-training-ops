"use server";
// 1차 선별·선별 취소 서버 처리 (PLAN 작업 12). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { cancelSelection, selectApplicants } from "@/lib/selection";
import { getStore } from "@/store";

export interface SelectionState {
  status?: "success" | "error";
  message?: string;
}

const idsOf = (formData: FormData): string[] => formData.getAll("traineeId").map(String);

/** 체크한 신청자를 "선정"으로 바꾼다 (1차 선별) */
export async function selectApplicantsAction(_prev: SelectionState | undefined, formData: FormData): Promise<SelectionState> {
  await requireAdmin(); // proxy와 별개로, 이 서버 처리 안에서도 로그인을 확인한다 (Next.js 문서 권장)
  const result = await selectApplicants(getStore(), idsOf(formData));
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout"); // 명단 표·정원 요약·메뉴를 새 내용으로 다시 그린다
  return { status: "success", message: `신청자 ${result.count}명을 선정했습니다.` };
}

/** 1차 선별로 선정된 사람을 "신청"으로 되돌린다 (2차 추첨 전까지) */
export async function cancelSelectionAction(_prev: SelectionState | undefined, formData: FormData): Promise<SelectionState> {
  await requireAdmin();
  const result = await cancelSelection(getStore(), idsOf(formData));
  if (!result.ok) return { status: "error", message: result.reason };
  revalidatePath("/admin", "layout");
  return { status: "success", message: `${result.count}명의 선별을 취소했습니다.` };
}
