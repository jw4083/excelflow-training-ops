// 담당자 로그인 화면 (첫 화면 `/`).
// 이미 로그인한 사람은 proxy(src/proxy.ts)가 명단 화면으로 보내므로, 이 화면은 쿠키를 읽지 않는 정적 화면이다.
import { Mascot, MascotCredit } from "@/components/Mascot";
import { LoginForm } from "./login-form";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex items-center gap-4 rounded-card bg-primary-soft p-5">
          <Mascot name="키우미" size={96} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight break-keep">교육 운영 통합관리</h1>
            <p className="mt-1 text-base text-zinc-700">교육운영 담당자 로그인</p>
          </div>
        </div>
        <div className="rounded-card border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(20,33,61,0.05)]">
          <LoginForm />
        </div>
        <MascotCredit />
      </div>
    </main>
  );
}
