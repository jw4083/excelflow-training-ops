"use client";
// "수기 추가" 창 (PLAN 작업 21, DESIGN 2.3 "명단"): 사번·이름·부서·추가 사유, 회신 기한(기본 3일 후), 대신할 불참·제외 자리(선택).
// 사번 칸은 글자 입력 칸이다(앞자리 0 보존). 정원을 넘게 되면 경고 뒤 "정원 초과 추가"로만 진행된다.
import { useActionState, useState } from "react";
import { addManualAction, type ManualAddState } from "@/app/actions/manualAdd";

export interface VacancyOption {
  id: string;
  label: string; // 예: "김테스트05 (불참)"
}

const inputClass = "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900";

export function ManualAdd({
  vacancies,
  defaultDeadline,
  exceeds,
}: {
  vacancies: VacancyOption[];
  defaultDeadline: string; // 한국 시간 "YYYY-MM-DDTHH:mm" (지금부터 3일 후)
  exceeds: boolean; // 지금 추가하면 정원을 넘는가
}) {
  const [open, setOpen] = useState(false);
  // 입력 칸은 직접 값을 들고 있는다: 서버 처리가 끝나면 React가 양식을 비우므로, 오류가 났을 때 쓴 내용이 사라지지 않게 한다
  const empty = { empNo: "", name: "", dept: "", reason: "", deadline: defaultDeadline, target: "" };
  const [v, setV] = useState(empty);
  // 추가에 성공하면 입력 칸을 비워 다음 사람을 바로 넣을 수 있게 한다 (실패하면 쓴 내용을 그대로 둔다)
  const [state, action, pending] = useActionState<ManualAddState | undefined, FormData>(async (prev, formData) => {
    const result = await addManualAction(prev, formData);
    if (result.status === "success") setV(empty);
    return result;
  }, undefined);
  const over = exceeds || state?.needsOver === true;
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [key]: e.target.value }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-11 rounded-lg border border-zinc-300 px-4 text-base font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {open ? "수기 추가 닫기" : "수기 추가"}
        </button>
        {!open && state?.status === "success" && (
          <p role="status" className="text-base font-medium text-green-700 dark:text-green-400">
            {state.message}
          </p>
        )}
      </div>

      {open && (
        <form
          action={action}
          className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <p className="text-base text-zinc-700 dark:text-zinc-300">선정 이후에 직접 명단에 넣습니다. 추가된 사람은 &quot;선정&quot;과 &quot;수기&quot; 표시가 붙습니다.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="m-empNo" className="text-base font-medium">사번 (숫자 6자리)</label>
              <input id="m-empNo" name="empNo" value={v.empNo} onChange={set("empNo")} inputMode="numeric" maxLength={6} autoComplete="off" required className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="m-name" className="text-base font-medium">이름</label>
              <input id="m-name" name="name" value={v.name} onChange={set("name")} required maxLength={50} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="m-dept" className="text-base font-medium">부서</label>
              <input id="m-dept" name="dept" value={v.dept} onChange={set("dept")} required maxLength={50} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="m-reason" className="text-base font-medium">추가 사유</label>
            <input id="m-reason" name="reason" value={v.reason} onChange={set("reason")} required maxLength={200} className={inputClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="m-deadline" className="text-base font-medium">이 사람의 회신 기한 (한국 시간)</label>
              <input id="m-deadline" type="datetime-local" name="replyDeadline" value={v.deadline} onChange={set("deadline")} className={inputClass} />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">기본값은 지금부터 3일 후입니다. 비우면 과정 회신 기한을 따릅니다.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="m-target" className="text-base font-medium">대신할 자리 (선택)</label>
              <select id="m-target" name="replaceTargetId" value={v.target} onChange={set("target")} className={inputClass}>
                <option value="">선택 안 함</option>
                {vacancies.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">고르면 그 자리는 충원이 확정된 것으로 처리되어 알림에서 빠집니다.</p>
            </div>
          </div>

          {over && <input type="hidden" name="confirmOver" value="yes" />}
          {over && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-base font-medium text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              정원 초과 경고: 이 사람을 추가하면 선정 인원이 정원을 넘습니다. 그래도 진행하려면 아래 버튼을 눌러 주세요.
            </p>
          )}
          {state?.status === "error" && !state.needsOver && (
            <p role="alert" className="text-base font-medium text-red-700 dark:text-red-400">
              {state.message}
            </p>
          )}
          {state?.status === "success" && (
            <p role="status" className="text-base font-medium text-green-700 dark:text-green-400">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-12 rounded-lg bg-zinc-900 px-6 text-base font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? "처리 중…" : over ? "정원 초과 추가" : "추가"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-lg border border-zinc-300 px-6 text-base font-medium dark:border-zinc-700">
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
