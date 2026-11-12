// 과정 정보 화면 (PLAN 작업 9, DESIGN 2.3): 과정은 1개뿐이며, 아직 없으면 빈 입력 양식으로 시작한다.
import { Suspense } from "react";
import { connection } from "next/server";
import { courseToFormValues } from "@/domain/course";
import { requireAdmin } from "@/lib/auth";
import { formatKst } from "@/lib/datetime";
import { getStore } from "@/store";
import { CourseForm } from "./course-form";

export default function CoursePage() {
  // 로그인 확인과 저장소 읽기는 요청이 들어온 뒤에 하는 일이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <CourseContent />
    </Suspense>
  );
}

async function CourseContent() {
  await requireAdmin();
  await connection();
  const course = await getStore().getCourse();

  return (
    <main className="flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">과정 정보</h1>
      <CourseForm
        initial={{
          values: courseToFormValues(course),
          updatedAtText: course ? formatKst(course.updatedAt) : null,
        }}
      />
    </main>
  );
}
