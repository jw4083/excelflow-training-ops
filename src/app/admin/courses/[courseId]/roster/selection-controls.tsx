"use client";
// 1차 선별 화면 조작 (DESIGN 2.3 "명단"): "신청" 탭의 체크박스 + "선택한 사람 선정 처리" 버튼, 선정 행의 "선별 취소" 버튼.
// 체크박스는 표 안에 있고 선정 처리 양식(select-form)은 표 위에 있다. 두 곳은 HTML의 form 속성(form="select-form")으로 이어진다.
import { CourseIdField } from "@/components/admin/CourseIdField";
import { useActionState } from "react";
import {
  cancelSelectionAction,
  rejectApplicantsAction,
  restoreRejectedAction,
  selectApplicantsAction,
  type SelectionState,
} from "@/app/actions/selection";

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
  const [rejectState, rejectAction, rejectPending] = useActionState<SelectionState | undefined, FormData>(rejectApplicantsAction, undefined);
  if (empty)
    return (
      <>
        <Message state={state} />
        <Message state={rejectState} />
      </>
    );

  // 미선정 처리 전에: 체크한 인원을 세어 확인창에 보여 주고, 아무도 고르지 않았으면 막는다
  const confirmReject = (event: React.MouseEvent<HTMLButtonElement>) => {
    const count = document.querySelectorAll(`input[name="traineeId"][form="${SELECT_FORM_ID}"]:checked`).length;
    if (count === 0) {
      event.preventDefault();
      window.alert("미선정 처리할 사람을 먼저 체크해 주세요.");
      return;
    }
    const reason = (document.getElementById("reject-reason") as HTMLInputElement | null)?.value.trim();
    if (!reason) return; // 사유 칸의 필수 표시가 안내한다
    if (!window.confirm(`체크한 ${count}명을 미선정 처리합니다.
사유: ${reason}

처리된 사람은 추첨과 충원 대상에서 빠지며, 추첨 전에는 "신청"으로 되돌릴 수 있습니다. 진행할까요?`)) {
      event.preventDefault();
    }
  };

  // 우선 선정 전에: 체크한 인원이 있는지, 공통 사유를 적었는지 확인하고 대상 인원·사유를 확인창에 보여 준다
  const confirmSelect = (event: React.MouseEvent<HTMLButtonElement>) => {
    const count = document.querySelectorAll(`input[name="traineeId"][form="${SELECT_FORM_ID}"]:checked`).length;
    const reason = (document.getElementById("select-reason") as HTMLInputElement | null)?.value.trim();
    if (count === 0) {
      event.preventDefault();
      window.alert("선정할 신청자를 먼저 체크해 주세요.");
      return;
    }
    if (!reason) {
      event.preventDefault();
      window.alert("선정 사유를 입력해 주세요.");
      return;
    }
    if (!window.confirm(`체크한 ${count}명을 우선 선정합니다.
사유(모든 대상자에게 기록): ${reason}

진행할까요?`)) event.preventDefault();
  };

  const toggleAll = (checked: boolean) => {
    document
      .querySelectorAll<HTMLInputElement>(`input[name="traineeId"][form="${SELECT_FORM_ID}"]`)
      .forEach((box) => (box.checked = checked));
  };

  return (
    <form id={SELECT_FORM_ID} action={formAction} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800">
      <CourseIdField />
      <div className="flex flex-col gap-2">
        <label htmlFor="select-reason" className="text-base font-medium">
          체크한 사람을 우선 선정 — 선정 사유 (필수, 선택한 모든 사람에게 같은 사유가 기록됩니다)
        </label>
        <input
          id="select-reason"
          name="selectReason"
          maxLength={300}
          placeholder="예: 직무 필수 교육 대상자"
          className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex h-11 cursor-pointer items-center gap-3 text-base">
          <input type="checkbox" className="h-5 w-5" onChange={(e) => toggleAll(e.target.checked)} />
          이 쪽 전체 선택
        </label>
        <button
          type="submit"
          disabled={pending}
          onClick={confirmSelect}
          className="h-11 rounded-lg bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "처리 중…" : "선택한 사람 우선 선정"}
        </button>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        체크한 사람은 사유와 함께 바로 &quot;선정&quot;(우선 선정)이 되고, 체크하지 않은 사람은 2차 추첨 대상으로 남습니다. 체크는 지금 보고 있는 쪽에서만 적용됩니다.
      </p>
      <Message state={state} />

      <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <label htmlFor="reject-reason" className="text-base font-medium">
          체크한 사람을 미선정 처리 — 미선정 사유 (필수)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="reject-reason"
            name="rejectReason"
            maxLength={300}

            form={SELECT_FORM_ID}
            placeholder="예: 대상 직급이 아님"
            className="h-12 min-w-64 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            formAction={rejectAction}
            disabled={rejectPending}
            onClick={confirmReject}
            className="h-11 rounded-lg border border-red-300 px-5 text-base font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
          >
            {rejectPending ? "처리 중…" : "선택한 사람 미선정 처리"}
          </button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          미선정 처리한 사람은 명단에 기록이 남지만 추첨·충원 대상에서 빠집니다. 추첨 전이라면 &quot;미선정&quot; 탭에서 &quot;신청&quot;으로 되돌릴 수 있습니다.
        </p>
        <Message state={rejectState} />
      </div>
    </form>
  );
}

/** 선정 행의 "선별 취소" 버튼 (2차 추첨 전, 1차 선별로 선정된 사람에게만 보인다) */
export function CancelSelectionButton({ traineeId, name }: { traineeId: string; name: string }) {
  const [state, formAction, pending] = useActionState<SelectionState | undefined, FormData>(cancelSelectionAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <CourseIdField />
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

/** 미선정 행의 "신청으로 복구" 버튼 (2차 추첨 전, 담당자가 직접 미선정 처리한 사람에게만 보인다) */
export function RestoreRejectedButton({ traineeId, name }: { traineeId: string; name: string }) {
  const [state, formAction, pending] = useActionState<SelectionState | undefined, FormData>(restoreRejectedAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <CourseIdField />
      <input type="hidden" name="traineeId" value={traineeId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${name} 신청으로 복구`}
        onClick={(event) => {
          if (!window.confirm(`${name}님의 미선정 처리를 취소하고 "신청" 상태로 되돌립니다. 진행할까요?`)) event.preventDefault();
        }}
        className="h-11 rounded-lg border border-zinc-300 px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "처리 중…" : "신청으로 복구"}
      </button>
      {state?.status === "error" && (
        <p role="alert" className="max-w-xs text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
