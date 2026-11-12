// 신청자 엑셀 업로드 처리 (PLAN 작업 10): 파일 읽기 → 등록 계획 → 저장소에 저장.
// 서버 액션은 이 함수를 부르기만 한다. 화면과 무관하게 자동 검사할 수 있도록 따로 두었다.
import { randomUUID } from "node:crypto";
import { planImport, type UploadSummary } from "@/domain/applicants";
import { parseApplicantWorkbook } from "@/domain/excel";
import type { Trainee } from "@/domain/types";
import { StoreError } from "@/store/applyChanges";
import type { Store } from "@/store";

/** 올릴 수 있는 파일 크기 (Next.js 서버 액션의 기본 요청 크기 제한 1MB와 맞춘다. 1,000행 엑셀은 약 30KB) */
export const MAX_FILE_BYTES = 1024 * 1024;

export type ImportResult =
  | { ok: true; summary: UploadSummary }
  | { ok: false; error: string; missingColumns?: string[] };

export interface UploadedFile {
  name: string;
  size: number;
  buffer: Buffer;
}

async function importApplicantsUnlocked(
  store: Store,
  file: UploadedFile,
  now: string = new Date().toISOString(),
): Promise<ImportResult> {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "파일이 너무 큽니다. 1MB 이하의 엑셀 파일을 올려 주세요." };
  }

  const parsed = await parseApplicantWorkbook(file.buffer, file.name);
  if (!parsed.ok) return parsed;
  if (parsed.rows.length === 0) {
    return { ok: false, error: "등록할 신청자가 없습니다. 첫 줄 아래에 신청자 정보를 입력해 주세요." };
  }

  // 이미 명단에 있는 사번은 건너뛴다 (다시 올린 경우)
  const existing = new Set((await store.readAll()).trainees.map((t) => t.empNo));
  const plan = planImport(parsed.rows, existing);

  // 새 신청자는 상태 "신청"으로 저장한다. 이 사번이 곧 교육생 로그인 계정이다 (별도 계정·링크 생성 없음)
  const newTrainees: Trainee[] = plan.accepted.map((row) => ({
    id: randomUUID(),
    empNo: row.empNo,
    name: row.name,
    dept: row.dept,
    status: "신청",
    isManual: false,
    createdAt: now,
    updatedAt: now,
  }));

  if (newTrainees.length > 0) {
    try {
      await store.commit({ upsertTrainees: newTrainees });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, error: error.message };
      throw error;
    }
  }

  return {
    ok: true,
    summary: {
      totalRows: parsed.rows.length,
      registered: newTrainees.length,
      rowErrors: plan.rowErrors,
      duplicates: plan.duplicates,
      skippedExisting: plan.skippedExisting,
      restored: plan.restored,
    },
  };
}

/** 신청자 엑셀 등록: 기존 사번 읽기 → 중복 검사 → 저장을 한 덩어리(transaction)로 실행한다. 같은 파일을 동시에 두 번 올려도 사번이 겹쳐 등록되지 않는다. */
export function importApplicants(
  store: Store,
  file: UploadedFile,
  now: string = new Date().toISOString(),
): Promise<ImportResult> {
  return store.transaction(() => importApplicantsUnlocked(store, file, now));
}
