"use client";
// 교육생 회신 양식 (PLAN 작업 18, PRD M2-3·M2-6·M2-11): 참석/불참, 불참 사유, 노트북, 룸메이트(직접 입력). 휴대폰 기준(입력 칸·버튼 48px, 글자 16px).
import { startTransition, useActionState, useRef, useState } from "react";
import { submitReplyAction, type ReplyFormState } from "@/app/actions/reply";
import { Mascot } from "@/components/Mascot";
import { ABSENT_DETAIL_MAX, ABSENT_DETAIL_MIN, ROOMMATE_FIELD_MAX } from "@/domain/replyRules";

export interface ReplyDefaults {
  attend?: boolean;
  absentType?: string;
  absentDetail?: string;
  laptop?: boolean;
  roommateName?: string;
  roommateDept?: string;
  submittedAt?: string; // 화면용 "제출 일시" 글
}

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900";
const choiceClass =
  "flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-300 text-base font-medium has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900";

type Choice = "yes" | "no" | "";
const toChoice = (v: boolean | undefined): Choice => (v === undefined ? "" : v ? "yes" : "no");

function Err({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} role="alert" className="text-base text-red-700 dark:text-red-400">
      {text}
    </p>
  ) : null;
}

/**
 * `onSubmitAction`을 넘기지 않으면 교육생 본인 제출이고, 담당자 대리 입력 화면에서는 대리 입력용 서버 처리를 넘긴다.
 * (같은 양식·같은 규칙을 쓰므로 입력 검사가 두 곳에서 어긋나지 않는다)
 * - mode="cancelOnly": 회신 기한이 지난 참석자가 취소 마감 전에 "불참으로 변경"만 하는 양식 (참석/불참 선택 없이 사유만 받는다)
 * - 참석 → 불참 변경은 서버가 먼저 사유·기한을 검사한 뒤 "최종 확인"을 요구하고(needsConfirm), 확인 버튼을 눌러야 저장된다.
 */
