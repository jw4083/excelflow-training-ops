// 2차 랜덤 추첨 실행 (PLAN 작업 13, PRD M1-3·M1-4·M1-10, DESIGN 4.2).
// 한 번의 추첨은 아래를 "한 묶음"으로 저장한다. 하나라도 규칙에 어긋나면 아무것도 저장되지 않는다.
//   ① 뽑힌 사람마다 상태 변경(선정/대기/미선정)과 변경 이력  ② 추첨 기록 1건(실행 일시, 정원, 결과 — 수정할 수 없음)
//   ③ 정원(Course.capacity) 저장  ④ 추첨 전체를 요약하는 이력 1건(정원 변경 포함)
import { randomInt as cryptoRandomInt, randomUUID } from "node:crypto";
import { seatsToDraw } from "@/domain/capacity";
import { drawLots, drawPool, parseDrawCounts, type DrawFormErrors, type RandomInt } from "@/domain/draw";
import type { DrawRecord, History, Trainee } from "@/domain/types";
import { kstLocalToIso } from "@/lib/datetime";
import { changeStatuses, type StatusChangeInput } from "@/lib/history";
import type { Store } from "@/store";

export interface DrawOptions {
  now?: string; // 실행 일시 (생략하면 지금)
  newId?: () => string; // 번호 만들기 (생략하면 무작위)
  randomInt?: RandomInt; // 섞기에 쓰는 난수 (생략하면 암호용 난수). 검사에서만 바꾼다
}

export type DrawResult =
  | {
      ok: true;
      record: DrawRecord;
      selected: number;
      waitlist: number;
      rejected: number;
      shortage: number; // 대상자가 뽑을 인원보다 적어서 채우지 못한 자리 (0이면 모두 채움)
      redraw: boolean; // 재추첨이었는가
    }
  | { ok: false; reason: string; errors?: DrawFormErrors };

const fail = (reason: string, errors?: DrawFormErrors): DrawResult => ({ ok: false, reason, errors });

