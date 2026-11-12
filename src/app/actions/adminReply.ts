"use server";
// 담당자 대리 입력 서버 처리 (PLAN 작업 19, PRD M2-8). 회신 기한이 지나도 가능하고, 기록에 "담당자 입력"으로 남는다.
import { revalidatePath } from "next/cache";
import type { ReplyFormState } from "@/app/actions/reply";
import { requireAdmin } from "@/lib/auth";
import { submitReply } from "@/lib/reply";
import { getStore } from "@/store";

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
};
const yesNo = (v: string | undefined) => (v === "yes" ? true : v === "no" ? false : undefined);

/** `traineeId`는 화면에서 `.bind`로 미리 채워 넘긴다 (담당자만 쓰는 화면이라 로그인을 다시 확인한다) */
export async function adminSubmitReplyAction(
  traineeId: string,
  _prev: ReplyFormState,
  formData: FormData,
): Promise<ReplyFormState> {
  await requireAdmin();
  const result = await submitReply(
    getStore(),
    traineeId,
    {
      attend: yesNo(text(formData, "attend")),
      absentType: text(formData, "absentType"),
      absentDetail: text(formData, "absentDetail"),
      laptop: yesNo(text(formData, "laptop")),
      roommateName: text(formData, "roommateName"),
      roommateDept: text(formData, "roommateDept"),
    },
    { byAdmin: true },
  );
  if (!result.ok) return { message: result.reason, errors: result.errors };
  revalidatePath("/admin", "layout"); // 회신 현황·배너·배지를 새 내용으로 다시 그린다
  return { ok: true, message: "담당자 입력으로 저장했습니다." };
}
