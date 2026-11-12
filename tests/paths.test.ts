// 작업 15 확인용 검사: 교육생 공통 주소를 만드는 규칙을 본다 (PRD M2-13).
import { describe, expect, it } from "vitest";
import { TRAINEE_PATH, traineeUrl } from "@/lib/paths";

describe("작업 15: 교육생 공통 주소", () => {
  it("교육생 주소는 모두 같은 하나의 경로(/trainee)다 — 개인별 링크가 아니다", () => {
    expect(TRAINEE_PATH).toBe("/trainee");
  });

  it("접속한 주소(origin) 뒤에 경로를 붙여 전체 주소를 만든다", () => {
    expect(traineeUrl("https://my-app.vercel.app")).toBe("https://my-app.vercel.app/trainee");
    expect(traineeUrl("http://localhost:3000")).toBe("http://localhost:3000/trainee");
  });

  it("끝의 슬래시나 공백이 있어도 슬래시가 겹치지 않는다", () => {
    expect(traineeUrl("https://example.com/")).toBe("https://example.com/trainee");
    expect(traineeUrl("https://example.com///")).toBe("https://example.com/trainee");
    expect(traineeUrl("  https://example.com  ")).toBe("https://example.com/trainee");
  });

  it("개인 정보(사번 등)가 주소에 들어가지 않는다", () => {
    const url = traineeUrl("https://example.com");
    expect(url).not.toMatch(/\d{6}/);
    expect(url).not.toContain("?");
  });
});
