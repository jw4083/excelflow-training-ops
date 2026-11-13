// 상태 탭 (전체 + 상태별)과 각 탭의 인원 수. 검색어가 있으면 탭을 바꿔도 검색은 유지되고, 숫자도 검색 결과 기준이다.
import Link from "next/link";
import { ROSTER_FILTERS, type RosterFilter } from "@/domain/roster";

/** 탭·쪽 이동 주소. "전체"와 1쪽, 빈 검색어는 주소를 짧게 둔다 */
export function rosterHref(courseId: string, filter: RosterFilter, page = 1, q = ""): string {
  const query = new URLSearchParams();
  if (filter !== "전체") query.set("status", filter);
  if (q) query.set("q", q);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/admin/courses/${courseId}/roster?${text}` : `/admin/courses/${courseId}/roster`;
}

export function RosterTabs({ active, counts, courseId, q = "" }: { active: RosterFilter; counts: Record<RosterFilter, number>; courseId: string; q?: string }) {
  return (
    <nav aria-label="상태별 보기" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {ROSTER_FILTERS.map((filter) => {
        const isActive = filter === active;
        return (
          <Link
            key={filter}
            href={rosterHref(courseId, filter, 1, q)}
            aria-current={isActive ? "page" : undefined}
            className={`ui-btn flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-base font-semibold whitespace-nowrap ${
              isActive ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {filter}
            <span className={`text-sm tabular-nums ${isActive ? "text-white/80" : "text-zinc-500"}`} aria-label={`${counts[filter]}명`}>
              {counts[filter]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
