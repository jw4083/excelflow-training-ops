// 명단 맨 위 요약: 정원 / 현재 선정 / 빈자리 (DESIGN 2.3, PRD M1-10).
// 정원은 2차 추첨 때 정해지므로 추첨 전에는 "미정", 정원을 넘으면 빈자리 대신 "정원 초과 N명"을 보여 준다.
import type { CapacitySummary } from "@/domain/capacity";

function Stat({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl px-4 py-3 sm:px-5 sm:py-4 ${tone === "warn" ? "bg-red-50 text-red-900" : "bg-white"}`}
    >
      <span className="text-sm font-medium text-zinc-600">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

export function CapacitySummaryBar({ summary }: { summary: CapacitySummary }) {
  const { capacity, selected, vacancies, over } = summary;
  return (
    <section aria-label="정원 현황" className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="정원" value={capacity === null ? "미정" : `${capacity}명`} />
        <Stat label="현재 선정" value={`${selected}명`} />
        {over > 0 ? (
          <Stat label="정원 초과" value={`${over}명`} tone="warn" />
        ) : (
          <Stat label="빈자리" value={vacancies === null ? "-" : `${vacancies}명`} />
        )}
      </div>
      {capacity === null && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">정원은 2차 추첨 때 입력하는 선발 인원으로 정해집니다.</p>
      )}
    </section>
  );
}
