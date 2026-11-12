// 아직 만들지 않은 담당자 화면의 임시 자리. 메뉴가 404로 이어지지 않게 하고, 로그인 확인이 각 화면에서도 되는지 보여 준다.
// 각 화면을 만드는 작업(9, 11, 13, 14, 19)에서 이 자리를 실제 화면으로 바꾼다.
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";

async function PlaceholderContent({ title, note }: { title: string; note: string }) {
  await requireAdmin(); // proxy가 막지 못한 경우를 대비해 화면마다 한 번 더 확인
  return (
    <main className="flex flex-col gap-3 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-base text-zinc-600 dark:text-zinc-400">{note}</p>
    </main>
  );
}

export function AdminPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-base text-zinc-600 dark:text-zinc-400">불러오는 중…</p>}>
      <PlaceholderContent title={title} note={note} />
    </Suspense>
  );
}
