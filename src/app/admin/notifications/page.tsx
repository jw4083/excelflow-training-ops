// 회신 알림 목록: 교육생이 참석·불참을 회신하거나 바꿀 때마다 모든 과정의 알림이 여기에 쌓인다 (반복 팝업 없음).
// 위에 새(안 읽은) 회신 건수와 참석·불참 구분, 아래에 최신순 목록. 알림을 누르면 읽음 처리되고 그 과정의 해당 교육생 회신 내용으로 이동한다.
import { Suspense } from "react";
import { connection } from "next/server";
import { markAllReadAction, openNoticeAction } from "@/app/actions/notices";
import { describeChange } from "@/domain/historyView";
import { listCoursesForRender } from "@/lib/adminCourse";
import { requireAdmin } from "@/lib/auth";
import { formatKst } from "@/lib/datetime";
import { listNotices, summarizeNotices, type NoticeItem } from "@/lib/notices";
import { getCatalog } from "@/store";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600">불러오는 중…</p>}>
      <NotificationsContent />
    </Suspense>
  );
}

async function NotificationsContent() {
  await requireAdmin();
  await connection();
  const items = await listNotices(getCatalog(), listCoursesForRender);
  const s = summarizeNotices(items);
  // 안 읽은 알림이 있는 과정(모두 읽음 버튼용)
  const unreadCourses = [...new Map(items.filter((i) => !i.notice.readAt).map((i) => [i.courseId, i.courseName])).entries()];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">회신 알림</h1>

      <p className="text-base">
        새 회신 <strong>{s.unread}건</strong> · 참석 <strong>{s.unreadAttend}</strong> · 불참 <strong>{s.unreadAbsent}</strong>
        {s.unreadChanged > 0 && <> (그중 기존 응답 변경 <strong>{s.unreadChanged}</strong>)</>}
      </p>

      {unreadCourses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unreadCourses.map(([courseId, name]) => (
            <form key={courseId} action={markAllReadAction.bind(null, courseId)}>
              <button type="submit" className="h-11 rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium hover:bg-zinc-100">
                「{name}」 모두 읽음
              </button>
            </form>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-base text-zinc-600">아직 회신 알림이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <NoticeCard key={`${item.courseId}-${item.notice.id}`} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}

function NoticeCard({ item }: { item: NoticeItem }) {
  const { notice, courseId, courseName, traineeName, traineeDept, archived } = item;
  const unread = !notice.readAt;
  return (
    <li className={`rounded-2xl border p-4 ${unread ? "border-primary bg-primary-soft/40" : "border-zinc-200 bg-white"}`}>
      <form action={openNoticeAction.bind(null, courseId, notice.id, notice.traineeId)}>
        <button type="submit" className="flex w-full flex-col gap-2 text-left">
          <span className="flex flex-wrap items-center gap-2">
            {unread && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-bold text-white">새 알림</span>}
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${notice.attend ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
              {notice.attend ? "참석" : "불참"}
            </span>
            <span className="rounded-full border border-zinc-400 px-3 py-1 text-sm">{notice.change === "변경" ? "응답 변경" : "첫 회신"}</span>
            {archived && <span className="rounded-full bg-zinc-700 px-2.5 py-0.5 text-sm font-semibold text-white">보관됨</span>}
          </span>
          <span className="text-lg font-bold">
            {traineeName} <span className="text-base font-normal text-zinc-600">{traineeDept}</span>
          </span>
          <span className="text-base text-zinc-600">
            {courseName} · {formatKst(notice.at)}
          </span>
          {notice.change === "변경" ? (
            <span className="grid gap-2 text-base sm:grid-cols-2">
              <span>
                <strong>변경 전</strong>
                {describeChange(notice.before).map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </span>
              <span>
                <strong>변경 후</strong>
                {describeChange(notice.after).map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </span>
            </span>
          ) : (
            <span className="text-base">
              {describeChange(notice.after).map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
            </span>
          )}
          <span className="text-base font-semibold text-primary">눌러서 회신 내용 보기{unread ? " (읽음 처리)" : ""} →</span>
        </button>
      </form>
    </li>
  );
}
