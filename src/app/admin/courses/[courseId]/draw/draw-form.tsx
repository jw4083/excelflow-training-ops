"use client";
// 추첨 입력 양식 (DESIGN 2.3 "추첨"): 선발 인원(정원), 대기 인원, (선택) 새 선정자 회신 기한 + 추첨 실행 버튼.
// 입력하는 동안 "이번에 뽑는 인원 = 정원 − 현재 선정 수"를 미리 계산해 보여 주고, 0 이하이면 버튼을 막는다.
import { CourseIdField } from "@/components/admin/CourseIdField";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { runDrawAction, type DrawState } from "@/app/actions/draw";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { inputClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { MAX_DRAW_SEATS, type DrawFormField } from "@/domain/draw";

function Field({ name, label, hint, error, children }: { name: DrawFormField; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-base font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function DrawForm({
  initial,
  selectedCount,
  poolLabel,
  redraw,
}: {
  initial: DrawState;
  selectedCount: number; // 현재 선정 수
  poolLabel: string; // "신청 28명" 또는 "대기·미선정 12명" 같은 추첨 대상 설명
  redraw: boolean;
}) {
  const [state, formAction, pending] = useActionState(runDrawAction, initial);
  const [capacityInput, setCapacityInput] = useState(initial.values.capacity);
  const e = state.errors ?? {};
  const v = state.values;
  const aria = (name: DrawFormField) => ({
    "aria-invalid": e[name] ? (true as const) : undefined,
    "aria-describedby": e[name] ? `${name}-error` : undefined,
  });

  // 입력한 정원으로 "이번에 뽑는 인원"을 미리 계산한다 (실제 검사는 서버에서 다시 한다)
  const typed = /^\d+$/.test(capacityInput.trim()) ? Number(capacityInput.trim()) : null;
  const toDraw = typed === null ? null : typed - selectedCount;
  const full = toDraw !== null && toDraw <= 0;

  // 추첨은 되돌릴 수 없으므로 앱 확인창에서 한 번 더 확인한다. 확인하면 그때 모아 둔 입력값으로 서버에 보낸다.
  const [confirming, setConfirming] = useState(false);
  const pendingData = useRef<FormData | null>(null);
  const [waitPreview, setWaitPreview] = useState("");
  const toast = useToast();
  const lastState = useRef(state);
  useEffect(() => {
    // 서버가 추첨을 마쳤다고 알려 준 뒤에만 완료 알림을 띄운다 (결과를 미리 보여 주지 않는다)
    if (state !== lastState.current && state.status === "success" && state.message) toast(state.message);
    lastState.current = state;
  }, [state, toast]);

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => {
        // 추첨은 되돌릴 수 없고 결과가 수정 불가 기록으로 남으므로, 실행 전에 앱 확인창으로 한 번 더 확인한다 (DESIGN 2.3)
        event.preventDefault();
        pendingData.current = new FormData(event.currentTarget);
        setWaitPreview(String(pendingData.current.get("waitSeats") ?? ""));
        setConfirming(true);
      }}
      className="flex flex-col gap-5"
    >
      <CourseIdField />
      <p className="text-base text-zinc-700 dark:text-zinc-300">
        추첨 대상: <strong>{poolLabel}</strong>
      </p>

      <Field
        name="capacity"
        label="선발 인원 (정원)"
        hint="1차 선별로 이미 선정된 사람을 포함한 전체 인원입니다."
        error={e.capacity}
      >
        <input
          id="capacity"
          name="capacity"
          type="text"
          inputMode="numeric"
          defaultValue={v.capacity}
          onChange={(ev) => setCapacityInput(ev.target.value)}
          maxLength={String(MAX_DRAW_SEATS).length}
          className={inputClass}
          {...aria("capacity")}
        />
      </Field>

      <p
        role="status"
        className={`rounded-lg px-4 py-3 text-base ${
          full
            ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
            : "bg-zinc-50 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
      >
        {toDraw === null
          ? `이번에 뽑는 인원 = 정원 − 현재 선정 수(${selectedCount}명). 선발 인원을 입력하면 계산됩니다.`
          : full
            ? `이미 정원이 찼습니다. 정원 ${typed}명, 현재 선정 ${selectedCount}명이라 새로 뽑을 인원이 없습니다.`
            : `이번에 뽑는 인원 = 정원 ${typed} − 현재 선정 ${selectedCount} = ${toDraw}명`}
      </p>

      <Field
        name="waitSeats"
        label="대기 인원"
        hint="뽑은 다음 순서로 대기 순번(1번부터)을 받는 인원입니다. 대기자가 없으면 0을 입력합니다. 나머지는 미선정이 됩니다."
        error={e.waitSeats}
      >
        <input
          id="waitSeats"
          name="waitSeats"
          type="text"
          inputMode="numeric"
          defaultValue={v.waitSeats}
          maxLength={String(MAX_DRAW_SEATS).length}
          className={inputClass}
          {...aria("waitSeats")}
        />
      </Field>

      <Field
        name="replyDeadline"
        label="새로 선정되는 사람의 회신 기한 (선택, 한국 시간)"
        hint="비워 두면 과정 정보의 회신 기한이 적용됩니다."
        error={e.replyDeadline}
      >
        <input id="replyDeadline" name="replyDeadline" type="datetime-local" defaultValue={v.replyDeadline} className={inputClass} {...aria("replyDeadline")} />
      </Field>

      {redraw && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          재추첨입니다. 이전 기록은 그대로 남고 새 기록이 추가됩니다. 선정된 사람은 그대로 두고, 대기·미선정인 사람 중에서만 다시 뽑으며 대기 순번은 새 기록 기준으로 1번부터 다시 매깁니다.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <Button type="submit" variant="primary" size="lg" pending={pending} pendingLabel="추첨 중" disabled={full}>
            {redraw ? "재추첨 실행" : "추첨 실행"}
          </Button>
        </div>
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-base font-semibold ${
              state.status === "success" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title={redraw ? "재추첨을 실행할까요?" : "추첨을 실행할까요?"}
        confirmLabel={redraw ? "재추첨 실행" : "추첨 실행"}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          const data = pendingData.current;
          setConfirming(false);
          if (data) startTransition(() => formAction(data));
        }}
      >
        <ul className="flex flex-col gap-1">
          <li>
            선발 인원(정원) <strong>{typed ?? "-"}명</strong> · 현재 선정 {selectedCount}명
          </li>
          <li>
            이번에 뽑는 인원 <strong>{toDraw ?? "-"}명</strong> · 대기 <strong>{waitPreview || "0"}명</strong>
          </li>
          <li>추첨 대상: {poolLabel}</li>
        </ul>
        <p className="font-semibold text-red-800 break-keep">실행하면 되돌릴 수 없고, 결과는 수정할 수 없는 기록으로 남습니다.</p>
      </ConfirmDialog>
    </form>
  );
}
