"use client";
// 명단 초기화 화면: 지워지는 범위를 먼저 보여 주고, 엑셀 내려받기를 권한 뒤, 과정명을 직접 입력하고 마지막 확인창을 거쳐야만 실행한다.
// 확인창은 앱 디자인의 확인창이다(브라우저 기본 확인창 아님). 과정명이 틀리면 입력칸 바로 아래에 알려 주고, 입력은 지우지 않는다.
import { useState } from "react";
import { resetRosterAction, type ResetFormState } from "@/app/actions/rosterReset";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { fieldErrorClass, inputClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useServerAction } from "@/components/ui/useServerAction";
import type { ResetScope } from "@/lib/rosterReset";
import { useParams } from "next/navigation";

export function ResetPanel({ scope, exportHref, archived }: { scope: ResetScope; exportHref: string; archived: boolean }) {
  const { courseId } = useParams<{ courseId: string }>();
  const name = scope.courseName ?? "";
  const empty = scope.trainees === 0;
  const [typed, setTyped] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction<ResetFormState>((prev, formData) => resetRosterAction(prev ?? {}, formData));
  const toast = useToast();

  const ask = () => {
    if (typed.trim() !== name.trim() || !name.trim()) return setFieldError("과정명이 일치하지 않습니다. 위에 보이는 과정명을 그대로 입력해 주세요.");
    setFieldError(null);
    setError(null);
    setOpen(true);
  };
  const confirm = () =>
    run({ courseId, expectedCount: String(scope.trainees), confirmName: typed }, (result) => {
      if ("networkError" in result) return setError(result.networkError);
      if (result.status !== "done") return setError(result.message ?? "초기화하지 못했습니다.");
      setOpen(false);
      setTyped("");
      toast(result.message ?? "명단을 초기화했습니다.");
    });

  return (
    <details className="group rounded-2xl bg-white px-5 py-1">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between text-base font-semibold text-red-800">
        교육생 명단 초기화
        <span aria-hidden className="text-zinc-500 transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="flex flex-col gap-4 pt-2 pb-5">
        {archived ? (
          <p className="text-base">보관된 과정은 초기화할 수 없습니다. 보관을 해제한 뒤 다시 시도해 주세요.</p>
        ) : empty ? (
          <p className="text-base">초기화할 명단이 없습니다.</p>
        ) : (
          <>
            <div className="rounded-xl bg-red-50 p-4 text-base">
              <p className="font-bold">「{name || "이름 없는 과정"}」 과정의 명단만 초기화합니다. 다른 과정에는 영향이 없습니다.</p>
              <ul className="mt-2 list-disc pl-5">
                <li>
                  교육생 명단 <strong>{scope.trainees}명</strong> (상태·대기 순번·충원 정보 포함)
                </li>
                <li>
                  연결된 회신 내용 <strong>{scope.replies}건</strong>, 회신 알림 {scope.notices}건
                </li>
                <li>
                  1차 선별 기록 {scope.selections}건, 추첨 기록 {scope.draws}건, 정원
                </li>
                <li>변경 이력 {scope.history}건 (초기화했다는 기록 1건만 남습니다)</li>
              </ul>
              <p className="mt-2">
                남는 것: 과정 정보(과정명·일정·장소·안내문·회신 기한). <strong>지운 데이터는 되돌릴 수 없습니다.</strong>
              </p>
            </div>

            <p className="text-base">
              먼저 지금 명단과 회신 내역을 엑셀로 내려받아 보관해 주세요.{" "}
              <a href={exportHref} download className="font-semibold text-primary underline underline-offset-2">
                명단·회신 엑셀 내려받기
              </a>
            </p>

            <div className="flex flex-col gap-2">
              <label htmlFor="reset-confirm-name" className="text-base">
                확인을 위해 과정명을 그대로 입력해 주세요: <strong>{name}</strong>
              </label>
              <input
                id="reset-confirm-name"
                type="text"
                autoComplete="off"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setFieldError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "reset-confirm-name-error" : undefined}
                className={inputClass}
              />
              {fieldError && (
                <p id="reset-confirm-name-error" className={fieldErrorClass}>
                  {fieldError}
                </p>
              )}
            </div>
            <div>
              <Button variant="dangerOutline" onClick={ask}>
                명단 초기화…
              </Button>
            </div>
            <ConfirmDialog
              open={open}
              title="명단을 초기화할까요?"
              confirmLabel={`${scope.trainees}명 초기화`}
              tone="danger"
              pending={pending}
              error={error}
              onConfirm={confirm}
              onClose={() => {
                setOpen(false);
                setError(null);
              }}
            >
              <p className="break-keep">
                「{name}」 과정의 교육생 <strong>{scope.trainees}명</strong>과 연결된 회신 <strong>{scope.replies}건</strong>·추첨·이력을 모두 삭제합니다.
              </p>
              <p className="font-semibold text-red-800">되돌릴 수 없습니다.</p>
            </ConfirmDialog>
          </>
        )}
      </div>
    </details>
  );
}
