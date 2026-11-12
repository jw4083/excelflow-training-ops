// 명단 화면 (PLAN 작업 10·11, DESIGN 2.3): 맨 위에 정원 요약, 신청자 엑셀 업로드, 상태 탭 7개, 명단 표.
// "신청" 탭에서는 1차 선별(작업 12), 선정 행에서는 선별 취소를 할 수 있다. 제외·수기 추가(작업 20·21) 버튼은 이 표에 이어서 붙인다.
import { Suspense } from "react";
import { connection } from "next/server";
import { capacitySummary } from "@/domain/capacity";
import { countByStatus, paginate, parseFilter, parsePage, removalIndex, statusView, visibleTrainees } from "@/domain/roster";
import { defaultFillDeadline, fillExceedsCapacity, openVacancies } from "@/domain/fill";
import { courseBase, openAdminCourse } from "@/lib/adminCourse";
import { isoToKstLocal } from "@/lib/datetime";
import { resetScope } from "@/lib/rosterReset";
import { CapacitySummaryBar } from "./capacity-summary";
import { ResetPanel } from "./reset-panel";
import { ManualAdd } from "./manual-add";
import { RosterTable } from "./roster-table";
import { RosterTabs } from "./roster-tabs";
import { SelectionToolbar } from "./selection-controls";
import { UploadForm } from "./upload-form";

type Params = Promise<{ courseId: string }>;
type SearchParams = Promise<{ status?: string | string[]; page?: string | string[] }>;

export default function RosterPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  // 로그인 확인·저장소 읽기·주소의 ?status= 값은 모두 요청이 들어온 뒤에 알 수 있는 값이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <RosterContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RosterContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { courseId } = await params;
  const store = await openAdminCourse(courseId); // 로그인 확인 + 이 과정의 저장소만 연다 (없는 과정이면 찾을 수 없음 화면)
  await connection();
  const query = await searchParams;
  const filter = parseFilter(query.status);

  const data = await store.readAll();
  const counts = countByStatus(data.trainees);
  const page = paginate(visibleTrainees(data.trainees, filter), parsePage(query.page));
  const replies = new Map(data.replies.map((r) => [r.traineeId, r]));
  // 이 쪽에 보이는 사람마다 "상태 + 처리 사유" (제외 경위는 저장된 값이 없는 예전 데이터면 변경 이력으로 계산한다)
  const removals = removalIndex(data.history);
  const views = new Map(page.items.map((t) => [t.id, statusView(t, removals, replies.get(t.id))]));

  return (
    <main className="flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">명단</h1>
        {/* 파일 내려받기는 화면 이동이 아니므로 Link 대신 일반 링크를 쓴다 */}
        <a
          href={`${courseBase(courseId)}/export`}
          download
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          최종 명단 내려받기
        </a>
      </div>

      <CapacitySummaryBar summary={capacitySummary(data.course?.capacity, data.trainees)} />

      <details open className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold">신청자 엑셀 올리기</summary>
        <div className="pt-4">
          <UploadForm />
        </div>
      </details>

      <ManualAdd
        vacancies={openVacancies(data.trainees).map((v) => ({ id: v.id, label: `${v.name} (${v.status === "불참" ? "불참" : "선정 취소"})` }))}
        defaultDeadline={isoToKstLocal(defaultFillDeadline(new Date().toISOString()))}
        exceeds={fillExceedsCapacity(data.course?.capacity, data.trainees)}
      />

      <RosterTabs active={filter} counts={counts} courseId={courseId} />
      {filter === "신청" && <SelectionToolbar empty={page.total === 0} />}
      <RosterTable page={page} filter={filter} replies={replies} canCancelSelection={data.draws.length === 0} courseId={courseId} views={views} />

      <ResetPanel scope={resetScope(data)} exportHref={`${courseBase(courseId)}/export`} archived={Boolean(data.archivedAt)} />
    </main>
  );
}
