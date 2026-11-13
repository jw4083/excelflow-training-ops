"use client";
// 교육생의 안내별 상태 표시와 버튼. "안내 확인"과 "준비 완료"는 서로 다른 상태다.
// - 아직 안 했으면 버튼(안내 확인 = 채운 버튼, 준비 완료 = 테두리 버튼)
// - 했으면 버튼 대신 "✓ 확인함 / ✓ 준비 완료" 상태 표시와, 취소하려면 따로 있는 "되돌리기"
// 누르면 서버가 다시 "선정 + 참석 회신"인지 검사한 뒤 저장하고, 저장된 뒤에만 완료로 바뀐다(미리 완료로 보이지 않는다).
import { useState } from "react";
import { markGuideAction, type MarkState } from "@/app/actions/guides";
import { Button } from "@/components/ui/Button";
import { badgeClass } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useServerAction } from "@/components/ui/useServerAction";

type Mark = "확인" | "확인취소" | "준비" | "준비취소";

function useMark(courseId: string, guideId: string) {
  const { pending, run } = useServerAction<MarkState>((prev, formData) => markGuideAction(prev ?? {}, formData));
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<Mark | null>(null);
  const toast = useToast();
  const mark = (m: Mark, done: string) => {
    setError(null);
    setRunning(m);
    run({ courseId, guideId, mark: m }, (result) => {
      setRunning(null);
      if ("networkError" in result) return setError(result.networkError);
      if (!result.ok) return setError(result.message ?? "저장하지 못했습니다.");
      toast(done);
    });
  };
  return { pending, running, error, mark };
}

export function GuideActions({
  courseId,
  guideId,
  confirmed,
  changed,
  needsPrep,
  prepared,
}: {
  courseId: string;
  guideId: string;
  confirmed: boolean;
  changed: boolean;
  needsPrep: boolean;
  prepared: boolean;
}) {
  const { pending, running, error, mark } = useMark(courseId, guideId);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {confirmed ? (
          <>
            <span className={badgeClass("green", "py-1 text-base")}>✓ 안내 확인함</span>
            <Button variant="text" size="sm" pending={running === "확인취소"} disabled={pending} onClick={() => mark("확인취소", "안내 확인을 되돌렸습니다.")}>
              되돌리기
            </Button>
          </>
        ) : (
          <Button variant="primary" pending={running === "확인"} disabled={pending} onClick={() => mark("확인", "안내를 확인했습니다.")}>
            {changed ? "바뀐 내용 확인" : "안내 확인"}
          </Button>
        )}
      </div>
      {needsPrep && (
        <div className="flex flex-wrap items-center gap-2">
          {prepared ? (
            <>
              <span className={badgeClass("green", "py-1 text-base")}>✓ 준비 완료</span>
              <Button variant="text" size="sm" pending={running === "준비취소"} disabled={pending} onClick={() => mark("준비취소", "준비 완료를 되돌렸습니다.")}>
                되돌리기
              </Button>
            </>
          ) : (
            <Button variant="secondary" pending={running === "준비"} disabled={pending} onClick={() => mark("준비", "준비 완료로 표시했습니다.")}>
              준비 완료로 표시
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
