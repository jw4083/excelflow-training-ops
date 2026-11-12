// 과정 하나의 담당자 틀: 과정 제목줄(과정 목록으로 돌아가기·과정 이름·보관), 충원 알림 배너, 왼쪽(휴대폰에서는 위쪽) 메뉴, 각 화면 내용.
// 레이아웃에서 params를 맨 위에서 기다리면 미리 그려지지 않으므로, params 약속(Promise)을 아래 컴포넌트에 넘겨 거기서 기다린다 (Next.js 문서).
import { Suspense, type ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { CourseBar } from "@/components/admin/CourseBar";
import { ReplyBadge } from "@/components/admin/ReplyBadge";
import { VacancyBanner } from "@/components/admin/VacancyBanner";

type Params = Promise<{ courseId: string }>;

export default function CourseLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600">불러오는 중…</p>}>
      <CourseFrame params={params}>{children}</CourseFrame>
    </Suspense>
  );
}

async function CourseFrame({ params, children }: { params: Params; children: ReactNode }) {
  const { courseId } = await params;
  return (
    <div className="flex flex-1 flex-col">
      <CourseBar courseId={courseId} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
        <aside className="border-b border-zinc-200 md:w-52 md:shrink-0 md:border-r md:border-b-0 dark:border-zinc-800">
          <AdminNav
            courseId={courseId}
            replyBadge={
              <Suspense fallback={null}>
                <ReplyBadge courseId={courseId} />
              </Suspense>
            }
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={null}>
            <VacancyBanner courseId={courseId} />
          </Suspense>
          {children}
        </div>
      </div>
    </div>
  );
}
