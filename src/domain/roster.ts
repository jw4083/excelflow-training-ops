// 담당자 명단 화면의 "보기" 규칙 (PLAN 작업 11, DESIGN 2.3 "명단"): 상태별 걸러 보기, 정렬, 쪽 나누기, 회신 여부 표기.
// 화면과 저장소를 모르는 순수 코드다.
import type { AbsentOrigin, History, Reply, Status, Trainee } from "./types";

/** 저장된 상태 "제외"에 해당하는 탭 이름. 화면에서는 "제외"라는 말 대신 실제 경위(선정 취소 / 불참 후 충원 완료)를 쓴다 */
export const REMOVED_TAB = "선정 취소·충원 완료";

/**
 * 상태 탭: "전체" + 신청·선정·대기·미선정·불참 + "선정 취소·충원 완료".
 * 미선정 탭에는 상태가 "미선정"인 사람(사전 미선정 + 추첨 미선정)만 있고, 선정 취소·충원 완료(저장된 상태 "제외")는 따로 둔다.
 * 처리 사유는 명단의 사유 칸(statusView)으로 구분한다.
 */
export const ROSTER_FILTERS = ["전체", "신청", "선정", "대기", "미선정", "불참", REMOVED_TAB] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

/** 한 쪽에 보여줄 인원 */
export const PAGE_SIZE = 50;

/** 저장된 상태가 속한 탭 */
export const tabOf = (status: Status): Exclude<RosterFilter, "전체"> => (status === "제외" ? REMOVED_TAB : status);

// ───────────────────────── 제외·미선정의 "경위" ─────────────────────────

export type RemovalOrigin = "선정취소" | "불참";
export interface RemovalInfo {
  origin: RemovalOrigin | null; // 알 수 없으면 null ("경위 미기록")
  reason?: string; // 선정 취소 사유 (이력에 남은 값)
}

/**
 * 변경 이력에서 "제외"가 된 사람마다 경위를 계산한다. 이력은 고치지 않고 읽기만 한다.
 * 제외로 들어간 기록(변경 전 상태가 선정이면 선정 취소, 불참이면 불참 후 충원)을 첫 번째로 찾는다.
 * (`excludedFrom` 필드가 생기기 전에 만들어진 예전 데이터를 위한 계산이다. 새 데이터는 필드에 바로 저장되어 있다.)
 */
export function removalIndex(history: Pick<History, "traineeId" | "kind" | "before" | "reason">[]): Map<string, RemovalInfo> {
  const index = new Map<string, RemovalInfo>();
  for (const h of history) {
    if (h.kind !== "제외" || !h.traineeId || index.has(h.traineeId)) continue;
    const from = (h.before as { status?: unknown } | null)?.status;
    if (from === "선정") index.set(h.traineeId, { origin: "선정취소", reason: h.reason });
    else if (from === "불참") index.set(h.traineeId, { origin: "불참" });
  }
  return index;
}

/** 한 사람의 제외 경위: 저장된 값 → 이력 → (교육생 화면처럼 이력이 없을 때) 불참 경위·불참 회신 흔적 순서로 정한다 */
export function removalOf(
  t: Pick<Trainee, "id" | "status"> & Partial<Pick<Trainee, "excludedFrom" | "absentOrigin">>,
  index?: ReadonlyMap<string, RemovalInfo>,
  reply?: { attend: boolean } | null,
): RemovalInfo {
  if (t.status !== "제외") return { origin: null };
  const fromHistory = index?.get(t.id);
  if (t.excludedFrom) return { origin: t.excludedFrom, reason: fromHistory?.origin === "선정취소" ? fromHistory.reason : undefined };
  if (fromHistory) return fromHistory;
  if (t.absentOrigin || reply?.attend === false) return { origin: "불참" };
  return { origin: null };
}

export interface StatusView {
  label: string; // 상태 칸에 보일 이름
  note: string; // 처리 사유 (상태가 미선정·제외일 때만)
}

/**
 * 명단·엑셀에 보일 "상태 + 처리 사유". 네 경우를 서로 다른 말로 보여 준다:
 *  - 사전 미선정: 추첨 전에 담당자가 대상이 아니라고 처리 (추첨·충원 대상 아님, 빈자리 아님)
 *  - 추첨 미선정: 추첨에서 떨어짐 (재추첨·충원 후보)
 *  - 선정 취소: 선정됐다가 담당자가 취소 (충원 전이면 "충원 필요")
 *  - 불참 후 충원 완료: 불참자의 자리가 다른 사람으로 채워짐
 */
