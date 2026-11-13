"use client";
// 명단 목록 (DESIGN 2.3): 사번·이름·부서·상태(+처리 사유)·수기·대기 순번·회신 여부와 행 작업.
// - "신청" 탭에서는 체크해서 여러 명을 한 번에 "우선 선정" 또는 "미선정 처리"할 수 있다.
//   선택은 **지금 보이는 쪽** 기준이고, 검색·탭·쪽을 바꾸면 이 목록이 새로 그려지면서 선택이 풀린다(보이지 않는 사람을 실수로 처리하지 않게).
// - 사유는 항상 펼쳐 두지 않고, 작업 버튼을 누르면 나오는 확인창에서 입력한다. 대상 인원과 이름을 확인창에서 다시 보여 준다.
// - 큰 화면은 표, 휴대폰은 핵심 정보(이름·상태)가 먼저 보이는 목록이고 사유·작업은 "자세히"를 펼쳐서 본다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { rejectApplicantsAction, selectApplicantsAction, type SelectionState } from "@/app/actions/selection";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { badgeClass, buttonClass, fieldErrorClass, STATUS_TONE, textareaClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useServerAction } from "@/components/ui/useServerAction";
import { ExcludeButton } from "./exclude-button";
import { CancelSelectionButton, RestoreRejectedButton } from "./selection-controls";

/** 서버가 넘겨주는 한 줄 (화면에 필요한 값만) */
export interface RosterRow {
  id: string;
  empNo: string;
  name: string;
  dept: string;
  statusLabel: string; // 화면에 보이는 상태 이름 (미선정 / 선정 취소 / 불참 후 충원 …)
  note: string; // 처리 사유 (사전 미선정 · 사유, 우선 선정 · 사유 등)
  isManual: boolean;
  waitNo?: number;
  reply: string; // 회신 여부 칸
  canCancel: boolean;
  canExclude: boolean;
  canRestore: boolean;
}

export interface RosterPageInfo {
  total: number;
  from: number;
  to: number;
  page: number;
  pageCount: number;
  prevHref?: string;
  nextHref?: string;
}

type Mode = "select" | "reject";
const MODE_TEXT: Record<Mode, { button: string; title: string; reasonLabel: string; placeholder: string; field: string; confirm: string; help: string }> = {
  select: {
    button: "우선 선정",
    title: "우선 선정할까요?",
    reasonLabel: "선정 사유",
    placeholder: "예: 직무 필수 교육 대상자",
    field: "selectReason",
    confirm: "우선 선정",
    help: "선택한 사람은 바로 \"선정\"이 되고, 같은 사유가 각 사람에게 기록됩니다. 2차 추첨 전이라면 \"선별 취소\"로 되돌릴 수 있습니다.",
  },
  reject: {
    button: "미선정 처리",
    title: "미선정 처리할까요?",
    reasonLabel: "미선정 사유",
    placeholder: "예: 대상 직급이 아님",
    field: "rejectReason",
    confirm: "미선정 처리",
    help: "처리한 사람은 명단에 기록이 남지만 추첨·충원 대상에서 빠집니다. 2차 추첨 전이라면 \"미선정\" 탭에서 \"신청\"으로 되돌릴 수 있습니다.",
  },
};

const NAME_PREVIEW = 6;

