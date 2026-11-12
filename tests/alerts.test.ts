// 작업 8 확인용 검사: 충원이 필요한 자리 건수 계산(PRD M2-9)이 맞는지 본다.
import { describe, expect, it } from "vitest";
import type { Status } from "@/domain/types";
import { ALERT_NAME_LIMIT, vacancyAlert } from "@/domain/alerts";

let seq = 0;
const t = (status: Status, extra: { replacedBy?: string; name?: string; updatedAt?: string } = {}) => ({
  name: extra.name ?? `김테스트${++seq}`,
  status,
  replacedBy: extra.replacedBy,
  updatedAt: extra.updatedAt ?? "2026-11-12T09:00:00+09:00",
});

describe("작업 8: 충원이 필요한 자리 건수", () => {
  it("불참자도 직접 제외한 자리도 충원 전까지는 건수에 들어간다", () => {
    const r = vacancyAlert([t("불참"), t("불참"), t("제외"), t("선정"), t("대기")]);
    expect(r).toMatchObject({ total: 3, absent: 2, excluded: 1 });
  });

  it("충원이 확정된 자리(replacedBy 있음)는 건수에서 빠진다", () => {
    const r = vacancyAlert([t("제외", { replacedBy: "x" }), t("불참")]);
    expect(r).toMatchObject({ total: 1, absent: 1, excluded: 0 });
  });

  it("불참자가 참석으로 다시 회신해 선정으로 돌아오면 건수에서 빠진다", () => {
    expect(vacancyAlert([t("불참")]).total).toBe(1);
    expect(vacancyAlert([t("선정")]).total).toBe(0);
  });

  it("해당자가 없으면 모두 0이다 (배너·배지가 나타나지 않음)", () => {
    expect(vacancyAlert([])).toEqual({ total: 0, absent: 0, excluded: 0, names: [] });
    expect(vacancyAlert([t("신청"), t("선정"), t("대기"), t("미선정")]).total).toBe(0);
  });

  it("이름은 오래 기다린 순으로 최대 3명까지만 담는다", () => {
    const r = vacancyAlert([
      t("불참", { name: "넷째", updatedAt: "2026-11-15T00:00:00+09:00" }),
      t("불참", { name: "첫째", updatedAt: "2026-11-12T00:00:00+09:00" }),
      t("제외", { name: "셋째", updatedAt: "2026-11-14T00:00:00+09:00" }),
      t("불참", { name: "둘째", updatedAt: "2026-11-13T00:00:00+09:00" }),
    ]);
    expect(ALERT_NAME_LIMIT).toBe(3);
    expect(r.total).toBe(4);
    expect(r.names).toEqual(["첫째", "둘째", "셋째"]);
  });

  it("결과에는 불참 상세 사유 같은 항목이 들어 있지 않다 (이름과 건수만)", () => {
    expect(Object.keys(vacancyAlert([t("불참")])).sort()).toEqual(["absent", "excluded", "names", "total"]);
  });
});
