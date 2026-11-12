// 작업 1 확인용 검사: 새로 설치한 도구 3개(vitest, zod, exceljs)가 실제로 동작하는지 본다.
// 본격적인 규칙 검사(작업 23)가 아니라, "설치가 잘 됐는가"만 확인하는 작은 검사다.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import ExcelJS from "exceljs";

// PRD 5번 M1-9: 사번은 숫자 6자리 텍스트
const empNoSchema = z.string().regex(/^[0-9]{6}$/);

describe("작업 1: 추가 도구 설치 확인", () => {
  it("zod: 6자리 숫자 사번만 통과시킨다", () => {
    expect(empNoSchema.safeParse("001234").success).toBe(true);
    expect(empNoSchema.safeParse("1234").success).toBe(false); // 5자리 미만
    expect(empNoSchema.safeParse("1234567").success).toBe(false); // 7자리
    expect(empNoSchema.safeParse("12A456").success).toBe(false); // 글자 섞임
  });

  it("exceljs: 텍스트 서식으로 저장한 사번의 앞자리 0이 엑셀 파일을 거쳐도 유지된다", async () => {
    // 쓰기: 사번 열을 텍스트 서식("@")으로 지정해 엑셀 파일(.xlsx)로 만든다
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("신청자");
    sheet.columns = [
      { header: "사번", key: "empNo", style: { numFmt: "@" } },
      { header: "이름", key: "name" },
    ];
    sheet.addRow({ empNo: "001234", name: "테스트1" });
    const buffer = await book.xlsx.writeBuffer();

    // 읽기: 다시 열어서 사번이 글자 그대로인지 확인한다
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(buffer as ArrayBuffer);
    const value = reread.getWorksheet("신청자")?.getRow(2).getCell(1).value;
    expect(value).toBe("001234");
  });
});