async function runDrawUnlocked(
  store: Store,
  input: { capacity: string; waitSeats: string; replyDeadline?: string },
  options: DrawOptions = {},
): Promise<DrawResult> {
  const now = options.now ?? new Date().toISOString();
  const newId = options.newId ?? (() => randomUUID());
  const randomInt = options.randomInt ?? ((max: number) => cryptoRandomInt(max));

  // 1) 입력 검사: 선발 인원(정원)·대기 인원은 숫자, 회신 기한은 (넣었다면) 올바른 한국 시간이고 지금보다 뒤
  const counts = parseDrawCounts(input);
  if (!counts.ok) return fail("입력한 내용을 확인해 주세요.", counts.errors);
  let deadline: string | undefined;
  if (input.replyDeadline?.trim()) {
    const iso = kstLocalToIso(input.replyDeadline.trim());
    if (!iso) return fail("입력한 내용을 확인해 주세요.", { replyDeadline: "회신 기한 칸의 날짜·시각이 올바르지 않습니다." });
    if (Date.parse(iso) <= Date.parse(now)) {
      return fail("입력한 내용을 확인해 주세요.", { replyDeadline: "회신 기한은 지금보다 뒤의 시각이어야 합니다." });
    }
    deadline = iso;
  }
  const { capacity, waitSeats } = counts;

  const data = await store.readAll();
  if (!data.course) return fail("먼저 [과정 정보]를 입력해 주세요. 정원은 과정에 저장됩니다.");

  // 2) 뽑는 인원 = 정원 − 현재 선정 수. 0 이하면 이미 정원이 찬 것이라 추첨하지 않는다 (DESIGN 4.2-1)
  const toDraw = seatsToDraw(capacity, data.trainees);
  const selectedNow = data.trainees.filter((t) => t.status === "선정").length;
  if (toDraw === 0) {
    return fail(`이미 정원이 찼습니다. 정원 ${capacity}명, 현재 선정 ${selectedNow}명이라 새로 뽑을 인원이 없습니다.`, {
      capacity: "정원이 현재 선정 인원보다 커야 추첨할 수 있습니다.",
    });
  }

  // 3) 추첨 대상: 첫 추첨은 "신청", 재추첨은 직전 결과의 "대기·미선정" (선정자는 그대로 둔다)
  const redraw = data.draws.length > 0;
  const pool = drawPool(data.trainees, data.draws.length);
  if (pool.length === 0) {
    return fail(
      redraw
        ? "재추첨 대상이 없습니다. 대기·미선정 상태인 사람이 없습니다."
        : '추첨 대상이 없습니다. "신청" 상태인 사람이 없습니다. 먼저 신청자 엑셀을 올려 주세요.',
    );
  }

  // 4) 무작위로 섞어서 선정·대기·미선정으로 나눈다
  const lots = drawLots(pool.map((t) => t.id), toDraw, waitSeats, randomInt);
  const byId = new Map<string, Trainee>(data.trainees.map((t) => [t.id, t]));

  // 5) 사람별 상태 변경. 상태도 순번도 그대로인 사람(재추첨에서 계속 미선정인 사람 등)은 이력을 만들지 않는다
  const changes: StatusChangeInput[] = [];
  for (const id of lots.selected) {
    changes.push({ action: "추첨", traineeId: id, to: "선정", patch: deadline ? { replyDeadline: deadline } : undefined });
  }
  lots.waitlist.forEach((id, index) => {
    const waitNo = index + 1;
    const t = byId.get(id) as Trainee;
    if (!(t.status === "대기" && t.waitNo === waitNo)) changes.push({ action: "추첨", traineeId: id, to: "대기", patch: { waitNo } });
  });
  for (const id of lots.rejected) {
    if ((byId.get(id) as Trainee).status !== "미선정") changes.push({ action: "추첨", traineeId: id, to: "미선정" });
  }

  // 6) 추첨 기록·정원·요약 이력을 같은 묶음에 담아 저장한다
  const record: DrawRecord = {
    id: newId(),
    executedAt: now,
    seats: capacity,
    waitSeats,
    selected: lots.selected,
    waitlist: lots.waitlist,
    rejected: lots.rejected,
  };
  const summary: History = {
    id: newId(),
    at: now,
    kind: "추첨",
    before: { capacity: data.course.capacity ?? null },
    after: {
      capacity,
      drawId: record.id,
      redraw,
      선정: lots.selected.length,
      대기: lots.waitlist.length,
      미선정: lots.rejected.length,
    },
  };

  const saved = await changeStatuses(
    store,
    changes,
    {
      appendDraws: [record],
      appendHistory: [summary],
      // 정원은 추첨 때 정해지는 값이므로 과정 정보의 "최종 수정 일시"는 바꾸지 않는다 (교육생 안내가 바뀐 것이 아니다)
      course: { ...data.course, capacity },
    },
    { now, newId },
  );
  if (!saved.ok) return fail(`추첨을 저장하지 못했습니다: ${saved.reason} 아무것도 변경되지 않았습니다.`);

  return {
    ok: true,
    record,
    selected: lots.selected.length,
    waitlist: lots.waitlist.length,
    rejected: lots.rejected.length,
    shortage: Math.max(0, toDraw - lots.selected.length),
    redraw,
  };
}

/** 2차 추첨: 읽기 → 대상·정원 검사 → 저장을 한 덩어리(transaction)로 실행한다. 추첨 도중에 상태가 바뀌어도 예전 명단으로 덮어쓰지 않는다. */
export function runDraw(
  store: Store,
  input: { capacity: string; waitSeats: string; replyDeadline?: string },
  options: DrawOptions = {},
): Promise<DrawResult> {
  return store.transaction(() => runDrawUnlocked(store, input, options));
}
