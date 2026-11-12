// 담당자 제목줄의 알림 종: 모든 과정의 안 읽은 회신 알림 수. 누르면 알림 목록으로 간다 (팝업은 띄우지 않고 목록에 쌓는다).
import Link from "next/link";
import { connection } from "next/server";
import { listNotices, summarizeNotices } from "@/lib/notices";
import { getCatalog } from "@/store";

export async function NoticeBell() {
  await connection();
  const s = summarizeNotices(await listNotices(getCatalog()));
  return (
    <Link
      href="/admin/notifications"
      aria-label={s.unread > 0 ? `회신 알림 ${s.unread}건 (참석 ${s.unreadAttend}, 불참 ${s.unreadAbsent})` : "회신 알림"}
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-zinc-300 px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100"
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
