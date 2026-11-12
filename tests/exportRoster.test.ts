// 작업 22 확인용 검사: 최종 명단 엑셀의 열 구성, 사번 텍스트 서식(앞자리 0), 화면 명단과의 일치 (PRD M1-9, PLAN SC-8·SC-9).
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildExportRows, buildRosterWorkbook, EXPORT_COLUMNS, EXPORT_SHEET_NAME, exportFileName } from "@/domain/exportRoster";
import { visibleTrainees } from "@/domain/roster";
import type { Reply, Trainee } from "@/domain/types";

const T0 = "2026-11-12T09:00:00+09:00";
const t = (id: string, empNo: string, status: Trainee["status"], extra: Partial<Trainee> = {}): Trainee => ({
  id,
  empNo,
  name: `이름${id}`,
  dept: "부서",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});
const COURSE_DEADLINE = "2026-11-20T18:00:00+09:00";

const trainees = [
  t("c", "001234", "선정", { isManual: true, manualReason: "임원 추천", replyDeadline: "2026-11-25T09:00:00+09:00" }),
  t("a", "000012", "선정"),
  t("b", "100000", "불참"),
  t("d", "100001", "대기", { waitNo: 2 }),
  t("e", "100002", "신청"),
  t("f", "100003", "선정"), // 미회신
];
const replies: Reply[] = [
  { traineeId: "a", attend: true, laptop: true, roommateName: "홍길동", roommateDept: "총무부", submittedAt: "2026-11-13T10:00:00+09:00", byAdmin: false },
  { traineeId: "b", attend: false, absentType: "업무", absentDetail: "=SUM(1,2) 출장으로 불참합니다", laptop: false, submittedAt: "2026-11-13T11:30:00+09:00", byAdmin: true },
  { traineeId: "c", attend: true, laptop: false, submittedAt: "2026-11-14T09:00:00+09:00", byAdmin: false },
];

const col = (name: string) => EXPORT_COLUMNS.findIndex((c) => c.header === name);

describe("작업 22: 최종 명단 내용", () => {
  const rows = buildExportRows(trainees, replies, COURSE_DEADLINE);

  it("교육생 전체를 사번 순으로 담는다 (명단 화면 '전체' 탭과 같은 사람·같은 순서)", () => {
    expect(rows.map((r) => r[0])).toEqual(visibleTrainees(trainees, "전체").map((x) => x.empNo));
    expect(rows).toHaveLength(trainees.length);
  });

  it("모든 줄이 열 수와 같은 칸 수를 가진다", () => {
    for (const r of rows) expect(r).toHaveLength(EXPORT_COLUMNS.length);
  });

  it("참석자: 노트북·룸메이트·제출 일시, 불참자: 구분·상세·담당자 입력 표시", () => {
    const a = rows.find((r) => r[0] === "000012")!;
    expect(a[col("회신 여부")]).toBe("참석");
    expect(a[col("노트북")]).toBe("지참");
    expect(a[col("룸메이트 이름")]).toBe("홍길동");
    expect(a[col("룸메이트 부서")]).toBe("총무부");
    expect(a[col("제출 일시")]).toBe("2026-11-13 10:00");
    expect(a[col("담당자 입력")]).toBe("");
    const b = rows.find((r) => r[0] === "100000")!;
    expect(b[col("회신 여부")]).toBe("불참");
    expect(b[col("불참 구분")]).toBe("업무");
    expect(b[col("불참 상세")]).toBe("=SUM(1,2) 출장으로 불참합니다");
    expect(b[col("노트북")]).toBe("");
    expect(b[col("담당자 입력")]).toBe("담당자 입력");
  });

  it("수기 표시·사유, 대기 순번, 미회신, 회신 기한(개별 우선)", () => {
    const c = rows.find((r) => r[0] === "001234")!;
    expect(c[col("수기")]).toBe("수기");
    expect(c[col("수기 추가 사유")]).toBe("임원 추천");
    expect(c[col("회신 기한")]).toBe("2026-11-25 09:00");
    expect(c[col("노트북")]).toBe("미지참");
    expect(rows.find((r) => r[0] === "100001")![col("대기 순번")]).toBe(2);
    const f = rows.find((r) => r[0] === "100003")!;
    expect(f[col("회신 여부")]).toBe("미회신");
    expect(f[col("회신 기한")]).toBe("2026-11-20 18:00");
    expect(f[col("제출 일시")]).toBe("");
    // 회신 대상이 아닌 상태(신청·대기)는 회신 여부·기한이 비어 있다
    const e = rows.find((r) => r[0] === "100002")!;
    expect(e[col("회신 여부")]).toBe("");
    expect(e[col("회신 기한")]).toBe("");
  });

  it("파일 이름은 한국 날짜로 만든다", () => {
    expect(exportFileName("2026-11-12T16:00:00.000Z")).toBe("최종명단_20261113.xlsx"); // UTC 16시 = 한국 다음 날 01시
  });
});

describe("작업 22: 만들어진 엑셀 파일", () => {
  it("다시 열어도 사번 앞자리 0이 그대로이고 사번 열이 텍스트 서식이다", async () => {
    const buffer = await buildRosterWorkbook(trainees, replies, COURSE_DEADLINE);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet(EXPORT_SHEET_NAME)!;
    expect(sheet.getRow(1).values).toEqual([undefined, ...EXPORT_COLUMNS.map((c) => c.header)]);
    const empNos = sheet.getColumn(1).values.slice(2);
    expect(empNos).toEqual(["000012", "001234", "100000", "100001", "100002", "100003"]);
    for (let r = 2; r <= sheet.rowCount; r++) {
      const cell = sheet.getRow(r).getCell(1);
      expect(typeof cell.value).toBe("string");
      expect(cell.numFmt).toBe("@");
    }
  });

  it("'='로 시작하는 불참 상세도 수식이 아니라 글자로 저장된다", async () => {
    const buffer = await buildRosterWorkbook(trainees, replies, COURSE_DEADLINE);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const cell = wb.getWorksheet(EXPORT_SHEET_NAME)!.getRow(4).getCell(col("불참 상세") + 1);
    expect(cell.value).toBe("=SUM(1,2) 출장으로 불참합니다");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });

  it("교육생이 없어도 머리글만 있는 파일이 만들어진다", async () => {
    const buffer = await buildRosterWorkbook([], [], undefined);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(wb.getWorksheet(EXPORT_SHEET_NAME)!.rowCount).toBe(1);
  });
});