export function ReplyForm({
  defaults,
  onSubmitAction = submitReplyAction,
  submitLabel,
  mode = "full",
}: {
  defaults: ReplyDefaults;
  onSubmitAction?: (prev: ReplyFormState, formData: FormData) => Promise<ReplyFormState>;
  submitLabel?: string;
  mode?: "full" | "cancelOnly";
}) {
  const [state, action, pending] = useActionState<ReplyFormState, FormData>(onSubmitAction, {});
  const celebrate = onSubmitAction === submitReplyAction; // 교육생 본인 제출일 때만 마스코트를 보여 준다
  const cancelOnly = mode === "cancelOnly";
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmHidden, setConfirmHidden] = useState(false); // 확인 단계에서 "돌아가기"를 누르면 숨긴다
  const [attend, setAttend] = useState<Choice>(cancelOnly ? "no" : toChoice(defaults.attend));
  const [absentType, setAbsentType] = useState(defaults.absentType ?? "");
  const [detail, setDetail] = useState(defaults.absentDetail ?? "");
  const [laptop, setLaptop] = useState<Choice>(toChoice(defaults.laptop));
  const [roommateName, setRoommateName] = useState(defaults.roommateName ?? "");
  const [roommateDept, setRoommateDept] = useState(defaults.roommateDept ?? "");
  const errors = state.errors ?? {};
  const confirming = state.needsConfirm === true && !confirmHidden && !pending;
  const send = (confirm: boolean) => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current); // 확인 단계에서도 지금 칸의 값을 그대로 다시 보낸다 (서버가 한 번 더 검사)
    if (confirm) data.set("confirm", "yes");
    setConfirmHidden(false);
    startTransition(() => action(data));
  };

  return (
    // action 속성 대신 onSubmit으로 보낸다: action 속성을 쓰면 제출이 끝날 때 React가 양식을 비워(라디오 선택이 풀림) 다시 제출할 때 값이 빠진다
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        send(false);
      }}
      onChange={() => setConfirmHidden(true)} // 확인 단계 중에 내용을 고치면 확인 상자를 닫고 다시 제출하게 한다
      className="flex flex-col gap-4"
      noValidate
    >
      {/* 회신 완료(교육생 본인 화면): 캠코 마스코트 보따와 함께 접수 사실을 알려 준다. 담당자 대신 입력 화면에서는 글자만 보인다 */}
      {celebrate && (state.ok || defaults.submittedAt) ? (
        <div role="status" className="flex items-center gap-3 rounded-card bg-primary-soft p-4">
          <Mascot name="보따" size={72} />
          <div className="min-w-0">
            <p className="text-base font-bold break-keep">{state.ok ? "회신이 저장되었습니다" : "회신이 접수되었습니다"}</p>
            <p className="mt-1 text-base text-zinc-700 break-keep">
              {state.ok ? state.message : `마지막으로 제출한 시각: ${defaults.submittedAt}`}
            </p>
          </div>
        </div>
      ) : (
        defaults.submittedAt && <p className="text-base text-zinc-600">마지막으로 제출한 시각: {defaults.submittedAt}</p>
      )}

      {cancelOnly ? (
        <div className="flex flex-col gap-1">
          <input type="hidden" name="attend" value="no" />
          <p className="text-base font-bold">참석 → 불참으로 변경</p>
          <p className="text-base text-zinc-700 break-keep">
            회신 기한은 지났지만 참석 취소 마감 전까지는 불참으로 바꿀 수 있습니다. 사유를 적어 주세요. 다른 내용(노트북·룸메이트)을 고치려면 담당자에게 문의하세요.
          </p>
        </div>
      ) : (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium">교육에 참석하시나요?</legend>
        <div className="flex gap-2">
          <label className={choiceClass}>
            <input type="radio" name="attend" value="yes" checked={attend === "yes"} onChange={() => setAttend("yes")} className="sr-only" />
            참석
          </label>
          <label className={choiceClass}>
            <input type="radio" name="attend" value="no" checked={attend === "no"} onChange={() => setAttend("no")} className="sr-only" />
            불참
          </label>
        </div>
        <Err id="err-attend" text={errors.attend} />
      </fieldset>
      )}

      {attend === "no" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-base font-medium">불참 사유 구분</legend>
            <div className="flex gap-2">
              {["업무", "기타"].map((t) => (
                <label key={t} className={choiceClass}>
                  <input type="radio" name="absentType" value={t} checked={absentType === t} onChange={() => setAbsentType(t)} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
            <Err id="err-absentType" text={errors.absentType} />
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor="absentDetail" className="text-base font-medium">
              상세 사유 ({ABSENT_DETAIL_MIN}자 이상 {ABSENT_DETAIL_MAX}자 이하)
            </label>
            <textarea
              id="absentDetail"
              name="absentDetail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={5}
              aria-invalid={errors.absentDetail ? true : undefined}
              aria-describedby="err-absentDetail"
              className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-base text-zinc-600 dark:text-zinc-400">민감한 개인 사정은 적지 마세요.</p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">{[...detail.trim()].length}자 / {ABSENT_DETAIL_MAX}자</p>
            <Err id="err-absentDetail" text={errors.absentDetail} />
          </div>
        </>
      )}

      {attend === "yes" && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-base font-medium">노트북을 가져오시나요?</legend>
            <div className="flex gap-2">
              <label className={choiceClass}>
                <input type="radio" name="laptop" value="yes" checked={laptop === "yes"} onChange={() => setLaptop("yes")} className="sr-only" />
                가져옵니다
              </label>
              <label className={choiceClass}>
                <input type="radio" name="laptop" value="no" checked={laptop === "no"} onChange={() => setLaptop("no")} className="sr-only" />
                안 가져옵니다
              </label>
            </div>
            <Err id="err-laptop" text={errors.laptop} />
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-base font-medium">룸메이트 희망 (선택)</legend>
            <p className="text-base text-zinc-600 dark:text-zinc-400">함께 쓰고 싶은 분이 있으면 이름과 부서를 직접 써 주세요. 없으면 비워 두세요.</p>
            <input
              name="roommateName"
              value={roommateName}
              onChange={(e) => setRoommateName(e.target.value)}
              maxLength={ROOMMATE_FIELD_MAX}
              placeholder="이름"
              aria-label="룸메이트 이름"
              className={inputClass}
            />
            <input
              name="roommateDept"
              value={roommateDept}
              onChange={(e) => setRoommateDept(e.target.value)}
              maxLength={ROOMMATE_FIELD_MAX}
              placeholder="부서"
              aria-label="룸메이트 부서"
              className={inputClass}
            />
            <Err id="err-roommate" text={errors.roommate} />
          </fieldset>
        </>
      )}

      {/* 최종 확인 (참석 → 불참): 서버가 사유·기한을 확인한 뒤에만 나타난다 */}
      {confirming && (
        <div role="alertdialog" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <p id="confirm-title" className="text-base font-bold text-red-900">정말 불참으로 바꿀까요?</p>
          <ul className="list-disc pl-5 text-base text-red-900 break-keep">
            <li>확정하면 바로 반영되고 담당자에게 알려집니다.</li>
            <li>비게 된 자리는 담당자가 다른 분으로 충원할 수 있으며, 충원되면 다시 참석으로 바꿀 수 없습니다.</li>
            <li>회신 기한이 지난 뒤에는 다시 참석하려면 담당자에게 문의해야 합니다.</li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => send(true)} className="h-12 flex-1 rounded-lg bg-red-700 text-base font-bold text-white">
              불참으로 확정
            </button>
            <button type="button" onClick={() => setConfirmHidden(true)} className="h-12 flex-1 rounded-lg border border-zinc-300 bg-white text-base font-medium">
              돌아가기
            </button>
          </div>
        </div>
      )}

      {state.message && !(celebrate && state.ok) && !confirming && !(state.needsConfirm && confirmHidden) && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`rounded-lg border p-3 text-base ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || confirming}
        className="h-12 w-full rounded-lg bg-primary text-base font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "저장 중…" : cancelOnly ? "불참으로 변경하기" : (submitLabel ?? (defaults.submittedAt ? "회신 수정하기" : "회신 제출하기"))}
      </button>
    </form>
  );
}
