"use client";
// 과정 정보 입력 양식 (DESIGN 2.3): 과정명, 일정(시작일·시작 시각·종료일), 장소, 안내문, 회신 기한, 참석 취소 마감 + 저장 버튼 + 최종 수정 일시
import { CourseIdField } from "@/components/admin/CourseIdField";
import { useActionState, type ReactNode } from "react";
import { saveCourse, type CourseFormState } from "@/app/actions/course";
import type { CourseFormField } from "@/domain/course";

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300";

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: CourseFormField;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
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

export function CourseForm({
  initial,
  action = saveCourse,
  submitLabel = "저장",
}: {
  initial: CourseFormState;
  action?: (prev: CourseFormState, formData: FormData) => Promise<CourseFormState>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const e = state.errors ?? {};
  const v = state.values;
  const aria = (name: CourseFormField) => ({
    "aria-invalid": e[name] ? (true as const) : undefined,
    "aria-describedby": e[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <CourseIdField />
      <Field name="name" label="과정명" error={e.name}>
        <input id="name" name="name" type="text" defaultValue={v.name} maxLength={100} className={inputClass} {...aria("name")} />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field name="startDate" label="시작일" error={e.startDate}>
          <input id="startDate" name="startDate" type="date" defaultValue={v.startDate} className={inputClass} {...aria("startDate")} />
        </Field>
        <Field name="startTime" label="시작 시각 (한국 시간)" error={e.startTime}>
          <input id="startTime" name="startTime" type="time" defaultValue={v.startTime ?? ""} className={inputClass} {...aria("startTime")} />
        </Field>
        <Field name="endDate" label="종료일" error={e.endDate}>
          <input id="endDate" name="endDate" type="date" defaultValue={v.endDate} className={inputClass} {...aria("endDate")} />
        </Field>
      </div>

      <Field name="place" label="장소" error={e.place}>
        <input id="place" name="place" type="text" defaultValue={v.place} maxLength={100} className={inputClass} {...aria("place")} />
      </Field>

      <Field name="notice" label="안내문" hint="교육생 화면에 그대로 보이며, 줄바꿈이 유지됩니다. 비워 두었다가 나중에 채워도 됩니다." error={e.notice}>
        <textarea
          id="notice"
          name="notice"
          rows={8}
          defaultValue={v.notice}
          className={`${inputClass} h-auto min-h-40 py-3`}
          {...aria("notice")}
        />
      </Field>

      <Field
        name="replyDeadline"
        label="회신 기한 (한국 시간)"
        hint="이 시각이 지나면 교육생은 회신을 제출할 수 없습니다. 담당자는 기한이 지나도 대신 입력할 수 있습니다."
        error={e.replyDeadline}
      >
        <input id="replyDeadline" name="replyDeadline" type="datetime-local" defaultValue={v.replyDeadline} className={inputClass} {...aria("replyDeadline")} />
      </Field>

      <Field
        name="cancelDeadline"
        label="참석 취소 마감 (한국 시간, 선택)"
        hint="회신 기한이 지난 뒤에도 참석으로 회신한 교육생은 이 시각까지 불참으로 바꿀 수 있습니다(사유 필수). 회신 기한과 교육 시작 사이로 정해 주세요. 비워 두면 회신 기한 뒤에는 바꿀 수 없습니다."
        error={e.cancelDeadline}
      >
        <input id="cancelDeadline" name="cancelDeadline" type="datetime-local" defaultValue={v.cancelDeadline ?? ""} className={inputClass} {...aria("cancelDeadline")} />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-lg bg-primary px-8 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "저장 중…" : submitLabel}
        </button>
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-base font-medium ${
              state.status === "saved"
                ? "text-green-700 dark:text-green-400"
                : state.status === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>

      <p className="border-t border-zinc-200 pt-4 text-base text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
        최종 수정 일시:{" "}
        <strong className="font-semibold">{state.updatedAtText ?? "아직 저장된 과정 정보가 없습니다"}</strong>
      </p>
    </form>
  );
}
