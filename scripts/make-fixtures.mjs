// 작업 2: 가짜 신청자 엑셀(테스트용)을 만드는 스크립트.
// 실행: npm run fixtures  → fixtures/ 폴더에 파일이 생긴다 (이미 있으면 덮어씀).
// 이름·부서·사번은 전부 가짜이며 실제 직원 정보는 하나도 쓰지 않는다 (PRD 7번).
import ExcelJS from "exceljs";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(OUT, { recursive: true });

const DEPTS = ["인재개발부", "기획조정부", "자산관리부", "정보화부", "경영지원부", "금융지원부"];
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];

// 가짜 이름: 성 + "테스트" + 번호 (누가 봐도 가짜인 이름)
const fakeName = (n) => `${SURNAMES[n % SURNAMES.length]}테스트${String(n).padStart(2, "0")}`;
const fakeDept = (n) => DEPTS[n % DEPTS.length];

/**
 * 엑셀 파일 하나를 만든다.
 * rows: [사번, 이름, 부서] 배열. 사번이 문자열이면 "텍스트 서식(@)"으로, 숫자면 "숫자 서식"으로 저장한다.
 * headers: 첫 줄 제목 (기본: 사번, 이름, 부서)
 */
async function makeXlsx(fileName, rows, headers = ["사번", "이름", "부서"]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("신청자");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  // 사번 열(1번째 열)의 서식: 문자열이면 텍스트("@"), 숫자면 일반 숫자
  sheet.getColumn(1).eachCell((cell, rowNumber) => {
    if (rowNumber > 1 && typeof cell.value === "string") cell.numFmt = "@";
  });
  await book.xlsx.writeFile(join(OUT, fileName));
}

// ── 1) 기본 명단: 30행 = 고유 28명 + 중복 사번 행 2개 (사번은 모두 6자리) ──
// 앞자리 0 사번 5개: 000123, 001234, 002345, 003456, 004567
const leadingZero = ["000123", "001234", "002345", "003456", "004567"];
const uniqueEmpNos = [
  ...leadingZero,
  ...Array.from({ length: 23 }, (_, i) => String(100001 + i)), // 100001 ~ 100023
];
const main = uniqueEmpNos.map((empNo, i) => [empNo, fakeName(i + 1), fakeDept(i)]);
// 중복 2행: 아래쪽에 같은 사번을 다른 이름으로 다시 넣는다 → "위쪽 행만 남김" 규칙을 확인할 수 있다
main.splice(13, 0, ["100005", "중복행(남으면 안 됨)A", "정보화부"]); // 14번째 줄: 100005 중복
main.push(["001234", "중복행(남으면 안 됨)B", "경영지원부"]); // 맨 끝: 앞자리 0 사번 중복
await makeXlsx("applicants-30.xlsx", main);

// ── 2) 필수 열 누락: "부서" 열이 없다 → 업로드 거부 + "부서" 표시 ──
await makeXlsx(
  "err-missing-column.xlsx",
  uniqueEmpNos.slice(0, 5).map((empNo, i) => [empNo, fakeName(i + 1)]),
  ["사번", "이름"],
);

// ── 3) 1,001행(거부) / 1,000행(통과): 제목 행을 뺀 데이터 행 기준 ──
const manyRows = (count) =>
  Array.from({ length: count }, (_, i) => [String(100000 + i), fakeName(i + 1), fakeDept(i)]);
await makeXlsx("err-1001-rows.xlsx", manyRows(1001));
await makeXlsx("ok-1000-rows.xlsx", manyRows(1000));

// ── 4) 6자리가 아닌 사번: 정상 2행 + 오류 4행(5자리, 7자리, 글자 섞임, 빈 사번) ──
await makeXlsx("err-bad-empno.xlsx", [
  ["100001", fakeName(1), fakeDept(0)], // 정상
  ["12345", fakeName(2), fakeDept(1)], // 5자리
  ["1234567", fakeName(3), fakeDept(2)], // 7자리
  ["12A456", fakeName(4), fakeDept(3)], // 글자 섞임
  ["", fakeName(5), fakeDept(4)], // 빈 사번
  ["100002", fakeName(6), fakeDept(5)], // 정상
]);

// ── 5) 숫자 서식 사번: 엑셀이 앞자리 0을 지운 경우 (6자리 미만 숫자는 앞에 0을 채워 복원해야 함) ──
await makeXlsx("warn-numeric-empno.xlsx", [
  [1234, fakeName(1), fakeDept(0)], // → 001234 로 복원
  [98765, fakeName(2), fakeDept(1)], // → 098765 로 복원
  [123456, fakeName(3), fakeDept(2)], // 이미 6자리 → 그대로
  [1234567, fakeName(4), fakeDept(3)], // 7자리 → 형식 오류
  [12.5, fakeName(5), fakeDept(4)], // 소수 → 형식 오류
]);

// ── 6) .xlsx가 아닌 파일(형식 오류): 업로드에서 거부되어야 한다 ──
writeFileSync(
  join(OUT, "err-not-xlsx.csv"),
  ["사번,이름,부서", "100001,김테스트01,인재개발부", "100002,이테스트02,기획조정부", ""].join("\n"),
  "utf8",
);
// .xls 확장자 검사용: 내용은 xlsx지만 이름만 .xls (확장자로 거부하는지 확인하는 용도)
copyFileSync(join(OUT, "applicants-30.xlsx"), join(OUT, "err-not-xlsx.xls"));

console.log("fixtures 폴더에 가짜 엑셀을 만들었습니다:", OUT);
