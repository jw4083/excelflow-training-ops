// 링크 영역 자리 검사 (PRD M2-12): 링크가 없으면 비어 있고, 안전한 https 링크만 보여 준다.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { RESOURCE_KINDS, usableResourceLinks } from "@/domain/traineeResources";
import { ResourceLinks } from "@/app/trainee/resource-links";

describe("교육생 화면 링크 영역 자리 (PRD M2-12)", () => {
  it("링크 종류는 카톡방·사전 퀴즈·사후 퀴즈·설문", () => {
    expect([...RESOURCE_KINDS]).toEqual(["카톡방", "사전 퀴즈", "사후 퀴즈", "설문"]);
  });

  it("링크를 넘기지 않으면(지금 상태) 화면에 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(createElement(ResourceLinks))).toBe("");
    expect(renderToStaticMarkup(createElement(ResourceLinks, { links: [] }))).toBe("");
  });

  it("https 링크만 보여 준다 (javascript:·http:·깨진 주소·모르는 종류는 걸러진다)", () => {
    const bad = [
      { kind: "설문", url: "javascript:alert(1)" },
      { kind: "설문", url: "http://example.com" },
      { kind: "설문", url: "example.com" },
      { kind: "퀴즈" as never, url: "https://example.com" },
    ] as const;
    expect(usableResourceLinks(bad)).toEqual([]);
    expect(renderToStaticMarkup(createElement(ResourceLinks, { links: bad }))).toBe("");
  });

  it("올바른 링크가 있으면 새 창으로 안전하게 열리는 링크로 나타난다", () => {
    const html = renderToStaticMarkup(
      createElement(ResourceLinks, { links: [{ kind: "카톡방", url: "https://example.com/room", label: "3기 카톡방" }] }),
    );
    expect(html).toContain("함께 보기");
    expect(html).toContain('href="https://example.com/room"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("3기 카톡방");
  });
});
