// 앱의 주소 규칙 (PLAN 작업 15, PRD M2-13). 교육생 공통 주소를 만드는 방법을 한 곳에 둔다.
// 교육생은 모두 같은 주소로 접속해 로그인하므로(개인 링크 없음), 담당자는 이 주소 하나를 기존 메일로 안내한다.

/** 교육생 공통 주소의 경로 (교육생 화면은 작업 16~18에서 만든다) */
export const TRAINEE_PATH = "/trainee";

/**
 * 교육생 공통 주소의 전체 주소를 만든다. 예: ("https://example.com") → "https://example.com/trainee".
 * 주소의 origin(주소창의 `https://도메인:포트` 부분)은 담당자가 지금 접속한 주소를 그대로 쓰므로,
 * 배포 주소(Vercel 등)로 접속해서 복사하면 교육생에게 보낼 수 있는 주소가 된다.
 */
export function traineeUrl(origin: string): string {
  return `${origin.trim().replace(/\/+$/, "")}${TRAINEE_PATH}`;
}
