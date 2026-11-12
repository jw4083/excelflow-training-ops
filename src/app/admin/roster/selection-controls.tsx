"use client";
// 1차 선별 화면 조작 (DESIGN 2.3 "명단"): "신청" 탭의 체크박스 + "선택한 사람 선정 처리" 버튼, 선정 행의 "선별 취소" 버튼.
// 체크박스는 표 안에 있고 선정 처리 양식(select-form)은 표 위에 있다. 두 곳은 HTML의 form 속성(form="select-form")으로 이어진다.
import { useActionState } from "react";
import { cancelSelectionAction, selectApplicantsAction, type SelectionState } from "@/app/actions/selection";

export const SELECT_FORM_ID = "select-form";

function Message({ state }: { state: SelectionState | undefined }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`text-base font-medium ${
        state.status === "success" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {state.message}
    </p>
  );
}

/**
 * 표 위의 도구줄: 이 쪽 전체 선택 + 선정 처리 버튼 + 결과 메시지.
 * 마지막 신청자까지 처리해서 명단이 비어도 "N명을 선정했습니다" 결과는 남아 있어야 하므로,
 * 비어 있을 때는 조작 부분만 숨기고 이 컴포넌트(와 결과 메시지)는 계속 화면에 둔다.
 */
export function SelectionToolbar({ empty }: { empty: boolean }) {
  const [state, formAction, pending] = useActionState<SelectionState | undefined, FormData>(selectApplicantsAction, undefined);
  if (empty) return <Message state={state} />;

  const toggleAll = (checked: boolean) => {
    document
      .querySelectorAll<HTMLInputElement>(`input[name="traineeId"][form="${SELECT_FORM_ID}"]`)
      .forEach((box) => (box.checked = checked));
  };

  return (
    <form id={SELECT_FORM_ID} action={formAction} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex h-11 cursor-pointer items-center gap-3 text-base">
          <input type="checkbox" className="h-5 w-5" onChange={(e) => toggleAll(e.target.checked)} />
          이 쪽 전체 선택
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "처리 중…" : "선택한 사람 선정 처리"}
        </button>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        체크한 사람은 바로 &quot;선정&quot;이 되고, 체크하지 않은 사람은 2차 추첨 대상으로 남습니다. 체크는 지금 보고 있는 쪽에서만 적용됩니다.
      </p>
      <Message state={state} />
    </form>
  );
}

/** 선정 행의 "선별 취소" 버튼 (2차 추첨 전, 1차 선별로 선정된 사람에게만 보인다) */
export function CancelSelectionButton({ traineeId, name }: { traineeId: string; name: string }) {
  const [state, formAction, pending] = useActionState<SelectionState | undefined, FormData>(cancelSelectionAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="traineeId" value={traineeId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${name} 선별 취소`}
        className="h-11 rounded-lg border border-zinc-300 px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "처리 중…" : "선별 취소"}
      </button>
      {state?.status === "error" && (
        <p role="alert" className="max-w-xs text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
