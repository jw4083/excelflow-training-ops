"use client";
// 명단 행 하나에 붙는 작업: "선별 취소"(추첨 전 우선 선정자), "신청으로 복구"(추첨 전 사전 미선정자).
// 둘 다 앱 확인창으로 한 번 더 확인하고, 서버가 처리를 마친 뒤에만 완료 알림을 띄운다. 실패하면 확인창 안에 이유를 보여 준다.
import { useState } from "react";
import { cancelSelectionAction, restoreRejectedAction, type SelectionState } from "@/app/actions/selection";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useServerAction } from "@/components/ui/useServerAction";

function RowConfirm({
  courseId,
  traineeId,
  name,
  label,
  title,
  body,
  confirmLabel,
  action,
}: {
  courseId: string;
  traineeId: string;
  name: string;
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
  action: (prev: SelectionState | undefined, formData: FormData) => Promise<SelectionState>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction(action);
  const toast = useToast();

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={`${name} ${label}`}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel={confirmLabel}
        pending={pending}
        error={error}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={() =>
          run({ courseId, traineeId }, (result) => {
            if ("networkError" in result) return setError(result.networkError);
            if (result.status !== "success") return setError(result.message ?? "처리하지 못했습니다.");
            setOpen(false);
            setError(null);
            toast(result.message ?? "처리했습니다.");
          })
        }
      >
        <p className="break-keep">
          <strong>{name}</strong>님 — {body}
        </p>
      </ConfirmDialog>
    </>
  );
}

/** 선정 행의 "선별 취소" (2차 추첨 전, 우선 선정(1차 선별)된 사람에게만 보인다) */
export function CancelSelectionButton({ courseId, traineeId, name }: { courseId: string; traineeId: string; name: string }) {
  return (
    <RowConfirm
      courseId={courseId}
      traineeId={traineeId}
      name={name}
      label="선별 취소"
      title="우선 선정을 취소할까요?"
      body={'"신청" 상태로 되돌아가 2차 추첨 대상이 됩니다. 취소 기록은 변경 이력에 남습니다.'}
      confirmLabel="선별 취소"
      action={cancelSelectionAction}
    />
  );
}

/** 사전 미선정 행의 "신청으로 복구" (2차 추첨 전에만 보인다) */
export function RestoreRejectedButton({ courseId, traineeId, name }: { courseId: string; traineeId: string; name: string }) {
  return (
    <RowConfirm
      courseId={courseId}
      traineeId={traineeId}
      name={name}
      label="신청으로 복구"
      title="미선정 처리를 되돌릴까요?"
      body={'사전 미선정을 취소하고 "신청" 상태로 되돌립니다. 다시 추첨 대상이 되며, 복구 기록이 변경 이력에 남습니다.'}
      confirmLabel="신청으로 복구"
      action={restoreRejectedAction}
    />
  );
}
