// 교육생 화면 공통 모양: 카드 스타일과 내 상태 표시(색만으로 구분하지 않고 항상 글자로도 보여 준다)
import type { StatusTone } from "@/domain/traineeView";

export const card = "rounded-card bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]";

export const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  good: { pill: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  wait: { pill: "bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  neutral: { pill: "bg-zinc-100 text-zinc-700", dot: "bg-zinc-400" },
  bad: { pill: "bg-red-50 text-red-800", dot: "bg-red-500" },
};
