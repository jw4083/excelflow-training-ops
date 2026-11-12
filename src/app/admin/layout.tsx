// 담당자 화면 공통 틀 (PLAN 작업 8, DESIGN 2.2): 맨 위 제목줄과 자동 새로고침. 과정별 틀(메뉴·충원 배너·과정 제목줄)은 courses/[courseId]/layout.tsx.
// ⚠ 레이아웃은 화면을 옮겨 다닐 때 다시 그려지지 않으므로 로그인 확인은 여기서 하지 않는다.
//    proxy(1차)와 각 화면·서버 액션의 requireAdmin()(2차)이 확인한다.
import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AutoRefresh } from "@/components/admin/AutoRefresh";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader />
      <AutoRefresh />
      {children}
    </div>
  );
}
