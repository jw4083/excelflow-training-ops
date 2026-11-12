// 담당자 화면 공통 틀 (PLAN 작업 8, DESIGN 2.2).
// 맨 위 제목줄, 그 아래 충원 알림 배너, 왼쪽(휴대폰에서는 위쪽) 메뉴, 그리고 각 화면 내용.
// ⚠ 레이아웃은 화면을 옮겨 다닐 때 다시 그려지지 않으므로 로그인 확인은 여기서 하지 않는다.
//    proxy(1차)와 각 화면·서버 액션의 requireAdmin()(2차)이 확인한다.
import { Suspense, type ReactNode } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { AdminNav } from "@/components/admin/AdminNav";
import { ReplyBadge } from "@/components/admin/ReplyBadge";
import { VacancyBanner } from "@/components/admin/VacancyBanner";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader />
      <AutoRefresh />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
        <aside className="border-b border-zinc-200 md:w-52 md:shrink-0 md:border-r md:border-b-0 dark:border-zinc-800">
          <AdminNav
            replyBadge={
              <Suspense fallback={null}>
                <ReplyBadge />
              </Suspense>
            }
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={null}>
            <VacancyBanner />
          </Suspense>
          {children}
        </div>
      </div>
    </div>
  );
}
