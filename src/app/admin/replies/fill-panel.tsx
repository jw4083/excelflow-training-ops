"use client";
// 충원 창 (PLAN 작업 20, DESIGN 2.3 "회신 현황"): 비는 자리 하나에 대해 후보를 제시하고, "확정" 버튼을 눌러야만 확정한다.
// 후보: 대기자가 있으면 가장 앞 순번 한 명, 없으면 미선정자 중에서 직접 선택. 정원을 넘게 되면 경고 뒤 "정원 초과 확정".
import { useActionState, useState } from "react";
import { confirmFillAction, type FillState } from "@/app/actions/fill";

export interface PanelPerson {
  id: string;
  name: string;
  dept: string;
  empNo: string;
}

export type PanelCandidates =
  | { mode: "waitlist"; candidate: PanelPerson & { waitNo?: number } }
  | { mode: "pool"; pool: PanelPerson[] }
  | { mode: "none" };

export function FillPanel({
  target,
  reasonLabel,
  candidates,
  defaultDeadline,
  exceeds,
  defaultOpen,
}: {
  target: PanelPerson;
  reasonLabel: string; // "불참" 또는 "직접 제외"
  candidates: PanelCandidates;
  defaultDeadline: string; // 한국 시간 "YYYY-MM-DDTHH:mm" (지금부터 3일 후)
  exceeds: boolean; // 확정하면 정원을 넘는가
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState<FillState | undefined, FormData>(confirmFillAction, undefined);
  const over = exceeds || state?.needsOver === true;
  const [picked, setPicked] = useState("");

  return (
    <li id={`vacancy-${target.id}`} className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base">
          <strong className="text-lg">{target.name}</strong> · {target.dept} · {target.empNo}{" "}
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold dark:bg-zinc-800">{reasonLabel}</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-11 rounded-lg bg-amber-900 px-4 text-base font-semibold text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
        >
          {open ? "닫기" : reasonLabel === "불참" ? "제외하고 충원" : "충원"}
        </button>
      </div>

      {open && (
        <form action={action} className="flex flex-col gap-4 rounded-lg bg-white p-4 dark:bg-zinc-900">
          <input type="hidden" name="targetId" value={target.id} />
          {over && <input type="hidden" name="confirmOver" value="yes" />}

          {candidates.mode === "none" && (
            <p className="text-base font-medium">충원할 대기자도 미선정자도 없습니다. 수기 추가로 사람을 넣어야 합니다.</p>
          )}

          {candidates.mode === "waitlist" && (
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">대기 순번이 가장 빠른 사람을 제시합니다.</p>
              <p className="text-lg font-bold">
                {candidates.candidate.waitNo ? `대기 ${candidates.candidate.waitNo}번 · ` : ""}
                {candidates.candidate.name} · {candidates.candidate.dept} · {candidates.candidate.empNo}
              </p>
              <input type="hidden" name="candidateId" value={candidates.candidate.id} />
            </div>
          )}

          {candidates.mode === "pool" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-base font-medium">대기자가 없습니다. 미선정자 중에서 충원할 사람을 골라 주세요.</legend>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {candidates.pool.map((p) => (
                  <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-zinc-300 px-3 text-base dark:border-zinc-700">
                    <input type="radio" name="candidateId" value={p.id} checked={picked === p.id} onChange={() => setPicked(p.id)} className="h-5 w-5" />
                    {p.name} · {p.dept} · {p.empNo}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {candidates.mode !== "none" && (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor={`deadline-${target.id}`} className="text-base font-medium">
                  충원되는 사람의 회신 기한 (한국 시간)
                </label>
                <input
                  id={`deadline-${target.id}`}
                  type="datetime-local"
                  name="replyDeadline"
                  defaultValue={defaultDeadline}
                  className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base sm:w-72 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">기본값은 지금부터 3일 후입니다. 이 사람에게만 적용되는 개별 기한입니다.</p>
              </div>

              {over && (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-base font-medium text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  정원 초과 경고: 이 충원을 확정하면 선정 인원이 정원을 넘습니다. 그래도 진행하려면 아래 버튼을 눌러 주세요.
                </p>
              )}
            </>
          )}

          {state?.message && !state.needsOver && (
            <p role="alert" className="text-base font-medium text-red-700 dark:text-red-400">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {candidates.mode !== "none" && (
              <button
                type="submit"
                disabled={pending || (candidates.mode === "pool" && !picked)}
                className="h-12 rounded-lg bg-zinc-900 px-6 text-base font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {pending ? "처리 중…" : over ? "정원 초과 확정" : "확정"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 rounded-lg border border-zinc-300 px-6 text-base font-medium dark:border-zinc-700"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
