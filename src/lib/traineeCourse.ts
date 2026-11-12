// 교육생이 "어느 과정"을 보는지 정하는 곳. 교육생 화면·서버 액션은 모두 여기를 거쳐, 본인이 등록된 과정만 열 수 있다.
//  - 본인 사번(로그인 쿠키)이 그 과정(보관되지 않은 과정)에 등록돼 있을 때만 돌려준다.
//  - 과정 번호 형식이 틀리거나, 없는 과정이거나, 보관된 과정이거나, 내가 등록되지 않은 과정이면 모두 똑같이 null이다.
//    (어느 경우인지 구별해 알려 주면 "그런 과정이 있다"는 사실이 새기 때문이다)
import { isCourseId } from "@/store/courseId";
import type { Catalog, Enrollment } from "@/store";

export async function findMyEnrollment(catalog: Catalog, empNo: string, courseId: string): Promise<Enrollment | null> {
  if (!isCourseId(courseId)) return null;
  return (await catalog.findEnrollments(empNo)).find((e) => e.courseId === courseId) ?? null;
}
