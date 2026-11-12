// 작업 9 확인용 검사: 한국 시간 변환, 과정 정보 입력 검사, 최종 수정 일시 갱신 규칙을 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildCourse,
  courseToFormValues,
  EMPTY_COURSE_FORM,
  parseCourseForm,
  type CourseFormValues,
} from "@/domain/course";
import type { Course } from "@/domain/types";
import { formatKst, isoToKstLocal, isValidDate, kstLocalToIso } from "@/lib/datetime";
import { FileStore } from "@/store/fileStore";

const valid: CourseFormValues = {
  name: "테스트 과정",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  place: "테스트 교육장",
  notice: "첫째 줄\n둘째 줄",
  replyDeadline: "2026-11-20T18:00",
};
const T1 = "2026-11-12T09:00:00+09:00";
const T2 = "2026-11-13T10:30:00+09:00";

describe("작업 9: 한국 시간 변환", () => {
  it("입력(한국 시간)에 +09:00을 붙여 저장하고, 다시 한국 시간으로 읽는다", () => {
    expect(kstLocalToIso("2026-11-20T18:00")).toBe("2026-11-20T18:00:00+09:00");
    expect(isoToKstLocal("2026-11-20T18:00:00+09:00")).toBe("2026-11-20T18:00");
  });

  it("다른 시간대로 저장된 값도 한국 시간으로 바꿔 보여 준다 (UTC 09:00 = 한국 18:00)", () => {
    expect(isoToKstLocal("2026-11-20T09:00:00Z")).toBe("2026-11-20T18:00");
    expect(formatKst("2026-11-20T09:00:00Z")).toBe("2026-11-20 18:00");
    expect(isoToKstLocal("2026-11-20T20:00:00Z")).toBe("2026-11-21T05:00"); // 날짜가 넘어가는 경우
  });

  it("없는 날짜·시각이나 잘못된 형식은 거부한다", () => {
    for (const bad of ["2026-02-31T10:00", "2026-11-20T25:00", "2026-11-20 18:00", "2026-11-20", "", "abc"]) {
      expect(kstLocalToIso(bad)).toBeNull();
    }
    expect(isValidDate("2026-12-01")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false); // 2026년은 윤년이 아님
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("26-12-01")).toBe(false);
  });
});

describe("작업 9: 과정 정보 입력 검사", () => {
  it("올바른 입력은 통과하고 앞뒤 공백은 제거된다", () => {
    const r = parseCourseForm({ ...valid, name: "  테스트 과정  ", place: " 교육장 " });
    expect(r).toMatchObject({ ok: true, values: { name: "테스트 과정", place: "교육장" } });
  });

  it("빈 양식은 필수 칸마다 오류가 나오고, 안내문은 비워도 된다", () => {
    const r = parseCourseForm({ ...EMPTY_COURSE_FORM });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["endDate", "name", "place", "replyDeadline", "startDate"]);
      expect(r.errors.notice).toBeUndefined();
    }
    expect(parseCourseForm({ ...valid, notice: "" }).ok).toBe(true);
  });

  it("안내문의 줄바꿈(\\r\\n, \\r)은 \\n으로 통일되어 저장된다 (브라우저는 \\r\\n으로 보냄)", () => {
    const r = parseCourseForm({ ...valid, notice: "첫째\r\n둘째\r셋째\n넷째" });
    expect(r).toMatchObject({ ok: true, values: { notice: "첫째\n둘째\n셋째\n넷째" } });
    // 줄바꿈이 두 글자로 세어져 글자 수 제한을 잘못 넘기지 않는다
    const lines = Array.from({ length: 2500 }, () => "가").join("\r\n"); // 2,500글자 + 줄바꿈 2,499개 = 4,999자
    expect(parseCourseForm({ ...valid, notice: lines }).ok).toBe(true);
  });

  it("오류 문구는 받침과 상관없이 조사가 맞는 문장이다 (예: '장소 칸을', '시작일 칸을')", () => {
    const r = parseCourseForm({ ...EMPTY_COURSE_FORM });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({
        name: "과정명 칸을 입력해 주세요.",
        startDate: "시작일 칸을 입력해 주세요.",
        endDate: "종료일 칸을 입력해 주세요.",
        place: "장소 칸을 입력해 주세요.",
        replyDeadline: "회신 기한 칸을 입력해 주세요.",
      });
      for (const message of Object.values(r.errors)) expect(message).not.toContain("(를)");
    }
  });

  it("종료일이 시작일보다 빠르면 종료일 칸에 오류가 나온다 (같은 날은 가능)", () => {
    const r = parseCourseForm({ ...valid, startDate: "2026-12-05", endDate: "2026-12-03" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.endDate).toContain("시작일");
    expect(parseCourseForm({ ...valid, startDate: "2026-12-03", endDate: "2026-12-03" }).ok).toBe(true);
  });

  it("없는 날짜(2월 31일)와 잘못된 회신 기한을 거부한다", () => {
    const a = parseCourseForm({ ...valid, startDate: "2026-02-31" });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors.startDate).toBe("시작일 칸의 날짜가 올바르지 않습니다.");
    const b = parseCourseForm({ ...valid, replyDeadline: "2026-11-20 18:00" });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors.replyDeadline).toBe("회신 기한 칸의 날짜·시각이 올바르지 않습니다.");
  });

  it("글자 수 제한: 과정명 100자, 안내문 5,000자", () => {
    expect(parseCourseForm({ ...valid, name: "가".repeat(100) }).ok).toBe(true);
    expect(parseCourseForm({ ...valid, name: "가".repeat(101) }).ok).toBe(false);
    expect(parseCourseForm({ ...valid, notice: "가".repeat(5000) }).ok).toBe(true);
    expect(parseCourseForm({ ...valid, notice: "가".repeat(5001) }).ok).toBe(false);
  });
});

