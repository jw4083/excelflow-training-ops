// 작업 10 확인용 검사: 신청자 엑셀 업로드 규칙(PRD M1-1·M1-2·M1-9)을 작업 2의 가짜 엑셀로 확인한다.
// 먼저 `npm run fixtures`로 fixtures/ 파일이 만들어져 있어야 한다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { planImport, type RawRow } from "@/domain/applicants";
import { parseApplicantWorkbook } from "@/domain/excel";
import { importApplicants, MAX_FILE_BYTES } from "@/lib/importApplicants";
import { FileStore } from "@/store/fileStore";

const fixture = async (name: string) => ({ name, buffer: await readFile(path.join(process.cwd(), "fixtures", name)) });
const text = (empNo: string) => ({ kind: "text", text: empNo }) as const;
const row = (line: number, empNo: RawRow["empNo"], name = "김테스트", dept = "인재개발부"): RawRow => ({ line, empNo, name, dept });

describe("작업 10: 등록 계획 (엑셀과 무관한 규칙)", () => {
  it("6자리 숫자 사번만 등록하고, 아닌 행은 줄 번호와 함께 등록하지 않는다", () => {
    const plan = planImport(
      [row(2, text("100001")), row(3, text("12345")), row(4, text("1234567")), row(5, text("12A456")), row(6, text(""))],
      new Set(),
    );
    expect(plan.accepted.map((r) => r.empNo)).toEqual(["100001"]);
    expect(plan.rowErrors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(plan.rowErrors[0].reason).toContain("6자리");
  });

  it("앞자리 0 사번은 글자 그대로 등록된다 ('001234'와 '1234'는 다른 값)", () => {
    const plan = planImport([row(2, text("001234"))], new Set());
    expect(plan.accepted[0].empNo).toBe("001234");
  });

  it("숫자로 저장된 사번: 6자리 미만이면 앞에 0을 채워 복원하고 경고, 6자리 초과·소수는 형식 오류", () => {
    const plan = planImport(
      [
        row(2, { kind: "number", value: 1234 }),
        row(3, { kind: "number", value: 98765 }),
        row(4, { kind: "number", value: 123456 }),
        row(5, { kind: "number", value: 1234567 }),
        row(6, { kind: "number", value: 12.5 }),
        row(7, { kind: "number", value: -1 }),
      ],
      new Set(),
    );
    expect(plan.accepted.map((r) => r.empNo)).toEqual(["001234", "098765", "123456"]);
    expect(plan.restored).toEqual([
      { line: 2, from: "1234", to: "001234" },
      { line: 3, from: "98765", to: "098765" },
    ]); // 이미 6자리인 123456은 경고 없음
    expect(plan.rowErrors.map((e) => e.line)).toEqual([5, 6, 7]);
  });

  it("같은 사번은 위쪽 행만 남기고 중복 목록을 보여 준다", () => {
    const plan = planImport(
      [row(2, text("100001"), "첫째"), row(3, text("100002")), row(4, text("100001"), "중복"), row(5, text("100001"), "또 중복")],
      new Set(),
    );
    expect(plan.accepted.map((r) => [r.empNo, r.name])).toEqual([["100001", "첫째"], ["100002", "김테스트"]]);
    expect(plan.duplicates).toEqual([{ empNo: "100001", keptLine: 2, removedLines: [4, 5] }]);
  });

  it("형식 검사를 먼저 하므로, 형식 오류 행은 중복 목록에 들어가지 않는다", () => {
    const plan = planImport([row(2, text("12345")), row(3, text("12345"))], new Set());
    expect(plan.duplicates).toEqual([]);
    expect(plan.rowErrors).toHaveLength(2);
  });

  it("숫자로 저장된 사번과 글자 사번이 같은 값이면 중복으로 본다 (1234 → 001234)", () => {
    const plan = planImport([row(2, text("001234")), row(3, { kind: "number", value: 1234 })], new Set());
    expect(plan.duplicates).toEqual([{ empNo: "001234", keptLine: 2, removedLines: [3] }]);
  });

  it("이미 명단에 있는 사번은 건너뛰고 목록에 보여 준다 (다시 올린 경우)", () => {
    const plan = planImport([row(2, text("100001")), row(3, text("100002"))], new Set(["100001"]));
    expect(plan.accepted.map((r) => r.empNo)).toEqual(["100002"]);
    expect(plan.skippedExisting).toEqual([{ line: 2, empNo: "100001" }]);
  });

  it("이름·부서가 비어 있거나 너무 길면 그 행만 등록하지 않는다", () => {
    const plan = planImport(
      [row(2, text("100001"), "", "인재개발부"), row(3, text("100002"), "김테스트", " "), row(4, text("100003"), "가".repeat(101)), row(5, text("100004"))],
      new Set(),
    );
    expect(plan.accepted.map((r) => r.empNo)).toEqual(["100004"]);
    expect(plan.rowErrors.map((e) => [e.line, e.reason])).toEqual([
      [2, "이름 칸이 비어 있습니다."],
      [3, "부서 칸이 비어 있습니다."],
      [4, "이름·부서는 100자 이하여야 합니다."],
    ]);
  });
});

describe("작업 10: 엑셀 파일 읽기 (가짜 엑셀)", () => {
  it(".xlsx가 아니면 거부한다 (.csv, .xls)", async () => {
    for (const name of ["err-not-xlsx.csv", "err-not-xlsx.xls"]) {
      const f = await fixture(name);
      const r = await parseApplicantWorkbook(f.buffer, f.name);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(".xlsx");
    }
  });

  it("이름은 .xlsx여도 내용이 엑셀이 아니면 거부한다", async () => {
    const r = await parseApplicantWorkbook(Buffer.from("엑셀이 아닌 글자"), "가짜.xlsx");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("읽을 수 없습니다");
  });

  it("필수 열이 없으면 거부하고 빠진 열 이름을 알려 준다", async () => {
    const f = await fixture("err-missing-column.xlsx");
    const r = await parseApplicantWorkbook(f.buffer, f.name);
    expect(r).toMatchObject({ ok: false, missingColumns: ["부서"] });
    if (!r.ok) expect(r.error).toContain("부서");
  });

  it("1,001행은 거부하고 1,000행은 통과한다 (제목 행 제외)", async () => {
    const over = await fixture("err-1001-rows.xlsx");
    const overResult = await parseApplicantWorkbook(over.buffer, over.name);
    expect(overResult.ok).toBe(false);
    if (!overResult.ok) expect(overResult.error).toContain("1,000행");

    const ok = await fixture("ok-1000-rows.xlsx");
    const okResult = await parseApplicantWorkbook(ok.buffer, ok.name);
    expect(okResult).toMatchObject({ ok: true });
    if (okResult.ok) expect(okResult.rows).toHaveLength(1000);
  });

  it("기본 명단 30행: 줄 번호는 제목 행 다음인 2번부터 시작하고, 사번은 글자 그대로 읽힌다", async () => {
    const f = await fixture("applicants-30.xlsx");
    const r = await parseApplicantWorkbook(f.buffer, f.name);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(30);
      expect(r.rows[0].line).toBe(2);
      expect(r.rows[0].empNo).toEqual({ kind: "text", text: "000123" }); // 앞자리 0 유지
      expect(r.rows[29].line).toBe(31);
    }
  });

  it("숫자 서식 사번 파일은 숫자로 읽힌다", async () => {
    const f = await fixture("warn-numeric-empno.xlsx");
    const r = await parseApplicantWorkbook(f.buffer, f.name);
    expect(r.ok && r.rows[0].empNo).toEqual({ kind: "number", value: 1234 });
  });
});

