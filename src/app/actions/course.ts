"use server";
// 과정 정보 저장 서버 처리 (PLAN 작업 9). 담당자만 할 수 있으므로 시작하자마자 로그인을 다시 확인한다.
import { revalidatePath } from "next/cache";
import {
  buildCourse,
  parseCourseForm,
  type CourseFormErrors,
  type CourseFormValues,
} from "@/domain/course";
import { requireAdmin } from "@/lib/auth";
import { formatKst } from "@/lib/datetime";
import { getStore } from "@/store";

export interface CourseFormState {
  values: CourseFormValues; // 화면에 다시 채워 넣을 값 (오류가 나도 입력한 내용이 사라지지 않게)
  errors?: CourseFormErrors; // 칸별 오류
  status?: "saved" | "unchanged" | "error";
  message?: string;
  updatedAtText: string | null; // 최종 수정 일시 (한국 시간), 아직 저장 전이면 null
}

const read = (formData: FormData, key: keyof CourseFormValues): string => String(formData.get(key) ?? "");

export async function saveCourse(_prev: CourseFormState, formData: FormData): Promise<CourseFormState> {
  await requireAdmin(); // proxy와 별개로, 이 서버 처리 안에서도 로그인을 확인한다 (Next.js 문서 권장)

  const raw: CourseFormValues = {
    name: read(formData, "name"),
    startDate: read(formData, "startDate"),
    endDate: read(formData, "endDate"),
    place: read(formData, "place"),
    notice: read(formData, "notice"),
    replyDeadline: read(formData, "replyDeadline"),
  };

  const store = getStore();
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

  await store.commit({ course });
  revalidatePath("/admin", "layout"); // 제목줄의 과정 이름 등 공통 틀도 새 내용으로 다시 그린다
  return {
    values: parsed.values,
    status: "saved",
    message: "저장했습니다.",
    updatedAtText: formatKst(course.updatedAt),
  };
}
