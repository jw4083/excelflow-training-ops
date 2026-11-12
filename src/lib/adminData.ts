// 담당자 화면 공통 틀이 쓰는 요약 정보 (과정 이름, 충원 알림 건수).
// React의 cache()로 감싸서, 한 번의 요청 안에서 배너·메뉴 배지·제목줄이 저장소를 여러 번 읽지 않고 같은 결과를 쓰게 한다.
import { cache } from "react";
import { connection } from "next/server";
import { vacancyAlert, type VacancyAlert } from "@/domain/alerts";
import { getStore } from "@/store";

export interface AdminSummary {
  courseName: string | null; // 과정 정보를 아직 입력하지 않았으면 null
  alert: VacancyAlert;
}

/**
 * 이 함수를 부르는 화면은 `<Suspense>` 안에 있어야 한다 (Cache Components 규칙:
 * 저장소는 요청이 들어온 뒤에 읽는 "요청 시점 데이터"이므로 `connection()`을 먼저 부른다).
 */
export const getAdminSummary = cache(async (): Promise<AdminSummary> => {
  await connection();
  const data = await getStore().readAll();
  return { courseName: data.course?.name ?? null, alert: vacancyAlert(data.trainees) };
});
