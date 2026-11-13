// 명단 화면 (PLAN 작업 10·11, DESIGN 2.3): 정원 요약 → (접힌) 신청자 엑셀 올리기·수기 추가 → 상태 탭 + 검색 → 명단 → 명단 초기화.
// 검색(?q=)은 이 과정의 전체 명단에서 이름·사번·부서로 찾고, 상태 탭과 함께 작동한다. 탭 숫자도 검색 결과 기준이다.
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { capacitySummary } from "@/domain/capacity";
import {
  countByStatus,
  paginate,
  parseFilter,
  parsePage,
  parseQuery,
  removalIndex,
  replyLabel,
  searchTrainees,
  statusView,
  visibleTrainees,
} from "@/domain/roster";
import { defaultFillDeadline, fillExceedsCapacity, openVacancies } from "@/domain/fill";
import { buttonClass, inputClass, text } from "@/components/ui/styles";
import { courseBase, openAdminCourse } from "@/lib/adminCourse";
import { isoToKstLocal } from "@/lib/datetime";
import { resetScope } from "@/lib/rosterReset";
import { CapacitySummaryBar } from "./capacity-summary";
import { ResetPanel } from "./reset-panel";
import { ManualAdd } from "./manual-add";
import { RosterTable, type RosterRow } from "./roster-table";
import { rosterHref, RosterTabs } from "./roster-tabs";
import { UploadForm } from "./upload-form";

type Params = Promise<{ courseId: string }>;
type SearchParams = Promise<{ status?: string | string[]; page?: string | string[]; q?: string | string[] }>;

export default function RosterPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  // 로그인 확인·저장소 읽기·주소의 ?status= 값은 모두 요청이 들어온 뒤에 알 수 있는 값이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600">불러오는 중…</p>}>
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
  const q = parseQuery(query.q);

  const data = await store.readAll();
  const found = searchTrainees(data.trainees, q); // 검색은 이 과정의 전체 명단 대상
  const counts = countByStatus(found);
  const page = paginate(visibleTrainees(found, filter), parsePage(query.page));
  const replies = new Map(data.replies.map((r) => [r.traineeId, r]));
  // 이 쪽에 보이는 사람마다 "상태 + 처리 사유" (제외 경위는 저장된 값이 없는 예전 데이터면 변경 이력으로 계산한다)
  const removals = removalIndex(data.history);
  const beforeDraw = data.draws.length === 0;
  const rows: RosterRow[] = page.items.map((t) => {
    const view = statusView(t, removals, replies.get(t.id));
    return {
      id: t.id,
      empNo: t.empNo,
      name: t.name,
      dept: t.dept,
      statusLabel: view.label,
      note: view.note,
      isManual: t.isManual,
      waitNo: t.status === "대기" ? t.waitNo : undefined,
      reply: replyLabel(t.status, replies.get(t.id), t.absentOrigin),
      canCancel: beforeDraw && t.status === "선정" && t.selectedVia === "선별",
      canExclude: t.status === "선정",
      canRestore: beforeDraw && t.status === "미선정" && Boolean(t.rejectedBy),
    };
  });
  const hasTrainees = data.trainees.length > 0;
  const base = `${courseBase(courseId)}/roster`;
  const emptyMessage = !hasTrainees
    ? "아직 등록된 신청자가 없습니다. 위에서 신청자 엑셀을 올려 주세요."
    : q
      ? `"${q}"에 맞는 ${filter === "전체" ? "" : `"${filter}" 상태의 `}교육생이 없습니다.`
      : `"${filter}" 상태의 교육생이 없습니다.`;

  return (
    <main className="flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={text.page}>명단</h1>
        {/* 파일 내려받기는 화면 이동이 아니므로 Link 대신 일반 링크를 쓴다. 자주 쓰는 행동이 아니라 보조 버튼으로 둔다 */}
        <a href={`${courseBase(courseId)}/export`} download className={buttonClass("secondary")}>
          최종 명단 내려받기
        </a>
      </div>

      <CapacitySummaryBar summary={capacitySummary(data.course?.capacity, data.trainees)} />

      {/* 신청자가 이미 있으면 엑셀 올리기는 접어 둔다 */}
      <div className="flex flex-col gap-2">
        <details open={!hasTrainees} className="group rounded-2xl bg-white px-5 py-1">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between text-base font-semibold">
            신청자 엑셀 올리기
            <span aria-hidden className="text-zinc-500 transition-transform group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <div className="pt-2 pb-4">
            <UploadForm />
          </div>
        </details>
        <div className="rounded-2xl bg-white px-5 py-3">
          <ManualAdd
            vacancies={openVacancies(data.trainees).map((v) => ({ id: v.id, label: `${v.name} (${v.status === "불참" ? "불참" : "선정 취소"})` }))}
            defaultDeadline={isoToKstLocal(defaultFillDeadline(new Date().toISOString()))}
            exceeds={fillExceedsCapacity(data.course?.capacity, data.trainees)}
          />
        </div>
      </div>

      <section aria-labelledby="roster-title" className="flex flex-col gap-3">
        <h2 id="roster-title" className="sr-only">
          교육생 명단
        </h2>
        <RosterTabs active={filter} counts={counts} courseId={courseId} q={q} />
        {/* 검색: 과정 전체 명단에서 찾는다. 검색하면 선택은 풀린다 */}
        <Form action={base} className="flex gap-2" role="search">
          {filter !== "전체" && <input type="hidden" name="status" value={filter} />}
          <label htmlFor="roster-q" className="sr-only">
            이름·사번·부서 검색
          </label>
          <input id="roster-q" name="q" type="search" defaultValue={q} placeholder="이름·사번·부서 검색 (과정 전체)" className={inputClass} />
          <button type="submit" className={buttonClass("secondary", "lg")}>
            검색
          </button>
          {q && (
            <Link href={rosterHref(courseId, filter)} className={buttonClass("text", "lg")}>
              지우기
            </Link>
          )}
        </Form>
        {q && (
          <p className="text-base text-zinc-700">
            &quot;{q}&quot; 검색 결과 <strong>{counts["전체"]}명</strong>
            {filter !== "전체" && <> · {filter} {page.total}명</>}
          </p>
        )}
        <RosterTable
          // 검색·탭·쪽이 바뀌면 목록을 새로 그려 선택을 푼다 (보이지 않는 사람을 실수로 처리하지 않게)
          key={`${filter}|${q}|${page.page}`}
          rows={rows}
          selectable={filter === "신청"}
          courseId={courseId}
          emptyMessage={emptyMessage}
          pageInfo={{
            total: page.total,
            from: page.from,
            to: page.to,
            page: page.page,
            pageCount: page.pageCount,
            prevHref: page.page > 1 ? rosterHref(courseId, filter, page.page - 1, q) : undefined,
            nextHref: page.page < page.pageCount ? rosterHref(courseId, filter, page.page + 1, q) : undefined,
          }}
        />
        {filter !== "신청" && counts["신청"] > 0 && (
          <p className="text-sm text-zinc-600">
            여러 명을 한 번에 우선 선정하거나 미선정 처리하려면{" "}
            <Link href={rosterHref(courseId, "신청", 1, q)} className="font-semibold text-primary underline-offset-2 hover:underline">
              &quot;신청&quot; 탭
            </Link>
            에서 체크해 주세요.
          </p>
        )}
      </section>

      <ResetPanel scope={resetScope(data)} exportHref={`${courseBase(courseId)}/export`} archived={Boolean(data.archivedAt)} />
    </main>
  );
}
