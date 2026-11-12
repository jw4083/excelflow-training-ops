"use server";
// 2차 추첨 실행 서버 처리 (PLAN 작업 13). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import type { DrawFormErrors, DrawFormValues } from "@/domain/draw";
import { COURSE_NOT_FOUND, openAdminCourseFromForm } from "@/lib/adminCourse";
import { runDraw } from "@/lib/draw";

export interface DrawState {
  values: DrawFormValues; // 화면에 다시 채워 넣을 값 (오류가 나도 입력한 내용이 사라지지 않게)
  errors?: DrawFormErrors; // 칸별 오류
  status?: "success" | "error";
  message?: string;
  result?: { selected: number; waitlist: number; rejected: number; shortage: number; redraw: boolean };
}

const read = (formData: FormData, key: keyof DrawFormValues): string => String(formData.get(key) ?? "");

export async function runDrawAction(_prev: DrawState, formData: FormData): Promise<DrawState> {
  const store = await openAdminCourseFromForm(formData); // 로그인 확인 + 이 과정의 저장소만 연다

  const values: DrawFormValues = {
    capacity: read(formData, "capacity"),
    waitSeats: read(formData, "waitSeats"),
    replyDeadline: read(formData, "replyDeadline"),
  };

  if (!store) return { values, status: "error", message: COURSE_NOT_FOUND };
  const result = await runDraw(store, values);
  if (!result.ok) return { values, errors: result.errors, status: "error", message: result.reason };

  revalidatePath("/admin", "layout"); // 정원 요약·명단·알림을 새 결과로 다시 그린다
  const summary = `선정 ${result.selected}명, 대기 ${result.waitlist}명, 미선정 ${result.rejected}명`;
  return {
    // 성공하면 입력칸을 다음 재추첨에 쓰기 좋게 정원만 남긴다
    values: { capacity: values.capacity, waitSeats: values.waitSeats, replyDeadline: "" },
    status: "success",
    message: `${result.redraw ? "재추첨" : "추첨"}을 마쳤습니다. ${summary}.${
      result.shortage > 0 ? ` 대상자가 부족해 ${result.shortage}자리는 채우지 못했습니다.` : ""
    }`,
    result: {
      selected: result.selected,
      waitlist: result.waitlist,
      rejected: result.rejected,
      shortage: result.shortage,
      redraw: result.redraw,
    },
  };
}
