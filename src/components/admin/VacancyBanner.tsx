// 담당자 화면 맨 위의 충원 알림 배너 (DESIGN 2.2, PRD M2-9).
// 충원이 필요한 자리가 없으면 아무것도 보이지 않는다. 불참 상세 사유는 배너에 담지 않고 이름과 건수만 보여 준다.
// 담당자가 아직 확인하지 않은 참석 취소가 있으면 "새 참석 취소 n건"을 함께 보여 주고, 누르면 "참석 후 취소" 목록으로 간다.
import Link from "next/link";
import { getAdminSummary } from "@/lib/adminData";

export async function VacancyBanner({ courseId }: { courseId: string }) {
  const { alert } = await getAdminSummary(courseId);
  if (alert.total === 0 && alert.newCancels === 0) return null;

  const parts = [alert.absent > 0 && `불참 ${alert.absent}명`, alert.excluded > 0 && `선정 취소 ${alert.excluded}명`]
    .filter(Boolean)
    .join(", ");
  const rest = alert.total - alert.names.length;

  return (
    <div
      role="status"
      className="flex flex-col gap-1 border-b border-peach-200 bg-peach-100 px-4 py-3 text-base text-zinc-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p>
        {alert.newCancels > 0 && (
          <strong className="mr-2 inline-block rounded-full bg-rose-600 px-2.5 py-0.5 text-sm font-bold text-white">새 참석 취소 {alert.newCancels}건</strong>
        )}
        <strong className="font-bold">
          충원이 필요한 자리가 {alert.total}개 있습니다
        </strong>{" "}
        {parts && `(${parts})`}
        <span className="block text-sm text-peach-700 dark:text-amber-300">
          {alert.names.join(", ")}
          {rest > 0 ? ` 외 ${rest}명` : ""}
        </span>
      </p>
      <Link
        href={alert.newCancels > 0 ? `/admin/courses/${courseId}/replies?filter=cancelled` : `/admin/courses/${courseId}/replies#vacancies`}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
      >
        회신 현황에서 확인
      </Link>
    </div>
  );
}
