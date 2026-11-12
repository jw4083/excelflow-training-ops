"use client";
// 최종 안내 등록·수정 양식: 제목, 내용, 링크(https), 버튼 글, 준비 기한, 준비 필요 여부, 공개 여부.
// 이미 공개된 안내를 수정하면 교육생에게 "변경된 안내"로 보이므로, 저장 전에 한 번 더 확인한다.
import { useActionState } from "react";
import { saveGuideAction, type GuideFormState } from "@/app/actions/guides";
import { CourseIdField } from "@/components/admin/CourseIdField";
import type { GuideFormField } from "@/domain/guides";

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-red-600 dark:border-zinc-700 dark:bg-zinc-900";

export function GuideForm({
  initial,
  guideId,
  wasPublished,
  cancelHref,
}: {
  initial: GuideFormState;
  guideId?: string;
  wasPublished: boolean; // 이미 공개된 안내를 고치는 중인가
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState(saveGuideAction, initial);
  const v = state.values;
  const e = state.errors ?? {};
  const err = (name: GuideFormField) =>
    e[name] && (
      <p role="alert" className="text-sm text-red-600">
        {e[name]}
      </p>
    );

  return (
    <form
      action={action}
      noValidate
      onSubmit={(event) => {
        if (
          wasPublished &&
          !window.confirm("이미 공개된 안내입니다. 내용을 바꾸면 교육생에게 '변경된 안내'로 표시되고, 이미 확인한 교육생도 다시 확인해야 합니다. 저장할까요?")
        ) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4"
    >
      <CourseIdField />
      {guideId && <input type="hidden" name="guideId" value={guideId} />}
      <div className="flex flex-col gap-2">
        <label htmlFor="g-title" className="text-base font-medium">
          안내 제목
        </label>
        <input id="g-title" name="title" defaultValue={v.title} maxLength={100} className={inputClass} aria-invalid={e.title ? true : undefined} />
        {err("title")}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="g-body" className="text-base font-medium">
          내용 (줄바꿈이 유지됩니다)
        </label>
        <textarea id="g-body" name="body" defaultValue={v.body} rows={6} maxLength={3000} className={`${inputClass} h-auto py-3`} aria-invalid={e.body ? true : undefined} />
        {err("body")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="g-link" className="text-base font-medium">
            링크 (선택, https:// 만)
          </label>
          <input id="g-link" name="linkUrl" defaultValue={v.linkUrl} maxLength={500} inputMode="url" className={inputClass} aria-invalid={e.linkUrl ? true : undefined} />
          {err("linkUrl")}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="g-label" className="text-base font-medium">
            링크 버튼 글 (선택)
          </label>
          <input id="g-label" name="linkLabel" defaultValue={v.linkLabel} maxLength={30} placeholder="예: 입장하기" className={inputClass} />
          {err("linkLabel")}
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
        <input type="checkbox" name="needsPrep" defaultChecked={v.needsPrep} className="h-5 w-5" />
        준비가 필요한 안내입니다 (교육생이 「준비 완료」를 따로 체크합니다)
      </label>
      <div className="flex flex-col gap-2">
        <label htmlFor="g-due" className="text-base font-medium">
          준비 기한 (한국 시간, 선택 — 준비가 필요한 안내만)
        </label>
        <input id="g-due" name="dueAt" type="datetime-local" defaultValue={v.dueAt} className={inputClass} aria-invalid={e.dueAt ? true : undefined} />
        {err("dueAt")}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
        <input type="checkbox" name="published" defaultChecked={v.published} className="h-5 w-5" />
        공개 (체크하면 참석으로 회신한 최종 선정자에게 바로 보입니다)
      </label>
      {state.message && (
        <p role="alert" className="text-base font-medium text-red-700">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="h-12 rounded-lg bg-primary px-6 text-base font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
          {pending ? "저장 중…" : guideId ? "수정 저장" : "안내 등록"}
        </button>
        <a href={cancelHref} className="inline-flex h-12 items-center rounded-lg border border-zinc-300 px-5 text-base font-medium hover:bg-zinc-100">
          취소
        </a>
      </div>
    </form>
  );
}
