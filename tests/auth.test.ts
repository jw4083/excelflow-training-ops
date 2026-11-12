// 작업 7 확인용 검사: 로그인 쿠키 서명·확인, 비밀번호 비교, 화면 보호(proxy)를 본다.
// 실제 .env 값은 쓰지 않고, 이 검사 안에서만 가짜 값을 환경에 넣는다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  checkAdminPassword,
  createAdminToken,
  isAdminConfigured,
  isAdminToken,
  signToken,
  verifyToken,
} from "@/lib/auth";
import { config, proxy } from "@/proxy";

const SECRET = "x".repeat(64); // 검사용 가짜 서명 키
const PASSWORD = "test-admin-pass"; // 검사용 가짜 비밀번호
const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("작업 7: 서명된 쿠키", () => {
  it("만든 값은 확인되고, 만료 시각 전까지만 유효하다", () => {
    const token = signToken("admin", NOW + 1000);
    expect(verifyToken(token, NOW)).toEqual({ payload: "admin", expiresAt: NOW + 1000 });
    expect(verifyToken(token, NOW + 999)).not.toBeNull();
    expect(verifyToken(token, NOW + 1000)).toBeNull(); // 만료
  });

  it("담당자 로그인은 8시간 동안 유효하다", () => {
    expect(ADMIN_SESSION_SECONDS).toBe(8 * 60 * 60);
    const token = createAdminToken(NOW);
    expect(isAdminToken(token, NOW + 8 * 3600 * 1000 - 1)).toBe(true);
    expect(isAdminToken(token, NOW + 8 * 3600 * 1000)).toBe(false);
  });

  it("내용을 바꾸거나 서명을 고치면 위조로 보고 거부한다", () => {
    const token = signToken("trainee:001234", NOW + 1000);
    const [body, sig] = token.split(".");
    // 내용을 담당자용("admin")으로 바꿔치기
    const forgedBody = Buffer.from(JSON.stringify({ p: "admin", e: NOW + 1000 })).toString("base64url");
    expect(verifyToken(`${forgedBody}.${sig}`, NOW)).toBeNull();
    // 서명을 한 글자 바꾸기
    expect(verifyToken(`${body}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, NOW)).toBeNull();
    // 서명 없는 값, 빈 값, 엉뚱한 값
    for (const bad of [body, "", "abc", "a.b.c", undefined, null]) expect(verifyToken(bad as string, NOW)).toBeNull();
  });

  it("다른 서명 키로 만든 값은 거부한다", () => {
    const other = signToken("admin", NOW + 1000, "y".repeat(64));
    expect(verifyToken(other, NOW)).toBeNull();
  });

  it("교육생용 값은 담당자 로그인으로 인정되지 않는다 (용도가 다름)", () => {
    expect(isAdminToken(signToken("trainee:001234", NOW + 1000), NOW)).toBe(false);
    expect(isAdminToken(signToken("admin", NOW + 1000), NOW)).toBe(true);
  });

  it("서명 키가 없거나 32자 미만이면 값을 만들 수 없고, 확인은 '로그인 안 됨'으로 처리한다", () => {
    vi.stubEnv("SESSION_SECRET", "짧은키");
    expect(() => signToken("admin", NOW + 1000)).toThrow(/SESSION_SECRET/);
    expect(isAdminToken("a.b", NOW)).toBe(false); // 오류가 나지 않고 false
    vi.stubEnv("SESSION_SECRET", "");
    expect(isAdminConfigured()).toBe(false);
  });
});

describe("작업 7: 담당자 비밀번호", () => {
  it(".env의 비밀번호와 같을 때만 통과한다", () => {
    expect(checkAdminPassword(PASSWORD)).toBe(true);
    expect(checkAdminPassword("틀린 비밀번호")).toBe(false);
    expect(checkAdminPassword(PASSWORD + " ")).toBe(false);
    expect(checkAdminPassword(PASSWORD.toUpperCase())).toBe(false);
    expect(checkAdminPassword("")).toBe(false);
  });

  it(".env에 비밀번호가 없으면(빈 값) 어떤 입력도 통과하지 못한다", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(checkAdminPassword("")).toBe(false);
    expect(checkAdminPassword("아무거나")).toBe(false);
    expect(isAdminConfigured()).toBe(false);
  });

  it("설정이 모두 있으면 준비된 것으로 본다", () => {
    expect(isAdminConfigured()).toBe(true);
  });
});

describe("작업 7: 화면 보호(proxy)", () => {
  const request = (cookie?: string, url = "http://localhost:3000/admin/roster") =>
    new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
  const LOGIN_URL = "http://localhost:3000/";

  it("로그인하지 않으면 로그인 화면(/)으로 보낸다", () => {
    const res = proxy(request());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
  });

  it("위조되거나 엉뚱한 쿠키로도 들어갈 수 없다", () => {
    for (const bad of ["abc", "a.b", signToken("trainee:001234", Date.now() + 100000)]) {
      const res = proxy(request(`${ADMIN_COOKIE}=${bad}`));
      expect(res.headers.get("location")).not.toBeNull();
    }
  });

  it("올바른 로그인 쿠키가 있으면 통과한다", () => {
    const res = proxy(request(`${ADMIN_COOKIE}=${createAdminToken()}`));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("로그인 화면(/): 로그인 전에는 그대로 보여주고, 이미 로그인했다면 명단 화면으로 보낸다", () => {
    const loggedOut = proxy(request(undefined, LOGIN_URL));
    expect(loggedOut.headers.get("location")).toBeNull();
    expect(loggedOut.headers.get("x-middleware-next")).toBe("1");

    const loggedIn = proxy(request(`${ADMIN_COOKIE}=${createAdminToken()}`, LOGIN_URL));
    expect(new URL(loggedIn.headers.get("location") ?? "").pathname).toBe("/admin");

    // 위조된 쿠키는 로그인으로 인정하지 않으므로 로그인 화면이 그대로 보인다
    const forged = proxy(request(`${ADMIN_COOKIE}=abc.def`, LOGIN_URL));
    expect(forged.headers.get("location")).toBeNull();
  });

  it("보호 범위는 로그인 화면(/)과 /admin 아래 전체다", () => {
    expect(config.matcher).toEqual(["/", "/admin/:path*"]);
  });
});
