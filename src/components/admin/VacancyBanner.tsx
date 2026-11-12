// 담당자 화면 맨 위의 충원 알림 배너 (DESIGN 2.2, PRD M2-9).
// 충원이 필요한 자리가 없으면 아무것도 보이지 않는다. 불참 상세 사유는 배너에 담지 않고 이름과 건수만 보여 준다.
import Link from "next/link";
import { getAdminSummary } from "@/lib/adminData";

export async function VacancyBanner() {
  const { alert } = await getAdminSummary();
  if (alert.total === 0) return null;

  const parts = [alert.absent > 0 && `불참 ${alert.absent}명`, alert.excluded > 0 && `직접 제외 ${alert.excluded}명`]
    .filter(Boolean)
    .join(", ");
  const rest = alert.total - alert.names.length;

  return (
    <div
      role="status"
      className="flex flex-col gap-1 border-b border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p>
        <strong className="font-bold">
          충원이 필요한 자리가 {alert.total}개 있습니다
        </strong>{" "}
        ({parts})
        <span className="block text-sm text-amber-800 dark:text-amber-300">
          {alert.names.join(", ")}
          {rest > 0 ? ` 외 ${rest}명` : ""}
        </span>
      </p>
      <Link
        href="/admin/replies?filter=absent"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-amber-900 px-4 text-base font-semibold text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
      >
        회신 현황에서 확인
      </Link>
    </div>
  );
}
