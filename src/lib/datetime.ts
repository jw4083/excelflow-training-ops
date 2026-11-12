// 한국 시간 변환 도구 (PLAN 위험 항목: 회신 기한이 시간대 때문에 어긋나는 일을 막는다).
// 화면에서는 모두 한국 시간으로 입력·표시하고, 저장은 "+09:00"이 붙은 ISO 문자열로 한다.
// 한국은 서머타임이 없어서 항상 UTC+9 고정으로 계산해도 정확하다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // 예: 2026-11-20T18:00 (datetime-local 입력칸의 값)
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/; // 예: 2026-12-01 (date 입력칸의 값)

/** 순간(ISO 문자열)을 한국 시간의 "YYYY-MM-DDTHH:mm"로. 다른 시간대(+00:00 등)로 저장된 값도 한국 시간으로 바꿔 준다. */
export function isoToKstLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}

/** 한국 시간 입력("YYYY-MM-DDTHH:mm")을 "+09:00"이 붙은 ISO로. 형식이 틀리거나 없는 날짜(2월 31일 등)면 null */
export function kstLocalToIso(local: string): string | null {
  if (!LOCAL_PATTERN.test(local)) return null;
  const iso = `${local}:00+09:00`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return isoToKstLocal(new Date(ms).toISOString()) === local ? iso : null; // 되돌려 봐서 같아야 실제 있는 날짜·시각
}

/** "YYYY-MM-DD"가 실제로 있는 날짜인가 (2026-02-31 같은 값은 false) */
export function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const ms = Date.parse(`${date}T00:00:00+09:00`);
  return !Number.isNaN(ms) && isoToKstLocal(new Date(ms).toISOString()).slice(0, 10) === date;
}

/** 화면에 보여줄 한국 시간 표기: "2026-11-12 09:00" */
export function formatKst(iso: string): string {
  return isoToKstLocal(iso).replace("T", " ");
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 날짜("YYYY-MM-DD")를 읽기 쉬운 한국어로: "2026년 12월 1일(화)". 잘못된 날짜면 받은 값을 그대로 돌려준다 */
export function formatDateKo(date: string): string {
  if (!isValidDate(date)) return date;
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; // 날짜만 쓰므로 시간대 영향이 없다
  return `${y}년 ${m}월 ${d}일(${weekday})`;
}

/** 교육 기간을 읽기 쉽게: 하루면 "2026년 12월 1일(화)", 여러 날이면 "2026년 12월 1일(화) ~ 2026년 12월 3일(목)" */
export function formatPeriodKo(start: string, end: string): string {
  return start === end ? formatDateKo(start) : `${formatDateKo(start)} ~ ${formatDateKo(end)}`;
}
