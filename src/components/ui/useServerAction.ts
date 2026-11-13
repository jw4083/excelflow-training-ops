"use client";
// 확인창 안의 버튼에서 서버 처리를 부르는 공통 방법.
// - 처리 중(pending) 동안 버튼은 "처리 중"으로 바뀌고 다시 누를 수 없다.
// - 결과는 서버가 돌려준 뒤에만 넘겨준다(미리 성공한 것처럼 보이지 않는다). 화면 이동(redirect)은 Next.js가 처리하도록 그대로 넘긴다.
// - 연결이 끊기는 등 예상하지 못한 오류는 안내 문구로 바꿔 돌려주고, 입력·선택은 화면에 그대로 남긴다.
import { startTransition as globalStartTransition, useTransition } from "react";

export type FieldValues = Record<string, string | string[] | undefined>;

function toFormData(fields: FieldValues): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) formData.append(key, v);
  }
  return formData;
}

const isRedirect = (error: unknown) =>
  typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");

export const NETWORK_ERROR = "처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";

export function useServerAction<S>(action: (prev: S | undefined, formData: FormData) => Promise<S>) {
  const [pending, startTransition] = useTransition();
  const run = (fields: FieldValues, onResult: (result: S | { networkError: string }) => void) => {
    startTransition(async () => {
      try {
        const result = await action(undefined, toFormData(fields));
        // await 뒤의 화면 갱신도 같은 전환으로 묶어, 새 명단과 결과가 한 번에 나타나게 한다
        globalStartTransition(() => onResult(result));
      } catch (error) {
        if (isRedirect(error)) throw error;
        globalStartTransition(() => onResult({ networkError: NETWORK_ERROR }));
      }
    });
  };
  return { pending, run };
}
