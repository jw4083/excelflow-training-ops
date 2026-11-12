// 담당자 화면 보호 (PLAN 작업 7). Next.js 16에서는 예전의 middleware가 proxy라는 이름으로 바뀌었다.
// - /admin 아래 모든 주소: 로그인(서명된 쿠키)이 확인될 때만 열린다. 아니면 로그인 화면(/)으로 보낸다.
// - 로그인 화면(/): 이미 로그인한 상태면 명단 화면으로 보낸다 (DESIGN 2.3). 이렇게 하면 로그인 화면 자체는
//   쿠키를 읽지 않는 정적 화면이 되어 Cache Components 규칙에도 맞는다.
// ⚠ 이것은 "화면 이동"만 막는 1차 확인이다. 서버 액션 등은 각자 안에서 `requireAdmin()`으로 다시 확인한다.
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const loggedIn = isAdminToken(request.cookies.get(ADMIN_COOKIE)?.value);
  const isLoginPage = request.nextUrl.pathname === "/";

  if (isLoginPage) {
    return loggedIn ? NextResponse.redirect(new URL("/admin/roster", request.url)) : NextResponse.next();
  }
  return loggedIn ? NextResponse.next() : NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
