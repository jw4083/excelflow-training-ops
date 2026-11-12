// 신청자 엑셀 등록 계획 (PLAN 작업 10, PRD M1-1·M1-2·M1-9, DESIGN 4.1). 엑셀 파일과 저장소를 모르는 순수 코드.
// 엑셀에서 읽은 행 목록을 받아 "누구를 등록하고, 누구를 왜 등록하지 않는지"를 정한다.
//
// 처리 순서 (DESIGN 4.1):
//  1) 형식 검사: 사번이 숫자 6자리인가, 이름·부서가 있는가 → 아니면 그 행만 등록하지 않고 엑셀 줄 번호와 함께 알린다
//  2) 중복 검사: 형식 검사를 통과한 행만 대상. 같은 사번이 여러 번이면 위쪽(먼저 나온) 행 1건만 남긴다
//  3) 이미 명단에 있는 사번(재업로드)은 건너뛴다
import { EMP_NO_PATTERN } from "./types";

/** 한 번에 받을 수 있는 최대 데이터 행 수 (제목 행 제외) */
export const MAX_APPLICANT_ROWS = 1000;
/** 이름·부서의 최대 글자 수 */
export const MAX_TEXT_LENGTH = 100;
/** 엑셀에 꼭 있어야 하는 열 이름 */
export const REQUIRED_COLUMNS = ["사번", "이름", "부서"] as const;

/** 엑셀의 사번 칸에서 읽은 값: 글자로 저장돼 있었는지, 숫자로 저장돼 있었는지(앞자리 0이 사라졌을 수 있음) */
export type RawEmpNo = { kind: "text"; text: string } | { kind: "number"; value: number };

/** 엑셀에서 읽은 한 행 */
export interface RawRow {
  line: number; // 엑셀 줄 번호 (제목 행이 1줄이므로 첫 데이터 행은 2)
  empNo: RawEmpNo;
  name: string;
  dept: string;
}

export interface AcceptedRow {
  line: number;
  empNo: string;
  name: string;
  dept: string;
}

export interface RowError {
  line: number;
  value: string; // 엑셀에 적혀 있던 사번 (빈 칸이면 "")
  reason: string;
}

export interface DuplicateGroup {
  empNo: string;
  keptLine: number; // 남긴 줄
  removedLines: number[]; // 지운 줄
}

export interface RestoredEmpNo {
  line: number;
  from: string; // 엑셀에 숫자로 들어 있던 값 (예: 1234)
  to: string; // 앞에 0을 채워 복원한 값 (예: 001234)
}

export interface ImportPlan {
  accepted: AcceptedRow[]; // 새로 등록할 행
  rowErrors: RowError[]; // 형식 오류로 등록하지 않은 행
  duplicates: DuplicateGroup[]; // 파일 안에서 중복되어 위쪽 행만 남긴 사번
  skippedExisting: { line: number; empNo: string }[]; // 이미 명단에 있어서 건너뛴 행
  restored: RestoredEmpNo[]; // 앞자리 0을 복원한 사번 (경고)
}

/** 화면에 보여줄 업로드 결과 (서버 → 화면으로 전달되므로 단순한 값만 담는다) */
export interface UploadSummary {
  totalRows: number; // 엑셀의 데이터 행 수 (빈 행 제외)
  registered: number; // 새로 등록한 인원
  rowErrors: RowError[];
  duplicates: DuplicateGroup[];
  skippedExisting: { line: number; empNo: string }[];
  restored: RestoredEmpNo[];
}

/** 사번 칸의 값을 6자리 사번으로 바꾼다. 못 바꾸면 null과 이유. */
function normalizeEmpNo(raw: RawEmpNo): { empNo: string; restoredFrom?: string } | { error: string; value: string } {
  if (raw.kind === "text") {
    const text = raw.text.trim();
    return EMP_NO_PATTERN.test(text) ? { empNo: text } : { error: "사번이 숫자 6자리가 아닙니다.", value: text };
  }
  // 숫자로 저장된 사번: 엑셀이 앞자리 0을 지웠을 수 있다. 6자리 미만의 양의 정수면 앞에 0을 채워 복원한다.
  const n = raw.value;
  const shown = String(n);
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000) {
    return { error: "사번이 숫자 6자리가 아닙니다.", value: shown };
  }
  const padded = shown.padStart(6, "0");
  return shown.length < 6 ? { empNo: padded, restoredFrom: shown } : { empNo: padded };
}

export function planImport(rows: RawRow[], existingEmpNos: ReadonlySet<string>): ImportPlan {
  const plan: ImportPlan = { accepted: [], rowErrors: [], duplicates: [], skippedExisting: [], restored: [] };

  // 1) 형식 검사 (통과한 행만 다음 단계로)
  const valid: AcceptedRow[] = [];
  for (const row of rows) {
    const normalized = normalizeEmpNo(row.empNo);
    if ("error" in normalized) {
      plan.rowErrors.push({ line: row.line, value: normalized.value, reason: normalized.error });
      continue;
    }
    const name = row.name.trim();
    const dept = row.dept.trim();
    const missing = [!name && "이름", !dept && "부서"].filter(Boolean).join("·");
    if (missing) {
      plan.rowErrors.push({ line: row.line, value: normalized.empNo, reason: `${missing} 칸이 비어 있습니다.` });
      continue;
    }
    if (name.length > MAX_TEXT_LENGTH || dept.length > MAX_TEXT_LENGTH) {
      plan.rowErrors.push({ line: row.line, value: normalized.empNo, reason: `이름·부서는 ${MAX_TEXT_LENGTH}자 이하여야 합니다.` });
      continue;
    }
    if (normalized.restoredFrom) {
      plan.restored.push({ line: row.line, from: normalized.restoredFrom, to: normalized.empNo });
    }
    valid.push({ line: row.line, empNo: normalized.empNo, name, dept });
  }

  // 2) 중복 검사: 같은 사번은 위쪽 행만 남긴다
  const kept = new Map<string, AcceptedRow>();
  const groups = new Map<string, DuplicateGroup>();
  for (const row of valid) {
    const first = kept.get(row.empNo);
    if (!first) {
      kept.set(row.empNo, row);
      continue;
    }
    const group = groups.get(row.empNo) ?? { empNo: row.empNo, keptLine: first.line, removedLines: [] };
    group.removedLines.push(row.line);
    groups.set(row.empNo, group);
  }
  plan.duplicates = [...groups.values()];

  // 3) 이미 명단에 있는 사번은 건너뛴다 (다시 올린 경우)
  for (const row of kept.values()) {
    if (existingEmpNos.has(row.empNo)) plan.skippedExisting.push({ line: row.line, empNo: row.empNo });
    else plan.accepted.push(row);
  }
  return plan;
}
