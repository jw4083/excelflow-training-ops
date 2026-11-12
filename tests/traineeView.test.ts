// 작업 17 확인용 검사: 교육생 화면의 상태 안내 문구, 회신 기한, 날짜 표기를 본다 (PRD M2-1·M2-5·M2-7).
import { describe, expect, it } from "vitest";
import {
  describeMyStatus,
  hasReplySection,
  lastUpdatedText,
  remainingLabel,
  replyDeadlineFor,
} from "@/domain/traineeView";
import { STATUSES } from "@/domain/types";
import { formatDateKo, formatPeriodKo } from "@/lib/datetime";

describe("작업 17: 내 상태를 쉬운 말로", () => {
  it("상태 6종 모두 제목과 풀이가 있다", () => {
    for (const status of STATUSES) {
      const m = describeMyStatus({ status, waitNo: undefined, replacedBy: undefined });
      expect(m.title.length).toBeGreaterThan(3);
      expect(m.detail.length).toBeGreaterThan(8);
    }
  });

  it('"신청"은 "신청이 접수되었습니다"와 기다려 달라는 안내다 (DESIGN 2.3)', () => {
    const m = describeMyStatus({ status: "신청" });
    expect(m.title).toBe("신청이 접수되었습니다");
    expect(m.detail).toContain("선정 결과를 기다려 주세요");
  });

  it("선정이면 회신하라고 안내한다", () => {
    const m = describeMyStatus({ status: "선정" });
    expect(m).toMatchObject({ tone: "good", title: "교육 대상자로 선정되었습니다" });
    expect(m.detail).toContain("회신");
  });

  it("대기는 본인의 대기 순번만 알려 준다", () => {
    expect(describeMyStatus({ status: "대기", waitNo: 3 }).title).toBe("대기 3번입니다");
    expect(describeMyStatus({ status: "대기" }).title).toBe("대기자로 등록되었습니다"); // 순번이 없어도 깨지지 않음
  });

  it("미선정·제외는 담당자에게 문의하라고 안내한다", () => {
    for (const status of ["미선정", "제외"] as const) expect(describeMyStatus({ status }).detail).toContain("담당자");
  });

  it("불참: 충원 전이면 다시 회신할 수 있다고, 충원이 확정됐으면 참석으로 바꿀 수 없다고 안내한다 (PRD M2-7)", () => {
    const open = describeMyStatus({ status: "불참" });
    expect(open.detail).toContain("다시 회신");
    const filled = describeMyStatus({ status: "불참", replacedBy: "someone" });
    expect(filled.title).toContain("충원");
    expect(filled.detail).toContain("참석으로 바꿀 수 없습니다");
    expect(filled.detail).toContain("담당자에게 문의");
  });

  it("충원된 사람이 누구인지는 어떤 문구에도 나오지 않는다", () => {
    const m = describeMyStatus({ status: "불참", replacedBy: "p-secret-id-123" });
    expect(JSON.stringify(m)).not.toContain("p-secret-id-123");
  });

  it("문구는 조사가 맞는 문장이다", () => {
    for (const status of STATUSES) {
      const m = describeMyStatus({ status, waitNo: 2, replacedBy: "x" });
      expect(`${m.title} ${m.detail}`).not.toContain("(를)");
      expect(`${m.title} ${m.detail}`).not.toContain("(은)");
    }
  });

  it("회신 영역은 선정·불참 상태에서만 보인다", () => {
    expect(STATUSES.filter(hasReplySection)).toEqual(["선정", "불참"]);
  });
});

