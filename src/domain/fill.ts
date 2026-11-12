// 충원 규칙 (PLAN 작업 20, PRD M1-5·M1-10·M1-11, DESIGN 4.4). 화면·저장소를 모르는 순수 코드.
// 충원이 필요한 자리 = 상태가 "불참" 또는 "제외"이고 아직 충원이 확정되지 않은(`replacedBy`가 없는) 교육생 (alerts.ts와 같은 기준).
import type { Trainee } from "./types";

/** 충원 후보를 정하는 방식 */
export type FillCandidates =
  | { mode: "waitlist"; candidate: Trainee } // 대기자가 있으면 가장 앞 순번 한 명만 제시한다 (자동 확정은 하지 않는다)
  | { mode: "pool"; pool: Trainee[] } // 대기자가 없으면 미선정자 중에서 담당자가 직접 고른다 (사번 순)
  | { mode: "none" }; // 대기자도 미선정자도 없다

/** 대기 순번이 빠른 순 (순번이 없으면 맨 뒤, 같으면 사번 순) */
const byWaitNo = (a: Trainee, b: Trainee) => (a.waitNo ?? Infinity) - (b.waitNo ?? Infinity) || a.empNo.localeCompare(b.empNo);

export function fillCandidates(trainees: Trainee[]): FillCandidates {
  const waiting = trainees.filter((t) => t.status === "대기").sort(byWaitNo);
  if (waiting.length > 0) return { mode: "waitlist", candidate: waiting[0] };
  const pool = trainees.filter((t) => t.status === "미선정").sort((a, b) => a.empNo.localeCompare(b.empNo));
  return pool.length > 0 ? { mode: "pool", pool } : { mode: "none" };
}

/** 충원이 필요한 자리 목록: 오래 기다린 순 */
export function openVacancies<T extends Pick<Trainee, "status" | "replacedBy" | "updatedAt">>(trainees: T[]): T[] {
  return trainees
    .filter((t) => (t.status === "불참" || t.status === "제외") && !t.replacedBy)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** 고른 사람이 지금 충원 후보로 허용되는가 (대기자가 있으면 맨 앞 순번만, 없으면 미선정자 누구든) */
export function isAllowedCandidate(trainees: Trainee[], candidateId: string): boolean {
  const c = fillCandidates(trainees);
  if (c.mode === "waitlist") return c.candidate.id === candidateId;
  if (c.mode === "pool") return c.pool.some((t) => t.id === candidateId);
  return false;
}

/** 이 충원을 확정하면 정원을 넘게 되는가 (정원이 정해지지 않았으면 넘지 않는 것으로 본다). 충원자는 "선정"이 되어 1명 늘어난다. */
export function fillExceedsCapacity(capacity: number | null | undefined, trainees: Pick<Trainee, "status">[]): boolean {
  if (capacity === null || capacity === undefined) return false;
  return trainees.filter((t) => t.status === "선정").length + 1 > capacity;
}

/** "지금부터 3일 후" 기본 회신 기한 (PRD M1-11) */
export const DEFAULT_FILL_DEADLINE_DAYS = 3;
export function defaultFillDeadline(now: string): string {
  return new Date(Date.parse(now) + DEFAULT_FILL_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
