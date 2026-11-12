// 최종 안내 한 건의 교육생별 확인·준비 현황 (담당자). 대상은 "선정 + 참석 회신" 교육생뿐이고, 「미완료만」으로 아직 안 한 사람을 모아 본다.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { guideStatus } from "@/domain/guides";
import { courseBase, openAdminCourse } from "@/lib/adminCourse";
import { formatKst } from "@/lib/datetime";

type Params = Promise<{ courseId: string; guideId: string }>;
type SearchParams = Promise<{ filter?: string | string[] }>;

export default function GuideStatusPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600">불러오는 중…</p>}>
      <StatusContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StatusContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { courseId, guideId } = await params;
  const store = await openAdminCourse(courseId);
  await connection();
  const query = await searchParams;
  const raw = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  const filter = raw === "incomplete" || raw === "changed" ? raw : "all";
  const data = await store.readAll();
  const guide = data.guides?.find((g) => g.id === guideId);
  if (!guide) notFound();

  const status = guideStatus(data, guide);
  const rows = status.rows.filter((r) => (filter === "incomplete" ? r.incomplete : filter === "changed" ? r.state.changed : true));
  const base = `${courseBase(courseId)}/guides`;
  const tabs = [
    { key: "all", label: `전체 ${status.total}`, href: `${base}/${guideId}` },
    { key: "incomplete", label: `미완료 ${status.incomplete}`, href: `${base}/${guideId}?filter=incomplete` },
    { key: "changed", label: `변경 후 미확인 ${status.changedUnconfirmed}`, href: `${base}/${guideId}?filter=changed` },
  ];

  return (
    <main className="flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={base} className="inline-flex h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium hover:bg-zinc-100">
          ← 안내 목록
        </Link>
        <h1 className="text-2xl font-bold tracking-tight break-keep">{guide.title}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${guide.published ? "bg-emerald-100 text-emerald-900" : "bg-zinc-200 text-zinc-800"}`}>
          {guide.published ? "공개" : "비공개"}
        </span>
      </div>
      <p className="text-base">
        대상(선정 + 참석 회신) <strong>{status.total}명</strong> · 확인 완료 <strong>{status.confirmed}</strong>
        {guide.needsPrep && (
          <>
            {" "}· 준비 완료 <strong>{status.prepared}</strong>
          </>
        )}{" "}
        · 미완료 <strong>{status.incomplete}</strong>
        {guide.dueAt && <span className="block text-zinc-600">준비 기한: {formatKst(guide.dueAt)}</span>}
      </p>

      <nav aria-label="걸러 보기" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={filter === t.key ? "page" : undefined}
            className={`inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium ${
              filter === t.key ? "border-primary bg-primary text-white" : "border-zinc-300 hover:bg-zinc-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-base text-zinc-600">
          {status.total === 0 ? "아직 안내를 볼 수 있는 교육생(선정 + 참석 회신)이 없습니다." : "해당하는 교육생이 없습니다."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[40rem] text-left text-base">
            <caption className="sr-only">교육생별 확인·준비 현황</caption>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-600">
              <tr>
                {["사번", "이름", "부서", "확인", guide.needsPrep ? "준비" : null].filter(Boolean).map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {rows.map(({ trainee, state }) => (
                <tr key={trainee.id}>
                  <td className="px-4 py-3 font-mono tabular-nums">{trainee.empNo}</td>
                  <td className="px-4 py-3">{trainee.name}</td>
                  <td className="px-4 py-3">{trainee.dept}</td>
                  <td className="px-4 py-3">
                    {state.confirmed ? (
                      <span className="text-emerald-800">완료 · {formatKst(state.confirmedAt as string)}</span>
                    ) : state.changed ? (
                      <span className="font-semibold text-amber-800">변경 후 미확인</span>
                    ) : (
                      <span className="font-semibold text-red-700">미확인</span>
                    )}
                  </td>
                  {guide.needsPrep && (
                    <td className="px-4 py-3">
                      {state.prepared ? <span className="text-emerald-800">완료 · {formatKst(state.preparedAt as string)}</span> : <span className="font-semibold text-red-700">미완료</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
