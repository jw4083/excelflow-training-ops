// 담당자 로그인 화면 (첫 화면 `/`).
// 이미 로그인한 사람은 proxy(src/proxy.ts)가 명단 화면으로 보내므로, 이 화면은 쿠키를 읽지 않는 정적 화면이다.
import { LoginForm } from "./login-form";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">교육 운영 통합관리</h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">교육운영 담당자 로그인</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
