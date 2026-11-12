// 선별 기록·추첨 기록 목록 (DESIGN 2.3 "추첨"). 수정·삭제 버튼은 없다 (PRD M1-4).
// 추첨 기록은 가장 최근 것에만 "현재 반영", 이전 것에는 "이전 기록"을 붙이고, 눌러서 상세 결과(누가 선정·대기·미선정)를 본다.
import { currentDrawId } from "@/domain/draw";
import type { DrawRecord, SelectionRecord, Trainee } from "@/domain/types";
import { formatKst } from "@/lib/datetime";

type Who = Pick<Trainee, "id" | "empNo" | "name">;

function People({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">
        {title} <span className="font-normal text-zinc-600 dark:text-zinc-400">({items.length}명)</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">없음</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SelectionRecords({ selections }: { selections: SelectionRecord[] }) {
  if (selections.length === 0) {
    return <p className="text-base text-zinc-600 dark:text-zinc-400">아직 1차 선별 기록이 없습니다.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800">
      {[...selections].reverse().map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-base">
          <span className="tabular-nums">{formatKst(s.at)}</span>
          <span>
            <strong className={s.kind === "선별취소" ? "text-amber-800 dark:text-amber-300" : ""}>
              {s.kind === "선별" ? "1차 선별" : "선별 취소"}
            </strong>{" "}
            {s.traineeIds.length}명
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DrawRecords({ draws, trainees }: { draws: DrawRecord[]; trainees: Who[] }) {
  if (draws.length === 0) {
    return <p className="text-base text-zinc-600 dark:text-zinc-400">아직 추첨 기록이 없습니다.</p>;
  }
  const byId = new Map(trainees.map((t) => [t.id, t]));
  const label = (id: string) => {
    const t = byId.get(id);
    return t ? `${t.name}(${t.empNo})` : "(알 수 없음)";
  };
  const current = currentDrawId(draws);

  return (
    <ul className="flex flex-col gap-3">
      {[...draws].reverse().map((d, index) => {
        const isCurrent = d.id === current;
        const number = draws.length - index; // 몇 번째 추첨인지 (처음이 1번)
        return (
          <li key={d.id} className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-base">
                <span className="font-semibold">{number}번째 추첨</span>
                <span
                  className={`rounded-full px-3 py-0.5 text-sm font-medium ${
                    isCurrent
                      ? "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {isCurrent ? "현재 반영" : "이전 기록"}
                </span>
                <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{formatKst(d.executedAt)}</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  선발 인원 {d.seats}명 · 선정 {d.selected.length} / 대기 {d.waitlist.length} / 미선정 {d.rejected.length}
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
                <People title="선정" items={d.selected.map(label)} />
                <People title="대기 (순번 순)" items={d.waitlist.map((id, i) => `${i + 1}번 ${label(id)}`)} />
                <People title="미선정" items={d.rejected.map(label)} />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
