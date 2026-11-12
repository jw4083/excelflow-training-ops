// 작업 5 확인용 검사: 상태 전환 규칙표(DESIGN 3.3)가 그대로 지켜지는지 본다.
import { describe, expect, it } from "vitest";
import { STATUSES, type Status, type Trainee } from "@/domain/types";
import { ACTIONS, checkTransition, isTransitionAllowed, TRANSITION_TABLE } from "@/domain/status";

type T = Pick<Trainee, "status" | "selectedVia" | "replacedBy">;
const t = (status: Status, extra: Partial<T> = {}): T => ({ status, ...extra });

const NOW = "2026-11-15T12:00:00+09:00";
const BEFORE = "2026-11-20T18:00:00+09:00"; // 기한이 아직 안 지남
const AFTER = "2026-11-10T18:00:00+09:00"; // 기한이 지남

describe("작업 5: 상태 전환 규칙표", () => {
  it("동작은 11가지이고 표에 모두 있다", () => {
    expect([...ACTIONS]).toHaveLength(11);
    for (const a of ACTIONS) expect(TRANSITION_TABLE[a]).toBeDefined();
  });

  it("표에 있는 전환 목록이 DESIGN 3.3과 정확히 같다", () => {
    const allowed: string[] = [];
    for (const from of [null, ...STATUSES]) {
      for (const to of STATUSES) if (isTransitionAllowed(from, to)) allowed.push(`${from ?? "새로"}→${to}`);
    }
    expect(allowed.sort()).toEqual(
      [
        "신청→선정", // 선별, 추첨
        "신청→대기", // 추첨
        "신청→미선정", // 추첨
        "선정→신청", // 선별 취소
        "선정→불참", // 불참 회신
        "불참→선정", // 참석 재회신
        "선정→제외", // 직접 제외
        "불참→제외", // 충원 확정 때 자리 처리
        "제외→제외", // 직접 제외된 자리의 충원 확정 (상태 유지)
        "대기→선정", // 충원 / 재추첨
        "대기→대기", // 재추첨
        "대기→미선정", // 재추첨
        "미선정→선정", // 충원(대기자 없을 때) / 재추첨
        "미선정→대기", // 재추첨
        "미선정→미선정", // 재추첨
        "미선정→신청", // 담당자 미선정 복구 (추첨 전)
        "새로→선정", // 수기 추가
      ].sort(),
    );
  });

  it("표에 없는 전환은 거부한다 (제외 → 선정 등)", () => {
    expect(isTransitionAllowed("제외", "선정")).toBe(false);
    expect(isTransitionAllowed("신청", "불참")).toBe(false);
    expect(isTransitionAllowed("선정", "대기")).toBe(false);
    expect(isTransitionAllowed("불참", "신청")).toBe(false);
    // 제외된 사람은 어떤 동작으로도 "선정"이 될 수 없다 (담당자 대리 입력·재추첨 상황이어도)
    for (const action of ACTIONS) {
      expect(checkTransition(action, t("제외"), "선정", { drawCount: 1, byAdmin: true }).ok).toBe(false);
    }
  });

  it("1차 선별: 신청 → 선정만", () => {
    expect(checkTransition("선별", t("신청"))).toEqual({ ok: true, to: "선정" });
    expect(checkTransition("선별", t("대기")).ok).toBe(false);
    expect(checkTransition("선별", t("선정")).ok).toBe(false);
  });

  it("선별 취소: 추첨 전 + 1차 선별로 선정된 사람만", () => {
    expect(checkTransition("선별취소", t("선정", { selectedVia: "선별" }), undefined, { drawCount: 0 })).toEqual({ ok: true, to: "신청" });
    expect(checkTransition("선별취소", t("선정", { selectedVia: "선별" }), undefined, { drawCount: 1 }).ok).toBe(false); // 추첨 후
    for (const via of ["추첨", "충원", "수기"] as const) {
      expect(checkTransition("선별취소", t("선정", { selectedVia: via })).ok).toBe(false); // 다른 경로로 선정된 사람
    }
    expect(checkTransition("선별취소", t("선정")).ok).toBe(false); // 경로 기록 없음
  });

  it("2차 추첨: 첫 추첨은 신청만, 대기·미선정은 재추첨(추첨 1회 이상) 때만", () => {
    for (const to of ["선정", "대기", "미선정"] as const) {
      expect(checkTransition("추첨", t("신청"), to)).toEqual({ ok: true, to });
    }
    expect(checkTransition("추첨", t("신청")).ok).toBe(false); // 결과 상태를 안 넘김
    expect(checkTransition("추첨", t("신청"), "불참").ok).toBe(false);
    expect(checkTransition("추첨", t("대기"), "선정", { drawCount: 0 }).ok).toBe(false);
    expect(checkTransition("추첨", t("대기"), "선정", { drawCount: 1 }).ok).toBe(true);
    expect(checkTransition("추첨", t("미선정"), "대기", { drawCount: 2 }).ok).toBe(true);
    expect(checkTransition("추첨", t("선정"), "대기", { drawCount: 1 }).ok).toBe(false); // 선정자는 재추첨 대상이 아님
  });

  it("불참 회신: 선정 → 불참, 기한 전에만 (담당자 대리 입력은 기한 후에도)", () => {
    expect(checkTransition("불참회신", t("선정"), undefined, { now: NOW, replyDeadline: BEFORE })).toEqual({ ok: true, to: "불참" });
    const late = checkTransition("불참회신", t("선정"), undefined, { now: NOW, replyDeadline: AFTER });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toContain("담당자에게 문의");
    expect(checkTransition("불참회신", t("선정"), undefined, { now: NOW, replyDeadline: AFTER, byAdmin: true }).ok).toBe(true);
    expect(checkTransition("불참회신", t("대기"), undefined, { now: NOW, replyDeadline: BEFORE }).ok).toBe(false);
  });

  it("참석 재회신: 불참 → 선정, 기한 전 + 충원 미확정일 때만", () => {
    const ctx = { now: NOW, replyDeadline: BEFORE };
    expect(checkTransition("참석재회신", t("불참"), undefined, ctx)).toEqual({ ok: true, to: "선정" });
    expect(checkTransition("참석재회신", t("불참"), undefined, { now: NOW, replyDeadline: AFTER }).ok).toBe(false); // 기한 후
    const replaced = checkTransition("참석재회신", t("불참", { replacedBy: "t9" }), undefined, ctx);
    expect(replaced.ok).toBe(false); // 충원 확정 후
    if (!replaced.ok) expect(replaced.reason).toContain("담당자에게 문의");
    // 담당자 대리 입력도 충원 확정 후에는 막는다
    expect(checkTransition("참석재회신", t("불참", { replacedBy: "t9" }), undefined, { ...ctx, byAdmin: true }).ok).toBe(false);
    // 기한이 없으면(과정 정보 미입력) 교육생 제출은 막는다
    expect(checkTransition("참석재회신", t("불참"), undefined, { now: NOW }).ok).toBe(false);
  });

  it("직접 제외: 선정 → 제외만", () => {
    expect(checkTransition("직접제외", t("선정"))).toEqual({ ok: true, to: "제외" });
    for (const s of ["신청", "대기", "미선정", "불참", "제외"] as const) {
      expect(checkTransition("직접제외", t(s)).ok).toBe(false);
    }
  });

  it("충원 확정 때 자리 처리: 불참 → 제외, 직접 제외된 자리는 제외 그대로, 이미 충원된 자리는 거부", () => {
    expect(checkTransition("충원자리처리", t("불참"))).toEqual({ ok: true, to: "제외" });
    expect(checkTransition("충원자리처리", t("제외"))).toEqual({ ok: true, to: "제외" });
    expect(checkTransition("충원자리처리", t("제외", { replacedBy: "t9" })).ok).toBe(false);
    expect(checkTransition("충원자리처리", t("선정")).ok).toBe(false);
  });

  it("충원 선정: 대기 → 선정, 미선정은 대기자가 없을 때만", () => {
    expect(checkTransition("충원선정", t("대기"), undefined, { waitlistCount: 3 })).toEqual({ ok: true, to: "선정" });
    expect(checkTransition("충원선정", t("미선정"), undefined, { waitlistCount: 0 })).toEqual({ ok: true, to: "선정" });
    expect(checkTransition("충원선정", t("미선정"), undefined, { waitlistCount: 2 }).ok).toBe(false);
    expect(checkTransition("충원선정", t("신청")).ok).toBe(false);
    expect(checkTransition("충원선정", t("제외")).ok).toBe(false);
  });

  it("수기 추가: 새로 추가된 사람만 선정으로 들어간다", () => {
    expect(checkTransition("수기추가", null)).toEqual({ ok: true, to: "선정" });
    expect(checkTransition("수기추가", null, "대기").ok).toBe(false);
    expect(checkTransition("수기추가", t("신청")).ok).toBe(false); // 이미 명단에 있는 사람
  });

  it("거부 이유는 화면에 그대로 보여줄 수 있는 한국어 문장이다", () => {
    const r = checkTransition("직접제외", t("제외"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/제외.*직접제외/);
  });
});
