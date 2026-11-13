"use client";
// 짧은 완료 알림. 서버가 성공을 알려 준 뒤에만 띄운다(미리 성공한 것처럼 보이지 않게).
// 화면 아래쪽에 잠깐 나타났다 사라지며, 화면 읽기 프로그램에는 aria-live로 읽힌다. 입력 오류는 여기 말고 해당 입력칸 가까이에 보여 준다.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string };
const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <p key={t.id} className="ui-toast flex max-w-md items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-base font-medium text-white shadow-lg">
            <span aria-hidden className="text-emerald-300">
              ✓
            </span>
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** 완료 알림 띄우기: const toast = useToast(); toast("저장했습니다") */
export function useToast() {
  return useContext(ToastContext);
}
