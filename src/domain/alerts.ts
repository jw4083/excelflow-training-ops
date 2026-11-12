// 충원 알림 건수 계산 (DESIGN 4.4-1, PRD M2-9).
// "충원이 필요한 자리" = 상태가 "불참" 또는 "제외"인데 아직 충원이 확정되지 않은(`replacedBy`가 없는) 교육생.
// 담당자 화면의 상단 배너·메뉴 배지·회신 현황 필터가 모두 이 한 곳의 계산을 쓴다.
// 충원을 확정하거나(replacedBy가 채워짐) 불참자가 참석으로 다시 회신하면(상태가 "선정"으로 돌아감) 자동으로 건수에서 빠진다.
// 참석 취소도 상태가 "불참"이 되므로 그대로 빈자리로 잡힌다(자동 충원은 하지 않는다). 담당자가 확인 전인 취소는 newCancels로 따로 센다.
import { openVacancies } from "./fill";
import type { Trainee } from "./types";

/** 배너에 이름을 보여줄 최대 인원 */
export const ALERT_NAME_LIMIT = 3;

export interface VacancyAlert {
  total: number; // 충원이 필요한 자리 수
  absent: number; // 그중 "불참"
  excluded: number; // 그중 담당자가 직접 "제외"
  names: string[]; // 오래 기다린 순으로 최대 3명의 이름 (불참 상세 사유 같은 민감 정보는 담지 않는다)
  newCancels: number; // 담당자가 아직 "확인"하지 않은 참석 취소 (충원 전 불참자만)
}

/** 담당자가 아직 확인하지 않은 참석 취소인가: 참석 회신 후 취소했고, 아직 불참 상태이며(충원·재참석 전), 확인 시각이 없다 */
export function isNewCancel(t: Pick<Trainee, "status" | "replacedBy" | "absentOrigin" | "cancelSeenAt">): boolean {
  return t.status === "불참" && !t.replacedBy && t.absentOrigin === "참석후취소" && !t.cancelSeenAt;
}

export function vacancyAlert(
  trainees: (Pick<Trainee, "name" | "status" | "replacedBy" | "updatedAt"> & Partial<Pick<Trainee, "absentOrigin" | "cancelSeenAt">>)[],
): VacancyAlert {
  // "충원이 필요한 자리"의 기준은 fill.ts의 openVacancies 한 곳이다. 회신 현황의 충원 목록도 같은 함수를 쓰므로 배너의 개수와 목록이 어긋나지 않는다
  const open = openVacancies(trainees); // 먼저 비워진(오래 기다린) 자리가 앞

  return {
    total: open.length,
    absent: open.filter((t) => t.status === "불참").length,
    excluded: open.filter((t) => t.status === "제외").length,
    names: open.slice(0, ALERT_NAME_LIMIT).map((t) => t.name),
    newCancels: trainees.filter(isNewCancel).length,
  };
}
