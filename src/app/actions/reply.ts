"use server";
// 교육생 회신 제출 서버 처리 (PLAN 작업 18). 누구의 회신인지는 화면이 보낸 값이 아니라 **로그인 쿠키의 사번**으로만 정한다 (PRD M2-1).
import { revalidatePath } from "next/cache";
import type { ReplyField } from "@/domain/replyRules";
import { getTraineeEmpNo } from "@/lib/auth";
import { TRAINEE_PATH } from "@/lib/paths";
import { submitReply } from "@/lib/reply";
import { getStore } from "@/store";

export interface ReplyFormState {
  ok?: boolean;
  message?: string; // 성공 또는 실패 안내
  errors?: Partial<Record<ReplyField, string>>;
}

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
};
const yesNo = (v: string | undefined) => (v === "yes" ? true : v === "no" ? false : undefined);

export async function submitReplyAction(_prev: ReplyFormState, formData: FormData): Promise<ReplyFormState> {
  const empNo = await getTraineeEmpNo();
  if (!empNo) return { message: "로그인이 풀렸습니다. 새로고침해서 다시 로그인해 주세요." };
  const me = await getStore().getTraineeByEmpNo(empNo);
  if (!me) return { message: "로그인이 풀렸습니다. 새로고침해서 다시 로그인해 주세요." };

  const result = await submitReply(getStore(), me.id, {
    attend: yesNo(text(formData, "attend")),
    absentType: text(formData, "absentType"),
    absentDetail: text(formData, "absentDetail"),
    laptop: yesNo(text(formData, "laptop")),
    roommateName: text(formData, "roommateName"),
    roommateDept: text(formData, "roommateDept"),
  });
  if (!result.ok) return { message: result.reason, errors: result.errors };

  revalidatePath(TRAINEE_PATH);
  return { ok: true, message: "회신이 저장되었습니다. 기한 전에는 언제든 다시 고칠 수 있습니다." };
}
