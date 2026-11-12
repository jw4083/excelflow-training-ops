// 과정 목록 (여러 과정 운영): 담당자가 로그인하면 가장 먼저 보는 화면. 진행 중인 과정과 보관된 과정을 나눠 보여 주고,
// 과정을 누르면 그 과정의 명단·추첨·회신 현황·변경 이력 화면으로 들어간다. "새 과정 만들기"도 여기서 시작한다.
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { vacancyAlert } from "@/domain/alerts";
import { capacitySummary } from "@/domain/capacity";
import { requireAdmin } from "@/lib/auth";
import { formatPeriodKo } from "@/lib/datetime";
import { getCatalog, type CourseEntry } from "@/store";

export default function AdminIndex() {
  // 로그인 확인과 저장소 읽기는 요청이 들어온 뒤에 하는 일이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <CourseList />
    </Suspense>
  );
}

async function CourseList() {
  await requireAdmin();
  await connection();
  const all = await getCatalog().listCourses();
  const active = all.filter((c) => !c.data.archivedAt);
  const archived = all.filter((c) => c.data.archivedAt);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">과정 목록</h1>
        <Link
          href="/admin/courses/new"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover"
        >
          새 과정 만들기
        </Link>
      </div>

      <section aria-labelledby="active-title" className="flex flex-col gap-3">
        <h2 id="active-title" className="text-xl font-semibold">
          진행 중인 과정 <span className="text-base font-normal text-zinc-600">{active.length}개</span>
        </h2>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-base text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            진행 중인 과정이 없습니다. 「새 과정 만들기」로 시작해 주세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((c, index) => (
              <CourseCard key={c.id} entry={c} fallbackName={`과정 ${index + 1}`} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="archived-title" className="flex flex-col gap-3">
          <h2 id="archived-title" className="text-xl font-semibold">
            보관된 과정 <span className="text-base font-normal text-zinc-600">{archived.length}개 · 조회만 가능</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {archived.map((c, index) => (
              <CourseCard key={c.id} entry={c} fallbackName={`보관된 과정 ${index + 1}`} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function CourseCard({ entry, fallbackName }: { entry: CourseEntry; fallbackName: string }) {
  const { id, data } = entry;
  const archived = Boolean(data.archivedAt);
  const summary = capacitySummary(data.course?.capacity, data.trainees);
  const alert = vacancyAlert(data.trainees);
  const waiting = data.trainees.filter((t) => t.status === "대기").length;

  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold break-keep">
            {data.course?.name ?? fallbackName}
            {archived && <span className="ml-2 rounded-full bg-zinc-700 px-2.5 py-0.5 align-middle text-sm font-semibold text-white">보관됨</span>}
          </p>
          <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">
            {data.course ? formatPeriodKo(data.course.startDate, data.course.endDate) : "과정 정보 미입력"}
            {data.course?.place ? ` · ${data.course.place}` : ""}
          </p>
        </div>
        <Link
          href={`/admin/courses/${id}/roster`}
          className="inline-flex h-11 shrink-0 items-center rounded-lg border border-zinc-300 px-5 text-base font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {archived ? "기록 보기" : "열기"}
        </Link>
      </div>
      <p className="mt-3 text-base">
        등록 <strong>{data.trainees.length}명</strong> · 선정 <strong>{summary.selected}명</strong>
        {summary.capacity !== null && <> / 정원 {summary.capacity}명</>} · 대기 <strong>{waiting}명</strong>
        {!archived && alert.total > 0 && (
          <strong className="ml-2 rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-bold text-white">충원 필요 {alert.total}자리</strong>
        )}
        {!archived && alert.newCancels > 0 && (
          <strong className="ml-2 rounded-full bg-rose-600 px-2.5 py-0.5 text-sm font-bold text-white">새 취소 {alert.newCancels}건</strong>
        )}
      </p>
    </li>
  );
}
