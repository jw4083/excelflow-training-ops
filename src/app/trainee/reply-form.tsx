"use client";
// 교육생 회신 양식 (PLAN 작업 18, PRD M2-3·M2-6·M2-11): 참석/불참, 불참 사유, 노트북, 룸메이트(직접 입력). 휴대폰 기준(입력 칸·버튼 48px, 글자 16px).
import { useActionState, useState } from "react";
import { submitReplyAction, type ReplyFormState } from "@/app/actions/reply";
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
  "flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-300 text-base font-medium has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900";

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
 */
export function ReplyForm({
  defaults,
  onSubmitAction = submitReplyAction,
  submitLabel,
}: {
  defaults: ReplyDefaults;
  onSubmitAction?: (prev: ReplyFormState, formData: FormData) => Promise<ReplyFormState>;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<ReplyFormState, FormData>(onSubmitAction, {});
  const [attend, setAttend] = useState<Choice>(toChoice(defaults.attend));
  const [absentType, setAbsentType] = useState(defaults.absentType ?? "");
  const [detail, setDetail] = useState(defaults.absentDetail ?? "");
  const [laptop, setLaptop] = useState<Choice>(toChoice(defaults.laptop));
  const [roommateName, setRoommateName] = useState(defaults.roommateName ?? "");
  const [roommateDept, setRoommateDept] = useState(defaults.roommateDept ?? "");
  const errors = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {defaults.submittedAt && (
        <p className="text-base text-zinc-600 dark:text-zinc-400">마지막으로 제출한 시각: {defaults.submittedAt}</p>
      )}

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

      {state.message && (
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
        disabled={pending}
        className="h-12 w-full rounded-lg bg-zinc-900 text-base font-bold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "저장 중…" : (submitLabel ?? (defaults.submittedAt ? "회신 수정하기" : "회신 제출하기"))}
      </button>
    </form>
  );
}
