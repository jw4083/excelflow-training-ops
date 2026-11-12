// 담당자가 "어느 과정"을 다루는지 정하고 그 과정의 저장소를 여는 곳 (여러 과정 운영).
// 모든 담당자 화면·서버 액션은 과정 번호를 받아 여기서 저장소를 연다. 열린 저장소는 그 과정의 데이터만 볼 수 있어서 과정끼리 섞이지 않는다.
// 과정 번호는 주소·양식에서 오는 "믿을 수 없는 값"이라, 형식과 존재를 매번 확인한다.
import { cache } from "react";
import { notFound } from "next/navigation";
import type { DbData } from "@/domain/types";
import { getCatalog, type CourseEntry, type Store } from "@/store";
import { requireAdmin } from "@/lib/auth";

export const COURSE_NOT_FOUND = "과정을 찾을 수 없습니다. 과정 목록에서 다시 선택해 주세요.";

/** 담당자 화면 주소의 기준: 과정 하나의 화면들은 모두 이 아래에 있다 */
export const courseBase = (courseId: string) => `/admin/courses/${courseId}`;

/**
 * 한 번의 화면 요청 안에서 같은 과정을 "열기 + 전체 읽기"를 한 번만 하게 한다 (React cache는 요청마다 따로 비워진다).
 * 제목줄·배너·메뉴 배지·페이지가 같은 과정을 각자 읽으면 DB를 여러 번 순서대로 부르게 되어 느려진다.
 * 화면을 그리는 동안에만 쓴다: 서버 액션(값을 바꾸는 곳)은 아래 openAdminCourseById·FromForm으로 매번 새로 연다.
 */
export const loadCourseForRender = cache(async (courseId: string): Promise<{ store: Store; data: DbData } | null> => {
  const store = await getCatalog().openCourse(courseId);
  if (!store) return null;
  return { store, data: await store.readAll() };
});

/** 한 번의 화면 요청 안에서 모든 과정 목록(알림 종·과정 목록 화면이 함께 쓴다)을 한 번만 읽는다 */
export const listCoursesForRender = cache((): Promise<CourseEntry[]> => getCatalog().listCourses());

/**
 * 담당자 화면(서버 컴포넌트)용: 로그인 확인 → 과정 저장소 열기. 없는 과정이면 "찾을 수 없음" 화면.
 * 돌려주는 저장소의 읽기는 같은 요청 안에서 이미 읽은 내용을 다시 쓴다 (쓰기·transaction은 그대로 진짜 저장소로 간다).
 */
export async function openAdminCourse(courseId: string): Promise<Store> {
  await requireAdmin();
  const loaded = await loadCourseForRender(courseId);
  if (!loaded) notFound();
  const { store, data } = loaded;
  return Object.assign(Object.create(store) as Store, { readAll: async () => data });
}

/** 서버 액션용: 로그인 확인 → 양식의 courseId로 과정 저장소 열기. 없으면 null (호출한 쪽이 오류 문구를 돌려준다) */
export async function openAdminCourseFromForm(formData: FormData): Promise<Store | null> {
  await requireAdmin(); // proxy와 별개로 서버 액션 안에서도 로그인을 확인한다 (Next.js 문서 권장)
  const id = formData.get("courseId");
  return typeof id === "string" ? getCatalog().openCourse(id) : null;
}

/** 서버 액션용(번호를 직접 받는 경우) */
export async function openAdminCourseById(courseId: string): Promise<Store | null> {
  await requireAdmin();
  return getCatalog().openCourse(courseId);
}
