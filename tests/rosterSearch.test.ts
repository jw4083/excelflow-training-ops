// 명단 검색 검사: 과정 전체 명단에서 이름·사번·부서로 찾고, 상태 탭과 함께 작동하는지 본다.
import { describe, expect, it } from "vitest";
import { countByStatus, parseQuery, searchTrainees, visibleTrainees } from "@/domain/roster";
import type { Status, Trainee } from "@/domain/types";

const t = (empNo: string, name: string, dept: string, status: Status = "신청"): Trainee => ({
  id: empNo,
  empNo,
  name,
  dept,
  status,
  isManual: false,
  createdAt: "2026-11-12T09:00:00+09:00",
  updatedAt: "2026-11-12T09:00:00+09:00",
});
const list = [
  t("100001", "김가람", "인재개발원"),
  t("100002", "이나래", "기획조정실", "선정"),
  t("100003", "박다솜", "인재 개발원", "선정"),
  t("012345", "최라온", "경영지원실", "대기"),
];

describe("명단 검색", () => {
  it("이름·사번·부서 어느 것으로든 찾고, 띄어쓰기·대소문자는 무시한다", () => {
    expect(searchTrainees(list, "나래").map((x) => x.empNo)).toEqual(["100002"]);
    expect(searchTrainees(list, "0123").map((x) => x.empNo)).toEqual(["012345"]); // 앞자리 0 사번
    expect(searchTrainees(list, "인재개발원").map((x) => x.empNo)).toEqual(["100001", "100003"]); // "인재 개발원"도 찾는다
    expect(searchTrainees(list, "  ")).toHaveLength(4);
    expect(searchTrainees(list, "없는사람")).toEqual([]);
  });

  it("상태 탭과 함께 쓰면 검색 결과 안에서 거르고, 탭 숫자도 검색 결과 기준이다", () => {
    const found = searchTrainees(list, "인재");
    expect(visibleTrainees(found, "선정").map((x) => x.empNo)).toEqual(["100003"]);
    expect(countByStatus(found)).toMatchObject({ 전체: 2, 신청: 1, 선정: 1, 대기: 0 });
  });

  it("주소의 검색어는 앞뒤 공백을 지우고 50자까지만 쓴다", () => {
    expect(parseQuery(undefined)).toBe("");
    expect(parseQuery("  김가람 ")).toBe("김가람");
    expect(parseQuery(["a", "b"])).toBe("a");
    expect(parseQuery("가".repeat(80))).toHaveLength(50);
  });
});
