"use client";
// 담당자 화면 메뉴 (DESIGN 2.2): 큰 화면에서는 왼쪽 세로 메뉴, 휴대폰 폭에서는 위쪽 가로 메뉴.
// 지금 보고 있는 메뉴를 강조하려고 현재 주소를 읽기 때문에 클라이언트 컴포넌트다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ITEMS = [
  { path: "course", label: "과정 정보" },
  { path: "roster", label: "명단" },
  { path: "draw", label: "추첨" },
  { path: "replies", label: "회신 현황", hasBadge: true },
  { path: "guides", label: "최종 안내" },
  { path: "history", label: "변경 이력" },
] as const;

/** replyBadge: "회신 현황" 메뉴 옆에 붙는 충원 알림 숫자 표시 (서버에서 계산해 넘겨받는다) */
export function AdminNav({ courseId, replyBadge }: { courseId: string; replyBadge: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav aria-label="담당자 메뉴" className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-3">
      {ITEMS.map((item) => {
        const href = `/admin/courses/${courseId}/${item.path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 shrink-0 items-center rounded-lg px-4 text-base font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-primary-soft font-semibold text-primary"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {item.label}
            {"hasBadge" in item && item.hasBadge ? replyBadge : null}
          </Link>
        );
      })}
    </nav>
  );
}
