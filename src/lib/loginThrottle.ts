// 담당자 로그인 시도 제한 (CHECK.md 보안 High): 같은 접속지(IP)에서 비밀번호를 5번 연속 틀리면 15분 동안 로그인을 받지 않는다.
// 규칙 숫자(5회·15분)는 교육생 로그인과 같은 값을 쓴다 (domain/login.ts).
// 잠금 중에는 비밀번호가 맞아도 받지 않는다 → 맞는 값을 찾았는지 알 수 없다.
// ⚠ 실패 횟수는 서버 메모리에만 있다(담당자는 명단에 계정이 없어 저장할 곳이 없다). 서버가 다시 시작하면 초기화되고,
//   서버가 여러 대로 나뉘는 환경(Vercel 등)에서는 서버마다 따로 센다. 배포 때 DB 저장소로 옮길 때 함께 공용 저장소로 바꾼다.
import { LOCK_MINUTES, MAX_LOGIN_FAILS } from "@/domain/login";

export interface ThrottleEntry {
  fails: number;
  lockedUntil?: number; // 잠금이 풀리는 시각(밀리초)
}

/** 기억해 둘 접속지의 최대 개수 (공격으로 메모리가 무한히 커지지 않게 한다) */
export const MAX_TRACKED = 5000;

export class LoginThrottle {
  private readonly entries = new Map<string, ThrottleEntry>();

  /** 지금 이 접속지가 잠겨 있는가 (잠겨 있으면 풀리는 시각) */
  check(key: string, nowMs: number): { locked: false } | { locked: true; until: number } {
    const e = this.entries.get(key);
    if (e?.lockedUntil !== undefined) {
      if (nowMs < e.lockedUntil) return { locked: true, until: e.lockedUntil };
      this.entries.delete(key); // 잠금 시간이 지났으면 처음부터 다시 센다
    }
    return { locked: false };
  }

  /** 비밀번호가 틀렸을 때 부른다. 5번째 연속 실패면 잠그고 true를 돌려준다 */
  fail(key: string, nowMs: number): boolean {
    this.prune(nowMs);
    const e = this.entries.get(key) ?? { fails: 0 };
    e.fails += 1;
    const lockNow = e.fails >= MAX_LOGIN_FAILS;
    if (lockNow) e.lockedUntil = nowMs + LOCK_MINUTES * 60 * 1000;
    this.entries.set(key, e);
    return lockNow;
  }

  /** 로그인에 성공하면 실패 횟수를 지운다 */
  succeed(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** 잠금이 풀린 기록을 지우고, 너무 많으면 오래된 것부터 버린다 */
  private prune(nowMs: number): void {
    if (this.entries.size < MAX_TRACKED) return;
    for (const [k, e] of this.entries) if (e.lockedUntil !== undefined && nowMs >= e.lockedUntil) this.entries.delete(k);
    for (const k of this.entries.keys()) {
      if (this.entries.size < MAX_TRACKED) break;
      this.entries.delete(k); // Map은 넣은 순서대로 돌아서 가장 오래된 것부터 지워진다
    }
  }
}

// 개발 서버가 코드를 다시 불러와도 같은 기록을 쓰도록 globalThis에 보관한다
const globalForThrottle = globalThis as unknown as { __adminLoginThrottle?: LoginThrottle };
export function adminLoginThrottle(): LoginThrottle {
  globalForThrottle.__adminLoginThrottle ??= new LoginThrottle();
  return globalForThrottle.__adminLoginThrottle;
}

/** 요청 헤더에서 접속지를 정한다. 배포 환경(프록시)이 붙여 주는 x-forwarded-for의 첫 값을 쓰고, 없으면 한 묶음("unknown")으로 센다 */
export function clientKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

export const LOCKED_MESSAGE = `로그인 시도가 너무 많습니다. ${LOCK_MINUTES}분 뒤에 다시 시도해 주세요.`;
