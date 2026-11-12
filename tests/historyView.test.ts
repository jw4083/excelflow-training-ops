// 작업 14 확인용 검사: 변경 이력 화면의 보기 규칙(종류별 걸러 보기, 최신순, 읽기 쉬운 변환)을 본다.
import { describe, expect, it } from "vitest";
import {
  HISTORY_FILTERS,
  countByKind,
  describeChange,
  historyTarget,
  parseKindFilter,
  visibleHistory,
} from "@/domain/historyView";
import type { HistoryKind } from "@/domain/types";

const h = (kind: HistoryKind, at: string, tag = "") => ({ kind, at, tag });
const names: Record<string, string> = { a: "김테스트01(100001)", b: "이테스트02(100002)" };
const nameOf = (id: string) => names[id];

describe("작업 14: 종류 탭", () => {
  it("탭은 '전체'와 이력 종류 10종이다", () => {
    expect([...HISTORY_FILTERS]).toEqual(["전체", "추첨", "선정", "선별취소", "불참", "제외", "충원", "수기추가", "회신", "회신대리입력", "참석취소"]);
  });

  it("종류마다 건수가 맞고, 전체는 모든 종류의 합이다", () => {
    const counts = countByKind([h("추첨", "2026-11-12T09:00:00Z"), h("추첨", "2026-11-12T09:00:00Z"), h("선정", "2026-11-12T09:00:00Z"), h("제외", "2026-11-12T09:00:00Z")]);
    expect(counts).toMatchObject({ 전체: 4, 추첨: 2, 선정: 1, 제외: 1, 불참: 0, 충원: 0 });
  });

  it("주소의 값이 틀리면 '전체'로 본다", () => {
    expect(parseKindFilter("추첨")).toBe("추첨");
    expect(parseKindFilter(["선별취소", "추첨"])).toBe("선별취소");
    for (const bad of [undefined, "", "없는종류", "<script>", "전체 "]) expect(parseKindFilter(bad)).toBe("전체");
  });
});

describe("작업 14: 걸러 보기와 최신순", () => {
  it("종류로 걸러 보여 준다", () => {
    const list = [h("추첨", "2026-11-12T09:00:00Z"), h("선정", "2026-11-12T10:00:00Z"), h("추첨", "2026-11-12T11:00:00Z")];
    expect(visibleHistory(list, "추첨")).toHaveLength(2);
    expect(visibleHistory(list, "불참")).toEqual([]);
    expect(visibleHistory(list, "전체")).toHaveLength(3);
  });

  it("가장 나중에 일어난 일이 맨 위에 온다", () => {
    const list = [h("선정", "2026-11-12T09:00:00Z", "첫째"), h("선정", "2026-11-14T09:00:00Z", "셋째"), h("선정", "2026-11-13T09:00:00Z", "둘째")];
    expect(visibleHistory(list, "전체").map((x) => x.tag)).toEqual(["셋째", "둘째", "첫째"]);
  });

  it("시각이 같으면 나중에 저장된 것이 위에 온다 (한 번의 추첨으로 여러 건이 같은 시각에 남은 경우)", () => {
    const same = "2026-11-12T09:00:00Z";
    const list = [h("추첨", same, "1"), h("추첨", same, "2"), h("추첨", same, "3")];
    expect(visibleHistory(list, "전체").map((x) => x.tag)).toEqual(["3", "2", "1"]);
  });

  it("다른 시간대 표기(+09:00과 Z)가 섞여도 실제 시각 순서로 정렬한다", () => {
    const list = [h("선정", "2026-11-12T09:00:00+09:00", "한국09시"), h("선정", "2026-11-12T05:00:00Z", "UTC05시=한국14시")];
    expect(visibleHistory(list, "전체").map((x) => x.tag)).toEqual(["UTC05시=한국14시", "한국09시"]);
  });

  it("원본 목록의 순서는 바꾸지 않는다", () => {
    const list = [h("선정", "2026-11-12T09:00:00Z", "a"), h("선정", "2026-11-13T09:00:00Z", "b")];
    visibleHistory(list, "전체");
    expect(list.map((x) => x.tag)).toEqual(["a", "b"]);
  });
});

