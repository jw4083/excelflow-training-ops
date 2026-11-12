// 신청자 엑셀 읽기 (PLAN 작업 10, PRD M1-1, DESIGN 4.1). 파일 이름·내용을 검사하고 사번·이름·부서만 뽑는다.
// 연락처·이메일·주민등록번호·직급 같은 다른 열이 있어도 읽지 않는다 (최소 수집, PRD 7번).
import ExcelJS from "exceljs";
import { MAX_APPLICANT_ROWS, REQUIRED_COLUMNS, type RawEmpNo, type RawRow } from "./applicants";

export type ParseResult =
  | { ok: true; rows: RawRow[] }
  | { ok: false; error: string; missingColumns?: string[] };

const fail = (error: string, missingColumns?: string[]): ParseResult => ({ ok: false, error, missingColumns });

type Cell = { text: string; number?: number };

/** 엑셀 칸의 값을 글자(또는 숫자)로 바꾼다. 서식 있는 글자·수식 결과도 읽는다. */
function readCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return { text: "" };
  if (typeof value === "number") return { text: String(value), number: value };
  if (typeof value === "string") return { text: value.trim() };
  if (typeof value === "boolean") return { text: String(value) };
  if (value instanceof Date) return { text: value.toISOString() }; // 날짜 칸은 사번이 될 수 없으므로 글자로 넘겨 형식 오류가 되게 한다
  if ("richText" in value) return { text: value.richText.map((part) => part.text).join("").trim() };
  if ("result" in value) return readCell(value.result as ExcelJS.CellValue);
  if ("text" in value) return { text: String(value.text).trim() };
  return { text: "" }; // 오류 값(#N/A 등)
}

const toRawEmpNo = (cell: Cell): RawEmpNo =>
  cell.number !== undefined ? { kind: "number", value: cell.number } : { kind: "text", text: cell.text };

/**
 * 업로드한 파일을 읽는다.
 * - 확장자가 .xlsx가 아니면 거부 (.xls, .csv 등)
 * - 첫 시트의 첫 줄에서 열 이름(사번, 이름, 부서)을 찾는다. 하나라도 없으면 거부하고 빠진 열 이름을 알려 준다.
 * - 데이터가 1,000행을 넘으면 거부 (제목 행과 빈 행은 세지 않는다)
 */
export async function parseApplicantWorkbook(buffer: Buffer, fileName: string): Promise<ParseResult> {
  if (!/\.xlsx$/i.test(fileName.trim())) {
    return fail("엑셀 파일(.xlsx)만 올릴 수 있습니다. .xls나 .csv 파일은 엑셀에서 .xlsx로 저장한 뒤 올려 주세요.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return fail("엑셀 파일을 읽을 수 없습니다. 파일이 손상되었거나 .xlsx 형식이 아닙니다.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return fail("엑셀 파일에 시트가 없습니다.");

  // 첫 줄에서 열 이름 찾기 (앞뒤 공백은 무시)
  const header = new Map<string, number>();
  const headerRow = sheet.getRow(1);
  for (let col = 1; col <= sheet.columnCount; col++) {
    const name = readCell(headerRow.getCell(col).value).text;
    if (name && !header.has(name)) header.set(name, col);
  }
  const missing = REQUIRED_COLUMNS.filter((name) => !header.has(name));
  if (missing.length > 0) {
    return fail(`필수 열이 없습니다: ${missing.join(", ")}. 첫 줄에 사번, 이름, 부서 열이 있어야 합니다.`, [...missing]);
  }
  const [empNoCol, nameCol, deptCol] = REQUIRED_COLUMNS.map((name) => header.get(name) as number);

  // 데이터 행 읽기: 세 칸이 모두 비어 있는 행은 건너뛴다 (엑셀에 남은 빈 서식 줄)
  const rows: RawRow[] = [];
  for (let line = 2; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line);
    const empNo = readCell(row.getCell(empNoCol).value);
    const name = readCell(row.getCell(nameCol).value);
    const dept = readCell(row.getCell(deptCol).value);
    if (!empNo.text && !name.text && !dept.text) continue;
    rows.push({ line, empNo: toRawEmpNo(empNo), name: name.text, dept: dept.text });
    if (rows.length > MAX_APPLICANT_ROWS) {
      return fail(`한 번에 ${MAX_APPLICANT_ROWS.toLocaleString("ko-KR")}행까지만 올릴 수 있습니다. 파일을 나누어 올려 주세요.`);
    }
  }
  return { ok: true, rows };
}
