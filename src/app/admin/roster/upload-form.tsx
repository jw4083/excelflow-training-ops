"use client";
// 신청자 엑셀 업로드 영역 (DESIGN 2.3 "명단" 위쪽): 파일 선택 + 업로드 버튼 + 안내 문구 + 결과 목록
import { useActionState, useState, type ReactNode } from "react";
import { uploadApplicants, type UploadState } from "@/app/actions/applicants";

const MAX_BYTES = 1024 * 1024; // importApplicants의 제한과 같은 1MB
const LIST_LIMIT = 30; // 목록은 처음 30건만 보여 주고 나머지는 "외 N건"으로 줄인다

function ResultList({ title, hint, tone, items }: { title: string; hint?: string; tone: "warn" | "info"; items: string[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, LIST_LIMIT);
  return (
    <section
      className={`rounded-lg border px-4 py-3 ${
        tone === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          : "border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      }`}
    >
      <h3 className="text-base font-semibold">
        {title} <span className="font-normal">({items.length}건)</span>
      </h3>
      {hint && <p className="mt-1 text-sm opacity-80">{hint}</p>}
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {shown.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {items.length > shown.length && <p className="mt-2 text-sm opacity-80">외 {items.length - shown.length}건</p>}
    </section>
  );
}

export function UploadForm({ children }: { children?: ReactNode }) {
  const [state, formAction, pending] = useActionState<UploadState | undefined, FormData>(uploadApplicants, undefined);
  const [fileError, setFileError] = useState<string | null>(null);
  const summary = state?.summary;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <label htmlFor="file" className="text-base font-medium">
          신청자 엑셀 파일
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileError(file && file.size > MAX_BYTES ? "파일이 너무 큽니다. 1MB 이하의 엑셀 파일을 올려 주세요." : null);
          }}
          className="w-full rounded-lg border border-zinc-300 bg-white text-base file:mr-4 file:h-12 file:cursor-pointer file:border-0 file:bg-zinc-100 file:px-4 file:text-base file:font-medium hover:file:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:file:bg-zinc-800 dark:hover:file:bg-zinc-700"
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          .xlsx 파일만, 한 번에 최대 1,000행까지 올릴 수 있습니다. 첫 줄에 <strong>사번, 이름, 부서</strong> 열이 있어야 하고,
          사번은 숫자 6자리입니다. 같은 사번이 여러 번이면 위쪽 행만 남깁니다. 연락처 등 다른 열은 읽지 않습니다.
        </p>
        {fileError && (
          <p role="alert" className="text-base text-red-600 dark:text-red-400">
            {fileError}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={pending || fileError !== null}
            className="h-12 rounded-lg bg-zinc-900 px-8 text-base font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {pending ? "업로드 중…" : "업로드"}
          </button>
        </div>
      </form>

      {state?.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-base font-semibold ${
            state.status === "success"
              ? "text-green-700 dark:text-green-400"
              : state.status === "error"
                ? "text-red-600 dark:text-red-400"
                : "text-amber-800 dark:text-amber-300"
          }`}
        >
          {state.message}
        </p>
      )}

      {summary && (
        <div className="flex flex-col gap-3">
          <p className="text-base text-zinc-700 dark:text-zinc-300">
            엑셀 {summary.totalRows}행 중 <strong>{summary.registered}명</strong>을 새로 등록했습니다.
          </p>
          <ResultList
            title="등록하지 못한 행"
            tone="warn"
            hint="사번이 숫자 6자리가 아니거나 이름·부서가 비어 있는 행입니다. 엑셀에서 고친 뒤 다시 올려 주세요."
            items={summary.rowErrors.map((e) => `${e.line}줄: ${e.value || "(사번 없음)"} — ${e.reason}`)}
          />
          <ResultList
            title="중복 사번"
            tone="warn"
            hint="같은 사번이 여러 번 있어 위쪽 행만 남겼습니다."
            items={summary.duplicates.map(
              (d) => `${d.empNo} — ${d.keptLine}줄 남김, ${d.removedLines.map((l) => `${l}줄`).join(", ")} 제외`,
            )}
          />
          <ResultList
            title="앞자리 0 복원"
            tone="warn"
            hint="엑셀에 숫자로 저장되어 앞자리 0이 사라졌던 사번입니다. 맞는지 확인해 주세요. (엑셀의 사번 열을 '텍스트' 서식으로 두면 생기지 않습니다)"
            items={summary.restored.map((r) => `${r.line}줄: ${r.from} → ${r.to}`)}
          />
          <ResultList
            title="이미 명단에 있어 건너뜀"
            tone="info"
            items={summary.skippedExisting.map((s) => `${s.line}줄: ${s.empNo}`)}
          />
        </div>
      )}
      {children}
    </div>
  );
}
