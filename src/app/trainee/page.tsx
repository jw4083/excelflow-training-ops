// 교육생 공통 주소 (PLAN 작업 16~18, PRD M2-2): 모든 교육생이 같은 주소 /trainee에서 로그인한다 (개인 링크 없음).
// 로그인 전에는 로그인 양식, 로그인한 뒤에는 "내 과정 목록"(본인이 등록된, 보관되지 않은 과정만)이 보이고, 과정을 누르면 /trainee/[courseId]에서 확인·회신한다.
// 같은 직원이 여러 과정에 등록돼 있으면 과정마다 카드가 따로 있고, 선정 상태와 회신은 과정마다 따로다.
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { logoutTraineeAction } from "@/app/actions/trainee";
import { Mascot, MascotCredit } from "@/components/Mascot";
import { describeMyStatus, hasReplySection, replyDeadlineFor } from "@/domain/traineeView";
import { getTraineeEmpNo } from "@/lib/auth";
import { formatPeriodKo } from "@/lib/datetime";
import { getCatalog } from "@/store";
import { card, TONE } from "./tone";
import { TraineeLoginForm } from "./trainee-login-form";

export const metadata: Metadata = { title: "교육 안내 · 회신" };

export default function TraineePage() {
  // 제목은 정적이고, "로그인했는가"는 요청이 들어온 뒤에 알 수 있으므로 Suspense 안에서 정한다 (Cache Components 규칙)
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <Suspense fallback={<p className="text-base text-zinc-600">불러오는 중…</p>}>
        <TraineeGate />
      </Suspense>
      <MascotCredit />
    </main>
  );
}

async function TraineeGate() {
  const empNo = await getTraineeEmpNo();
  if (empNo) {
    // 이 사번이 등록된, 보관되지 않은 과정만 (다른 교육생 정보는 이 화면에서 얻을 수 없다, PRD M2-1)
    const mine = await getCatalog().findEnrollments(empNo);
    if (mine.length > 0) {
      await connection(); // 현재 시각을 쓰므로 요청 시점에 계산 (Cache Components 규칙)
      const nowIso = new Date().toISOString();
      return (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold break-keep">내 교육 과정</h1>
            <form action={logoutTraineeAction}>
              <button type="submit" className="h-11 shrink-0 rounded-xl border border-zinc-300 bg-white px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100">
                로그아웃
              </button>
            </form>
          </div>
          <p className="text-base text-zinc-700 break-keep">
            <strong>{mine[0].trainee.name}</strong>님이 등록된 과정입니다. 과정을 눌러 선정 결과를 확인하고 회신해 주세요.
          </p>
          <ul className="flex flex-col gap-3">
            {mine.map(({ courseId, course, trainee }) => {
              const msg = describeMyStatus(trainee);
              const tone = TONE[msg.tone];
              const deadline = hasReplySection(trainee.status) ? replyDeadlineFor(trainee, course, nowIso) : null;
              return (
                <li key={courseId}>
                  <Link href={`/trainee/${courseId}`} className={`${card} block hover:bg-zinc-50`}>
                    <p className="text-lg font-bold break-keep">{course?.name ?? "교육 과정"}</p>
                    {course && <p className="mt-1 text-base text-zinc-600 break-keep">{formatPeriodKo(course.startDate, course.endDate)}</p>}
                    <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-base font-semibold ${tone.pill}`}>
                      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                      {msg.title}
                    </p>
                    {deadline && (
                      <p className="mt-2 text-base">
                        회신 기한: {deadline.text} <strong className="font-bold text-primary">({deadline.remaining})</strong>
                      </p>
                    )}
                    <p className="mt-3 text-base font-semibold text-primary">열어서 확인·회신하기 →</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      );
    }
    // 쿠키는 유효한데 등록된 과정이 없어졌다면(보관 등) 로그인하지 않은 것으로 보고 로그인 양식을 보여 준다
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-card bg-primary-soft p-5">
        <Mascot name="키우미" size={104} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold break-keep">교육 운영 통합관리</h1>
          <p className="mt-1 text-base text-zinc-700 break-keep">내 선정 결과와 교육 안내를 확인하고 회신해 주세요.</p>
        </div>
      </div>
      <div className={card}>
        <TraineeLoginForm />
      </div>
    </section>
  );
}
