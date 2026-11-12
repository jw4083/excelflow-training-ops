"use client";
// 담당자 화면이 열려 있는 동안 60초마다 서버에서 새 내용을 가져와 다시 그린다 (PRD M2-9: 새로고침 없이 새 불참이 반영됨).
// 탭이 가려져 있을 때는 쉬고, 다시 보이면 곧바로 한 번 갱신한다. 입력 중인 칸은 router.refresh()가 지우지 않는다.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const REFRESH_SECONDS = 60;

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, REFRESH_SECONDS * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}
