// 추첨 화면 (PLAN 작업 13, DESIGN 2.3 "추첨"): 정원 요약, 추첨 입력 양식, 1차 선별 기록, 추첨 기록.
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { capacitySummary } from "@/domain/capacity";
import { drawPool } from "@/domain/draw";
import { courseBase, openAdminCourse } from "@/lib/adminCourse";
import { CapacitySummaryBar } from "../roster/capacity-summary";
import { DrawForm } from "./draw-form";
import { DrawRecords, SelectionRecords } from "./draw-records";

type Params = Promise<{ courseId: string }>;

export default function DrawPage({ params }: { params: Params }) {
  // 로그인 확인과 저장소 읽기는 요청이 들어온 뒤에 하는 일이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <DrawContent params={params} />
    </Suspense>
  );
}

async function DrawContent({ params }: { params: Params }) {
  const { courseId } = await params;
  const store = await openAdminCourse(courseId);
  await connection();
  const data = await store.readAll();

  const redraw = data.draws.length > 0;
  const pool = drawPool(data.trainees, data.draws.length);
  const summary = capacitySummary(data.course?.capacity, data.trainees);
  const poolLabel = redraw
    ? `대기 ${pool.filter((t) => t.status === "대기").length}명 + 미선정 ${pool.filter((t) => t.status === "미선정").length}명 (재추첨)`
    : `신청 ${pool.length}명`;

  return (
    <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">추첨</h1>

      <CapacitySummaryBar summary={summary} />

      <section aria-labelledby="draw-form-title" className="flex flex-col gap-4">
        <h2 id="draw-form-title" className="text-xl font-semibold">
          {redraw ? "재추첨" : "2차 랜덤 추첨"}
        </h2>
        {data.course ? (
          <DrawForm
            initial={{
              values: { capacity: data.course.capacity === undefined ? "" : String(data.course.capacity), waitSeats: "", replyDeadline: "" },
            }}
            selectedCount={summary.selected}
            poolLabel={poolLabel}
            redraw={redraw}
          />
        ) : (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            정원은 과정에 저장되므로 먼저{" "}
            <Link href={`${courseBase(courseId)}/course`} className="font-semibold underline">
              과정 정보
            </Link>
            를 입력해 주세요.
          </p>
        )}
      </section>

      <section aria-labelledby="draw-records-title" className="flex flex-col gap-3">
        <h2 id="draw-records-title" className="text-xl font-semibold">
          추첨 기록
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          기록은 수정하거나 지울 수 없습니다. 다시 추첨하면 이전 기록은 그대로 남고 새 기록이 추가되며, 가장 최근 기록만 &quot;현재 반영&quot;으로 표시됩니다.
        </p>
        <DrawRecords draws={data.draws} trainees={data.trainees} />
      </section>

      <section aria-labelledby="selection-records-title" className="flex flex-col gap-3">
        <h2 id="selection-records-title" className="text-xl font-semibold">
          1차 선별 기록
        </h2>
        <SelectionRecords selections={data.selections} />
      </section>
    </main>
  );
}
