// 데이터 모양 정의 (PLAN 작업 3, DESIGN 3번).
// 앱이 다루는 모든 정보(과정, 교육생, 추첨 기록, 회신, 변경 이력)의 "항목 이름과 종류"를 여기 한곳에서 정한다.
// 화면·저장 방식과 무관한 순수 정의이므로 이 파일은 다른 곳(store, 화면)을 가져오지 않는다.
// 일시는 모두 ISO 문자열(예: "2026-11-12T09:00:00+09:00")로 저장한다.

// ───────────────────────── 상태 ─────────────────────────

/** 상태 6종 (PRD M1-8). 순서는 담당자 화면의 탭 순서와 같다. */
export const STATUSES = ["신청", "선정", "대기", "미선정", "불참", "제외"] as const;
export type Status = (typeof STATUSES)[number];

// ───────────────────────── 사번 ─────────────────────────

/**
 * 사번은 숫자 0~9로 된 정확히 6자리 "텍스트"다 (PRD M1-9).
 * 숫자(number)로 바꾸면 앞자리 0이 사라지므로 항상 문자열로만 다룬다. 예: "001234"
 */
export const EMP_NO_PATTERN = /^[0-9]{6}$/;

// ───────────────────────── 과정 ─────────────────────────

/** 교육 과정 (이번에는 1개만 다룬다) */
export interface Course {
  name: string; // 과정명 (화면 식별용). 정원 칸은 없다: 선발 인원은 추첨 때 입력
  startDate: string; // 교육 시작일
  endDate: string; // 교육 종료일
  place: string; // 장소
  notice: string; // 안내문 (여러 줄)
  replyDeadline: string; // 회신 기한 (일시) — 개별 기한이 없는 교육생에게 적용
  capacity?: number; // 정원 = 추첨 때 입력한 선발 인원(1차 선별자 포함). 추첨 전에는 없음 (PRD M1-10)
  updatedAt: string; // 최종 수정 일시 — 교육생 화면 맨 위에 표시 (PRD M2-5)
}

// ───────────────────────── 교육생 ─────────────────────────

/** "선정"이 된 경로. 선별 취소는 "선별"로 선정된 사람만 할 수 있다 (PRD M1-3). */
export const SELECTED_VIA = ["선별", "추첨", "충원", "수기"] as const;
export type SelectedVia = (typeof SELECTED_VIA)[number];

/** 교육생. 지우지 않고 상태만 바꾼다 (PRD M1-7). */
export interface Trainee {
  id: string; // 내부 번호 (화면에 보이지 않음)
  empNo: string; // 사번: 숫자 6자리 텍스트, 중복 불가
  name: string;
  dept: string; // 부서
  status: Status;
  isManual: boolean; // 수기 추가자 표시 ("선정" + "수기")
  manualReason?: string; // 수기 추가 사유 (수기 추가자만)
  waitNo?: number; // 대기 순번 (대기 상태일 때)
  replacedBy?: string; // 이 사람 자리에 충원된 교육생의 id. 값이 있으면 "충원 확정됨" → 참석으로 되돌릴 수 없음
  replacedFor?: string; // 이 사람이 충원으로 들어간 대상(불참·제외자)의 id
  replyDeadline?: string; // 개별 회신 기한 (충원자·수기 추가자·추첨 선정자). 없으면 과정 기한을 따름 (PRD M1-11)
  selectedVia?: SelectedVia; // "선정"이 된 경로
  loginFails: number; // 연속 로그인 실패 횟수 (5회가 되면 lockedUntil 설정, 성공하면 0)
  lockedUntil?: string; // 이 시각까지 로그인 잠금 (15분)
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── 1차 선별 기록 · 추첨 기록 ─────────────────────────

/** 1차 선별 기록. 추가만 가능하다. 취소도 지우지 않고 새 기록("선별취소")으로 남긴다 (PRD M1-3). */
export interface SelectionRecord {
  id: string;
  at: string; // 일시
  kind: "선별" | "선별취소";
  traineeIds: string[]; // 선정 처리(또는 취소)된 교육생 id
}

/**
 * 추첨 기록. 추가만 가능하고 수정·삭제는 없다 (PRD M1-4).
 * "현재 반영"은 따로 저장하지 않고, 가장 최근 기록을 "현재 반영", 나머지를 "이전 기록"으로 계산한다.
 */
export interface DrawRecord {
  id: string;
  executedAt: string; // 실행 일시
  seats: number; // 이때 입력한 선발 인원(정원)
  waitSeats: number; // 대기 인원
  selected: string[]; // 선정된 교육생 id
  waitlist: string[]; // 대기 교육생 id (대기 순번 순서대로)
  rejected: string[]; // 미선정 교육생 id
}

// ───────────────────────── 회신 ─────────────────────────

/** 불참 사유 구분 (PRD M2-3) */
export const ABSENT_TYPES = ["업무", "기타"] as const;
export type AbsentType = (typeof ABSENT_TYPES)[number];

/** 교육생 한 명의 최신 회신 (마지막 제출본이 기준, PRD M2-4). 이전 제출은 변경 이력에 남는다. */
export interface Reply {
  traineeId: string;
  attend: boolean; // true = 참석, false = 불참
  absentType?: AbsentType; // 불참일 때만
  absentDetail?: string; // 불참일 때만, 10자 이상 300자 이하
  laptop: boolean; // 노트북 지참 여부
  roommateName?: string; // 룸메이트 희망 (직접 입력, 다른 교육생 선택 없음 — PRD M2-6)
  roommateDept?: string;
  submittedAt: string; // 제출 일시
  byAdmin: boolean; // true = 담당자가 대신 입력 ("담당자 입력" 표시, PRD M2-8)
}

// ───────────────────────── 변경 이력 ─────────────────────────

/** 변경 이력의 종류 9가지 */
export const HISTORY_KINDS = [
  "추첨",
  "선정",
  "선별취소",
  "불참",
  "제외",
  "충원",
  "수기추가",
  "회신",
  "회신대리입력",
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

/** 변경 이력. 추가만 가능하고 수정·삭제는 없다 (PRD M1-7). */
export interface History {
  id: string;
  at: string; // 변경 일시
  kind: HistoryKind;
  traineeId?: string; // 대상 교육생 (추첨처럼 여러 명이 걸린 변경은 비어 있을 수 있음)
  before: unknown; // 변경 전 내용
  after: unknown; // 변경 후 내용
  reason?: string; // 사유 (제외, 수기 추가 등)
}

// ───────────────────────── 저장되는 전체 모양 ─────────────────────────

/** 저장소에 들어가는 전체 데이터. 저장 방식이 무엇이든 이 모양을 저장한다 (작업 4에서 사용). */
export interface DbData {
  course: Course | null; // 아직 입력 전이면 null
  trainees: Trainee[];
  selections: SelectionRecord[];
  draws: DrawRecord[];
  replies: Reply[];
  history: History[];
}
