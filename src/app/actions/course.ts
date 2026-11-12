"use server";
// 과정 정보 저장 서버 처리 (PLAN 작업 9). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import {
  buildCourse,
  parseCourseForm,
  type CourseFormErrors,
  type CourseFormValues,
} from "@/domain/course";
import { COURSE_NOT_FOUND, courseBase, openAdminCourseById, openAdminCourseFromForm } from "@/lib/adminCourse";
import { requireAdmin } from "@/lib/auth";
import { createCourseFromForm, setCourseArchived } from "@/lib/courses";
import { formatKst } from "@/lib/datetime";
import { getCatalog, StoreError } from "@/store";
import { redirect } from "next/navigation";

export interface CourseFormState {
  values: CourseFormValues; // 화면에 다시 채워 넣을 값 (오류가 나도 입력한 내용이 사라지지 않게)
  errors?: CourseFormErrors; // 칸별 오류
  status?: "saved" | "unchanged" | "error";
  message?: string;
  updatedAtText: string | null; // 최종 수정 일시 (한국 시간), 아직 저장 전이면 null
}

const read = (formData: FormData, key: keyof CourseFormValues): string => String(formData.get(key) ?? "");

function readForm(formData: FormData): CourseFormValues {
  return {
    name: read(formData, "name"),
    startDate: read(formData, "startDate"),
    endDate: read(formData, "endDate"),
    place: read(formData, "place"),
    notice: read(formData, "notice"),
    replyDeadline: read(formData, "replyDeadline"),
    startTime: read(formData, "startTime"),
    cancelDeadline: read(formData, "cancelDeadline"),
  };
}

/** 새 과정 만들기: 성공하면 만들어진 과정의 명단 화면으로 이동한다 */
export async function createCourseAction(_prev: CourseFormState, formData: FormData): Promise<CourseFormState> {
  await requireAdmin();
  const raw = readForm(formData);
  const result = await createCourseFromForm(getCatalog(), raw);
  if (!result.ok) {
    return { values: raw, errors: result.errors, status: "error", message: "입력한 내용을 확인해 주세요.", updatedAtText: null };
  }
  revalidatePath("/admin", "layout");
  redirect(`${courseBase(result.courseId)}/roster`);
}

export async function saveCourse(_prev: CourseFormState, formData: FormData): Promise<CourseFormState> {
  const store = await openAdminCourseFromForm(formData); // 로그인 확인 + 이 과정의 저장소만 연다
  const raw = readForm(formData);
  if (!store) return { values: raw, status: "error", message: COURSE_NOT_FOUND, updatedAtText: null };

  // 과정 정보를 읽고 → 검사하고 → 저장하는 동안 추첨(정원 저장) 등 다른 변경이 끼어들지 않게 한 덩어리로 실행한다
  return store.transaction(async () => {
    const current = await store.getCourse();
    const updatedAtText = current ? formatKst(current.updatedAt) : null;

    const parsed = parseCourseForm(raw);
    if (!parsed.ok) {
      return { values: raw, errors: parsed.errors, status: "error", message: "입력한 내용을 확인해 주세요.", updatedAtText };
    }

    const { course, changed } = buildCourse(parsed.values, current, new Date().toISOString());
    if (!changed) {
      return { values: parsed.values, status: "unchanged", message: "바뀐 내용이 없어 저장하지 않았습니다.", updatedAtText };
    }

    try {
      await store.commit({ course });
    } catch (error) {
      if (error instanceof StoreError) return { values: parsed.values, status: "error", message: error.message, updatedAtText };
      throw error;
    }
    revalidatePath("/admin", "layout"); // 제목줄의 과정 이름 등 공통 틀도 새 내용으로 다시 그린다
    return {
      values: parsed.values,
      status: "saved",
      message: "저장했습니다.",
      updatedAtText: formatKst(course.updatedAt),
    };
  });
}

/** 보관/보관 해제: 담당자가 직접, 과정 번호와 함께 `.bind`로 받는다. 끝나면 과정 목록으로 돌아간다 */
export async function archiveCourseAction(courseId: string): Promise<void> {
  const store = await openAdminCourseById(courseId);
  if (!store) return;
  await setCourseArchived(store, true);
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function unarchiveCourseAction(courseId: string): Promise<void> {
  const store = await openAdminCourseById(courseId);
  if (!store) return;
  await setCourseArchived(store, false);
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
