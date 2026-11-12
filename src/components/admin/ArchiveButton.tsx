"use client";
// 보관·보관 해제 버튼: 누르면 한 번 더 확인한 뒤에만 실행한다 (실수로 눌러도 바로 바뀌지 않게).
export function ArchiveButton({ action, label, confirmText }: { action: () => Promise<void>; label: string; confirmText: string }) {
  return (
    <form action={action}>
      <button
        type="submit"
        onClick={(event) => {
          if (!window.confirm(confirmText)) event.preventDefault();
        }}
        className="h-11 rounded-lg border border-zinc-300 bg-white px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100"
      >
        {label}
      </button>
    </form>
  );
}
