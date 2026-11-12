// 종류 탭 10개 (전체 + 9종)와 각 탭의 건수. 탭을 누르면 주소의 ?kind= 값이 바뀌어 같은 화면이 다시 그려진다.
import Link from "next/link";
import { HISTORY_FILTERS, type HistoryFilter } from "@/domain/historyView";

/** 탭·쪽 이동 주소. "전체"와 1쪽은 주소를 짧게 둔다 */
export function historyHref(filter: HistoryFilter, page = 1): string {
  const query = new URLSearchParams();
  if (filter !== "전체") query.set("kind", filter);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/admin/history?${text}` : "/admin/history";
}

export function HistoryTabs({ active, counts }: { active: HistoryFilter; counts: Record<HistoryFilter, number> }) {
  return (
    <nav aria-label="종류별 보기" className="flex gap-1 overflow-x-auto border-b border-zinc-200 pb-2 dark:border-zinc-800">
      {HISTORY_FILTERS.map((filter) => {
        const isActive = filter === active;
        return (
          <Link
            key={filter}
            href={historyHref(filter)}
            aria-current={isActive ? "page" : undefined}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-base font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {filter}
            <span className={`text-sm tabular-nums ${isActive ? "opacity-90" : "text-zinc-500 dark:text-zinc-400"}`} aria-label={`${counts[filter]}건`}>
              {counts[filter]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
