// 정원·현재 선정 수·빈자리 계산 (DESIGN 4.2-1, PRD M1-10). 명단 위 요약·추첨 화면·충원 창·수기 추가 창이 모두 이 계산을 쓴다.
//
//  정원 = 추첨 때 입력한 선발 인원 (1차 선별로 이미 선정된 사람 포함). 추첨 전에는 정해지지 않았으므로 null.
//  현재 선정 수 = 상태가 "선정"인 인원 (수기·충원 포함. 불참·제외·대기·미선정은 세지 않는다)
//  빈자리 = 정원 − 현재 선정 수 (0보다 작아지면 0으로 보고, 넘친 만큼은 "정원 초과"로 따로 센다)
//  추첨으로 뽑을 인원 = 정원 − 현재 선정 수 (0 이하면 추첨하지 않는다)
import type { Trainee } from "./types";

export interface CapacitySummary {
  capacity: number | null; // 정원 (추첨 전이면 null)
  selected: number; // 현재 선정 수
  vacancies: number | null; // 빈자리 (정원이 없으면 null)
  over: number; // 정원을 넘은 인원 (0이면 넘지 않음)
}

const countSelected = (trainees: Pick<Trainee, "status">[]) => trainees.filter((t) => t.status === "선정").length;

export function capacitySummary(
  capacity: number | null | undefined,
  trainees: Pick<Trainee, "status">[],
): CapacitySummary {
  const selected = countSelected(trainees);
  if (capacity === null || capacity === undefined) return { capacity: null, selected, vacancies: null, over: 0 };
  return {
    capacity,
    selected,
    vacancies: Math.max(0, capacity - selected),
    over: Math.max(0, selected - capacity),
  };
}

/** 2차 추첨으로 새로 뽑아야 하는 인원 = 정원 − 현재 선정 수. 0이면 이미 정원이 찬 것이라 추첨하지 않는다. */
export function seatsToDraw(capacity: number, trainees: Pick<Trainee, "status">[]): number {
  return Math.max(0, capacity - countSelected(trainees));
}