describe("작업 10: 업로드 → 저장 (가짜 엑셀 전체 흐름)", () => {
  let dir: string;
  let store: FileStore;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "applicants-test-"));
    store = new FileStore(path.join(dir, "db.json"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const upload = async (name: string) => {
    const f = await fixture(name);
    return importApplicants(store, { name: f.name, size: f.buffer.length, buffer: f.buffer });
  };

  it("기본 명단 30행: 고유 28명 등록, 중복 2건은 위쪽 행만 남고 목록에 나온다, 상태는 모두 '신청'", async () => {
    const r = await upload("applicants-30.xlsx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toMatchObject({ totalRows: 30, registered: 28, rowErrors: [], skippedExisting: [], restored: [] });
    expect(r.summary.duplicates.map((d) => d.empNo).sort()).toEqual(["001234", "100005"]);
    for (const d of r.summary.duplicates) expect(d.removedLines).toHaveLength(1);

    const { trainees, history } = await store.readAll();
    expect(trainees).toHaveLength(28);
    expect(trainees.every((t) => t.status === "신청" && !t.isManual && t.loginFails === 0)).toBe(true);
    expect(trainees.filter((t) => t.empNo.startsWith("0"))).toHaveLength(5); // 앞자리 0 사번 5개가 그대로
    expect(trainees.some((t) => t.name.includes("중복행"))).toBe(false); // 중복 행은 남지 않음
    expect(history).toHaveLength(0); // 업로드는 상태 변경 이력이 아니다
  });

  it("같은 파일을 다시 올리면 전부 '이미 있음'으로 건너뛰고 새로 등록되지 않는다", async () => {
    await upload("applicants-30.xlsx");
    const again = await upload("applicants-30.xlsx");
    expect(again.ok && again.summary).toMatchObject({ registered: 0 });
    if (again.ok) expect(again.summary.skippedExisting).toHaveLength(28);
    expect((await store.readAll()).trainees).toHaveLength(28);
  });

  it("6자리 아닌 사번이 섞인 파일: 정상 2행만 등록하고 오류 4행은 줄 번호와 함께 알린다", async () => {
    const r = await upload("err-bad-empno.xlsx");
    expect(r.ok && r.summary).toMatchObject({ totalRows: 6, registered: 2 });
    if (r.ok) expect(r.summary.rowErrors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect((await store.readAll()).trainees.map((t) => t.empNo).sort()).toEqual(["100001", "100002"]);
  });

  it("숫자 서식 사번 파일: 앞자리 0을 복원해 등록하고 경고 목록을 보여 준다", async () => {
    const r = await upload("warn-numeric-empno.xlsx");
    expect(r.ok && r.summary).toMatchObject({ registered: 3 });
    if (r.ok) {
      expect(r.summary.restored).toEqual([
        { line: 2, from: "1234", to: "001234" },
        { line: 3, from: "98765", to: "098765" },
      ]);
      expect(r.summary.rowErrors.map((e) => e.line)).toEqual([5, 6]); // 7자리, 소수
    }
    expect((await store.readAll()).trainees.map((t) => t.empNo).sort()).toEqual(["001234", "098765", "123456"]);
  });

  it("거부된 파일은 아무것도 저장하지 않는다 (1,001행, 필수 열 없음, .csv)", async () => {
    for (const name of ["err-1001-rows.xlsx", "err-missing-column.xlsx", "err-not-xlsx.csv"]) {
      expect((await upload(name)).ok).toBe(false);
    }
    expect((await store.readAll()).trainees).toHaveLength(0);
  });

  it("1,000행 파일은 한 번에 모두 등록된다", async () => {
    const r = await upload("ok-1000-rows.xlsx");
    expect(r.ok && r.summary.registered).toBe(1000);
    expect((await store.readAll()).trainees).toHaveLength(1000);
  });

  it("1MB를 넘는 파일은 읽지 않고 거부한다", async () => {
    const r = await importApplicants(store, { name: "큰파일.xlsx", size: MAX_FILE_BYTES + 1, buffer: Buffer.alloc(0) });
    expect(r).toMatchObject({ ok: false });
  });

  it("데이터가 없는 엑셀(제목 줄만)은 등록할 신청자가 없다고 알린다", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    book.addWorksheet("신청자").addRow(["사번", "이름", "부서"]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const r = await importApplicants(store, { name: "빈파일.xlsx", size: buffer.length, buffer });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("등록할 신청자가 없습니다");
  });

  it("연락처·이메일 같은 다른 열이 있어도 저장되지 않는다 (최소 수집)", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("신청자");
    sheet.addRow(["연락처", "사번", "이메일", "이름", "직급", "부서"]); // 열 순서가 달라도 이름으로 찾는다
    sheet.addRow(["010-0000-0000", "100001", "test@example.com", "김테스트01", "과장", "인재개발부"]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const r = await importApplicants(store, { name: "열섞임.xlsx", size: buffer.length, buffer });
    expect(r.ok && r.summary.registered).toBe(1);
    const saved = JSON.stringify((await store.readAll()).trainees);
    for (const secret of ["010-0000-0000", "test@example.com", "과장"]) expect(saved).not.toContain(secret);
  });
});
