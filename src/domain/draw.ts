// 2차 랜덤 추첨 규칙 (PLAN 작업 13, PRD M1-3·M1-4·M1-10, DESIGN 4.2). 화면·저장소와 무관한 순수 코드.
//
//  추첨 대상: 첫 추첨은 "신청" 상태인 사람 전체. 재추첨은 직전 결과의 "대기·미선정"인 사람만 (선정자는 그대로 둔다. DESIGN Q6)
//  뽑는 인원 = 정원 − 현재 선정 수 (capacity.ts의 seatsToDraw). 0 이하면 추첨하지 않는다.
//  결과: 무작위로 섞어서 앞쪽 (뽑는 인원)명 선정, 다음 (대기 인원)명 대기(1번부터), 나머지 미선정.
import type { DrawRecord, Trainee } from "./types";

/** 정원·대기 인원으로 입력할 수 있는 최대값 (엑셀 한 번에 받는 최대 행 수와 같다) */
export const MAX_DRAW_SEATS = 1000;

/** 추첨 대상자: 첫 추첨이면 "신청", 이미 추첨한 적이 있으면(재추첨) "대기·미선정" */
export function drawPool<T extends Pick<Trainee, "status">>(trainees: T[], drawCount: number): T[] {
  return trainees.filter((t) => (drawCount === 0 ? t.status === "신청" : t.status === "대기" || t.status === "미선정"));
}

export interface LotResult {
  selected: string[]; // 선정된 사람 (뽑힌 순서)
  waitlist: string[]; // 대기 (대기 순번 순서: 첫 번째가 1번)
  rejected: string[]; // 미선정
}

/** 0 이상 max 미만의 정수를 무작위로 돌려주는 함수. 기본은 암호용 난수이고, 검사에서는 정해진 순서의 함수를 넣는다. */
export type RandomInt = (maxExclusive: number) => number;

/**
 * 후보 목록을 공정하게 섞어서 선정·대기·미선정으로 나눈다 (Fisher–Yates 섞기).
 * 후보가 뽑을 인원보다 적으면 모두 선정되고 대기·미선정은 비게 된다.
 */
export function drawLots(candidateIds: string[], seats: number, waitSeats: number, randomInt: RandomInt): LotResult {
  const shuffled = [...candidateIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return {
    selected: shuffled.slice(0, seats),
    waitlist: shuffled.slice(seats, seats + waitSeats),
    rejected: shuffled.slice(seats + waitSeats),
  };
}

/** 가장 최근 추첨 기록의 번호 (이 기록에만 "현재 반영" 표시를 한다). 기록이 없으면 null */
export function currentDrawId(draws: Pick<DrawRecord, "id">[]): string | null {
  return draws.length > 0 ? draws[draws.length - 1].id : null;
}

// ───────────────────────── 입력 양식 검사 ─────────────────────────

export interface DrawFormValues {
  capacity: string; // 선발 인원 = 정원 (1차 선별로 이미 선정된 사람 포함)
  waitSeats: string; // 대기 인원 (없으면 0)
  replyDeadline: string; // (선택) 새로 선정되는 사람의 회신 기한. 한국 시간의 "YYYY-MM-DDTHH:mm"
}
export type DrawFormField = keyof DrawFormValues;
export type DrawFormErrors = Partial<Record<DrawFormField, string>>;

export type DrawParseResult =
  | { ok: true; capacity: number; waitSeats: number }
  | { ok: false; errors: DrawFormErrors };

function parseCount(text: string, label: string, min: number, emptyHint = ""): { value: number } | { error: string } {
  const t = text.trim();
  if (!t) return { error: `${label} 칸을 입력해 주세요.${emptyHint}` };
  if (!/^\d+$/.test(t)) return { error: `${label} 칸에는 숫자만 입력해 주세요.` };
  const n = Number(t);
  if (n < min || n > MAX_DRAW_SEATS) return { error: `${label} 칸은 ${min}명에서 ${MAX_DRAW_SEATS.toLocaleString("ko-KR")}명 사이여야 합니다.` };
  return { value: n };
}

/** 선발 인원(정원)과 대기 인원을 검사한다. 회신 기한은 시각 비교가 필요해서 저장 처리(lib/draw.ts)에서 검사한다. */
export function parseDrawCounts(values: Pick<DrawFormValues, "capacity" | "waitSeats">): DrawParseResult {
  const capacity = parseCount(values.capacity, "선발 인원", 1);
  const wait = parseCount(values.waitSeats, "대기 인원", 0, " 대기자가 없으면 0을 입력합니다.");
  const errors: DrawFormErrors = {};
  if ("error" in capacity) errors.capacity = capacity.error;
  if ("error" in wait) errors.waitSeats = wait.error;
  if ("error" in capacity || "error" in wait) return { ok: false, errors };
  return { ok: true, capacity: capacity.value, waitSeats: wait.value };
}
