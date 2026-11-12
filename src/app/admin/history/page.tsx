// 변경 이력 화면 (PLAN 작업 14, DESIGN 2.3 "변경 이력"): 종류별 걸러 보기, 최신순, 일시·대상·변경 전·후·사유. 읽기 전용이다 (PRD M1-7).
import { Suspense } from "react";
import { connection } from "next/server";
import { countByKind, parseKindFilter, visibleHistory } from "@/domain/historyView";
import { paginate, parsePage } from "@/domain/roster";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/store";
import { HistoryTable } from "./history-table";
import { HistoryTabs } from "./history-tabs";

type SearchParams = Promise<{ kind?: string | string[]; page?: string | string[] }>;

export default function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  // 로그인 확인·저장소 읽기·주소의 ?kind= 값은 모두 요청이 들어온 뒤에 알 수 있는 값이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <HistoryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HistoryContent({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  await connection();
  const params = await searchParams;
  const filter = parseKindFilter(params.kind);

  const { history, trainees } = await getStore().readAll();
  const byId = new Map(trainees.map((t) => [t.id, `${t.name}(${t.empNo})`]));
  const page = paginate(visibleHistory(history, filter), parsePage(params.page));

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">변경 이력</h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          선별·추첨·불참·충원 등 명단의 모든 변경이 일시, 변경 전, 변경 후와 함께 남습니다. 이력은 수정하거나 지울 수 없고, 최신 순으로 보입니다.
        </p>
      </div>
      <HistoryTabs active={filter} counts={countByKind(history)} />
      <HistoryTable page={page} filter={filter} nameOf={(id) => byId.get(id)} />
    </main>
  );
}
