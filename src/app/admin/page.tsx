// /admin 으로 들어오면 명단 화면으로 보낸다 (로그인 확인은 proxy와 각 화면에서 한다)
import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/roster");
}
