// 작업 3 확인용 검사: 데이터 모양 정의가 PRD·DESIGN과 맞는지 본다.
// (모양이 틀리면 `npx tsc --noEmit`에서 오류가 나고, 상수 값은 여기서 검사한다.)
import { describe, expect, it } from "vitest";
import {
  ABSENT_TYPES,
  EMP_NO_PATTERN,
  HISTORY_KINDS,
  SELECTED_VIA,
  STATUSES,
  type Course,
  type DbData,
  type DrawRecord,
  type History,
  type Reply,
  type SelectionRecord,
  type Trainee,
} from "@/domain/types";

describe("작업 3: 데이터 모양 정의", () => {
  it("상태는 PRD M1-8의 6종이다", () => {
    expect([...STATUSES]).toEqual(["신청", "선정", "대기", "미선정", "불참", "제외"]);
  });

  it("'선정'이 된 경로는 4가지다", () => {
    expect([...SELECTED_VIA]).toEqual(["선별", "추첨", "충원", "수기"]);
  });

  it("변경 이력 종류는 9종이고 DESIGN 3.1과 같다", () => {
    expect([...HISTORY_KINDS]).toEqual([
      "추첨",
      "선정",
      "선별취소",
      "불참",
      "제외",
      "충원",
      "수기추가",
      "회신",
      "회신대리입력",
    ]);
  });

  it("불참 사유 구분은 업무/기타 두 가지다", () => {
    expect([...ABSENT_TYPES]).toEqual(["업무", "기타"]);
  });

  it("사번 규칙: 숫자 6자리 텍스트만 통과, 앞자리 0 유지", () => {
    expect(EMP_NO_PATTERN.test("001234")).toBe(true);
    expect(EMP_NO_PATTERN.test("123456")).toBe(true);
    for (const bad of ["1234", "12345", "1234567", "12A456", "", " 12345", "12.456"]) {
      expect(EMP_NO_PATTERN.test(bad)).toBe(false);
    }
  });

  it("모든 항목이 한 데이터 안에 들어간다 (타입 검사용 예시)", () => {
    const course: Course = {
      name: "테스트 과정",
      startDate: "2026-12-01",
      endDate: "2026-12-03",
      place: "테스트 교육장",
      notice: "안내문",
      replyDeadline: "2026-11-20T18:00:00+09:00",
      capacity: 20,
      updatedAt: "2026-11-12T09:00:00+09:00",
    };
    const trainee: Trainee = {
      id: "t1",
      empNo: "001234",
      name: "김테스트01",
      dept: "인재개발부",
      status: "선정",
      isManual: false,
      selectedVia: "충원",
      replyDeadline: "2026-11-25T18:00:00+09:00", // 개별 회신 기한
      loginFails: 0,
      createdAt: "2026-11-12T09:00:00+09:00",
      updatedAt: "2026-11-12T09:00:00+09:00",
    };
    const selection: SelectionRecord = {
      id: "s1",
      at: "2026-11-12T09:30:00+09:00",
      kind: "선별",
      traineeIds: ["t1"],
    };
    const draw: DrawRecord = {
      id: "d1",
      executedAt: "2026-11-12T10:00:00+09:00",
      seats: 20,
      waitSeats: 5,
      selected: ["t1"],
      waitlist: [],
      rejected: [],
    };
    const reply: Reply = {
      traineeId: "t1",
      attend: false,
      absentType: "업무",
      absentDetail: "업무 일정으로 참석이 어렵습니다",
      laptop: false,
      submittedAt: "2026-11-13T09:00:00+09:00",
      byAdmin: false,
    };
    const history: History = {
      id: "h1",
      at: "2026-11-13T09:00:00+09:00",
      kind: "불참",
      traineeId: "t1",
      before: { status: "선정" },
      after: { status: "불참" },
    };
    const db: DbData = {
      course,
      trainees: [trainee],
      selections: [selection],
      draws: [draw],
      replies: [reply],
      history: [history],
    };

    expect(db.trainees[0].empNo).toBe("001234");
    expect(db.course).not.toBeNull();
  });
});
