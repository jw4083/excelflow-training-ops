// 회신 현황 화면 (PLAN 작업 19, DESIGN 2.3): 요약, 걸러 보기, 교육생별 회신 내용, "대신 입력".
// 충원 창("제외하고 충원")은 작업 20에서 불참 행에 이어서 붙인다. 휴대폰에서도 보도록 표 대신 세로 카드로 보여 준다.
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { acknowledgeCancelAction, adminSubmitReplyAction } from "@/app/actions/adminReply";
import { ReplyForm } from "@/app/trainee/reply-form";
import {
  buildReplyRows,
  filterReplyRows,
  parseReplyFilter,
  REPLY_FILTERS,
  REPLY_FILTER_LABELS,
  summarizeReplies,
  type ReplyFilter,
  type ReplyRow,
} from "@/domain/replyStatus";
import { defaultFillDeadline, fillCandidates, fillExceedsCapacity, openVacancies } from "@/domain/fill";
import type { Trainee } from "@/domain/types";
import { formatKst, isoToKstLocal } from "@/lib/datetime";
import { courseBase, openAdminCourse } from "@/lib/adminCourse";
import { FillPanel, type PanelCandidates } from "./fill-panel";

type Params = Promise<{ courseId: string }>;
type SearchParams = Promise<{ filter?: string | string[]; open?: string | string[]; filled?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const toPerson = (t: Trainee) => ({ id: t.id, name: t.name, dept: t.dept, empNo: t.empNo, waitNo: t.waitNo });

export default function RepliesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <RepliesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RepliesContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { courseId } = await params;
  const store = await openAdminCourse(courseId);
  await connection();
  const query = await searchParams;
  const filter = parseReplyFilter(query.filter);
  const openId = first(query.open);
  const filledId = first(query.filled);
  const data = await store.readAll();
  const nowIso = new Date().toISOString();
  const rows = buildReplyRows(data.trainees, data.replies, data.course, nowIso);

  // 충원 창에 필요한 값: 비는 자리, 후보(대기 1번 또는 미선정자 목록), 정원 초과 여부, 기본 회신 기한(3일 후)
  const vacancies = openVacancies(data.trainees);
  const found = fillCandidates(data.trainees);
  const panelCandidates: PanelCandidates =
    found.mode === "waitlist"
      ? { mode: "waitlist", candidate: toPerson(found.candidate) }
      : found.mode === "pool"
        ? { mode: "pool", pool: found.pool.map(toPerson) }
        : { mode: "none" };
  const exceeds = fillExceedsCapacity(data.course?.capacity, data.trainees);
  const defaultDeadline = isoToKstLocal(defaultFillDeadline(nowIso));
  const filledName = filledId ? data.trainees.find((t) => t.id === filledId)?.name : undefined;
  const summary = summarizeReplies(rows);
  const shown = filterReplyRows(rows, filter);
  const counts: Record<ReplyFilter, number> = {
    all: summary.total,
    none: summary.none,
    attend: summary.attend,
    absent: summary.absent,
    cancelled: summary.cancelled,
  };

  return (
    <main className="flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">회신 현황</h1>

      {filledName && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-base font-medium dark:border-emerald-800 dark:bg-emerald-950">
          충원을 확정했습니다. {filledName}님이 선정되었습니다. 필요하면 안내 메일을 직접 보내 주세요(앱은 메일을 보내지 않습니다).
        </p>
      )}

      {vacancies.length > 0 && (
        <section id="vacancies" aria-labelledby="vacancy-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="vacancy-title" className="text-xl font-bold">
            충원이 필요한 자리 {vacancies.length}개
          </h2>
          <ul className="flex flex-col gap-3">
            {vacancies.map((v) => (
              <FillPanel
                key={v.id}
                target={toPerson(v)}
                reasonLabel={v.status === "불참" ? (v.absentOrigin === "참석후취소" ? "참석 후 취소" : "불참") : "직접 제외"}
                candidates={panelCandidates}
                defaultDeadline={defaultDeadline}
                exceeds={exceeds}
                defaultOpen={openId === v.id}
              />
            ))}
          </ul>
        </section>
      )}

      <p className="text-base">
        회신 대상 <strong>{summary.total}명</strong> 중 회신 <strong>{summary.replied}</strong> · 미회신 <strong>{summary.none}</strong> ·
        참석 <strong>{summary.attend}</strong> · 불참 <strong>{summary.absent}</strong>
        {summary.cancelled > 0 && <> (그중 참석 후 취소 <strong>{summary.cancelled}</strong>)</>} · 노트북 지참 <strong>{summary.laptop}</strong>
      </p>
      {summary.newCancels > 0 && (
        <p role="status" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-base font-medium text-rose-900">
          새 참석 취소가 {summary.newCancels}건 있습니다. 내용을 보고 「확인」을 눌러 주세요. 충원은 자동으로 하지 않으니 위 「충원이 필요한 자리」에서 정해 주세요.
        </p>
      )}

      <nav aria-label="회신 걸러보기" className="flex flex-wrap gap-2">
        {REPLY_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? `${courseBase(courseId)}/replies` : `${courseBase(courseId)}/replies?filter=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={`inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium ${
              filter === f
                ? "border-primary bg-primary text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {REPLY_FILTER_LABELS[f]} {counts[f]}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-base text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {rows.length === 0 ? "아직 선정된 교육생이 없습니다." : "해당하는 교육생이 없습니다."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => (
            <ReplyCard key={row.trainee.id} row={row} courseId={courseId} />
          ))}
        </ul>
      )}
    </main>
  );
}

