// 변경 이력 표 (DESIGN 2.3): 일시, 종류, 대상(사번·이름), 변경 전, 변경 후, 사유. 읽기 전용이며 수정·삭제 버튼은 없다 (PRD M1-7).
import Link from "next/link";
import { describeChange, historyTarget, type HistoryFilter, type NameOf } from "@/domain/historyView";
import type { Page } from "@/domain/roster";
import type { History } from "@/domain/types";
import { formatKst } from "@/lib/datetime";
import { historyHref } from "./history-tabs";

// 색만으로 구분하지 않도록 종류는 항상 글자로도 보여 준다
const KIND_STYLE: Record<History["kind"], string> = {
  추첨: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  선정: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
  선별취소: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  불참: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
  제외: "bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100",
  충원: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  수기추가: "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100",
  회신: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  회신대리입력: "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
};

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-0.5">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

export function HistoryTable({ page, filter, nameOf }: { page: Page<History>; filter: HistoryFilter; nameOf: NameOf }) {
  if (page.total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-base text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        {filter === "전체" ? "아직 변경 이력이 없습니다." : `"${filter}" 이력이 없습니다.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800">
        <table className="w-full min-w-[56rem] text-left text-base">
          <caption className="sr-only">{filter} 변경 이력</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-600">
            <tr>
              {["일시", "종류", "대상", "변경 전", "변경 후", "사유"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 align-top dark:divide-zinc-800">
            {page.items.map((entry) => {
              const target = historyTarget(entry, nameOf);
              return (
                <tr key={entry.id} className="align-top hover:bg-zinc-50">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatKst(entry.at)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${KIND_STYLE[entry.kind]}`}>{entry.kind}</span>
                  </td>
                  <td className={`px-4 py-3 ${target.whole ? "text-zinc-600 dark:text-zinc-400" : ""}`}>{target.label}</td>
                  <td className="px-4 py-3 text-sm">
                    <Lines lines={describeChange(entry.before, nameOf)} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Lines lines={describeChange(entry.after, nameOf)} />
                  </td>
                  <td className="px-4 py-3 text-sm">{entry.reason ?? <span className="text-zinc-500">-</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-base">
        <p className="text-zinc-700 dark:text-zinc-300">
          {page.total}건 중 {page.from}–{page.to}번째
        </p>
        {page.pageCount > 1 && (
          <nav aria-label="쪽 이동" className="flex items-center gap-2">
            {page.page > 1 ? (
              <Link href={historyHref(filter, page.page - 1)} className="flex h-11 items-center rounded-lg border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                이전
              </Link>
            ) : (
              <span aria-disabled="true" className="flex h-11 items-center rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                이전
              </span>
            )}
            <span className="tabular-nums">
              {page.page} / {page.pageCount}
            </span>
            {page.page < page.pageCount ? (
              <Link href={historyHref(filter, page.page + 1)} className="flex h-11 items-center rounded-lg border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                다음
              </Link>
            ) : (
              <span aria-disabled="true" className="flex h-11 items-center rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                다음
              </span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
