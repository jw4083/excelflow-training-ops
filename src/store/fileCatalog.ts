// 개발용 파일 카탈로그: 과정마다 data/courses/<번호>.json 한 파일, 사번별 로그인 실패 기록은 login-attempts.json 한 파일.
// 과정 저장소는 기존 FileStore를 그대로 쓴다 (과정 하나 = 파일 하나라서 다른 과정의 파일은 열 수 없다).
// 내 컴퓨터 개발·확인용이다. 배포용은 pgCatalog.ts.
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Course, DbData } from "@/domain/types";
import { emptyData } from "./applyChanges";
import { isCourseId, newCourseId } from "./courseId";
import { FileStore } from "./fileStore";
import type { Catalog, CourseEntry, Enrollment, LoginAttemptStore, LoginRecord, Store } from "./index";

export class FileCatalog implements Catalog {
  private readonly stores = new Map<string, FileStore>(); // 과정마다 저장소 하나만 (저장 순서 줄이 과정 단위로 유지된다)
  private ready: Promise<void> | null = null;
  readonly loginAttempts: LoginAttemptStore;

  /**
   * @param root 저장 폴더 (이 안에 courses/ 와 login-attempts.json 을 만든다)
   * @param legacyFile 예전(과정 1개) 저장 파일. courses/ 가 비어 있고 이 파일이 있으면 첫 번째 과정으로 옮긴다
   */
  constructor(
    private readonly root: string,
    private readonly legacyFile?: string,
  ) {
    this.loginAttempts = new FileLoginAttempts(path.join(root, "login-attempts.json"));
  }

  private get coursesDir() {
    return path.join(this.root, "courses");
  }

  private fileOf(courseId: string) {
    return path.join(this.coursesDir, `${courseId}.json`);
  }

  private storeOf(courseId: string): FileStore {
    let store = this.stores.get(courseId);
    if (!store) {
      store = new FileStore(this.fileOf(courseId));
      this.stores.set(courseId, store);
    }
    return store;
  }

  /** 처음 한 번: 예전 db.json을 첫 번째 과정 파일로 옮긴다 (원본은 .v1.bak로 이름만 바꿔 남긴다) */
  private init(): Promise<void> {
    this.ready ??= this.migrateLegacy();
    return this.ready;
  }

  private async migrateLegacy(): Promise<void> {
    if (!this.legacyFile || (await this.courseIds()).length > 0) return;
    let raw: string;
    try {
      raw = await readFile(this.legacyFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const legacy = { ...emptyData(), ...(JSON.parse(raw) as Partial<DbData>) };
    const id = newCourseId();
    const createdAt = legacy.course?.updatedAt ?? new Date().toISOString();
    // 예전 데이터는 "그대로" 옮긴다 (로그인 실패 기록만 사번 기준 파일로 따로 옮긴다)
    await this.writeCourse(id, { ...legacy, createdAt });
    for (const t of legacy.trainees) {
      if ((t.loginFails ?? 0) > 0 || t.lockedUntil) {
        await this.loginAttempts.update(t.empNo, () => ({
          next: { fails: t.loginFails ?? 0, ...(t.lockedUntil ? { lockedUntil: t.lockedUntil } : {}) },
          result: undefined,
        }));
      }
    }
    await rename(this.legacyFile, `${this.legacyFile}.v1.bak`);
  }

  private async writeCourse(courseId: string, data: DbData): Promise<void> {
    await mkdir(this.coursesDir, { recursive: true });
    await writeFile(this.fileOf(courseId), JSON.stringify(data, null, 2), "utf8");
  }

  private async courseIds(): Promise<string[]> {
    try {
      return (await readdir(this.coursesDir))
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .filter(isCourseId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async listCourses(): Promise<CourseEntry[]> {
    await this.init();
    const entries = await Promise.all(
      (await this.courseIds()).map(async (id) => ({ id, data: await this.storeOf(id).readAll() })),
    );
    return entries.sort(
      (a, b) => (a.data.createdAt ?? "").localeCompare(b.data.createdAt ?? "") || a.id.localeCompare(b.id),
    );
  }

  async openCourse(courseId: string): Promise<Store | null> {
    if (!isCourseId(courseId)) return null;
    await this.init();
    return (await this.courseIds()).includes(courseId) ? this.storeOf(courseId) : null;
  }

  async createCourse(course: Course, now: string): Promise<string> {
    await this.init();
    const id = newCourseId();
    await this.writeCourse(id, { ...emptyData(), course, createdAt: now });
    return id;
  }

  async findEnrollments(empNo: string): Promise<Enrollment[]> {
    const result: Enrollment[] = [];
    for (const { id, data } of await this.listCourses()) {
      if (data.archivedAt) continue; // 보관된 과정은 교육생에게 보이지 않는다
      const trainee = data.trainees.find((t) => t.empNo === empNo);
      if (trainee) result.push({ courseId: id, course: data.course, trainee });
    }
    return result;
  }
}

/** 사번별 로그인 실패 기록 파일. 한 줄로 세워 "읽고 → 계산 → 쓰기"가 겹치지 않게 한다 */
class FileLoginAttempts implements LoginAttemptStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  update<T>(
    empNo: string,
    work: (current: LoginRecord | null) => { next: LoginRecord | null; result: T },
  ): Promise<T> {
    const run = this.queue.catch(() => undefined).then(async () => {
      const all = await this.load();
      const { next, result } = work(all[empNo] ?? null);
      if (next === null && !(empNo in all)) return result; // 바꿀 것이 없으면 파일을 쓰지 않는다
      if (next === null) delete all[empNo];
      else all[empNo] = next;
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(all, null, 2), "utf8");
      return result;
    });
    this.queue = run;
    return run;
  }

  private async load(): Promise<Record<string, LoginRecord>> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, LoginRecord>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
}
