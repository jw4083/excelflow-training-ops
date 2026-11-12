// 담당자 화면 공통 틀이 쓰는 요약 정보 (과정 이름, 충원 알림 건수, 보관 여부) — 과정 하나 기준.
// React의 cache()로 감싸서, 한 번의 요청 안에서 배너·메뉴 배지·과정 제목줄이 저장소를 여러 번 읽지 않고 같은 결과를 쓰게 한다.
import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { vacancyAlert, type VacancyAlert } from "@/domain/alerts";
import { loadCourseForRender } from "@/lib/adminCourse";

export interface AdminSummary {
  courseName: string | null; // 과정 정보를 아직 입력하지 않았으면 null
  archived: boolean; // 보관된 과정인가 (조회만 가능)
  alert: VacancyAlert;
}

/**
 * 이 함수를 부르는 화면은 `<Suspense>` 안에 있어야 한다 (Cache Components 규칙:
 * 저장소는 요청이 들어온 뒤에 읽는 "요청 시점 데이터"이므로 `connection()`을 먼저 부른다).
 * 과정 번호는 주소에서 온 값이라 매번 형식·존재를 확인하고, 없으면 "찾을 수 없음" 화면으로 보낸다.
 */
export const getAdminSummary = cache(async (courseId: string): Promise<AdminSummary> => {
  await connection();
  const loaded = await loadCourseForRender(courseId); // 페이지·배너·제목줄이 같은 요청 안에서 한 번만 읽는다
  if (!loaded) notFound();
  const { data } = loaded;
  return { courseName: data.course?.name ?? null, archived: Boolean(data.archivedAt), alert: vacancyAlert(data.trainees) };
});
