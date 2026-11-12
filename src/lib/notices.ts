// 회신 알림 읽기·읽음 처리 (담당자 전용). 알림은 과정 데이터 안에 있으므로 읽을 때만 모든 과정을 훑고, 쓸 때는 그 과정의 저장소만 연다.
import type { ReplyNotice } from "@/domain/types";
import type { Catalog, Store } from "@/store";

/** 알림 목록 한 줄: 어느 과정의 누구의 회신인지까지 풀어서 담는다 */
export interface NoticeItem {
  courseId: string;
  courseName: string;
  archived: boolean;
  traineeName: string;
  traineeDept: string;
  notice: ReplyNotice;
}

export interface NoticeSummary {
  unread: number;
  unreadAttend: number;
  unreadAbsent: number;
  unreadChanged: number; // 기존 응답을 바꾼 알림
}

export function summarizeNotices(items: Pick<NoticeItem, "notice">[]): NoticeSummary {
  const unread = items.filter((i) => !i.notice.readAt);
  return {
    unread: unread.length,
    unreadAttend: unread.filter((i) => i.notice.attend).length,
    unreadAbsent: unread.filter((i) => !i.notice.attend).length,
    unreadChanged: unread.filter((i) => i.notice.change === "변경").length,
  };
}

/** 모든 과정의 알림을 최신순으로. 교육생 이름은 그 과정 안에서만 찾는다(없으면 "(알 수 없음)") */
export async function listNotices(catalog: Catalog): Promise<NoticeItem[]> {
  const items: NoticeItem[] = [];
  const courses = await catalog.listCourses();
  courses.forEach(({ id, data }, index) => {
    for (const notice of data.notices ?? []) {
      const trainee = data.trainees.find((t) => t.id === notice.traineeId);
      items.push({
        courseId: id,
        courseName: data.course?.name ?? `과정 ${index + 1}`,
        archived: Boolean(data.archivedAt),
        traineeName: trainee?.name ?? "(알 수 없음)",
        traineeDept: trainee?.dept ?? "",
        notice,
      });
    }
  });
  return items.sort((a, b) => Date.parse(b.notice.at) - Date.parse(a.notice.at));
}

/** 읽음 처리: 이 과정의 지정한 알림(ids)만. 이미 읽은 알림은 그대로 둔다 */
export function markNoticesRead(store: Store, ids: string[], now: string = new Date().toISOString()): Promise<void> {
  return store.transaction(async () => {
    const data = await store.readAll();
    const unread = (data.notices ?? []).filter((n) => ids.includes(n.id) && !n.readAt).map((n) => n.id);
    if (unread.length === 0) return;
    await store.commit({ markNoticesRead: { ids: unread, at: now } });
  });
}

/** 이 과정의 안 읽은 알림을 모두 읽음 처리 */
export function markAllNoticesRead(store: Store, now: string = new Date().toISOString()): Promise<void> {
  return store.transaction(async () => {
    const data = await store.readAll();
    const ids = (data.notices ?? []).filter((n) => !n.readAt).map((n) => n.id);
    if (ids.length === 0) return;
    await store.commit({ markNoticesRead: { ids, at: now } });
  });
}
