// 최종 명단 엑셀 만들기 (PLAN 작업 22, PRD M1-9, DESIGN 4.5). 화면·저장소를 모르는 순수 코드(파일 내용만 만든다).
// - 교육생 전체를 사번 순으로 담는다: 명단 화면의 "전체" 탭과 같은 사람·같은 순서라 화면 명단과 파일이 같다 (PLAN SC-8).
// - 사번 열은 글자(텍스트) 서식이다: 엑셀에서 열어도 앞자리 0이 사라지지 않는다 (PLAN SC-9).
// - 불참 상세 사유는 대외비라, 이 파일을 받을 수 있는 사람은 로그인한 담당자뿐이다 (받는 길은 app/admin/export/route.ts).
import ExcelJS from "exceljs";
import { replyLabel } from "./roster";
import { formatKst } from "@/lib/datetime";
import type { Reply, Trainee } from "./types";

export const EXPORT_SHEET_NAME = "최종 명단";

/** 열 이름과 너비 (표시 순서 그대로) */
export const EXPORT_COLUMNS = [
  { header: "사번", width: 10 },
  { header: "이름", width: 14 },
  { header: "부서", width: 18 },
  { header: "상태", width: 8 },
  { header: "수기", width: 6 },
  { header: "수기 추가 사유", width: 24 },
  { header: "대기 순번", width: 10 },
  { header: "회신 여부", width: 10 },
  { header: "참석", width: 8 },
  { header: "불참 구분", width: 10 },
  { header: "불참 상세", width: 36 },
  { header: "노트북", width: 10 },
  { header: "룸메이트 이름", width: 14 },
  { header: "룸메이트 부서", width: 18 },
  { header: "회신 기한", width: 18 },
  { header: "제출 일시", width: 18 },
  { header: "담당자 입력", width: 12 },
] as const;

type Cell = string | number;

/** 사번 순으로 정렬한 한 줄씩의 값 (모두 글자, 대기 순번만 숫자). 값이 없는 칸은 빈 글자 */
export function buildExportRows(trainees: Trainee[], replies: Reply[], courseDeadline?: string): Cell[][] {
  const byId = new Map(replies.map((r) => [r.traineeId, r]));
  return [...trainees]
    .sort((a, b) => a.empNo.localeCompare(b.empNo))
    .map((t) => {
      const reply = byId.get(t.id);
      const label = replyLabel(t.status, reply);
      const deadline = t.replyDeadline ?? courseDeadline;
      const attended = reply?.attend === true;
      const absent = reply?.attend === false;
      return [
        t.empNo,
        t.name,
        t.dept,
        t.status,
        t.isManual ? "수기" : "",
        t.manualReason ?? "",
        t.status === "대기" && t.waitNo ? t.waitNo : "",
        label === "-" ? "" : label,
        attended ? "참석" : absent ? "불참" : "",
        absent ? (reply?.absentType ?? "") : "",
        absent ? (reply?.absentDetail ?? "") : "",
        attended ? (reply?.laptop ? "지참" : "미지참") : "",
        attended ? (reply?.roommateName ?? "") : "",
        attended ? (reply?.roommateDept ?? "") : "",
        (t.status === "선정" || t.status === "불참") && deadline && !Number.isNaN(Date.parse(deadline)) ? formatKst(deadline) : "",
        reply ? formatKst(reply.submittedAt) : "",
        reply?.byAdmin ? "담당자 입력" : "",
      ];
    });
}

/** .xlsx 파일 내용을 만든다 */
export async function buildRosterWorkbook(trainees: Trainee[], replies: Reply[], courseDeadline?: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EXPORT_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  sheet.getRow(1).font = { bold: true };

  // 사번 열(A)은 글자 서식("@")으로 미리 지정하고, 값도 글자로 넣는다 (숫자로 읽혀 앞자리 0이 사라지는 것을 막는다)
  sheet.getColumn(1).numFmt = "@";
  for (const row of buildExportRows(trainees, replies, courseDeadline)) {
    const added = sheet.addRow(row);
    added.getCell(1).numFmt = "@";
    added.getCell(1).value = String(row[0]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** 내려받는 파일 이름: 최종명단_20261112.xlsx (한국 날짜) */
export function exportFileName(nowIso: string): string {
  return `최종명단_${formatKst(nowIso).slice(0, 10).replaceAll("-", "")}.xlsx`;
}
