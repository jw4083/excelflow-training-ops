"use server";
// 최종 안내 서버 처리. 담당자 쪽(등록·수정·공개)은 로그인을 다시 확인하고, 교육생 쪽(확인·준비)은 **로그인 쿠키의 사번**으로만 누구인지 정한다.
// 교육생 쪽은 "선정 + 참석 회신" 검사를 lib/guides.ts에서 서버가 다시 한다 (화면이 숨기는 것만 믿지 않는다).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GuideFormErrors, GuideFormValues } from "@/domain/guides";
import { COURSE_NOT_FOUND, courseBase, openAdminCourseById, openAdminCourseFromForm } from "@/lib/adminCourse";
import { getTraineeEmpNo } from "@/lib/auth";
import { markGuide, saveGuide, setGuidePublished, type GuideMark } from "@/lib/guides";
import { TRAINEE_PATH } from "@/lib/paths";
import { findMyEnrollment } from "@/lib/traineeCourse";
import { getCatalog } from "@/store";

export interface GuideFormState {
  values: GuideFormValues; // 오류가 나도 입력한 내용이 사라지지 않게 다시 채워 넣는다
  errors?: GuideFormErrors;
  message?: string;
}

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

/** 안내 등록·수정. 성공하면 안내 목록으로 돌아간다 */
export async function saveGuideAction(_prev: GuideFormState, formData: FormData): Promise<GuideFormState> {
  const store = await openAdminCourseFromForm(formData); // 로그인 확인 + 이 과정의 저장소만 연다
  const values: GuideFormValues = {
    title: str(formData, "title"),
    body: str(formData, "body"),
    linkUrl: str(formData, "linkUrl"),
    linkLabel: str(formData, "linkLabel"),
    dueAt: str(formData, "dueAt"),
    needsPrep: formData.get("needsPrep") === "on",
    published: formData.get("published") === "on",
  };
  if (!store) return { values, message: COURSE_NOT_FOUND };
  const result = await saveGuide(store, str(formData, "guideId") || undefined, values);
  if (!result.ok) return { values, errors: result.errors, message: result.reason };
  revalidatePath("/admin", "layout");
  revalidatePath(TRAINEE_PATH, "layout");
  redirect(`${courseBase(str(formData, "courseId"))}/guides`);
}

/** 공개 / 비공개 전환 (courseId·guideId·값은 `.bind`로 받는다) */
export async function setGuidePublishedAction(courseId: string, guideId: string, published: boolean): Promise<void> {
  const store = await openAdminCourseById(courseId);
  if (!store) return;
  await setGuidePublished(store, guideId, published);
  revalidatePath("/admin", "layout");
  revalidatePath(TRAINEE_PATH, "layout");
}

export interface MarkState {
  ok?: boolean;
  message?: string;
}

/** 교육생이 안내별 "확인 완료" / "준비 완료"를 표시하거나 해제한다 */
export async function markGuideAction(_prev: MarkState, formData: FormData): Promise<MarkState> {
  const empNo = await getTraineeEmpNo();
  if (!empNo) return { message: "로그인이 풀렸습니다. 새로고침해서 다시 로그인해 주세요." };
  const catalog = getCatalog();
  const mine = await findMyEnrollment(catalog, empNo, str(formData, "courseId"));
  const store = mine ? await catalog.openCourse(mine.courseId) : null;
  if (!mine || !store) return { message: "이 과정을 찾을 수 없습니다. 내 과정 목록에서 다시 선택해 주세요." };
  const mark = str(formData, "mark");
  if (!["확인", "확인취소", "준비", "준비취소"].includes(mark)) return { message: "처리할 수 없는 요청입니다." };
  const result = await markGuide(store, mine.trainee.id, str(formData, "guideId"), mark as GuideMark);
  if (!result.ok) return { message: result.reason };
  revalidatePath(TRAINEE_PATH, "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
