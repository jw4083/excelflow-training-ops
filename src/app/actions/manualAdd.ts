"use server";
// 수기 추가 서버 처리 (PLAN 작업 21). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import { kstLocalToIso } from "@/lib/datetime";
import { requireAdmin } from "@/lib/auth";
import { addManualTrainee } from "@/lib/manualAdd";
import { getStore } from "@/store";

export interface ManualAddState {
  status?: "success" | "error";
  message?: string;
  needsOver?: boolean; // 정원을 넘는다는 경고를 보여 주고 다시 확인받아야 함
}

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function addManualAction(_prev: ManualAddState | undefined, formData: FormData): Promise<ManualAddState> {
  await requireAdmin();

  // 회신 기한은 비워 둘 수 있다(과정 기한을 따름). 쓴 값이 날짜·시간 형식이 아니면 거부한다
  const rawDeadline = text(formData, "replyDeadline").trim();
  const replyDeadline = rawDeadline === "" ? undefined : (kstLocalToIso(rawDeadline) ?? null);
  if (replyDeadline === null) return { status: "error", message: "회신 기한은 날짜와 시간으로 입력해 주세요." };

  const result = await addManualTrainee(getStore(), {
    empNo: text(formData, "empNo").trim(),
    name: text(formData, "name"),
    dept: text(formData, "dept"),
    reason: text(formData, "reason"),
    replyDeadline,
    replaceTargetId: text(formData, "replaceTargetId") || undefined,
    confirmOver: text(formData, "confirmOver") === "yes",
  });
  if (!result.ok) return { status: "error", message: result.reason, needsOver: result.needsOverConfirm };

  revalidatePath("/admin", "layout"); // 명단·정원 요약·알림을 새 내용으로 다시 그린다
  return {
    status: "success",
    message: `${text(formData, "name").trim()}님을 "선정(수기)"로 추가했습니다. 같은 교육생 주소에서 이 사번으로 바로 로그인할 수 있습니다.`,
  };
}
