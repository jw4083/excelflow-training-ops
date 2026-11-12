"use server";
// 담당자 로그인·로그아웃 서버 처리 (PLAN 작업 7, DESIGN 4.6).
// 쿠키는 서버 액션에서만 설정·삭제할 수 있다 (Next.js 문서).
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  checkAdminPassword,
  createAdminToken,
  isAdminConfigured,
} from "@/lib/auth";
import { adminLoginThrottle, clientKey, LOCKED_MESSAGE } from "@/lib/loginThrottle";

export type LoginState = { error?: string } | undefined;

/** 담당자 로그인: 비밀번호가 맞으면 서명된 쿠키를 주고 명단 화면으로 보낸다 */
export async function loginAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAdminConfigured()) {
    // 비밀 값 자체는 알려주지 않고, 설정이 필요하다는 사실만 알린다
    return { error: "서버 설정이 끝나지 않았습니다. .env의 담당자 비밀번호와 서명 키를 확인해 주세요." };
  }

  // 같은 접속지에서 5번 연속 틀리면 15분 동안 받지 않는다. 잠겨 있는 동안은 비밀번호가 맞아도 확인하지 않는다
  const throttle = adminLoginThrottle();
  const key = clientKey(await headers());
  if (throttle.check(key, Date.now()).locked) return { error: LOCKED_MESSAGE };

  const password = String(formData.get("password") ?? "");
  // 몇 번째 시도인지·힌트는 알려주지 않고 같은 문구만 보여준다 (DESIGN 2.3)
  if (!checkAdminPassword(password)) {
    return { error: throttle.fail(key, Date.now()) ? LOCKED_MESSAGE : "비밀번호가 맞지 않습니다" };
  }
  throttle.succeed(key);

  (await cookies()).set(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true, // 화면의 스크립트가 쿠키를 읽지 못하게 함
    sameSite: "lax", // 다른 사이트에서 보낸 요청에는 쿠키를 붙이지 않음
    secure: process.env.NODE_ENV === "production", // 배포(https)에서는 https로만 전송
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  redirect("/admin");
}

/** 로그아웃: 쿠키를 지우고 로그인 화면으로 보낸다. 로그인 여부와 상관없이 안전하게 실행된다. */
export async function logoutAdmin(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/");
}
