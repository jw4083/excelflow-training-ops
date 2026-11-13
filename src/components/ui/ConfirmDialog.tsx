"use client";
// 앱 디자인에 맞춘 확인창 (브라우저 기본 confirm·alert 대신).
// - 브라우저 기본 <dialog>의 모달 기능을 쓴다: 뒤 화면을 누를 수 없고, Tab 초점이 확인창 안에서만 돈다.
// - 열리면 첫 입력칸(없으면 위험한 작업은 "취소", 아니면 확인 버튼)에 초점을 두고, 닫히면 열기 전에 있던 버튼으로 초점을 돌려준다.
// - Esc나 취소로 닫을 수 있다. 처리 중에는 닫히지 않는다(중복 실행·결과 놓침 방지).
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import type { ButtonVariant } from "./styles";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode; // 대상 인원·사유 입력·주의 문구 등
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  confirmDisabled?: boolean;
  error?: string | null; // 서버가 거부한 이유 (확인창 안에 그대로 보여 준다)
  onConfirm: () => void;
  onClose: () => void;
  /** 확인 버튼 옆에 둘 다른 선택지 (예: "선정 취소하고 바로 충원") */
  extraAction?: { label: string; onClick: () => void; variant?: ButtonVariant };
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "취소",
  tone = "primary",
  pending = false,
  confirmDisabled = false,
  error,
  onConfirm,
  onClose,
  extraAction,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      // 첫 입력칸 → (위험한 작업이면) 취소 → 확인 순서로 초점
      const field = dialog.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select");
      const fallback = dialog.querySelector<HTMLElement>(tone === "danger" ? "[data-dialog-cancel]" : "[data-dialog-confirm]");
      (field ?? fallback)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus?.();
    }
  }, [open, tone]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="ui-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-zinc-900 shadow-xl"
      onCancel={(event) => {
        event.preventDefault(); // Esc: 처리 중이 아니면 닫는다 (닫는 일은 부모 상태로만 한다)
        if (!pending) onClose();
      }}
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        {children && <div className="flex flex-col gap-3 text-base">{children}</div>}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button data-dialog-cancel variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          {extraAction && (
            <Button variant={extraAction.variant ?? "secondary"} onClick={extraAction.onClick} disabled={pending || confirmDisabled}>
              {extraAction.label}
            </Button>
          )}
          <Button data-dialog-confirm variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} pending={pending} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