export function RosterTable({
  rows,
  pageInfo,
  selectable,
  courseId,
  emptyMessage,
}: {
  rows: RosterRow[];
  pageInfo: RosterPageInfo;
  selectable: boolean; // "신청" 탭에서만 체크해서 처리할 수 있다
  courseId: string;
  emptyMessage: string;
}) {
  const [picked, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("select");
  const [open, setOpen] = useState(false); // 확인창을 닫아도 내용(mode)은 남겨, 닫힐 때 초점을 원래 버튼으로 돌려줄 수 있게 한다
  const [reasons, setReasons] = useState<Record<Mode, string>>({ select: "", reject: "" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const select = useServerAction<SelectionState>(selectApplicantsAction);
  const reject = useServerAction<SelectionState>(rejectApplicantsAction);
  const pending = select.pending || reject.pending;
  const toast = useToast();

  // 처리 후 새 명단이 오면, 이제 목록에 없는 사람(다른 탭으로 옮겨간 사람)은 선택으로 치지 않는다
  const visibleIds = new Set(rows.map((r) => r.id));
  const selected = new Set([...picked].filter((id) => visibleIds.has(id)));

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && !allChecked;
  const headerBox = useRef<HTMLInputElement>(null);
  const mobileHeaderBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    for (const box of [headerBox.current, mobileHeaderBox.current]) if (box) box.indeterminate = someChecked;
  }, [someChecked]);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const chosen = rows.filter((r) => selected.has(r.id));
  const openDialog = (m: Mode) => {
    setMode(m);
    setOpen(true);
    setFieldError(null);
    setError(null);
  };
  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
    setFieldError(null);
  };
  const submit = () => {
    const reason = reasons[mode].trim();
    if (!reason) return setFieldError(`${MODE_TEXT[mode].reasonLabel}를 입력해 주세요.`);
    setFieldError(null);
    setError(null);
    const runner = mode === "select" ? select : reject;
    runner.run({ courseId, traineeId: chosen.map((r) => r.id), [MODE_TEXT[mode].field]: reason }, (result) => {
      if ("networkError" in result) return setError(result.networkError);
      if (result.status !== "success") return setError(result.message ?? "처리하지 못했습니다.");
      toast(result.message ?? "처리했습니다.");
      setReasons((cur) => ({ ...cur, [mode]: "" }));
      setSelected(new Set());
      setOpen(false);
    });
  };

  if (pageInfo.total === 0) {
    return <p className="rounded-2xl bg-white px-4 py-10 text-center text-base text-zinc-600">{emptyMessage}</p>;
  }

  const rowActions = (r: RosterRow) => (
    <>
      {r.canCancel && <CancelSelectionButton courseId={courseId} traineeId={r.id} name={r.name} />}
      {r.canExclude && <ExcludeButton courseId={courseId} traineeId={r.id} name={r.name} />}
      {r.canRestore && <RestoreRejectedButton courseId={courseId} traineeId={r.id} name={r.name} />}
    </>
  );
  const showActions = rows.some((r) => r.canCancel || r.canExclude || r.canRestore);
  const none = selected.size === 0;

  return (
    <div className="flex flex-col gap-3">
      {selectable && (
        // 선택 막대: 명단 바로 위에 붙어 있고, 스크롤해도 화면 위쪽에 남는다
        <div
          role="toolbar"
          aria-label="선택한 사람 처리"
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
        >
          <p className="mr-auto text-base" aria-live="polite">
            {none ? (
              <span className="text-zinc-600">이 쪽에서 처리할 사람을 체크해 주세요</span>
            ) : (
              <>
                선택 <strong className="tabular-nums text-primary">{selected.size}명</strong>
                <span className="text-sm text-zinc-600"> · 이 쪽 {rows.length}명 중</span>
              </>
            )}
          </p>
          <Button variant="primary" disabled={none} onClick={() => openDialog("select")}>
            우선 선정
          </Button>
          <Button variant="secondary" disabled={none} onClick={() => openDialog("reject")}>
            미선정 처리
          </Button>
          <Button variant="text" disabled={none} onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {/* 큰 화면: 표 */}
      <div className="hidden overflow-x-auto rounded-2xl bg-white md:block">
        <table className="w-full text-left text-base">
          <caption className="sr-only">명단 ({pageInfo.total}명 중 {pageInfo.from}–{pageInfo.to}번)</caption>
          <thead className="border-b border-zinc-200 text-sm text-zinc-600">
            <tr>
              {selectable && (
                <th scope="col" className="w-12 py-3 pl-4">
                  <input
                    ref={headerBox}
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label={`이 쪽 ${rows.length}명 모두 선택`}
                    className="h-5 w-5 cursor-pointer"
                  />
                </th>
              )}
              {["사번", "이름", "부서", "상태", "대기", "회신"].map((h) => (
                <th key={h} scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
              {showActions && (
                <th scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">
                  작업
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const on = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  aria-selected={selectable ? on : undefined}
                  onClick={selectable ? (e) => !(e.target as HTMLElement).closest("button,a,input,label") && toggle(r.id) : undefined}
                  className={`align-top transition-colors ${on ? "bg-primary-soft" : "hover:bg-zinc-50"} ${selectable ? "cursor-pointer" : ""}`}
                >
                  {selectable && (
                    <td className="py-3 pl-4">
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={`${r.name}(${r.empNo}) 선택`} className="h-5 w-5 cursor-pointer" />
                    </td>
                  )}
                  <td className="px-3 py-3 font-mono text-sm tabular-nums text-zinc-700">{r.empNo}</td>
                  <td className="px-3 py-3 font-semibold whitespace-nowrap">
                    {r.name}
                    {r.isManual && <span className={badgeClass("neutral", "ml-1.5 text-xs")}>수기</span>}
                  </td>
                  <td className="px-3 py-3 text-zinc-700">{r.dept}</td>
                  <td className="px-3 py-3">
                    <span className={badgeClass(STATUS_TONE[r.statusLabel] ?? "neutral")}>{r.statusLabel}</span>
                    {r.note && <span className="mt-1 block max-w-60 text-sm break-words text-zinc-600">{r.note}</span>}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{r.waitNo ? `${r.waitNo}번` : ""}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-zinc-700">{r.reply}</td>
                  {showActions && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">{rowActions(r)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 휴대폰: 이름·상태가 먼저, 사유·작업은 "자세히" */}
      <div className="flex flex-col gap-2 md:hidden">
        {selectable && (
          <label className="flex min-h-11 items-center gap-3 px-1 text-base">
            <input ref={mobileHeaderBox} type="checkbox" checked={allChecked} onChange={toggleAll} className="h-5 w-5" />
            이 쪽 {rows.length}명 모두 선택
          </label>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const on = selected.has(r.id);
            const hasMore = Boolean(r.note) || r.reply !== "-" || r.canCancel || r.canExclude || r.canRestore;
            return (
              <li key={r.id} className={`rounded-2xl px-4 py-3 transition-colors ${on ? "bg-primary-soft" : "bg-white"}`}>
                <div className="flex items-start gap-3">
                  {selectable && (
                    <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={`${r.name}(${r.empNo}) 선택`} className="mt-1 h-5 w-5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{r.name}</span>
                      <span className={badgeClass(STATUS_TONE[r.statusLabel] ?? "neutral")}>{r.statusLabel}</span>
                      {r.waitNo && <span className="text-sm text-zinc-700">대기 {r.waitNo}번</span>}
                      {r.isManual && <span className={badgeClass("neutral", "text-xs")}>수기</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-600">
                      {r.empNo} · {r.dept}
                    </p>
                    {hasMore && (
                      <details className="mt-1">
                        <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-primary">자세히</summary>
                        <div className="flex flex-col gap-2 pt-1 text-sm">
                          {r.note && <p className="break-words text-zinc-700">{r.note}</p>}
                          {r.reply !== "-" && <p className="text-zinc-700">회신: {r.reply}</p>}
                          <div className="flex flex-wrap gap-2">{rowActions(r)}</div>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3 text-base">
        <p className="text-zinc-700">
          {pageInfo.total}명 중 {pageInfo.from}–{pageInfo.to}번
        </p>
        {pageInfo.pageCount > 1 && (
          <nav aria-label="쪽 이동" className="flex items-center gap-2">
            {pageInfo.prevHref ? (
              <Link href={pageInfo.prevHref} className={buttonClass("secondary", "sm")}>
                이전
              </Link>
            ) : (
              <span aria-disabled="true" className={buttonClass("secondary", "sm")}>
                이전
              </span>
            )}
            <span className="tabular-nums">
              {pageInfo.page} / {pageInfo.pageCount}
            </span>
            {pageInfo.nextHref ? (
              <Link href={pageInfo.nextHref} className={buttonClass("secondary", "sm")}>
                다음
              </Link>
            ) : (
              <span aria-disabled="true" className={buttonClass("secondary", "sm")}>
                다음
              </span>
            )}
          </nav>
        )}
      </div>

      {selectable && (
        <ConfirmDialog
          open={open}
          title={MODE_TEXT[mode].title}
          confirmLabel={`${chosen.length}명 ${MODE_TEXT[mode].confirm}`}
          tone={mode === "reject" ? "danger" : "primary"}
          pending={pending}
          error={error}
          onConfirm={submit}
          onClose={close}
        >
          <p className="break-keep">
            대상 <strong>{chosen.length}명</strong>:{" "}
            {chosen
              .slice(0, NAME_PREVIEW)
              .map((r) => r.name)
              .join(", ")}
            {chosen.length > NAME_PREVIEW && ` 외 ${chosen.length - NAME_PREVIEW}명`}
          </p>
          <label htmlFor="bulk-reason" className="font-semibold">
            {MODE_TEXT[mode].reasonLabel} <span className="text-red-700">(필수, 모든 대상자에게 같은 사유가 기록됩니다)</span>
          </label>
          <textarea
            id="bulk-reason"
            rows={3}
            maxLength={300}
            value={reasons[mode]}
            onChange={(e) => {
              setReasons((cur) => ({ ...cur, [mode]: e.target.value }));
              setFieldError(null);
            }}
            placeholder={MODE_TEXT[mode].placeholder}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "bulk-reason-error" : undefined}
            className={textareaClass}
          />
          {fieldError && (
            <p id="bulk-reason-error" className={fieldErrorClass}>
              {fieldError}
            </p>
          )}
          <p className="text-sm text-zinc-600 break-keep">{MODE_TEXT[mode].help}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
