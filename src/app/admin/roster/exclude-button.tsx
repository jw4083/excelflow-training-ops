"use client";
// 선정 행의 "제외" 조작 (PLAN 작업 20, DESIGN 2.3 "명단"): 사유를 입력하고 확인한다. "제외하고 바로 충원" 이면 충원 창으로 이어진다.
import { useActionState, useState } from "react";
import { excludeAction, type FillState } from "@/app/actions/fill";

export function ExcludeButton({ traineeId, name }: { traineeId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FillState | undefined, FormData>(excludeAction, undefined);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${name} 제외`}
        className="h-11 rounded-lg border border-zinc-300 px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        제외
      </button>
    );
  }

  return (
    <form action={action} className="flex min-w-64 flex-col gap-2 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
      <input type="hidden" name="traineeId" value={traineeId} />
      <label htmlFor={`reason-${traineeId}`} className="text-base font-medium">
        {name}님 제외 사유
      </label>
      <input
        id={`reason-${traineeId}`}
        name="reason"
        required
        maxLength={200}
        className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
      />
      {state?.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="next"
          value="fill"
          disabled={pending}
          className="h-11 rounded-lg bg-primary px-4 text-base font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "처리 중…" : "제외하고 바로 충원"}
        </button>
        <button type="submit" disabled={pending} className="h-11 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700">
          제외만 하기
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg px-4 text-base font-medium underline">
          취소
        </button>
      </div>
    </form>
  );
}
