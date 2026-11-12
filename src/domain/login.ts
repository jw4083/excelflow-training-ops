// 교육생 로그인 판단 규칙 (PLAN 작업 16, PRD M2-2·M1-9, DESIGN 4.3). 화면·저장소·비밀번호를 모르는 순수 코드.
//
//  - 사번이 숫자 6자리가 아니면 조회 없이 바로 안내하고, 로그인 실패 횟수에는 세지 않는다.
//  - 명단에 없는 사번과 비밀번호 틀림은 구분하지 않고 같은 "invalid"로 처리한다 (어느 쪽이 틀렸는지 알려주지 않는다).
//  - 실패 기록은 과정이 아니라 사번 하나에 하나다: 여러 과정에 등록돼 있어도 같은 사번으로 5회 연속 틀리면 15분 동안 로그인할 수 없다. 잠금 중에는 맞는 비밀번호도 받지 않는다.
//  - 잠금 시간이 지나면 실패 횟수는 처음(0)부터 다시 센다. 로그인에 성공하면 실패 횟수와 잠금이 지워진다.
import { EMP_NO_PATTERN } from "./types";

/** 이 횟수만큼 연속으로 틀리면 잠근다 */
export const MAX_LOGIN_FAILS = 5;
/** 잠금 시간(분) */
export const LOCK_MINUTES = 15;

/** 사번 입력을 검사한다. 앞뒤 공백은 제거하고, 숫자 6자리가 아니면 실패 */
export function parseLoginEmpNo(input: string): { ok: true; empNo: string } | { ok: false } {
  const empNo = input.trim();
  return EMP_NO_PATTERN.test(empNo) ? { ok: true, empNo } : { ok: false };
}

/** 사번별로 저장하는 로그인 실패 기록 (store의 LoginRecord와 같은 모양) */
export interface LoginUpdate {
  fails: number;
  lockedUntil?: string; // 잠겼을 때만 (이 시각까지 로그인 불가)
}

export type LoginDecision =
  | { kind: "success"; update: LoginUpdate } // 로그인 성공: 실패 기록 초기화
  | { kind: "locked"; lockedUntil: string } // 잠금 중: 비밀번호가 맞아도 거부, 기록은 바꾸지 않는다
  | { kind: "invalid"; update: LoginUpdate | null }; // 틀림(또는 없는 사번): 없는 사번이면 기록할 곳이 없어 null

/**
 * 로그인 시도 한 번을 판단한다.
 * @param record 이 사번의 저장된 실패 기록 (기록이 없으면 `{ fails: 0 }`). 어느 과정에도 등록되지 않은 사번이면 null
 * @param passwordOk 입력한 비밀번호가 맞는가 (없는 사번이어도 비교는 해서 걸리는 시간으로 힌트가 새지 않게 한다)
 * @param now 지금 일시(ISO)
 */
export function decideLogin(
  record: LoginUpdate | null,
  passwordOk: boolean,
  now: string,
): LoginDecision {
  if (!record) return { kind: "invalid", update: null };

  const nowMs = Date.parse(now);
  const lockMs = record.lockedUntil ? Date.parse(record.lockedUntil) : NaN;
  if (!Number.isNaN(lockMs) && lockMs > nowMs) return { kind: "locked", lockedUntil: record.lockedUntil as string };

  if (passwordOk) return { kind: "success", update: { fails: 0 } };

  // 잠금이 있었는데 이미 풀렸다면 처음부터 다시 센다
  const previousFails = record.lockedUntil ? 0 : record.fails;
  const fails = previousFails + 1;
  if (fails >= MAX_LOGIN_FAILS) {
    return {
      kind: "invalid",
      update: { fails, lockedUntil: new Date(nowMs + LOCK_MINUTES * 60 * 1000).toISOString() },
    };
  }
  return { kind: "invalid", update: { fails } };
}
