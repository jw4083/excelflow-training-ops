// 최종 명단 내려받기 (PLAN 작업 22, DESIGN 4.5): 로그인한 담당자만 .xlsx 파일을 받을 수 있다.
// proxy가 /admin 아래를 1차로 막지만, 불참 상세 사유가 들어 있으므로 여기서도 로그인을 다시 확인한다.
import { buildRosterWorkbook, exportFileName } from "@/domain/exportRoster";
import { isAdminLoggedIn } from "@/lib/auth";
import { getCatalog } from "@/store";

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  if (!(await isAdminLoggedIn())) return new Response("로그인이 필요합니다.", { status: 401 });

  // 주소의 과정 번호로 그 과정의 저장소만 연다 (형식이 틀리거나 없는 과정이면 404). 보관된 과정도 내려받을 수 있다
  const { courseId } = await params;
  const store = await getCatalog().openCourse(courseId);
  if (!store) return new Response("과정을 찾을 수 없습니다.", { status: 404 });
  const data = await store.readAll();
  const file = await buildRosterWorkbook(data.trainees, data.replies, data.course?.replyDeadline);
  const name = exportFileName(new Date().toISOString());

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // 한글 파일 이름은 RFC 5987 방식(filename*)으로 보낸다
      "Content-Disposition": `attachment; filename="roster.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store", // 대외비라 브라우저·중간 서버에 남기지 않는다
    },
  });
}