describe("작업 14: 변경 내용을 읽기 쉽게", () => {
  it("선별·추첨 같은 상태 변경은 '항목: 값' 줄로 보여 준다", () => {
    expect(describeChange({ status: "신청" })).toEqual(["상태: 신청"]);
    expect(describeChange({ status: "선정", selectedVia: "추첨" })).toEqual(["상태: 선정", "선정 경로: 추첨"]);
    expect(describeChange({ status: "대기", waitNo: 3 })).toEqual(["상태: 대기", "대기 순번: 3번"]);
  });

  it("값이 없으면(수기 추가의 변경 전 등) '(없음)'으로 보여 준다", () => {
    expect(describeChange(null)).toEqual(["(없음)"]);
    expect(describeChange(undefined)).toEqual(["(없음)"]);
  });

  it("충원 확정은 교육생 번호 대신 이름(사번)으로 보여 준다", () => {
    expect(describeChange({ status: "제외", replacedBy: "a" }, nameOf)).toEqual(["상태: 제외", "충원 확정: 김테스트01(100001)로 충원"]);
    expect(describeChange({ replacedFor: "b" }, nameOf)).toEqual(["충원으로 들어간 자리: 이테스트02(100002)"]);
    expect(describeChange({ replacedBy: "없는사람" }, nameOf)).toEqual(["충원 확정: (알 수 없음)로 충원"]);
  });

  it("회신 기한은 한국 시간으로 읽기 쉽게 보여 준다", () => {
    expect(describeChange({ replyDeadline: "2026-11-25T18:00:00+09:00" })).toEqual(["회신 기한: 2026-11-25 18:00"]);
    expect(describeChange({ replyDeadline: "2026-11-25T09:00:00Z" })).toEqual(["회신 기한: 2026-11-25 18:00"]);
  });

  it("추첨 요약은 정원과 결과 인원을 보여 주고, 기계용 번호(drawId)는 숨긴다", () => {
    expect(describeChange({ capacity: null })).toEqual(["정원: 미정"]);
    const lines = describeChange({ capacity: 10, drawId: "uuid-1234", redraw: true, 선정: 2, 대기: 4, 미선정: 12 });
    expect(lines).toEqual(["정원: 10명", "구분: 재추첨", "선정: 2명", "대기: 4명", "미선정: 12명"]);
    expect(lines.join(" ")).not.toContain("uuid-1234");
    expect(describeChange({ redraw: false })).toEqual(["구분: 첫 추첨"]);
  });

  it("교육생 회신 항목은 읽기 쉬운 이름으로 보여 준다", () => {
    expect(
      describeChange({ attend: false, absentType: "업무", absentDetail: "업무 일정으로 불참합니다", laptop: false }),
    ).toEqual(["참석 여부: 불참", "불참 구분: 업무", "불참 사유: 업무 일정으로 불참합니다", "노트북 지참: 아니오"]);
    expect(describeChange({ attend: true, laptop: true, roommateName: "김가짜", roommateDept: "정보화부" })).toEqual([
      "참석 여부: 참석",
      "노트북 지참: 예",
      "룸메이트 이름: 김가짜",
      "룸메이트 부서: 정보화부",
    ]);
  });

  it("모르는 항목도 숨기지 않고 그대로 보여 준다 (이후 작업에서 새 항목이 생겨도 이력이 가려지지 않게)", () => {
    expect(describeChange({ newField: false, other: "값" })).toEqual(["newField: false", "other: 값"]);
    expect(describeChange({ 메모: { a: 1 }, 개수: 3 })).toEqual(['메모: {"a":1}', "개수: 3"]);
  });

  it("비어 있는 변경은 '(바뀐 항목 없음)', 객체가 아닌 값은 글자 그대로 보여 준다", () => {
    expect(describeChange({})).toEqual(["(바뀐 항목 없음)"]);
    expect(describeChange({ drawId: "x" })).toEqual(["(바뀐 항목 없음)"]);
    expect(describeChange("그냥 글자")).toEqual(["그냥 글자"]);
    expect(describeChange(42)).toEqual(["42"]);
  });
});

describe("작업 14: 대상 칸", () => {
  it("교육생이면 이름(사번), 모르는 교육생이면 '(알 수 없음)'", () => {
    expect(historyTarget({ kind: "선정", traineeId: "a" }, nameOf)).toEqual({ label: "김테스트01(100001)", whole: false });
    expect(historyTarget({ kind: "선정", traineeId: "zzz" }, nameOf)).toEqual({ label: "(알 수 없음)", whole: false });
  });

  it("추첨처럼 여러 명이 걸린 이력은 '추첨 전체'로 보여 준다", () => {
    expect(historyTarget({ kind: "추첨", traineeId: undefined }, nameOf)).toEqual({ label: "추첨 전체", whole: true });
    expect(historyTarget({ kind: "제외", traineeId: undefined }, nameOf)).toEqual({ label: "전체", whole: true });
  });
});
