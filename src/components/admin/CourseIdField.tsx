"use client";
// 담당자 화면의 모든 입력 양식에 넣는 숨은 칸: 지금 보고 있는 과정 번호(주소의 [courseId])를 서버 액션에 함께 보낸다.
// 서버 액션은 이 값을 믿지 않고 형식·존재를 다시 확인한 뒤 그 과정의 저장소만 연다.
import { useParams } from "next/navigation";

export function CourseIdField() {
  const { courseId } = useParams<{ courseId: string }>();
  return <input type="hidden" name="courseId" value={courseId} />;
}