describe("작업 17: 회신 기한 (본인 기한 → 과정 기한)", () => {
  const NOW = "2026-11-15T12:00:00+09:00";
  const course = { replyDeadline: "2026-11-20T18:00:00+09:00" };

  it("개별 기한이 없으면 과정 기한을 보여 준다", () => {
    expect(replyDeadlineFor({ replyDeadline: undefined }, course, NOW)).toEqual({
      iso: "2026-11-20T18:00:00+09:00",
      text: "2026-11-20 18:00",
      passed: false,
      personal: false,
      remaining: "5일 6시간 남음", // 11월 15일 12시 → 11월 20일 18시
    });
  });

  it("남은 시간을 쉬운 말로 알려 준다 (일+시간 / 시간 / 분, 지나면 안내)", () => {
    const at = (now: string) => remainingLabel("2026-11-20T18:00:00+09:00", now);
    expect(at("2026-11-17T18:00:00+09:00")).toBe("3일 남음");
    expect(at("2026-11-17T15:30:00+09:00")).toBe("3일 2시간 남음");
    expect(at("2026-11-20T08:00:00+09:00")).toBe("10시간 남음");
    expect(at("2026-11-20T17:20:00+09:00")).toBe("40분 남음");
    expect(at("2026-11-20T17:59:30+09:00")).toBe("1분 남음"); // 1분 미만도 0분이라 하지 않는다
    expect(at("2026-11-20T18:00:00+09:00")).toBe("1분 남음"); // 정확히 기한 시각까지는 아직 유효
    expect(at("2026-11-20T18:00:01+09:00")).toBe("기한이 지났습니다");
  });

  it("개별 기한이 있으면 과정 기한보다 우선한다", () => {
    const d = replyDeadlineFor({ replyDeadline: "2026-11-25T09:30:00+09:00" }, course, NOW);
    expect(d).toMatchObject({ text: "2026-11-25 09:30", personal: true, passed: false });
  });

  it("기한이 지났는지 알려 준다 (정확히 기한 시각까지는 아직 유효)", () => {
    expect(replyDeadlineFor({}, course, "2026-11-20T18:00:00+09:00")?.passed).toBe(false);
    expect(replyDeadlineFor({}, course, "2026-11-20T18:00:01+09:00")?.passed).toBe(true);
  });

  it("개별 기한이 과정 기한이 지난 뒤여도 아직 유효하다 (충원된 사람)", () => {
    const late = replyDeadlineFor({ replyDeadline: "2026-11-30T18:00:00+09:00" }, course, "2026-11-25T12:00:00+09:00");
    expect(late?.passed).toBe(false);
    expect(replyDeadlineFor({}, course, "2026-11-25T12:00:00+09:00")?.passed).toBe(true);
  });

  it("다른 시간대 표기로 저장돼 있어도 한국 시간으로 보여 준다", () => {
    expect(replyDeadlineFor({ replyDeadline: "2026-11-20T09:00:00Z" }, null, NOW)?.text).toBe("2026-11-20 18:00");
  });

  it("과정 정보가 없고 개별 기한도 없으면 기한을 알 수 없다 (null)", () => {
    expect(replyDeadlineFor({}, null, NOW)).toBeNull();
  });
});

describe("작업 17: 최종 수정 일시와 날짜 표기", () => {
  it("최종 수정 일시는 한국 시간으로, 과정이 없으면 null이다", () => {
    expect(lastUpdatedText({ updatedAt: "2026-11-12T01:46:24.829Z" })).toBe("2026-11-12 10:46");
    expect(lastUpdatedText(null)).toBeNull();
  });

  it("날짜는 요일과 함께 읽기 쉽게 보여 준다", () => {
    expect(formatDateKo("2026-12-01")).toBe("2026년 12월 1일(화)");
    expect(formatDateKo("2026-12-03")).toBe("2026년 12월 3일(목)");
    expect(formatDateKo("2026-11-15")).toBe("2026년 11월 15일(일)");
  });

  it("교육 기간은 하루면 한 날짜만, 여러 날이면 시작 ~ 종료로 보여 준다", () => {
    expect(formatPeriodKo("2026-12-01", "2026-12-01")).toBe("2026년 12월 1일(화)");
    expect(formatPeriodKo("2026-12-01", "2026-12-03")).toBe("2026년 12월 1일(화) ~ 2026년 12월 3일(목)");
  });

  it("잘못된 날짜는 깨지지 않고 받은 값을 그대로 보여 준다", () => {
    expect(formatDateKo("2026-02-31")).toBe("2026-02-31");
    expect(formatDateKo("아무거나")).toBe("아무거나");
  });
});
