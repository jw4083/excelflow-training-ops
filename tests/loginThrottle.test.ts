// 담당자 로그인 시도 제한 검사 (CHECK.md 보안 High): 5번 연속 실패 → 15분 잠금, 잠금 중에는 맞는 비밀번호도 받지 않음.
import { describe, expect, it } from "vitest";
import { LOCK_MINUTES, MAX_LOGIN_FAILS } from "@/domain/login";
import { clientKey, LoginThrottle, MAX_TRACKED } from "@/lib/loginThrottle";

const T = Date.parse("2026-11-12T10:00:00+09:00");
const MIN = 60 * 1000;

describe("담당자 로그인 시도 제한", () => {
  it("4번까지는 잠기지 않고, 5번째 실패에서 잠긴다", () => {
    const t = new LoginThrottle();
    for (let i = 1; i < MAX_LOGIN_FAILS; i++) {
      expect(t.fail("a", T)).toBe(false);
      expect(t.check("a", T).locked).toBe(false);
    }
    expect(t.fail("a", T)).toBe(true);
    expect(t.check("a", T)).toEqual({ locked: true, until: T + LOCK_MINUTES * MIN });
  });

  it("잠금은 15분 동안 유지되고 그 뒤에는 처음부터 다시 센다", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < MAX_LOGIN_FAILS; i++) t.fail("a", T);
    expect(t.check("a", T + LOCK_MINUTES * MIN - 1).locked).toBe(true);
    expect(t.check("a", T + LOCK_MINUTES * MIN).locked).toBe(false);
    for (let i = 1; i < MAX_LOGIN_FAILS; i++) expect(t.fail("a", T + 20 * MIN)).toBe(false); // 다시 4번까지는 괜찮다
  });

  it("성공하면 실패 횟수가 0으로 돌아간다 (연속 실패만 센다)", () => {
    const t = new LoginThrottle();
    for (let i = 1; i < MAX_LOGIN_FAILS; i++) t.fail("a", T);
    t.succeed("a");
    for (let i = 1; i < MAX_LOGIN_FAILS; i++) expect(t.fail("a", T)).toBe(false);
  });

  it("접속지마다 따로 센다 (한 곳이 잠겨도 다른 곳은 영향 없음)", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < MAX_LOGIN_FAILS; i++) t.fail("a", T);
    expect(t.check("a", T).locked).toBe(true);
    expect(t.check("b", T).locked).toBe(false);
  });

  it("기록하는 접속지 수에 상한이 있어 메모리가 무한히 커지지 않는다", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < MAX_TRACKED + 500; i++) t.fail(`ip-${i}`, T);
    expect(t.size).toBeLessThanOrEqual(MAX_TRACKED);
  });

  it("접속지는 x-forwarded-for 첫 값, 없으면 x-real-ip, 그것도 없으면 'unknown'", () => {
    const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
    expect(clientKey(h({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientKey(h({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientKey(h({}))).toBe("unknown");
    expect(clientKey(h({ "x-forwarded-for": "x".repeat(200) })).length).toBe(64);
  });
});
