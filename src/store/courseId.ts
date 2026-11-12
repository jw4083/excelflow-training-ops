// 과정 번호 형식 검사. 번호는 파일 이름·DB 조건으로 쓰이므로, 형식이 맞지 않는 값은 저장소에 닿기 전에 걸러낸다(경로 조작 방지).
import { randomUUID } from "node:crypto";

const COURSE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isCourseId(value: unknown): value is string {
  return typeof value === "string" && COURSE_ID.test(value);
}

export function newCourseId(): string {
  return randomUUID();
}
