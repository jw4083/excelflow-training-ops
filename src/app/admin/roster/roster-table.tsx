// 명단 표 (DESIGN 2.3): 사번, 이름, 부서, 상태, 수기 표시, 대기 순번, 회신 여부.
// 선별·제외·충원 같은 버튼은 해당 작업(12, 20 등)에서 이 표에 붙인다. 지금은 보기 전용이다.
import Link from "next/link";
import { replyLabel, type Page, type RosterFilter } from "@/domain/roster";
import type { Reply, Trainee } from "@/domain/types";
import { ExcludeButton } from "./exclude-button";
import { rosterHref } from "./roster-tabs";
import { CancelSelectionButton, SELECT_FORM_ID } from "./selection-controls";

// 색만으로 구분하지 않도록 상태는 항상 글자로도 보여 준다
const STATUS_STYLE: Record<Trainee["status"], string> = {
  신청: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  선정: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
  대기: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  미선정: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  불참: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
  제외: "bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100",
};

type Row = Pick<Trainee, "id" | "empNo" | "name" | "dept" | "status" | "isManual" | "waitNo" | "selectedVia">;

export function RosterTable({
  page,
  filter,
  replies,
  canCancelSelection,
}: {
  page: Page<Row>;
  filter: RosterFilter;
  replies: ReadonlyMap<string, Pick<Reply, "attend">>;
  /** 2차 추첨 전인가 (추첨 전에만 1차 선별을 취소할 수 있다) */
  canCancelSelection: boolean;
}) {
  // "신청" 탭에는 선별용 체크박스를, 1차 선별로 선정된 사람에게는(추첨 전이면) "선별 취소" 버튼을 붙인다
  const selectable = filter === "신청";
  const canCancel = (t: Row) => canCancelSelection && t.status === "선정" && t.selectedVia === "선별";
  const canExclude = (t: Row) => t.status === "선정"; // 선정자는 사유를 적고 직접 제외할 수 있다
  const showActions = page.items.some((t) => canCancel(t) || canExclude(t));
  if (page.total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-base text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        {filter === "전체" ? "아직 등록된 신청자가 없습니다. 위에서 신청자 엑셀을 올려 주세요." : `"${filter}" 상태의 교육생이 없습니다.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[40rem] text-left text-base">
          <caption className="sr-only">{filter} 명단</caption>
          <thead className="bg-zinc-50 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              {selectable && (
                <th scope="col" className="w-14 px-4 py-3 font-medium whitespace-nowrap">
                  선택
                </th>
              )}
              {["사번", "이름", "부서", "상태", "수기", "대기 순번", "회신 여부"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
              {showActions && (
                <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                  작업
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {page.items.map((t) => (
              <tr key={t.id}>
                {selectable && (
                  <td className="px-4 py-1">
                    <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        name="traineeId"
                        value={t.id}
                        form={SELECT_FORM_ID}
                        aria-label={`${t.name}(${t.empNo}) 선택`}
                        className="h-5 w-5"
                      />
                    </label>
                  </td>
                )}
                <td className="px-4 py-3 font-mono tabular-nums">{t.empNo}</td>
                <td className="px-4 py-3">{t.name}</td>
                <td className="px-4 py-3">{t.dept}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3">
                  {t.isManual && (
                    <span className="inline-block rounded-full border border-zinc-400 px-2 py-0.5 text-sm font-medium dark:border-zinc-500">수기</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{t.status === "대기" && t.waitNo ? `${t.waitNo}번` : ""}</td>
                <td className="px-4 py-3">{replyLabel(t.status, replies.get(t.id))}</td>
                {showActions && (
                  <td className="px-4 py-1">
                    <div className="flex flex-wrap items-start gap-2">
                      {canCancel(t) && <CancelSelectionButton traineeId={t.id} name={t.name} />}
                      {canExclude(t) && <ExcludeButton traineeId={t.id} name={t.name} />}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-base">
        <p className="text-zinc-700 dark:text-zinc-300">
          {page.total}명 중 {page.from}–{page.to}번
        </p>
        {page.pageCount > 1 && (
          <nav aria-label="쪽 이동" className="flex items-center gap-2">
            {page.page > 1 ? (
              <Link href={rosterHref(filter, page.page - 1)} className="flex h-11 items-center rounded-lg border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                이전
              </Link>
            ) : (
              <span aria-disabled="true" className="flex h-11 items-center rounded-lg border border-zinc-200 px-4 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                이전
              </span>
            )}
            <span className="tabular-nums">
              {page.page} / {page.pageCount}
            </span>
            {page.page < page.pageCount ? (
              <Link href={rosterHref(filter, page.page + 1)} className="flex h-11 items-center rounded-lg border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                다음
              </Link>
            ) : (
              <span aria-disabled="true" className="flex h-11 items-center rounded-lg border border-zinc-200 px-4 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                다음
              </span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
