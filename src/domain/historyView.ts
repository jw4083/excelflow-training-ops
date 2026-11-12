// 변경 이력 화면의 "보기" 규칙 (PLAN 작업 14, DESIGN 2.3 "변경 이력"): 종류별 걸러 보기, 최신순 정렬, 변경 내용을 읽기 쉬운 문장으로 바꾸기.
// 이력은 추가만 되고 수정·삭제할 수 없으므로(PRD M1-7), 여기에는 "읽는" 규칙만 있다. 화면·저장소를 모르는 순수 코드다.
import { formatKst } from "@/lib/datetime";
import { HISTORY_KINDS, type History, type HistoryKind } from "./types";

/** 종류 탭: "전체" + 이력 종류 9종 */
export const HISTORY_FILTERS = ["전체", ...HISTORY_KINDS] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

/** 주소의 ?kind= 값을 탭으로 바꾼다. 없거나 엉뚱한 값이면 "전체" */
export function parseKindFilter(value: string | string[] | undefined): HistoryFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return (HISTORY_FILTERS as readonly string[]).includes(v ?? "") ? (v as HistoryFilter) : "전체";
}

/** 탭마다 건수 (전체 포함) */
export function countByKind(history: Pick<History, "kind">[]): Record<HistoryFilter, number> {
  const counts = Object.fromEntries(HISTORY_FILTERS.map((f) => [f, 0])) as Record<HistoryFilter, number>;
  for (const h of history) {
    counts["전체"]++;
    counts[h.kind]++;
  }
  return counts;
}

/**
 * 종류에 맞게 걸러 최신순(가장 나중에 일어난 일이 맨 위)으로 정렬한다.
 * 같은 시각에 여러 건이 남은 경우(한 번의 추첨 등)는 저장된 순서의 반대로, 나중에 저장된 것이 위에 온다.
 */
export function visibleHistory<T extends Pick<History, "at" | "kind">>(history: T[], filter: HistoryFilter): T[] {
  return history
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => filter === "전체" || item.kind === filter)
    .sort((a, b) => Date.parse(b.item.at) - Date.parse(a.item.at) || b.index - a.index)
    .map(({ item }) => item);
}

// ───────────────────────── 변경 내용을 읽기 쉽게 ─────────────────────────

/** 교육생 id를 "이름(사번)"으로 바꿔 주는 함수. 모르면 undefined */
export type NameOf = (traineeId: string) => string | undefined;

// 값을 사람이 읽는 말로 보여 줄 항목들 (키 → [화면에 보일 이름, 값 바꾸는 방법])
const FIELDS: Record<string, [label: string, show: (value: unknown, nameOf?: NameOf) => string] | "hide"> = {
  status: ["상태", (v) => String(v)],
  waitNo: ["대기 순번", (v) => `${v}번`],
  selectedVia: ["선정 경로", (v) => String(v)],
  replacedBy: ["충원 확정", (v, nameOf) => `${nameOf?.(String(v)) ?? "(알 수 없음)"}로 충원`],
  replacedFor: ["충원으로 들어간 자리", (v, nameOf) => nameOf?.(String(v)) ?? "(알 수 없음)"],
  replyDeadline: ["회신 기한", (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? formatKst(v) : String(v))],
  capacity: ["정원", (v) => (v === null || v === undefined ? "미정" : `${v}명`)],
  redraw: ["구분", (v) => (v ? "재추첨" : "첫 추첨")],
  선정: ["선정", (v) => `${v}명`],
  대기: ["대기", (v) => `${v}명`],
  미선정: ["미선정", (v) => `${v}명`],
  // 교육생 회신 (작업 18·19에서 회신이 이력에 남기 시작하면 바로 읽기 쉽게 보이도록 미리 이름을 붙여 둔다)
  attend: ["참석 여부", (v) => (v ? "참석" : "불참")],
  absentType: ["불참 구분", (v) => String(v)],
  absentDetail: ["불참 사유", (v) => String(v)],
  laptop: ["노트북 지참", (v) => (v ? "예" : "아니오")],
  roommateName: ["룸메이트 이름", (v) => String(v)],
  roommateDept: ["룸메이트 부서", (v) => String(v)],
  drawId: "hide", // 기계용 번호는 사람이 읽을 필요가 없다
};

/**
 * 이력의 "변경 전/후" 값을 줄 단위 문장으로 바꾼다. 예: {status:"선정", selectedVia:"추첨"} → ["상태: 선정", "선정 경로: 추첨"].
 * 비어 있으면(수기 추가의 변경 전 등) "(없음)", 값은 있는데 바뀐 항목이 없으면 "(바뀐 항목 없음)".
 * 모르는 항목은 가리지 않고 "이름: 값" 그대로 보여 준다(이후 작업에서 새 항목이 생겨도 이력이 가려지지 않게).
 */
export function describeChange(value: unknown, nameOf?: NameOf): string[] {
  if (value === null || value === undefined) return ["(없음)"];
  if (typeof value !== "object" || Array.isArray(value)) return [String(value)];

  const lines: string[] = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const rule = FIELDS[key];
    if (rule === "hide") continue;
    if (rule) lines.push(`${rule[0]}: ${rule[1](raw, nameOf)}`);
    else lines.push(`${key}: ${typeof raw === "string" ? raw : JSON.stringify(raw)}`);
  }
  return lines.length > 0 ? lines : ["(바뀐 항목 없음)"];
}

/** 이력의 "대상" 칸: 교육생이면 "이름(사번)", 추첨처럼 여러 명이 걸린 이력이면 "전체" */
export function historyTarget(
  entry: Pick<History, "traineeId" | "kind">,
  nameOf: NameOf,
): { label: string; whole: boolean } {
  if (!entry.traineeId) return { label: entry.kind === "추첨" ? "추첨 전체" : "전체", whole: true };
  return { label: nameOf(entry.traineeId) ?? "(알 수 없음)", whole: false };
}

export type { HistoryKind };
