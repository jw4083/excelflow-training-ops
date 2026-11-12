// 작업 19 확인용 검사: 회신 현황 요약·걸러 보기·행 만들기 (DESIGN 2.3 "회신 현황").
import { describe, expect, it } from "vitest";
import { buildReplyRows, filterReplyRows, parseReplyFilter, summarizeReplies } from "@/domain/replyStatus";
import type { Reply, Trainee } from "@/domain/types";

const NOW = "2026-11-15T12:00:00+09:00";
const course = { replyDeadline: "2026-11-20T18:00:00+09:00" };
const t = (id: string, empNo: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: "부서",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});
const r = (traineeId: string, extra: Partial<Reply>): Reply => ({
  traineeId,
  attend: true,
  laptop: false,
  submittedAt: NOW,
  byAdmin: false,
  ...extra,
});

const trainees = [
  t("a", "100003", "선정"), // 미회신
  t("b", "100001", "선정"), // 참석, 노트북
  t("c", "100002", "불참"), // 불참, 충원 필요
  t("d", "100004", "불참", { replacedBy: "x" }), // 불참, 충원 확정
  t("e", "100005", "신청"), // 대상 아님
  t("f", "100006", "제외"), // 대상 아님
  t("g", "100007", "선정", { replyDeadline: "2026-11-25T09:00:00+09:00" }), // 참석, 노트북 없음
];
const replies = [
  r("b", { attend: true, laptop: true }),
  r("c", { attend: false, absentType: "업무", absentDetail: "출장 때문에 불참합니다" }),
  r("d", { attend: false, absentType: "기타", absentDetail: "개인 사정으로 불참합니다", byAdmin: true }),
  r("g", { attend: true, laptop: false }),
];

describe("작업 19: 회신 현황", () => {
  const rows = buildReplyRows(trainees, replies, course, NOW);

  it("회신 대상은 선정·불참 상태만이고 사번 순이다", () => {
    expect(rows.map((x) => x.trainee.empNo)).toEqual(["100001", "100002", "100003", "100004", "100007"]);
  });

  it("행마다 회신 상태, 기한(개별 기한 우선), 충원 필요 여부를 계산한다", () => {
    const byId = Object.fromEntries(rows.map((x) => [x.trainee.id, x]));
    expect(byId.a.kind).toBe("미회신");
    expect(byId.b.kind).toBe("참석");
    expect(byId.c.kind).toBe("불참");
    expect(byId.c.needsFill).toBe(true);
    expect(byId.d.needsFill).toBe(false);
    expect(byId.g.deadline).toMatchObject({ personal: true, text: "2026-11-25 09:00" });
    expect(byId.a.deadline).toMatchObject({ personal: false, text: "2026-11-20 18:00" });
  });

  it("요약 숫자: 대상, 회신/미회신, 참석/불참, 노트북 지참", () => {
    expect(summarizeReplies(rows)).toEqual({ total: 5, replied: 4, none: 1, attend: 2, absent: 2, laptop: 1 });
  });

  it("걸러 보기", () => {
    expect(filterReplyRows(rows, "all")).toHaveLength(5);
    expect(filterReplyRows(rows, "none").map((x) => x.trainee.id)).toEqual(["a"]);
    expect(filterReplyRows(rows, "attend").map((x) => x.trainee.id)).toEqual(["b", "g"]);
    expect(filterReplyRows(rows, "absent").map((x) => x.trainee.id)).toEqual(["c", "d"]);
  });

  it("회신 기록이 없는 불참 상태는 불참으로 센다 (옛 데이터 대비)", () => {
    const only = buildReplyRows([t("z", "100009", "불참")], [], course, NOW);
    expect(only[0].kind).toBe("불참");
  });

  it("주소의 filter 값: 엉뚱하면 전체", () => {
    expect(parseReplyFilter("absent")).toBe("absent");
    expect(parseReplyFilter(["none", "x"])).toBe("none");
    expect(parseReplyFilter("zzz")).toBe("all");
    expect(parseReplyFilter(undefined)).toBe("all");
  });

  it("대상이 없으면 빈 목록과 0 요약", () => {
    expect(summarizeReplies(buildReplyRows([], [], null, NOW))).toEqual({ total: 0, replied: 0, none: 0, attend: 0, absent: 0, laptop: 0 });
  });
});
