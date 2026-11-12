// 교육생 공통 주소 (PLAN 작업 16~18, PRD M2-2): 모든 교육생이 같은 주소 /trainee에서 로그인한다 (개인 링크 없음).
// 로그인 전에는 로그인 양식, 로그인한 뒤에는 본인 화면(내 결과·교육 안내·회신)이 같은 주소에서 보인다. 본인 1명의 정보만 읽는다 (PRD M2-1).
// 디자인: 따뜻한 흰 배경 위에 둥근 카드를 세로로 쌓는다(Craft). 로그인·교육 안내·회신 완료에는 캠코 공식 마스코트를 놓는다(Headspace).
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { cancelDeadlineFor, describeMyStatus, hasReplySection, lastUpdatedText, replyDeadlineFor, type StatusTone } from "@/domain/traineeView";
import { selfReplyMode } from "@/domain/replyRules";
import { formatKst, formatPeriodKo } from "@/lib/datetime";
import { Mascot, MascotCredit } from "@/components/Mascot";
import { ReplyForm } from "./reply-form";
import { ResourceLinks } from "./resource-links";
import { logoutTraineeAction } from "@/app/actions/trainee";
import { getTraineeEmpNo } from "@/lib/auth";
import { getStore } from "@/store";
import { TraineeLoginForm } from "./trainee-login-form";

export const metadata: Metadata = { title: "교육 안내 · 회신" };

const card = "rounded-card border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(20,33,61,0.05)]";

// 내 결과 카드의 상태 표시(색만으로 구분하지 않고 항상 글자로도 보여 준다)
const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  good: { pill: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  wait: { pill: "bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  neutral: { pill: "bg-zinc-100 text-zinc-700", dot: "bg-zinc-400" },
  bad: { pill: "bg-red-50 text-red-800", dot: "bg-red-500" },
};

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
    // 로그인한 본인 1명만 조회한다 (다른 교육생 정보는 이 화면에서 얻을 수 없다, PRD M2-1)
    const me = await getStore().getTraineeByEmpNo(empNo);
    if (me) {
      const course = await getStore().getCourse();
      await connection(); // 현재 시각을 쓰므로 요청 시점에 계산 (Cache Components 규칙)
      const msg = describeMyStatus(me);
      const nowIso = new Date().toISOString();
      const deadline = replyDeadlineFor(me, course, nowIso);
      const reply = await getStore().getReply(me.id);
      // 지금 할 수 있는 회신: 자유 회신(기한 전) / 불참 변경만(기한 후·취소 마감 전 참석자) / 닫힘(이유 안내). 서버 검사와 같은 함수다
      const mode = selfReplyMode(me, course, reply, nowIso);
      const cancelDeadline = cancelDeadlineFor(course, nowIso);
      const showCancelDeadline = cancelDeadline && (me.status === "선정" || me.absentOrigin === "참석후취소");
      const updated = lastUpdatedText(course);
      const tone = TONE[msg.tone];
      return (
        <section className="flex flex-col gap-4">
          {/* 맨 위: 최종 수정 일시(PRD M2-5)와 오른쪽 위 로그아웃 */}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-base text-zinc-600">{updated ?`최종 수정 일시: ${updated}` : "교육 운영 통합관리"}</p>
            <form action={logoutTraineeAction}>
              <button type="submit" className="h-11 shrink-0 rounded-xl border border-zinc-300 bg-white px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100">
                로그아웃
              </button>
            </form>
          </div>

          <div className={card}>
            <h2 className="text-base font-bold text-zinc-600">내 결과</h2>
            <p className="mt-2 text-base">
              <strong className="font-bold">{me.name}</strong>님 · {me.dept}
            </p>
            <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-base font-semibold ${tone.pill}`}>
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              {msg.title}
            </p>
            <p className="mt-3 text-base break-keep">{msg.detail}</p>
          </div>

          {course && (
            <div className="rounded-card border border-peach-200 bg-peach-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-peach-700">교육 안내</h2>
                  <p className="mt-2 text-lg font-bold break-keep">{course.name}</p>
                </div>
                <Mascot name="지키" size={80} />
              </div>
              <dl className="mt-3 grid gap-1 text-base">
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0 text-peach-700">일정</dt>
                  <dd className="break-keep">
                    {formatPeriodKo(course.startDate, course.endDate)}
                    {course.startTime && ` · ${course.startTime} 시작`}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0 text-peach-700">장소</dt>
                  <dd>{course.place}</dd>
                </div>
              </dl>
              {course.notice && <p className="mt-3 rounded-xl bg-white/70 p-3 text-base whitespace-pre-line break-keep">{course.notice}</p>}
            </div>
          )}

          {hasReplySection(me.status) && (
            <div className={card}>
              <h2 className="text-base font-bold text-zinc-600">회신</h2>
              {deadline ? (
                <p className="mt-2 text-base">
                  회신 기한: {deadline.text} <strong className="font-bold text-primary">({deadline.remaining})</strong>
                </p>
              ) : (
                <p className="mt-2 text-base">회신 기한은 아직 정해지지 않았습니다.</p>
              )}
              {showCancelDeadline && (
                <p className="mt-1 text-base">
                  참석 취소 마감: {cancelDeadline.text}{" "}
                  <strong className="font-bold text-primary">({cancelDeadline.remaining})</strong>
                </p>
              )}
              <div className="mt-4">
                {mode.mode !== "closed" ? (
                  <ReplyForm
                    key={mode.mode}
                    mode={mode.mode}
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
                  <p className="text-base font-medium text-red-700">{mode.reason}</p>
                )}
              </div>
            </div>
          )}

          {/* 링크 영역의 빈 자리 (PRD M2-12): 카톡방·퀴즈·설문 링크는 이번에 만들지 않으므로 지금은 아무것도 넘기지 않아 보이지 않는다 */}
          <ResourceLinks />
        </section>
      );
    }
    // 쿠키는 유효한데 명단에서 사라진 사번이면 로그인하지 않은 것으로 보고 로그인 양식을 보여 준다
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
