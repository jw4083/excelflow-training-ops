"use server";
// 교육생 로그인·로그아웃 서버 처리 (PLAN 작업 16, PRD M2-2). 쿠키는 서버 액션에서만 설정·삭제할 수 있다 (Next.js 문서).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  TRAINEE_COOKIE,
  TRAINEE_COOKIE_PATH,
  TRAINEE_SESSION_SECONDS,
  createTraineeToken,
  loginTrainee,
} from "@/lib/auth";
import { TRAINEE_PATH } from "@/lib/paths";
import { getCatalog } from "@/store";

export interface TraineeLoginState {
  empNo: string; // 틀려도 사번은 다시 채워 둔다 (비밀번호는 절대 되돌려 주지 않는다)
  error?: string;
}

/** 교육생 로그인: 사번과 비밀번호가 맞으면 본인 사번만 담은 서명된 쿠키를 주고 같은 주소(/trainee)로 돌려보낸다 */
export async function loginTraineeAction(_prev: TraineeLoginState, formData: FormData): Promise<TraineeLoginState> {
  const empNo = String(formData.get("empNo") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await loginTrainee(getCatalog(), { empNo, password });
  if (!result.ok) return { empNo, error: result.message };

  (await cookies()).set(TRAINEE_COOKIE, createTraineeToken(result.empNo), {
    httpOnly: true, // 화면의 스크립트가 쿠키를 읽지 못하게 함
    sameSite: "lax", // 다른 사이트에서 보낸 요청에는 쿠키를 붙이지 않음
    secure: process.env.NODE_ENV === "production", // 배포(https)에서는 https로만 전송
    path: TRAINEE_COOKIE_PATH, // 교육생 화면에서만 전송 (담당자 화면에는 붙지 않음)
    maxAge: TRAINEE_SESSION_SECONDS,
  });
  redirect(TRAINEE_PATH);
}

/** 교육생 로그아웃: 쿠키를 지우고 로그인 화면으로 돌아간다. 로그인 여부와 상관없이 안전하게 실행된다. */
export async function logoutTraineeAction(): Promise<void> {
  (await cookies()).delete({ name: TRAINEE_COOKIE, path: TRAINEE_COOKIE_PATH });
  redirect(TRAINEE_PATH);
}