describe("작업 9: 저장할 과정 만들기 (최종 수정 일시)", () => {
  it("처음 저장하면 새 과정이 만들어지고 최종 수정 일시가 기록된다", () => {
    const { course, changed } = buildCourse(valid, null, T1);
    expect(changed).toBe(true);
    expect(course).toMatchObject({ name: "테스트 과정", replyDeadline: "2026-11-20T18:00:00+09:00", updatedAt: T1 });
    expect(course.capacity).toBeUndefined();
  });

  it("내용이 그대로면 변경 없음으로 보고 최종 수정 일시를 갱신하지 않는다", () => {
    const first = buildCourse(valid, null, T1).course;
    const again = buildCourse(valid, first, T2);
    expect(again.changed).toBe(false);
    expect(again.course.updatedAt).toBe(T1);
  });

  it("한 칸이라도 바뀌면 최종 수정 일시가 새로 기록된다", () => {
    const first = buildCourse(valid, null, T1).course;
    for (const patch of [
      { name: "다른 이름" },
      { startDate: "2026-12-02" },
      { endDate: "2026-12-04" },
      { place: "다른 장소" },
      { notice: "고친 안내문" },
      { replyDeadline: "2026-11-21T18:00" },
    ]) {
      const r = buildCourse({ ...valid, ...patch }, first, T2);
      expect(r.changed).toBe(true);
      expect(r.course.updatedAt).toBe(T2);
    }
  });

  it("같은 순간을 다른 표기(UTC)로 저장해 둔 기한은 변경으로 보지 않는다", () => {
    const stored: Course = { ...buildCourse(valid, null, T1).course, replyDeadline: "2026-11-20T09:00:00Z" };
    expect(buildCourse(valid, stored, T2).changed).toBe(false);
  });

  it("정원(capacity)은 과정 정보를 수정해도 그대로 남는다", () => {
    const first = { ...buildCourse(valid, null, T1).course, capacity: 20 };
    const edited = buildCourse({ ...valid, place: "다른 장소" }, first, T2);
    expect(edited.course.capacity).toBe(20);
  });

  it("저장된 과정은 입력 양식 값으로 되돌려 보여 줄 수 있다 (한국 시간)", () => {
    const { course } = buildCourse(valid, null, T1);
    expect(courseToFormValues(course)).toEqual(valid);
    expect(courseToFormValues(null)).toEqual(EMPTY_COURSE_FORM);
  });

  it("검사를 거치지 않은 잘못된 기한으로는 만들 수 없다", () => {
    expect(() => buildCourse({ ...valid, replyDeadline: "잘못" }, null, T1)).toThrow();
  });
});

describe("작업 9: 저장소에 저장하고 다시 읽기", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "course-test-"));
    store = new FileStore(path.join(dir, "db.json"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("저장한 과정이 파일에 남고, 새 저장소로 열어도 같은 입력 양식이 나온다", async () => {
    await store.commit({ course: buildCourse(valid, null, T1).course });
    const reopened = new FileStore(path.join(dir, "db.json"));
    expect(courseToFormValues(await reopened.getCourse())).toEqual(valid);
    expect((await reopened.getCourse())?.updatedAt).toBe(T1);
  });
});
