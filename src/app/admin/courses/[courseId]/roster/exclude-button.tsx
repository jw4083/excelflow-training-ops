"use client";
// 선정 행의 "선정 취소": 앱 확인창에서 사유를 적고 "선정 취소만" 또는 "취소하고 바로 충원"을 고른다.
// 사유가 비어 있으면 입력칸 바로 아래에 알려 주고, 서버가 거부하면 확인창 안에 이유를 보여 준다(쓴 사유는 남는다).
import { useState } from "react";
import { excludeAction, type FillState } from "@/app/actions/fill";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fieldErrorClass, textareaClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useServerAction } from "@/components/ui/useServerAction";

export function ExcludeButton({ courseId, traineeId, name }: { courseId: string; traineeId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction<FillState>(excludeAction);
  const toast = useToast();

  const submit = (next?: "fill") => {
    if (!reason.trim()) return setFieldError("선정 취소 사유를 입력해 주세요.");
    setFieldError(null);
    setError(null);
    run({ courseId, traineeId, reason, next }, (result) => {
      if ("networkError" in result) return setError(result.networkError);
      if (!result.ok) return setError(result.message ?? "처리하지 못했습니다.");
      setOpen(false);
      setReason("");
      toast(result.message ?? "선정을 취소했습니다.");
    });
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={`${name} 선정 취소`}>
        선정 취소
      </Button>
      <ConfirmDialog
        open={open}
        title={`${name}님의 선정을 취소할까요?`}
        confirmLabel="선정 취소만"
        tone="danger"
        pending={pending}
        error={error}
        onConfirm={() => submit()}
        extraAction={{ label: "취소하고 바로 충원", onClick: () => submit("fill") }}
        onClose={() => {
          setOpen(false);
          setError(null);
          setFieldError(null);
        }}
      >
        <p className="break-keep">선정 인원이 한 명 줄어 &quot;충원이 필요한 자리&quot;로 알림에 표시됩니다. 사유는 변경 이력에 남습니다.</p>
        <label htmlFor={`exclude-reason-${traineeId}`} className="font-semibold">
          선정 취소 사유 <span className="text-red-700">(필수)</span>
        </label>
        <textarea
          id={`exclude-reason-${traineeId}`}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setFieldError(null);
          }}
          maxLength={200}
          rows={3}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `exclude-reason-${traineeId}-error` : undefined}
          className={textareaClass}
        />
        {fieldError && (
          <p id={`exclude-reason-${traineeId}-error`} className={fieldErrorClass}>
            {fieldError}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
