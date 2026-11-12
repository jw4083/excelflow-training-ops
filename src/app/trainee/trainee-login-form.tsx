"use client";
// 교육생 로그인 양식 (PLAN 작업 16, DESIGN 2.3 "교육생 화면" 1단계): 사번 + 비밀번호 + 로그인 버튼.
// 휴대폰에서 쓰기 편하도록 입력칸·버튼은 높이 48px, 글자는 16px 이상으로 한다 (PRD M2-11).
import { useActionState } from "react";
import { loginTraineeAction, type TraineeLoginState } from "@/app/actions/trainee";

const inputClass =
  "h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300";

export function TraineeLoginForm() {
  const [state, formAction, pending] = useActionState<TraineeLoginState, FormData>(loginTraineeAction, { empNo: "" });

  return (
    <form action={formAction} className="flex w-full flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2 text-base font-medium">
        사번
        {/* 글자 입력 칸이라 앞자리 0(001234)이 그대로 유지되고, inputMode로 휴대폰에서는 숫자 자판이 뜬다 */}
        <input
          name="empNo"
          type="text"
          inputMode="numeric"
          autoComplete="username"
          autoCapitalize="none"
          maxLength={6}
          placeholder="숫자 6자리"
          defaultValue={state.empNo}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "trainee-login-error" : undefined}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-2 text-base font-medium">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "trainee-login-error" : undefined}
          className={inputClass}
        />
      </label>

      {state.error && (
        <p id="trainee-login-error" role="alert" className="text-base font-medium text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-primary px-4 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
