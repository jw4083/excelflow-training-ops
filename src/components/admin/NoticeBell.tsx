// 담당자 제목줄의 알림 종: 모든 과정의 안 읽은 회신 알림 수. 누르면 알림 목록으로 간다 (팝업은 띄우지 않고 목록에 쌓는다).
import Link from "next/link";
import { connection } from "next/server";
import { listCoursesForRender } from "@/lib/adminCourse";
import { listNotices, summarizeNotices } from "@/lib/notices";
import { getCatalog } from "@/store";

export async function NoticeBell() {
  await connection();
  const s = summarizeNotices(await listNotices(getCatalog(), listCoursesForRender));
  return (
    <Link
      href="/admin/notifications"
      aria-label={s.unread > 0 ? `회신 알림 ${s.unread}건 (참석 ${s.unreadAttend}, 불참 ${s.unreadAbsent})` : "회신 알림"}
      className="ui-btn inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold whitespace-nowrap hover:bg-zinc-50 active:bg-zinc-100 sm:h-11 sm:px-4 sm:text-base"
    >
      회신 알림
      {s.unread > 0 && (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
          {s.unread > 99 ? "99+" : s.unread}
        </span>
      )}
    </Link>
  );
}
