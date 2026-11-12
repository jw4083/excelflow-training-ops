"use client";
// 교육생의 안내별 "확인 완료" / "준비 완료" 표시 버튼. 누르면 서버가 다시 "선정 + 참석 회신"인지 검사한 뒤 저장한다.
import { useActionState } from "react";
import { markGuideAction, type MarkState } from "@/app/actions/guides";

function MarkButton({
  courseId,
  guideId,
  done,
  doneLabel,
  todoLabel,
  markOn,
  markOff,
}: {
  courseId: string;
  guideId: string;
  done: boolean;
  doneLabel: string;
  todoLabel: string;
  markOn: string;
  markOff: string;
}) {
  const [state, action, pending] = useActionState<MarkState, FormData>(markGuideAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="guideId" value={guideId} />
      <input type="hidden" name="mark" value={done ? markOff : markOn} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={done}
        className={`h-12 rounded-xl border px-5 text-base font-semibold whitespace-nowrap disabled:opacity-60 ${
          done ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-white hover:bg-zinc-100"
        }`}
      >
        {pending ? "저장 중…" : done ? `✔ ${doneLabel}` : todoLabel}
      </button>
      {state.message && (
        <p role="alert" className="max-w-xs text-sm text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function GuideActions({
  courseId,
  guideId,
  confirmed,
  needsPrep,
  prepared,
}: {
  courseId: string;
  guideId: string;
  confirmed: boolean;
  needsPrep: boolean;
  prepared: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <MarkButton courseId={courseId} guideId={guideId} done={confirmed} doneLabel="확인 완료" todoLabel="확인 완료 표시" markOn="확인" markOff="확인취소" />
      {needsPrep && (
        <MarkButton courseId={courseId} guideId={guideId} done={prepared} doneLabel="준비 완료" todoLabel="준비 완료 표시" markOn="준비" markOff="준비취소" />
      )}
    </div>
  );
}