export function statusView(
  t: Pick<Trainee, "id" | "status"> &
    Partial<Pick<Trainee, "rejectedBy" | "rejectReason" | "excludedFrom" | "absentOrigin" | "replacedBy" | "selectedVia" | "selectReason">>,
  index?: ReadonlyMap<string, RemovalInfo>,
  reply?: { attend: boolean } | null,
): StatusView {
  if (t.status === "미선정") {
    return t.rejectedBy
      ? { label: "미선정", note: `사전 미선정${t.rejectReason ? ` · ${t.rejectReason}` : ""}` }
      : { label: "미선정", note: "추첨 미선정" };
  }
  if (t.status === "제외") {
    const { origin, reason } = removalOf(t, index, reply);
    if (origin === "선정취소") {
      return { label: "선정 취소", note: `선정 취소${reason ? ` · ${reason}` : ""} · ${t.replacedBy ? "충원 완료" : "충원 필요"}` };
    }
    if (origin === "불참") return { label: "불참 후 충원", note: "불참 후 충원 완료" };
    return { label: "처리 완료", note: "경위 미기록" };
  }
  // 우선 선정(1차 선별)된 사람: 사유를 보여 준다. 사유가 저장되기 전의 예전 데이터는 임의로 채우지 않고 "미기록"으로 둔다
  if ((t.status === "선정" || t.status === "불참") && t.selectedVia === "선별") {
    return { label: t.status, note: `우선 선정 · ${t.selectReason?.trim() ? t.selectReason : "미기록"}` };
  }
  return { label: t.status, note: "" };
}

/** 주소의 ?status= 값을 탭으로 바꾼다. 없거나 엉뚱한 값이면 "전체" */
export function parseFilter(value: string | string[] | undefined): RosterFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return (ROSTER_FILTERS as readonly string[]).includes(v ?? "") ? (v as RosterFilter) : "전체";
}

/** 주소의 ?q= 검색어 (앞뒤 공백 제거, 최대 50자). 없으면 빈 글자 */
export function parseQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").trim().slice(0, 50);
}

/**
 * 이름·사번·부서로 찾는다 (과정 전체 명단 대상, 대소문자·띄어쓰기 무시). 검색어가 없으면 그대로 돌려준다.
 * 상태 탭과 함께 쓴다: 먼저 검색으로 줄이고 그 안에서 탭으로 거른다.
 */
export function searchTrainees<T extends Pick<Trainee, "name" | "empNo" | "dept">>(trainees: T[], query: string): T[] {
  const q = query.replace(/\s+/g, "").toLowerCase();
  if (!q) return trainees;
  return trainees.filter((t) => [t.name, t.empNo, t.dept].some((v) => v.replace(/\s+/g, "").toLowerCase().includes(q)));
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
    counts[tabOf(t.status)]++;
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
  const list = filter === "전체" ? [...trainees] : trainees.filter((t) => tabOf(t.status) === filter);
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
export function replyLabel(
  status: Status,
  reply: Pick<Reply, "attend"> | null | undefined,
  origin?: AbsentOrigin,
): string {
  if (status !== "선정" && status !== "불참") return "-";
  if (!reply) return "미회신";
  if (reply.attend) return "참석";
  // 처음부터 불참과 참석 후 취소를 구분해 보여 준다 (경위가 없는 예전 데이터는 그냥 "불참")
  if (status === "불참" && origin === "참석후취소") return "불참(참석 후 취소)";
  if (status === "불참" && origin === "시작후불참") return "불참(시작 후)";
  return "불참";
}

/** 불참 경위를 사람이 읽는 말로. 불참·제외가 아니거나 경위가 없으면 빈 글자 (불참인데 경위가 없으면 "경위 미기록") */
export const ABSENT_ORIGIN_LABELS: Record<AbsentOrigin, string> = {
  회신불참: "처음부터 불참",
  참석후취소: "참석 후 취소",
  시작후불참: "교육 시작 후 불참",
};
export function absentOriginLabel(t: Pick<Trainee, "status"> & Partial<Pick<Trainee, "absentOrigin">>): string {
  if (t.absentOrigin && (t.status === "불참" || t.status === "제외")) return ABSENT_ORIGIN_LABELS[t.absentOrigin];
  return t.status === "불참" ? "경위 미기록" : "";
}
