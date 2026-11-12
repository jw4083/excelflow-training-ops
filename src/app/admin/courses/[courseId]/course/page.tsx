// 과정 정보 화면 (PLAN 작업 9, DESIGN 2.3): 과정마다 정보를 하나씩 가진다.
import { Suspense } from "react";
import { connection } from "next/server";
import { courseToFormValues } from "@/domain/course";
import { openAdminCourse } from "@/lib/adminCourse";
import { formatKst } from "@/lib/datetime";
import { CourseForm } from "./course-form";

type Params = Promise<{ courseId: string }>;

export default function CoursePage({ params }: { params: Params }) {
  // 로그인 확인과 저장소 읽기는 요청이 들어온 뒤에 하는 일이므로 Suspense 안에 둔다 (Cache Components 규칙)
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <CourseContent params={params} />
    </Suspense>
  );
}

async function CourseContent({ params }: { params: Params }) {
  const { courseId } = await params;
  const store = await openAdminCourse(courseId);
  await connection();
  const course = await store.getCourse();

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
