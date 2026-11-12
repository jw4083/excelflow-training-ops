// 담당자 화면 제목줄 (DESIGN 2.2): 앱 이름(누르면 과정 목록), 오른쪽에 "교육생 주소 복사"(작업 15)와 로그아웃 버튼.
import { logoutAdmin } from "@/app/actions/auth";
import Link from "next/link";
import { CopyTraineeUrlButton } from "./CopyTraineeUrlButton";

export function AdminHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      {/* 복사 안내가 버튼 아래에 나타나도 두 버튼이 위쪽에 나란히 있도록 items-start로 맞춘다 */}
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          {/* break-keep: 휴대폰처럼 좁을 때 단어 중간("통합/관리")이 아니라 띄어쓰기에서만 줄을 바꾼다 */}
          <Link href="/admin" className="flex items-center gap-2 text-base font-bold tracking-tight break-keep sm:text-lg"><span aria-hidden className="h-3 w-3 rounded-full bg-primary" />교육 운영 통합관리</Link>
          <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">교육 과정 관리</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <CopyTraineeUrlButton />
          <form action={logoutAdmin}>
            <button
              type="submit"
              className="h-11 shrink-0 rounded-lg border border-zinc-300 px-4 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
