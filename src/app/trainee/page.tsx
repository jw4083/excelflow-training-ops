// 교육생 공통 주소 (PLAN 작업 16, PRD M2-2): 모든 교육생이 같은 주소 /trainee에서 로그인한다 (개인 링크 없음).
// 로그인 전에는 로그인 양식, 로그인한 뒤에는 본인 화면이 같은 주소에서 보인다.
// 본인의 선정 결과·교육 안내·회신 화면은 작업 17~18에서 이 자리에 만든다. 지금은 로그인이 되었다는 임시 화면만 있다.
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { describeMyStatus, hasReplySection, lastUpdatedText, replyDeadlineFor } from "@/domain/traineeView";
import { replyFormState } from "@/domain/replyRules";
import { formatKst, formatPeriodKo } from "@/lib/datetime";
import { ReplyForm } from "./reply-form";
import { ResourceLinks } from "./resource-links";
import { logoutTraineeAction } from "@/app/actions/trainee";
import { getTraineeEmpNo } from "@/lib/auth";
import { getStore } from "@/store";
import { TraineeLoginForm } from "./trainee-login-form";

export const metadata: Metadata = { title: "교육 안내 · 회신" };

export default function TraineePage() {
  // 제목은 정적이고, "로그인했는가"는 요청이 들어온 뒤에 알 수 있으므로 Suspense 안에서 정한다 (Cache Components 규칙)
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">교육 운영 통합관리</h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">교육생 안내 · 회신</p>
      </div>
      <Suspense fallback={<p className="text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
        <TraineeGate />
      </Suspense>
    </main>
  );
}

async function TraineeGate() {
  const empNo = await getTraineeEmpNo();
  if (empNo) {
    // 로그인한 본인 1명만 조회한다 (다른 교육생 정보는 이 화면에서 얻을 수 없다, PRD M2-1)
    const me = await getStore().getTraineeByEmpNo(empNo);
    if (me) {
      const course = await getStore().getCourse();
      await connection(); // 현재 시각을 쓰므로 요청 시점에 계산 (Cache Components 규칙)
      const msg = describeMyStatus(me);
      const nowIso = new Date().toISOString();
      const deadline = replyDeadlineFor(me, course, nowIso);
      const formState = replyFormState(me, course, nowIso);
      const reply = await getStore().getReply(me.id);
      const updated = lastUpdatedText(course);
      const toneClass = {
        good: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
        wait: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
        neutral: "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900",
        bad: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
      }[msg.tone];
      return (
        <section className="flex flex-col gap-4">
          {updated && <p className="text-base text-zinc-600 dark:text-zinc-400">최종 수정 일시: {updated}</p>}
          <div className={`flex flex-col gap-2 rounded-lg border p-4 ${toneClass}`}>
            <h2 className="text-base font-bold">내 결과</h2>
            <p className="text-base">{me.name}님 · {me.dept}</p>
            <p className="text-lg font-bold break-keep">{msg.title}</p>
            <p className="text-base break-keep">{msg.detail}</p>
          </div>
          {course && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
              <h2 className="text-base font-bold">교육 안내</h2>
              <p className="text-base font-medium">{course.name}</p>
              <p className="text-base">일정: {formatPeriodKo(course.startDate, course.endDate)}</p>
              <p className="text-base">장소: {course.place}</p>
              {course.notice && <p className="text-base whitespace-pre-line break-keep">{course.notice}</p>}
            </div>
          )}
          {hasReplySection(me.status) && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
              <h2 className="text-base font-bold">회신</h2>
              {deadline ? (
                <p className="text-base">
                  회신 기한: {deadline.text} <strong className="font-bold">({deadline.remaining})</strong>
                </p>
              ) : (
                <p className="text-base">회신 기한은 아직 정해지지 않았습니다.</p>
              )}
              {formState.open ? (
                <ReplyForm
                  defaults={{
                    attend: reply?.attend,
                    absentType: reply?.absentType,
                    absentDetail: reply?.absentDetail,
                    laptop: reply?.laptop,
                    roommateName: reply?.roommateName,
                    roommateDept: reply?.roommateDept,
                    submittedAt: reply ? formatKst(reply.submittedAt) + (reply.byAdmin ? " (담당자 입력)" : "") : undefined,
                  }}
                />
              ) : (
                <p className="text-base font-medium text-red-700 dark:text-red-400">{formState.reason}</p>
              )}
            </div>
          )}
          {/* 링크 영역의 빈 자리 (PRD M2-12): 카톡방·퀴즈·설문 링크는 이번에 만들지 않으므로 지금은 아무것도 넘기지 않아 보이지 않는다 */}
          <ResourceLinks />
          <form action={logoutTraineeAction}>
            <button
              type="submit"
              className="h-12 w-full rounded-lg border border-zinc-300 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              로그아웃
            </button>
          </form>
        </section>
      );
    }
    // 쿠키는 유효한데 명단에서 사라진 사번이면 로그인하지 않은 것으로 보고 로그인 양식을 보여 준다
  }
  return <TraineeLoginForm />;
}
