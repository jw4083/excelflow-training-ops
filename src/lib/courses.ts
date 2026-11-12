// 과정 만들기·보관 (여러 과정 운영). 화면과 무관하게 자동 검사할 수 있도록 따로 두었다.
//  - 보관: 담당자가 직접 한다. 보관된 과정은 조회·내려받기만 가능하고(저장소가 다른 변경을 거부한다) 교육생에게는 보이지 않는다.
//  - 보관 해제: 담당자만 할 수 있다. 읽기 → 검사 → 저장을 한 덩어리(transaction)로 실행한다.
import { StoreError } from "@/store/applyChanges";
import type { Catalog, Store } from "@/store";
import { buildCourse, parseCourseForm, type CourseFormErrors, type CourseFormValues } from "@/domain/course";

export type ArchiveResult = { ok: true; changed: boolean } | { ok: false; reason: string };

export function setCourseArchived(store: Store, archived: boolean, now: string = new Date().toISOString()): Promise<ArchiveResult> {
  return store.transaction(async () => {
    const data = await store.readAll();
    if (archived === Boolean(data.archivedAt)) return { ok: true, changed: false } as const; // 이미 그 상태 (두 번 눌러도 안전)
    try {
      await store.commit({ archivedAt: archived ? now : null });
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, reason: error.message } as const;
      throw error;
    }
    return { ok: true, changed: true } as const;
  });
}

export type CreateCourseResult =
  | { ok: true; courseId: string }
  | { ok: false; errors: CourseFormErrors };

/** 새 과정 만들기: 과정 정보 양식(과정명·일정·장소·안내문·회신 기한 등)을 검사해서 비어 있는 새 과정을 만든다 */
export async function createCourseFromForm(
  catalog: Catalog,
  raw: CourseFormValues,
  now: string = new Date().toISOString(),
): Promise<CreateCourseResult> {
  const parsed = parseCourseForm(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const { course } = buildCourse(parsed.values, null, now);
  return { ok: true, courseId: await catalog.createCourse(course, now) };
}
