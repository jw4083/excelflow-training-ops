// 교육생 화면의 "링크 영역" 자리 (PRD M2-12, PLAN FR-25, DESIGN 2.3·8.2 #13).
// 나중에 같은 페이지에서 카톡방·사전 퀴즈·사후 퀴즈·설문 링크를 보여 줄 수 있도록 **빈 자리와 모양만** 정해 둔다.
// 링크를 입력·저장하는 기능은 이번 범위 밖이라 만들지 않는다(PRD 6번). 지금은 어디에서도 링크를 넘겨주지 않으므로 화면에 아무것도 나타나지 않는다.

/** 링크 종류 (PRD M2-12) */
export const RESOURCE_KINDS = ["카톡방", "사전 퀴즈", "사후 퀴즈", "설문"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourceLink {
  kind: ResourceKind;
  url: string; // https:// 로 시작하는 주소만 보여 준다
  label?: string; // 버튼에 쓸 글 (없으면 종류 이름)
}

/**
 * 화면에 보여도 되는 링크만 고른다: 종류가 맞고, 주소가 https://로 시작하는 것.
 * (javascript: 같은 주소가 링크로 들어가 실행되는 일을 막는다. 나중에 링크 입력 기능이 생겨도 이 검사를 거친다.)
 */
export function usableResourceLinks(links: readonly ResourceLink[]): ResourceLink[] {
  return links.filter((l) => (RESOURCE_KINDS as readonly string[]).includes(l.kind) && isHttpsUrl(l.url));
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}
