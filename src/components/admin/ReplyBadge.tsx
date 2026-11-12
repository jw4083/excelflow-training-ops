// "회신 현황" 메뉴 옆의 빨간 숫자 표시: 충원이 필요한 자리 수 (0이면 아무것도 보이지 않음). PRD M2-9
import { getAdminSummary } from "@/lib/adminData";

export async function ReplyBadge() {
  const { alert } = await getAdminSummary();
  if (alert.total === 0) return null;

  return (
    <span
      aria-label={`충원이 필요한 자리 ${alert.total}개`}
      className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white"
    >
      {alert.total > 99 ? "99+" : alert.total}
    </span>
  );
}
