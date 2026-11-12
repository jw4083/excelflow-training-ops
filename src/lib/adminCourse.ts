// 담당자가 "어느 과정"을 다루는지 정하고 그 과정의 저장소를 여는 곳 (여러 과정 운영).
// 모든 담당자 화면·서버 액션은 과정 번호를 받아 여기서 저장소를 연다. 열린 저장소는 그 과정의 데이터만 볼 수 있어서 과정끼리 섞이지 않는다.
// 과정 번호는 주소·양식에서 오는 "믿을 수 없는 값"이라, 형식과 존재를 매번 확인한다.
import { notFound } from "next/navigation";
import { getCatalog, type Store } from "@/store";
import { requireAdmin } from "@/lib/auth";

export const COURSE_NOT_FOUND = "과정을 찾을 수 없습니다. 과정 목록에서 다시 선택해 주세요.";

/** 담당자 화면 주소의 기준: 과정 하나의 화면들은 모두 이 아래에 있다 */
export const courseBase = (courseId: string) => `/admin/courses/${courseId}`;

/** 담당자 화면(서버 컴포넌트)용: 로그인 확인 → 과정 저장소 열기. 없는 과정이면 "찾을 수 없음" 화면 */
export async function openAdminCourse(courseId: string): Promise<Store> {
  await requireAdmin();
  const store = await getCatalog().openCourse(courseId);
  if (!store) notFound();
  return store;
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
