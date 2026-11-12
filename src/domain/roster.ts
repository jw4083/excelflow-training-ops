// 담당자 명단 화면의 "보기" 규칙 (PLAN 작업 11, DESIGN 2.3 "명단"): 상태별 걸러 보기, 정렬, 쪽 나누기, 회신 여부 표기.
// 화면과 저장소를 모르는 순수 코드다.
import { STATUSES, type Reply, type Status, type Trainee } from "./types";

/** 상태 탭: "전체" + 상태 6종 */
export const ROSTER_FILTERS = ["전체", ...STATUSES] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

/** 한 쪽에 보여줄 인원 */
export const PAGE_SIZE = 50;

/** 주소의 ?status= 값을 탭으로 바꾼다. 없거나 엉뚱한 값이면 "전체" */
export function parseFilter(value: string | string[] | undefined): RosterFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return (ROSTER_FILTERS as readonly string[]).includes(v ?? "") ? (v as RosterFilter) : "전체";
}

/** 주소의 ?page= 값을 쪽 번호로 바꾼다. 없거나 엉뚱한 값이면 1 */
export function parsePage(value: string | string[] | undefined): number {
  const v = Array.isArray(value) ? value[0] : value;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** 탭마다 인원 수 (전체 포함) */
export function countByStatus(trainees: Pick<Trainee, "status">[]): Record<RosterFilter, number> {
  const counts = Object.fromEntries(ROSTER_FILTERS.map((f) => [f, 0])) as Record<RosterFilter, number>;
  for (const t of trainees) {
    counts["전체"]++;
    counts[t.status]++;
  }
  return counts;
}

/**
 * 탭에 맞게 걸러 정렬한다. 사번 순이 기본이고, "대기" 탭은 대기 순번 순이다.
 * 사번은 모두 6자리 글자라서 글자 순서가 곧 숫자 순서다.
 */
export function visibleTrainees<T extends Pick<Trainee, "status" | "empNo" | "waitNo">>(
  trainees: T[],
  filter: RosterFilter,
): T[] {
  const list = filter === "전체" ? [...trainees] : trainees.filter((t) => t.status === filter);
  if (filter === "대기") {
    return list.sort((a, b) => (a.waitNo ?? Infinity) - (b.waitNo ?? Infinity) || a.empNo.localeCompare(b.empNo));
  }
  return list.sort((a, b) => a.empNo.localeCompare(b.empNo));
}

export interface Page<T> {
  items: T[];
  page: number; // 실제로 보여주는 쪽 (범위를 넘으면 마지막 쪽으로 맞춘다)
  pageCount: number;
  from: number; // 이 쪽의 첫 번호 (1부터, 비었으면 0)
  to: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number = PAGE_SIZE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { items: slice, page: current, pageCount, from: slice.length ? start + 1 : 0, to: start + slice.length, total };
}

/**
 * "회신 여부" 칸에 보일 말. 회신은 선정·불참 상태의 사람만 하므로 그 밖의 상태는 "-"다.
 * 선정·불참 상태인데 회신이 없으면 "미회신".
 */
export function replyLabel(status: Status, reply: Pick<Reply, "attend"> | null | undefined): string {
  if (status !== "선정" && status !== "불참") return "-";
  if (!reply) return "미회신";
  return reply.attend ? "참석" : "불참";
}
