// 작업 16 확인용 검사: 교육생 로그인 판단 규칙(PRD M2-2, M1-9)을 본다.
import { describe, expect, it } from "vitest";
import { LOCK_MINUTES, MAX_LOGIN_FAILS, decideLogin, parseLoginEmpNo } from "@/domain/login";

const NOW = "2026-11-15T10:00:00.000Z";
const at = (minutesFromNow: number) => new Date(Date.parse(NOW) + minutesFromNow * 60 * 1000).toISOString();
const clean = { fails: 0 };

describe("작업 16: 사번 입력 검사", () => {
  it("숫자 6자리만 통과하고, 앞자리 0은 그대로 유지된다", () => {
    expect(parseLoginEmpNo("001234")).toEqual({ ok: true, empNo: "001234" });
    expect(parseLoginEmpNo("  100001  ")).toEqual({ ok: true, empNo: "100001" });
  });

  it("5자리·7자리·글자 섞임·빈 값은 거부한다", () => {
    for (const bad of ["12345", "1234567", "12A456", "", "   ", "12 345", "12-345", "１２３４５６"]) {
      expect(parseLoginEmpNo(bad)).toEqual({ ok: false });
    }
  });
});

describe("작업 16: 로그인 판단", () => {
  it("규칙은 5회 연속 실패 시 15분 잠금이다", () => {
    expect(MAX_LOGIN_FAILS).toBe(5);
    expect(LOCK_MINUTES).toBe(15);
  });

  it("비밀번호가 맞으면 성공이고 실패 기록이 지워진다", () => {
    expect(decideLogin(clean, true, NOW)).toEqual({ kind: "success", update: { fails: 0 } });
    expect(decideLogin({ fails: 3 }, true, NOW)).toEqual({ kind: "success", update: { fails: 0 } });
  });

  it("명단에 없는 사번은 비밀번호가 맞아 보여도 틀린 것으로 처리하고 기록할 곳이 없다", () => {
    expect(decideLogin(null, false, NOW)).toEqual({ kind: "invalid", update: null });
    expect(decideLogin(null, true, NOW)).toEqual({ kind: "invalid", update: null });
  });

  it("비밀번호가 틀리면 실패 횟수가 1씩 늘어난다", () => {
    expect(decideLogin(clean, false, NOW)).toEqual({ kind: "invalid", update: { fails: 1 } });
    expect(decideLogin({ fails: 3 }, false, NOW)).toEqual({ kind: "invalid", update: { fails: 4 } });
  });

  it("5번째 연속 실패에서 15분 잠금이 걸린다", () => {
    const r = decideLogin({ fails: 4 }, false, NOW);
    expect(r).toEqual({ kind: "invalid", update: { fails: 5, lockedUntil: at(15) } });
  });

  it("잠금 중에는 비밀번호가 맞아도 거부하고, 기록은 바꾸지 않는다", () => {
    const locked = { fails: 5, lockedUntil: at(10) };
    expect(decideLogin(locked, true, NOW)).toEqual({ kind: "locked", lockedUntil: at(10) });
    expect(decideLogin(locked, false, NOW)).toEqual({ kind: "locked", lockedUntil: at(10) });
  });

  it("잠금이 풀리는 순간부터 다시 로그인할 수 있다 (경계: 정확히 잠금 시각이면 풀림)", () => {
    const locked = { fails: 5, lockedUntil: NOW };
    expect(decideLogin(locked, true, NOW).kind).toBe("success");
    expect(decideLogin({ fails: 5, lockedUntil: at(1) }, true, NOW).kind).toBe("locked");
  });

  it("잠금이 풀린 뒤 또 틀리면 실패 횟수를 처음부터 다시 센다 (5회가 아니라 1회)", () => {
    const expired = { fails: 5, lockedUntil: at(-1) };
    expect(decideLogin(expired, false, NOW)).toEqual({ kind: "invalid", update: { fails: 1 } });
  });

  it("연속 4번 틀리고 한 번 맞으면 횟수가 지워져서, 이후 4번을 더 틀려도 잠기지 않는다", () => {
    let state: { fails: number; lockedUntil?: string } = clean;
    const apply = (ok: boolean) => {
      const d = decideLogin(state, ok, NOW);
      if (d.kind === "invalid" && d.update) state = d.update;
      if (d.kind === "success") state = d.update;
      return d.kind;
    };
    for (let i = 0; i < 4; i++) apply(false);
    expect(state.fails).toBe(4);
    expect(apply(true)).toBe("success");
    for (let i = 0; i < 4; i++) expect(apply(false)).toBe("invalid");
    expect(state.lockedUntil).toBeUndefined();
  });
});
