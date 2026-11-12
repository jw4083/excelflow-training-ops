"use client";
// 명단 초기화 화면: 지워지는 범위를 먼저 보여 주고, 엑셀 내려받기를 권한 뒤, 과정명을 직접 입력하고 마지막 확인창을 거쳐야만 실행한다.
import { useActionState } from "react";
import { resetRosterAction, type ResetFormState } from "@/app/actions/rosterReset";
import { CourseIdField } from "@/components/admin/CourseIdField";
import type { ResetScope } from "@/lib/rosterReset";

export function ResetPanel({ scope, exportHref, archived }: { scope: ResetScope; exportHref: string; archived: boolean }) {
  const [state, action, pending] = useActionState<ResetFormState, FormData>(resetRosterAction, {});
  const name = scope.courseName ?? "";
  const empty = scope.trainees === 0;

  return (
    <details className="rounded-2xl border border-red-300 bg-white px-4 py-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-red-800">교육생 명단 초기화</summary>
      <div className="flex flex-col gap-4 pt-3">
        {state.status === "done" && (
          <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-base font-medium">
            {state.message}
          </p>
        )}
        {archived ? (
          <p className="text-base">보관된 과정은 초기화할 수 없습니다. 보관을 해제한 뒤 다시 시도해 주세요.</p>
        ) : empty ? (
          <p className="text-base">초기화할 명단이 없습니다.</p>
        ) : (
          <>
            <div className="rounded-lg bg-red-50 p-3 text-base">
              <p className="font-bold">
                「{name || "이름 없는 과정"}」 과정의 명단만 초기화합니다. 다른 과정에는 영향이 없습니다.
              </p>
              <ul className="mt-2 list-disc pl-5">
                <li>교육생 명단 <strong>{scope.trainees}명</strong> (상태·대기 순번·충원 정보 포함)</li>
                <li>연결된 회신 내용 <strong>{scope.replies}건</strong>, 회신 알림 {scope.notices}건</li>
                <li>1차 선별 기록 {scope.selections}건, 추첨 기록 {scope.draws}건, 정원</li>
                <li>변경 이력 {scope.history}건 (초기화했다는 기록 1건만 남습니다)</li>
              </ul>
              <p className="mt-2">남는 것: 과정 정보(과정명·일정·장소·안내문·회신 기한). <strong>지운 데이터는 되돌릴 수 없습니다.</strong></p>
            </div>

            <p className="text-base">
              먼저 지금 명단과 회신 내역을 엑셀로 내려받아 보관해 주세요.{" "}
              <a href={exportHref} download className="font-semibold text-primary underline">
                명단·회신 엑셀 내려받기
              </a>
            </p>

            <form
              action={action}
              onSubmit={(event) => {
                const ok = window.confirm(
                  `「${name}」 과정의 교육생 ${scope.trainees}명과 연결된 회신 ${scope.replies}건·추첨·이력을 모두 삭제합니다.\n되돌릴 수 없습니다. 정말 초기화할까요?`,
                );
                if (!ok) event.preventDefault();
              }}
              className="flex flex-col gap-3"
            >
              <CourseIdField />
              <input type="hidden" name="expectedCount" value={scope.trainees} />
              <label className="flex flex-col gap-1 text-base">
                <span>확인을 위해 과정명을 그대로 입력해 주세요: <strong>{name}</strong></span>
                <input
                  name="confirmName"
                  type="text"
                  autoComplete="off"
                  required
                  className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base"
                />
              </label>
              {state.status === "error" && (
                <p role="alert" className="text-base font-medium text-red-700">{state.message}</p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="h-11 self-start rounded-lg bg-red-700 px-5 text-base font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {pending ? "초기화 중…" : "명단 초기화"}
              </button>
            </form>
          </>
        )}
      </div>
    </details>
  );
}
