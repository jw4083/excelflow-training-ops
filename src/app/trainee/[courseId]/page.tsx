// 교육생 과정 화면 (여러 과정 운영): 내 과정 목록에서 고른 과정 하나의 내 결과·교육 안내·회신. 본인 1명의 정보만 읽는다 (PRD M2-1).
// 이 사번이 "보관되지 않은" 그 과정에 등록돼 있을 때만 열린다. 아니면(없는 과정·보관된 과정·내가 등록되지 않은 과정) 모두 같은 "찾을 수 없음" 화면이다.
// 디자인: 따뜻한 흰 배경 위에 둥근 카드를 세로로 쌓는다(Craft). 교육 안내·회신 완료에는 캠코 공식 마스코트를 놓는다(Headspace).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { logoutTraineeAction } from "@/app/actions/trainee";
import { Mascot, MascotCredit } from "@/components/Mascot";
import { removalOf } from "@/domain/roster";
import { selfReplyMode } from "@/domain/replyRules";
import { cancelDeadlineFor, describeMyStatus, hasReplySection, lastUpdatedText, replyDeadlineFor } from "@/domain/traineeView";
import { getTraineeEmpNo } from "@/lib/auth";
import { formatKst, formatPeriodKo } from "@/lib/datetime";
import { TRAINEE_PATH } from "@/lib/paths";
import { findMyEnrollment } from "@/lib/traineeCourse";
import { getCatalog } from "@/store";
import { loadMyGuides } from "@/lib/guides";
import { GuidesSection } from "../guides-section";
import { ReplyForm } from "../reply-form";
import { ResourceLinks } from "../resource-links";
import { card, TONE } from "../tone";

export const metadata: Metadata = { title: "교육 안내 · 회신" };

type Params = Promise<{ courseId: string }>;

export default function TraineeCoursePage({ params }: { params: Params }) {
  // "로그인했는가"·과정 번호는 요청이 들어온 뒤에 알 수 있으므로 Suspense 안에서 정한다 (Cache Components 규칙)
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <Suspense fallback={<p className="text-base text-zinc-600">불러오는 중…</p>}>
        <CourseView params={params} />
      </Suspense>
      <MascotCredit />
    </main>
  );
}

async function CourseView({ params }: { params: Params }) {
  const { courseId } = await params;
  const empNo = await getTraineeEmpNo();
  if (!empNo) redirect(TRAINEE_PATH); // 로그인 전이면 로그인 화면으로

  // 내 사번이 이 과정(보관되지 않은)에 등록돼 있을 때만 연다. 그 과정의 저장소는 본인 1명 + 과정 정보 + 본인 회신만 읽는다
  const catalog = getCatalog();
  const mine = await findMyEnrollment(catalog, empNo, courseId);
  const store = mine ? await catalog.openCourse(mine.courseId) : null;
  if (!mine || !store) notFound();

  const me = mine.trainee;
  const course = mine.course;
  await connection(); // 현재 시각을 쓰므로 요청 시점에 계산 (Cache Components 규칙)
  const nowIso = new Date().toISOString();
  const deadline = replyDeadlineFor(me, course, nowIso);
  const reply = await store.getReply(me.id);
  // 제외 상태의 경위(선정 취소 / 불참 후 충원): 저장된 값이 없는 예전 데이터는 불참 회신 흔적으로 정한다 (본인 정보만 쓴다)
  const msg = describeMyStatus(me, removalOf(me, undefined, reply).origin);
  // 지금 할 수 있는 회신: 자유 회신(기한 전) / 불참 변경만(기한 후·취소 마감 전 참석자) / 닫힘(이유 안내). 서버 검사와 같은 함수다
  const mode = selfReplyMode(me, course, reply, nowIso);
  const cancelDeadline = cancelDeadlineFor(course, nowIso);
  const showCancelDeadline = cancelDeadline && (me.status === "선정" || me.absentOrigin === "참석후취소");
  // 최종 안내: "선정 + 참석 회신"일 때만 목록이 온다 (아니면 빈 목록 — 안내가 있다는 사실도 보이지 않는다)
  const guides = await loadMyGuides(store, me.id);
  const updated = lastUpdatedText(course);
  const tone = TONE[msg.tone];

  return (
    <section className="flex flex-col gap-4">
      {/* 맨 위: 내 과정 목록으로 돌아가기, 최종 수정 일시(PRD M2-5), 오른쪽 위 로그아웃 */}
      <div className="flex items-center justify-between gap-3">
        <Link href={TRAINEE_PATH} className="inline-flex h-11 shrink-0 items-center rounded-xl border border-zinc-300 bg-white px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100">
          ← 내 과정
        </Link>
        <form action={logoutTraineeAction}>
          <button type="submit" className="h-11 shrink-0 rounded-xl border border-zinc-300 bg-white px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100">
            로그아웃
          </button>
        </form>
      </div>
      {updated && <p className="text-base text-zinc-600">최종 수정 일시: {updated}</p>}

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
                key={`${courseId}-${mode.mode}`}
                courseId={courseId}
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

      <GuidesSection courseId={courseId} guides={guides} nowIso={nowIso} />

      {/* 링크 영역의 빈 자리 (PRD M2-12): 카톡방·퀴즈·설문 링크는 이번에 만들지 않으므로 지금은 아무것도 넘기지 않아 보이지 않는다 */}
      <ResourceLinks />
    </section>
  );
}
