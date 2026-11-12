// 과정 화면 맨 위 막대: "← 과정 목록" · 과정 이름 · (보관된 과정이면 "보관됨" 표시) · 보관/보관 해제 버튼.
import Link from "next/link";
import { archiveCourseAction, unarchiveCourseAction } from "@/app/actions/course";
import { getAdminSummary } from "@/lib/adminData";
import { ArchiveButton } from "./ArchiveButton";

export async function CourseBar({ courseId }: { courseId: string }) {
  const { courseName, archived } = await getAdminSummary(courseId);
  return (
    <div className="border-b border-zinc-200 bg-primary-soft/40 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/admin" className="inline-flex h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium hover:bg-zinc-100">
          ← 과정 목록
        </Link>
        <p className="min-w-0 flex-1 truncate text-lg font-bold break-keep">{courseName ?? "과정 정보 미입력"}</p>
        {archived && <span className="rounded-full bg-zinc-700 px-3 py-1 text-sm font-semibold text-white">보관됨 · 조회만 가능</span>}
        {archived ? (
          <ArchiveButton
            action={unarchiveCourseAction.bind(null, courseId)}
            label="보관 해제"
            confirmText="보관을 해제하면 이 과정을 다시 바꿀 수 있고, 교육생에게 다시 보입니다. 해제할까요?"
          />
        ) : (
          <ArchiveButton
            action={archiveCourseAction.bind(null, courseId)}
            label="과정 보관"
            confirmText="보관하면 이 과정은 조회만 가능하고 교육생에게 보이지 않습니다. 나중에 보관을 해제할 수 있습니다. 보관할까요?"
          />
        )}
      </div>
    </div>
  );
}
