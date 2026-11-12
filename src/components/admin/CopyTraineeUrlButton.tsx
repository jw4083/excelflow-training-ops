"use client";
// "교육생 주소 복사" 버튼 (PLAN 작업 15, PRD M2-13). 누르면 교육생 공통 주소의 전체 주소를 복사한다.
// 담당자는 이 주소를 기존 메일에 붙여 교육생 전체에게 한꺼번에 안내한다. 앱이 메일을 보내지는 않는다.
//
// 복사는 환경에 따라 막힐 수 있어서 세 단계로 시도한다:
//  ① 최신 방식(navigator.clipboard, https·localhost에서만 가능) → ② 예전 방식(execCommand) → ③ 주소를 화면에 보여 주고 직접 복사하게 한다
import { useEffect, useRef, useState } from "react";
import { traineeUrl } from "@/lib/paths";

type Result = { kind: "copied" | "manual"; url: string } | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 권한이 없거나 안전하지 않은 주소(http)에서는 막힌다 → 예전 방식으로 다시 시도
  }
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";
  box.style.opacity = "0";
  document.body.appendChild(box);
  box.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(box);
  }
}

export function CopyTraineeUrlButton() {
  const [result, setResult] = useState<Result>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 화면을 떠날 때 남은 타이머를 정리한다
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function onClick() {
    const url = traineeUrl(window.location.origin);
    const ok = await copyText(url);
    setResult({ kind: ok ? "copied" : "manual", url });
    if (timer.current) clearTimeout(timer.current);
    // 복사됐다는 안내는 잠시 뒤 사라지고, 직접 복사해야 하는 경우의 주소는 사라지지 않게 둔다
    if (ok) timer.current = setTimeout(() => setResult(null), 5000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-label="교육생 주소 복사"
        title="교육생이 접속할 공통 주소를 복사합니다"
        className="h-11 shrink-0 rounded-lg border border-zinc-300 px-4 text-base font-medium whitespace-nowrap hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <span className="sm:hidden">주소 복사</span>
        <span className="hidden sm:inline">교육생 주소 복사</span>
      </button>
      {/* 스크린리더에도 결과가 읽히도록 항상 존재하는 안내 영역 */}
      <p role="status" className={result ? "max-w-[18rem] text-right text-sm" : "sr-only"}>
        {result?.kind === "copied" && (
          <span className="text-green-700 dark:text-green-400">
            복사했습니다. <span className="break-all text-zinc-600 dark:text-zinc-400">{result.url}</span>
          </span>
        )}
        {result?.kind === "manual" && (
          <span className="text-amber-800 dark:text-amber-300">
            자동 복사가 막혀 있습니다. 아래 주소를 직접 복사해 주세요.{" "}
            <input
              readOnly
              value={result.url}
              aria-label="교육생 공통 주소"
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </span>
        )}
      </p>
    </div>
  );
}
