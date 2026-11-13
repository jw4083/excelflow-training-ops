// 화면 공통 모양 (버튼·입력칸·상태 배지·영역). 모든 화면이 이 파일의 글자만 가져다 써서 모양이 화면마다 달라지지 않게 한다.
//  - 주요 행동: 채운 파란 버튼(primary) — 한 영역에 하나만
//  - 일반 행동: 테두리 버튼(secondary)
//  - 보조 행동: 글자 버튼(text) 또는 더보기 메뉴
//  - 되돌릴 수 없는 행동: 빨간 버튼(danger)

export type ButtonVariant = "primary" | "secondary" | "text" | "danger" | "dangerOutline";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "ui-btn relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
  secondary: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100",
  text: "text-primary hover:bg-primary-soft active:bg-primary-soft/80",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  dangerOutline: "border border-red-300 bg-white text-red-700 hover:bg-red-50 active:bg-red-100",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-12 px-5 text-base",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = ""): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${extra}`.trim();
}

/** 글자 입력칸 (오류면 aria-invalid로 빨간 테두리) */
export const inputClass =
  "h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-primary focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-red-600/15";

export const textareaClass = `${inputClass} h-auto min-h-28 py-3`;

/** 입력칸 아래 오류 문구 */
export const fieldErrorClass = "text-sm font-medium text-red-700";

/** 흰 콘텐츠 영역: 테두리 없이 흰 바탕과 여백으로 구분한다 */
export const surfaceClass = "rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

/** 글자 단계: 페이지 제목 / 영역 제목 / 본문 / 보조 설명 */
export const text = {
  page: "text-2xl font-bold tracking-tight text-zinc-900",
  section: "text-lg font-bold text-zinc-900",
  body: "text-base text-zinc-900",
  help: "text-sm text-zinc-600",
};

export type BadgeTone = "neutral" | "blue" | "green" | "amber" | "red" | "dark";
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700",
  blue: "bg-primary-soft text-primary-active",
  green: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-900",
  red: "bg-red-50 text-red-800",
  dark: "bg-zinc-800 text-white",
};

/** 상태 배지 (색만으로 구분하지 않도록 항상 글자와 함께 쓴다) */
export function badgeClass(tone: BadgeTone = "neutral", extra = ""): string {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${BADGE_TONE[tone]} ${extra}`.trim();
}

/** 교육생 상태 → 배지 색 */
export const STATUS_TONE: Record<string, BadgeTone> = {
  신청: "neutral",
  선정: "green",
  대기: "amber",
  미선정: "neutral",
  불참: "red",
  "선정 취소": "dark",
  "불참 후 충원": "dark",
  "처리 완료": "dark",
};
