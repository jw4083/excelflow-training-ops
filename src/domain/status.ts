// 상태 전환 규칙표 (PLAN 작업 5, DESIGN 3.3).
// "어떤 상태에서 어떤 상태로 갈 수 있는가"를 이 파일 한 곳에서만 판단한다.
// 선별·추첨·충원·회신 등 상태를 바꾸는 모든 기능은 바꾸기 전에 `checkTransition`을 거쳐야 하고,
// 표에 없는 전환은 거부된다 (예: 제외 → 선정).
// 이 파일은 화면·저장과 무관한 순수 코드이며, 상태를 실제로 바꾸거나 저장하지는 않는다 (검사만 한다).
import type { Status, Trainee } from "./types";

/** 상태를 바꾸는 동작 9가지 */
export const ACTIONS = [
  "선별", // 1차 선별: 신청 → 선정
  "선별취소", // 1차 선별 취소: 선정 → 신청
  "추첨", // 2차 추첨(재추첨 포함): 신청/대기/미선정 → 선정/대기/미선정
  "불참회신", // 교육생(또는 담당자 대리)의 불참 회신: 선정 → 불참
  "참석재회신", // 불참 후 참석으로 다시 회신: 불참 → 선정
  "직접제외", // 담당자가 선정자를 직접 제외: 선정 → 제외
  "충원자리처리", // 충원 확정 때 비는 자리 처리: 불참 → 제외 (이미 제외면 그대로 제외)
  "충원선정", // 충원 확정 때 새로 선정: 대기 → 선정, (대기자가 없을 때만) 미선정 → 선정
  "수기추가", // 선정 이후 수기 추가: (새로 추가) → 선정
] as const;
export type Action = (typeof ACTIONS)[number];

/** 동작별로 "어느 상태에서 어느 상태로" 갈 수 있는지 (DESIGN 3.3의 표). `null`은 "새로 추가"(아직 상태 없음). */
export const TRANSITION_TABLE: Record<Action, { from: (Status | null)[]; to: Status[] }> = {
  선별: { from: ["신청"], to: ["선정"] },
  선별취소: { from: ["선정"], to: ["신청"] },
  추첨: { from: ["신청", "대기", "미선정"], to: ["선정", "대기", "미선정"] },
  불참회신: { from: ["선정"], to: ["불참"] },
  참석재회신: { from: ["불참"], to: ["선정"] },
  직접제외: { from: ["선정"], to: ["제외"] },
  충원자리처리: { from: ["불참", "제외"], to: ["제외"] },
  충원선정: { from: ["대기", "미선정"], to: ["선정"] },
  수기추가: { from: [null], to: ["선정"] },
};

/** 전환을 판단할 때 필요한 주변 상황 */
export interface TransitionContext {
  /** 지금 일시 (ISO). 생략하면 현재 시각 */
  now?: string;
  /** 이 사람에게 적용되는 회신 기한 (개별 기한이 있으면 그것, 없으면 과정 기한) */
  replyDeadline?: string;
  /** 지금까지 한 2차 추첨 횟수 (0이면 아직 추첨 전) */
  drawCount?: number;
  /** 지금 남은 대기자 수 */
  waitlistCount?: number;
  /** 담당자가 교육생 대신 입력하는 경우 (회신 기한이 지나도 가능, PRD M2-8) */
  byAdmin?: boolean;
  /** 회신 기한·참석 취소 마감 판단을 이미 `replyRules`에서 마쳤다 (기한 뒤 참석 취소처럼 기한 검사를 다시 하면 안 되는 경우) */
  windowChecked?: boolean;
}

export type TransitionResult = { ok: true; to: Status } | { ok: false; reason: string };

const fail = (reason: string): TransitionResult => ({ ok: false, reason });

/**
 * 이 동작으로 이 교육생의 상태를 바꿔도 되는지 검사한다.
 * - trainee: 지금 교육생 (수기추가는 아직 없으므로 `null`)
 * - to: 바꾸려는 상태 (한 가지로 정해진 동작은 생략하면 자동으로 정해진다. 추첨은 선정/대기/미선정 중 하나를 꼭 넘긴다)
 */
