// 새 과정 만들기: 과정 정보 양식(과정명·일정·장소·안내문·회신 기한 등)을 채우면 비어 있는 새 과정이 만들어지고, 그 과정의 명단 화면으로 이동한다.
import Link from "next/link";
import { Suspense } from "react";
import { createCourseAction } from "@/app/actions/course";
import { EMPTY_COURSE_FORM } from "@/domain/course";
import { requireAdmin } from "@/lib/auth";
import { CourseForm } from "../[courseId]/course/course-form";

export default function NewCoursePage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <NewCourse />
    </Suspense>
  );
}

async function NewCourse() {
  await requireAdmin();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">새 과정 만들기</h1>
        <Link href="/admin" className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-4 text-base font-medium hover:bg-zinc-100">
          ← 과정 목록
        </Link>
      </div>
      <CourseForm initial={{ values: EMPTY_COURSE_FORM, updatedAtText: null }} action={createCourseAction} submitLabel="과정 만들기" />
    </main>
  );
}
