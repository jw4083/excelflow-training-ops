// 명단 화면 (PLAN 작업 10·11, DESIGN 2.3): 맨 위에 정원 요약, 신청자 엑셀 업로드, 상태 탭 7개, 명단 표.
// "신청" 탭에서는 1차 선별(작업 12), 선정 행에서는 선별 취소를 할 수 있다. 제외·수기 추가(작업 20·21) 버튼은 이 표에 이어서 붙인다.
import { Suspense } from "react";
import { connection } from "next/server";
import { capacitySummary } from "@/domain/capacity";
import { countByStatus, paginate, parseFilter, parsePage, visibleTrainees } from "@/domain/roster";
import { defaultFillDeadline, fillExceedsCapacity, openVacancies } from "@/domain/fill";
import { requireAdmin } from "@/lib/auth";
import { isoToKstLocal } from "@/lib/datetime";
import { getStore } from "@/store";
import { CapacitySummaryBar } from "./capacity-summary";
import { ManualAdd } from "./manual-add";
import { RosterTable } from "./roster-table";
import { RosterTabs } from "./roster-tabs";
import { SelectionToolbar } from "./selection-controls";
import { UploadForm } from "./upload-form";

type SearchParams = Promise<{ status?: string | string[]; page?: string | string[] }>;

export default function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  // 로그인 확인·저장소 읽기·주소의 ?status= 값은 모두 요청이 들어온 뒤에 알 수 있는 값이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <RosterContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RosterContent({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  await connection();
  const params = await searchParams;
  const filter = parseFilter(params.status);

  const data = await getStore().readAll();
  const counts = countByStatus(data.trainees);
  const page = paginate(visibleTrainees(data.trainees, filter), parsePage(params.page));
  const replies = new Map(data.replies.map((r) => [r.traineeId, r]));

  return (
    <main className="flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">명단</h1>
        {/* 파일 내려받기는 화면 이동이 아니므로 Link 대신 일반 링크를 쓴다 */}
        <a
          href="/admin/export"
          download
          className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-5 text-base font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          최종 명단 내려받기
        </a>
      </div>

      <CapacitySummaryBar summary={capacitySummary(data.course?.capacity, data.trainees)} />

      <details open className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold">신청자 엑셀 올리기</summary>
        <div className="pt-4">
          <UploadForm />
        </div>
      </details>

      <ManualAdd
        vacancies={openVacancies(data.trainees).map((v) => ({ id: v.id, label: `${v.name} (${v.status === "불참" ? "불참" : "직접 제외"})` }))}
        defaultDeadline={isoToKstLocal(defaultFillDeadline(new Date().toISOString()))}
        exceeds={fillExceedsCapacity(data.course?.capacity, data.trainees)}
      />

      <RosterTabs active={filter} counts={counts} />
      {filter === "신청" && <SelectionToolbar empty={page.total === 0} />}
      <RosterTable page={page} filter={filter} replies={replies} canCancelSelection={data.draws.length === 0} />
    </main>
  );
}