export function checkTransition(
  action: Action,
  trainee: Pick<Trainee, "status" | "selectedVia" | "replacedBy"> | null,
  to?: Status,
  context: TransitionContext = {},
): TransitionResult {
  const rule = TRANSITION_TABLE[action];
  const from = trainee ? trainee.status : null;

  // 1) 표에 있는 전환인가? (제외 → 선정 같은 전환은 여기서 거부된다)
  if (!rule.from.includes(from)) {
    // 문구는 "동작"을 붙여 받침 유무와 상관없이 조사가 맞게 한다 (이 문구는 화면에 그대로 보인다)
    return fail(`"${from ?? "새로 추가"}" 상태에서는 "${action}" 동작을 할 수 없습니다.`);
  }
  const target = to ?? (rule.to.length === 1 ? rule.to[0] : undefined);
  if (target === undefined) return fail(`"${action}" 동작은 바꿀 상태(선정/대기/미선정)를 정해서 넘겨야 합니다.`);
  if (!rule.to.includes(target)) {
    return fail(`"${action}" 동작으로는 "${target}" 상태가 될 수 없습니다.`);
  }

  // 2) 동작별 추가 조건
  const drawCount = context.drawCount ?? 0;
  switch (action) {
    case "선별취소":
      // 2차 추첨 전까지, 1차 선별로 선정된 사람만 취소할 수 있다 (PRD M1-3)
      if (drawCount > 0) return fail("2차 추첨이 끝난 뒤에는 선별을 취소할 수 없습니다.");
      if (trainee?.selectedVia !== "선별") return fail("1차 선별로 선정된 사람만 선별을 취소할 수 있습니다.");
      break;

    case "추첨":
      // 첫 추첨 대상은 "신청"뿐이고, 대기·미선정은 재추첨 때만 대상이 된다 (DESIGN 3.3)
      if (from !== "신청" && drawCount === 0) return fail("대기·미선정은 재추첨 때만 추첨 대상입니다.");
      break;

    case "불참회신":
    case "참석재회신": {
      // 충원이 확정된 자리는 참석으로 되돌릴 수 없다 (PRD M2-7, 담당자 대리 입력도 막음)
      if (action === "참석재회신" && trainee?.replacedBy) {
        return fail("충원이 확정되어 참석으로 바꿀 수 없습니다. 담당자에게 문의하세요.");
      }
      // 회신 기한이 지나면 교육생은 제출할 수 없다. 담당자 대리 입력은 기한이 지나도 가능 (PRD M2-4, M2-8)
      if (!context.byAdmin && !context.windowChecked) {
        const deadline = Date.parse(context.replyDeadline ?? "");
        if (Number.isNaN(deadline)) return fail("회신 기한이 정해져 있지 않습니다. 담당자에게 문의하세요.");
        if (Date.parse(context.now ?? new Date().toISOString()) > deadline) {
          return fail("회신 기한이 지났습니다. 담당자에게 문의하세요.");
        }
      }
      break;
    }

    case "충원자리처리":
      // 이미 다른 사람으로 충원된 자리는 다시 처리할 수 없다
      if (trainee?.replacedBy) return fail("이미 충원이 확정된 자리입니다.");
      break;

    case "충원선정":
      // 미선정자는 대기자가 한 명도 없을 때만 충원할 수 있다 (DESIGN Q8)
      if (from === "미선정" && (context.waitlistCount ?? 0) > 0) {
        return fail("대기자가 남아 있으면 미선정자를 충원할 수 없습니다. 대기 순번 앞사람부터 충원하세요.");
      }
      break;

    default:
      break;
  }

  return { ok: true, to: target };
}

/** 동작과 상관없이, 표에 있는 전환(from → to)인지만 확인한다. 저장 직전의 마지막 안전장치로 쓸 수 있다. */
export function isTransitionAllowed(from: Status | null, to: Status): boolean {
  return ACTIONS.some((action) => {
    const rule = TRANSITION_TABLE[action];
    return rule.from.includes(from) && rule.to.includes(to);
  });
}
