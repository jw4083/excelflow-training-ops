// 작업 11 확인용 검사: 정원·빈자리 계산(PRD M1-10)과 명단 보기 규칙(상태별 걸러 보기, 정렬, 쪽 나누기)을 본다.
import { describe, expect, it } from "vitest";
import { capacitySummary, seatsToDraw } from "@/domain/capacity";
import {
  PAGE_SIZE,
  ROSTER_FILTERS,
  countByStatus,
  paginate,
  parseFilter,
  parsePage,
  replyLabel,
  visibleTrainees,
} from "@/domain/roster";
import type { Status } from "@/domain/types";

const t = (status: Status, empNo = "100001", waitNo?: number) => ({ status, empNo, waitNo });
const many = (status: Status, n: number) => Array.from({ length: n }, () => t(status));

describe("작업 11: 정원·현재 선정·빈자리 (DESIGN 4.2-1)", () => {
  it("정원 20, 선정 18이면 빈자리는 2다", () => {
    expect(capacitySummary(20, many("선정", 18))).toEqual({ capacity: 20, selected: 18, vacancies: 2, over: 0 });
  });

  it("현재 선정 수에는 '선정' 상태만 들어간다 (불참·제외·대기·미선정·신청은 세지 않음)", () => {
    const all = [...many("선정", 3), ...many("불참", 2), ...many("제외", 2), ...many("대기", 4), ...many("미선정", 5), ...many("신청", 6)];
    expect(capacitySummary(10, all)).toMatchObject({ selected: 3, vacancies: 7 });
  });

  it("정원이 찬 경우 빈자리는 0이고, 정원을 넘으면 넘친 인원을 따로 센다", () => {
    expect(capacitySummary(20, many("선정", 20))).toMatchObject({ vacancies: 0, over: 0 });
    expect(capacitySummary(20, many("선정", 21))).toMatchObject({ vacancies: 0, over: 1 });
    expect(capacitySummary(20, many("선정", 25))).toMatchObject({ selected: 25, vacancies: 0, over: 5 });
  });

  it("추첨 전에는 정원이 없어서 빈자리도 계산하지 않는다", () => {
    expect(capacitySummary(undefined, many("선정", 3))).toEqual({ capacity: null, selected: 3, vacancies: null, over: 0 });
    expect(capacitySummary(null, [])).toEqual({ capacity: null, selected: 0, vacancies: null, over: 0 });
  });

  it("추첨으로 뽑을 인원 = 정원 − 현재 선정 수, 0 이하면 0 (정원 20·선별 8 → 12 / 정원 8·선별 8 → 0)", () => {
    expect(seatsToDraw(20, many("선정", 8))).toBe(12);
    expect(seatsToDraw(8, many("선정", 8))).toBe(0);
    expect(seatsToDraw(5, many("선정", 8))).toBe(0); // 이미 넘음
  });
});

describe("작업 11: 상태 탭", () => {
  it("탭은 '전체'와 상태 5종 + '선정 취소·충원 완료'이다", () => {
    expect([...ROSTER_FILTERS]).toEqual(["전체", "신청", "선정", "대기", "미선정", "불참", "선정 취소·충원 완료"]);
  });

  it("탭마다 인원 수가 맞고, 전체는 모든 상태의 합이다", () => {
    const counts = countByStatus([...many("신청", 5), ...many("선정", 3), ...many("대기", 2), ...many("불참", 1)]);
    expect(counts).toEqual({ 전체: 11, 신청: 5, 선정: 3, 대기: 2, 미선정: 0, 불참: 1, "선정 취소·충원 완료": 0 });
  });

  it("주소의 값이 틀리면 '전체'로 본다", () => {
    expect(parseFilter("선정")).toBe("선정");
    expect(parseFilter(["대기", "선정"])).toBe("대기");
    for (const bad of [undefined, "", "없는상태", "<script>"]) expect(parseFilter(bad)).toBe("전체");
  });

  it("상태별로 걸러 보여 준다", () => {
    const list = [t("신청", "100003"), t("선정", "100001"), t("선정", "100002"), t("제외", "100004")];
    expect(visibleTrainees(list, "선정").map((x) => x.empNo)).toEqual(["100001", "100002"]);
    expect(visibleTrainees(list, "미선정")).toEqual([]);
    expect(visibleTrainees(list, "선정 취소·충원 완료").map((x) => x.empNo)).toEqual(["100004"]); // 저장된 상태 "제외"는 미선정과 따로 보인다
    expect(visibleTrainees(list, "전체")).toHaveLength(4);
  });

  it("사번 순으로 정렬하고, 앞자리 0 사번이 맨 앞에 온다", () => {
    const list = [t("신청", "100001"), t("신청", "001234"), t("신청", "000123"), t("신청", "098765")];
    expect(visibleTrainees(list, "전체").map((x) => x.empNo)).toEqual(["000123", "001234", "098765", "100001"]);
  });

  it("'대기' 탭은 대기 순번 순이다", () => {
    const list = [t("대기", "100001", 3), t("대기", "100002", 1), t("대기", "100003", 2)];
    expect(visibleTrainees(list, "대기").map((x) => x.waitNo)).toEqual([1, 2, 3]);
  });

  it("원본 목록의 순서는 바꾸지 않는다", () => {
    const list = [t("신청", "100002"), t("신청", "100001")];
    visibleTrainees(list, "전체");
    expect(list.map((x) => x.empNo)).toEqual(["100002", "100001"]);
  });
});

describe("작업 11: 쪽 나누기", () => {
  const items = Array.from({ length: 120 }, (_, i) => i + 1);

  it("한 쪽에 50명씩 보여 준다 (120명 → 3쪽)", () => {
    expect(PAGE_SIZE).toBe(50);
    const p1 = paginate(items, 1);
    expect(p1).toMatchObject({ page: 1, pageCount: 3, from: 1, to: 50, total: 120 });
    expect(paginate(items, 3)).toMatchObject({ page: 3, from: 101, to: 120 });
    expect(paginate(items, 3).items).toHaveLength(20);
  });

  it("범위를 벗어난 쪽은 가까운 쪽으로 맞춘다", () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
  });

  it("비어 있으면 1쪽이고 번호는 0이다", () => {
    expect(paginate([], 1)).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it("주소의 쪽 번호가 틀리면 1쪽이다", () => {
    expect(parsePage("2")).toBe(2);
    for (const bad of [undefined, "", "0", "-1", "1.5", "abc"]) expect(parsePage(bad)).toBe(1);
  });
});

describe("작업 11: 회신 여부 칸", () => {
  it("선정·불참 상태: 회신이 없으면 미회신, 있으면 참석/불참", () => {
    expect(replyLabel("선정", null)).toBe("미회신");
    expect(replyLabel("선정", { attend: true })).toBe("참석");
    expect(replyLabel("불참", { attend: false })).toBe("불참");
    expect(replyLabel("불참", undefined)).toBe("미회신");
  });

  it("회신 대상이 아닌 상태는 '-'다", () => {
    for (const s of ["신청", "대기", "미선정", "제외"] as const) expect(replyLabel(s, null)).toBe("-");
  });
});
