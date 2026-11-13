"use client";
// 한 번 더 확인하고 실행하는 버튼 (과정 보관·보관 해제, 안내 공개·비공개 등).
// 브라우저 기본 확인창 대신 앱 확인창을 쓰고, 서버가 처리를 마친 뒤에만 완료 알림을 띄운다. 처리 중에는 버튼이 "처리 중"으로 바뀌고 다시 누를 수 없다.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { ButtonVariant } from "@/components/ui/styles";

export function ArchiveButton({
  action,
  label,
  confirmText,
  title,
  confirmLabel,
  tone = "primary",
  variant = "secondary",
  successMessage,
}: {
  action: () => Promise<void>;
  label: string;
  confirmText: string;
  title?: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  variant?: ButtonVariant;
  successMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        startTransition(() => setOpen(false));
        if (successMessage) toast(successMessage);
      } catch (e) {
        // 화면 이동(redirect)은 Next.js가 처리하도록 그대로 넘긴다
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setError("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} pending={pending && !open}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title ?? label}
        confirmLabel={confirmLabel ?? label}
        tone={tone}
        pending={pending}
        error={error}
        onConfirm={run}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      >
        <p className="whitespace-pre-line break-keep">{confirmText}</p>
      </ConfirmDialog>
    </>
  );
}
