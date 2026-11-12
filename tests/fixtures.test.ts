// 작업 2 확인용 검사: fixtures/ 의 가짜 엑셀이 계획(PLAN 작업 2, DESIGN 8.3)대로 만들어졌는지 본다.
// 먼저 `npm run fixtures`로 파일을 만들어 두어야 한다.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { join } from "node:path";

const dir = join(process.cwd(), "fixtures");

/** 엑셀 파일의 첫 시트를 읽어 [제목들, 데이터 행들]로 돌려준다 (사번 셀은 원래 값 그대로) */
async function read(fileName: string) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(join(dir, fileName));
  const sheet = book.worksheets[0];
  const headers = (sheet.getRow(1).values as unknown[]).slice(1);
  const rows: unknown[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    rows.push((sheet.getRow(r).values as unknown[]).slice(1));
  }
  return { headers, rows, sheet };
}

describe("작업 2: 가짜 신청자 엑셀", () => {
  it("기본 명단: 30행, 고유 사번 28개, 중복 행 2개", async () => {
    const { headers, rows } = await read("applicants-30.xlsx");
    expect(headers).toEqual(["사번", "이름", "부서"]);
    expect(rows).toHaveLength(30);

    const empNos = rows.map((r) => r[0] as string);
    expect(new Set(empNos).size).toBe(28);
    // 중복된 사번은 정확히 2개이고, 각각 "원래 행"이 먼저 나온다
    expect(empNos.filter((e) => e === "100005")).toHaveLength(2);
    expect(empNos.filter((e) => e === "001234")).toHaveLength(2);
    expect(empNos.indexOf("100005")).toBeLessThan(empNos.lastIndexOf("100005"));
  });

  it("기본 명단: 사번은 모두 6자리 글자(텍스트)이고 앞자리 0 사번이 5개(고유 기준)", async () => {
    const { rows } = await read("applicants-30.xlsx");
    const empNos = rows.map((r) => r[0]);
    for (const e of empNos) {
      expect(typeof e).toBe("string"); // 숫자가 아니라 글자
      expect(e).toMatch(/^[0-9]{6}$/);
    }
    const leadingZeroUnique = new Set((empNos as string[]).filter((e) => e.startsWith("0")));
    expect(leadingZeroUnique.size).toBe(5);
  });

  it("기본 명단: 사번 열은 텍스트 서식(@)이다", async () => {
    const { sheet } = await read("applicants-30.xlsx");
    expect(sheet.getRow(2).getCell(1).numFmt).toBe("@");
  });

  it("기본 명단: 이름은 모두 가짜 이름이다 (실제 직원 정보 없음)", async () => {
    const { rows } = await read("applicants-30.xlsx");
    for (const r of rows) expect(String(r[1])).toMatch(/테스트|중복행/);
  });

  it("필수 열 누락 파일: '부서' 열이 없다", async () => {
    const { headers } = await read("err-missing-column.xlsx");
    expect(headers).toEqual(["사번", "이름"]);
  });

  it("행 수 경계: 1,001행(거부용)과 1,000행(통과용), 제목 행 제외", async () => {
    expect((await read("err-1001-rows.xlsx")).rows).toHaveLength(1001);
    expect((await read("ok-1000-rows.xlsx")).rows).toHaveLength(1000);
  });

  it("6자리 아닌 사번 파일: 정상 2행 + 오류 4행(5자리, 7자리, 글자 섞임, 빈 사번)", async () => {
    const { rows } = await read("err-bad-empno.xlsx");
    const valid = rows.filter((r) => /^[0-9]{6}$/.test(String(r[0] ?? "")));
    expect(rows).toHaveLength(6);
    expect(valid).toHaveLength(2);
  });

  it("숫자 서식 사번 파일: 사번 셀이 글자가 아니라 숫자로 저장되어 있다", async () => {
    const { rows } = await read("warn-numeric-empno.xlsx");
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(typeof r[0]).toBe("number");
    expect(rows[0][0]).toBe(1234); // 업로드 때 001234로 복원해야 하는 값
  });

  it(".xlsx가 아닌 파일 2개가 있다 (.csv, .xls)", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(dir, "err-not-xlsx.csv"))).toBe(true);
    expect(existsSync(join(dir, "err-not-xlsx.xls"))).toBe(true);
  });
});
