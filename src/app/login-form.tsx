"use client";
// 담당자 로그인 입력 양식 (DESIGN 2.3: 비밀번호 1칸 + 로그인 버튼, 틀리면 같은 문구만 표시)
import { useActionState } from "react";
import { loginAdmin, type LoginState } from "@/app/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAdmin, undefined);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-base font-medium">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "login-error" : undefined}
          className="h-12 rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
        />
      </label>

      {state?.error && (
        <p id="login-error" role="alert" className="text-base text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-primary px-4 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
