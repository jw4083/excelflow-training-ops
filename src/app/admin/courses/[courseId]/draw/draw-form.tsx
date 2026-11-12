"use client";
// 추첨 입력 양식 (DESIGN 2.3 "추첨"): 선발 인원(정원), 대기 인원, (선택) 새 선정자 회신 기한 + 추첨 실행 버튼.
// 입력하는 동안 "이번에 뽑는 인원 = 정원 − 현재 선정 수"를 미리 계산해 보여 주고, 0 이하이면 버튼을 막는다.
import { CourseIdField } from "@/components/admin/CourseIdField";
import { useActionState, useState, type ReactNode } from "react";
import { runDrawAction, type DrawState } from "@/app/actions/draw";
import { MAX_DRAW_SEATS, type DrawFormField } from "@/domain/draw";

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300";

function Field({ name, label, hint, error, children }: { name: DrawFormField; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-base font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function DrawForm({
  initial,
  selectedCount,
  poolLabel,
  redraw,
}: {
  initial: DrawState;
  selectedCount: number; // 현재 선정 수
  poolLabel: string; // "신청 28명" 또는 "대기·미선정 12명" 같은 추첨 대상 설명
  redraw: boolean;
}) {
  const [state, formAction, pending] = useActionState(runDrawAction, initial);
  const [capacityInput, setCapacityInput] = useState(initial.values.capacity);
  const e = state.errors ?? {};
  const v = state.values;
  const aria = (name: DrawFormField) => ({
    "aria-invalid": e[name] ? (true as const) : undefined,
    "aria-describedby": e[name] ? `${name}-error` : undefined,
  });

  // 입력한 정원으로 "이번에 뽑는 인원"을 미리 계산한다 (실제 검사는 서버에서 다시 한다)
  const typed = /^\d+$/.test(capacityInput.trim()) ? Number(capacityInput.trim()) : null;
  const toDraw = typed === null ? null : typed - selectedCount;
  const full = toDraw !== null && toDraw <= 0;

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => {
        // 추첨은 되돌릴 수 없고 결과가 수정 불가 기록으로 남으므로, 실행 전에 한 번 더 확인한다 (DESIGN 2.3)
        if (!window.confirm("추첨을 실행하면 되돌릴 수 없습니다. 결과는 수정할 수 없는 기록으로 남습니다.\n실행할까요?")) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-5"
    >
      <CourseIdField />
      <p className="text-base text-zinc-700 dark:text-zinc-300">
        추첨 대상: <strong>{poolLabel}</strong>
      </p>

      <Field
        name="capacity"
        label="선발 인원 (정원)"
        hint="1차 선별로 이미 선정된 사람을 포함한 전체 인원입니다."
        error={e.capacity}
      >
        <input
          id="capacity"
          name="capacity"
          type="text"
          inputMode="numeric"
          defaultValue={v.capacity}
          onChange={(ev) => setCapacityInput(ev.target.value)}
          maxLength={String(MAX_DRAW_SEATS).length}
          className={inputClass}
          {...aria("capacity")}
        />
      </Field>

      <p
        role="status"
        className={`rounded-lg px-4 py-3 text-base ${
          full
            ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
            : "bg-zinc-50 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
      >
        {toDraw === null
          ? `이번에 뽑는 인원 = 정원 − 현재 선정 수(${selectedCount}명). 선발 인원을 입력하면 계산됩니다.`
          : full
            ? `이미 정원이 찼습니다. 정원 ${typed}명, 현재 선정 ${selectedCount}명이라 새로 뽑을 인원이 없습니다.`
            : `이번에 뽑는 인원 = 정원 ${typed} − 현재 선정 ${selectedCount} = ${toDraw}명`}
      </p>

      <Field
        name="waitSeats"
        label="대기 인원"
        hint="뽑은 다음 순서로 대기 순번(1번부터)을 받는 인원입니다. 대기자가 없으면 0을 입력합니다. 나머지는 미선정이 됩니다."
        error={e.waitSeats}
      >
        <input
          id="waitSeats"
          name="waitSeats"
          type="text"
          inputMode="numeric"
          defaultValue={v.waitSeats}
          maxLength={String(MAX_DRAW_SEATS).length}
          className={inputClass}
          {...aria("waitSeats")}
        />
      </Field>

      <Field
        name="replyDeadline"
        label="새로 선정되는 사람의 회신 기한 (선택, 한국 시간)"
        hint="비워 두면 과정 정보의 회신 기한이 적용됩니다."
        error={e.replyDeadline}
      >
        <input id="replyDeadline" name="replyDeadline" type="datetime-local" defaultValue={v.replyDeadline} className={inputClass} {...aria("replyDeadline")} />
      </Field>

      {redraw && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          재추첨입니다. 이전 기록은 그대로 남고 새 기록이 추가됩니다. 선정된 사람은 그대로 두고, 대기·미선정인 사람 중에서만 다시 뽑으며 대기 순번은 새 기록 기준으로 1번부터 다시 매깁니다.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <button
            type="submit"
            disabled={pending || full}
            className="h-12 rounded-lg bg-primary px-8 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {pending ? "추첨 중…" : redraw ? "재추첨 실행" : "추첨 실행"}
          </button>
        </div>
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-base font-semibold ${
              state.status === "success" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