const KIND_STYLE = {
  참석: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  // 참석 후 취소는 처음부터 불참과 다른 색·글자로 구분한다
  불참: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
  미회신: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
} as const;

function ReplyCard({ row, courseId }: { row: ReplyRow; courseId: string }) {
  const { trainee, reply, kind, deadline, cancelled, newCancel } = row;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-bold">{trainee.name}</p>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          {trainee.dept} · {trainee.empNo}
        </p>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${KIND_STYLE[kind]}`}>{kind}</span>
        {cancelled && <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-900">참석 후 취소</span>}
        {trainee.status === "불참" && trainee.absentOrigin === "시작후불참" && (
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-800">교육 시작 후 불참</span>
        )}
        {newCancel && <span className="rounded-full bg-rose-600 px-3 py-1 text-sm font-bold text-white">새 취소</span>}
        {trainee.status === "불참" && trainee.replacedBy && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">충원 확정</span>
        )}
        {reply?.byAdmin && <span className="rounded-full border border-zinc-400 px-3 py-1 text-sm">담당자 입력</span>}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-base sm:grid-cols-2">
        {reply?.attend === false && (
          <>
            <Item label="불참 구분" value={reply.absentType} />
            <Item label="불참 상세" value={reply.absentDetail} wide />
          </>
        )}
        {reply?.attend === true && (
          <>
            <Item label="노트북" value={reply.laptop ? "지참" : "미지참"} />
            <Item
              label="룸메이트"
              value={reply.roommateName ? `${reply.roommateName} (${reply.roommateDept})` : "없음"}
            />
          </>
        )}
        <Item
          label="회신 기한"
          value={deadline ? `${deadline.text}${deadline.personal ? " (개별 기한)" : ""}${deadline.passed ? " · 지남" : ""}` : "미정"}
        />
        <Item label="제출 일시" value={reply ? formatKst(reply.submittedAt) : "-"} />
        {cancelled && trainee.cancelledAt && <Item label="참석 취소 일시" value={formatKst(trainee.cancelledAt)} />}
        {cancelled && trainee.cancelSeenAt && <Item label="담당자 확인" value={formatKst(trainee.cancelSeenAt)} />}
      </dl>

      {newCancel && (
        <form action={acknowledgeCancelAction.bind(null, courseId, trainee.id)}>
          <button type="submit" className="h-11 rounded-lg border border-rose-400 bg-white px-4 text-base font-semibold text-rose-900 hover:bg-rose-50">
            확인 (새 취소 표시 끄기)
          </button>
        </form>
      )}

      {/* 회신 기한이 지나도 항상 쓸 수 있다 (PRD M2-8) */}
      <details className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800">
        <summary className="flex h-11 cursor-pointer items-center text-base font-semibold">대신 입력</summary>
        <div className="pb-3 pt-2">
          <ReplyForm
            defaults={{
              attend: reply?.attend,
              absentType: reply?.absentType,
              absentDetail: reply?.absentDetail,
              laptop: reply?.laptop,
              roommateName: reply?.roommateName,
              roommateDept: reply?.roommateDept,
            }}
            onSubmitAction={adminSubmitReplyAction.bind(null, courseId, trainee.id)}
            submitLabel="담당자 입력으로 저장"
          />
        </div>
      </details>
    </li>
  );
}

function Item({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="inline text-zinc-600 dark:text-zinc-400">{label}: </dt>
      <dd className="inline whitespace-pre-line break-words">{value ?? "-"}</dd>
    </div>
  );
}
