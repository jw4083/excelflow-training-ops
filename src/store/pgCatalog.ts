// 배포용 카탈로그: Supabase(Postgres). 과정마다 `course_state` 표의 한 행, 사번별 로그인 실패 기록은 `login_attempts` 표.
// 표는 scripts/migrate-multi-course.mjs 가 만든다. 접속 정보(DATABASE_URL)는 서버 환경 변수에만 있다.
import postgres from "postgres";
import type { Course, DbData } from "@/domain/types";
import { emptyData } from "./applyChanges";
import { isCourseId, newCourseId } from "./courseId";
import type { Catalog, CourseEntry, Enrollment, LoginAttemptStore, LoginRecord, Store } from "./index";
import { PgCourseStore } from "./pgStore";

const TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

export class PgCatalog implements Catalog {
  private readonly sql: postgres.Sql;
  private readonly table: string;
  private readonly loginTable: string;
  private readonly stores = new Map<string, PgCourseStore>(); // 과정마다 저장소 하나만 (거래 안 판단이 한 객체 안에서 이뤄진다)
  readonly loginAttempts: LoginAttemptStore;

  constructor(databaseUrl: string, options: { table?: string; loginTable?: string } = {}) {
    this.table = options.table ?? "course_state";
    this.loginTable = options.loginTable ?? "login_attempts";
    if (!TABLE_NAME.test(this.table) || !TABLE_NAME.test(this.loginTable)) throw new Error("표 이름이 올바르지 않습니다.");
    this.sql = postgres(databaseUrl, {
      max: 3, // 서버리스에서 연결을 많이 잡지 않는다
      prepare: false, // Supabase 연결 풀러(거래 모드)는 준비된 문장을 지원하지 않는다
      idle_timeout: 20,
      connect_timeout: 15,
    });
    this.loginAttempts = {
      update: (empNo, work) => this.updateLoginRecord(empNo, work),
    };
  }

  private storeOf(courseId: string): PgCourseStore {
    let store = this.stores.get(courseId);
    if (!store) {
      store = new PgCourseStore(this.sql, this.table, courseId);
      this.stores.set(courseId, store);
    }
    return store;
  }

  async listCourses(): Promise<CourseEntry[]> {
    const rows = await this.sql`
      select course_id, data from ${this.sql(this.table)}
      order by coalesce(data->>'createdAt', ''), course_id
    `;
    return rows.map((row) => ({ id: row.course_id as string, data: { ...emptyData(), ...(row.data as Partial<DbData>) } }));
  }

  async openCourse(courseId: string): Promise<Store | null> {
    if (!isCourseId(courseId)) return null;
    const rows = await this.sql`select 1 as ok from ${this.sql(this.table)} where course_id = ${courseId}`;
    return rows.length > 0 ? this.storeOf(courseId) : null;
  }

  async createCourse(course: Course, now: string): Promise<string> {
    const id = newCourseId();
    const data: DbData = { ...emptyData(), course, createdAt: now };
    await this.sql`insert into ${this.sql(this.table)} (course_id, data) values (${id}, ${this.sql.json(data as never)})`;
    return id;
  }

  async findEnrollments(empNo: string): Promise<Enrollment[]> {
    // 이 사번이 들어 있는 과정만 DB에서 걸러 읽는다. 보관된 과정은 교육생에게 보이지 않는다
    const rows = await this.sql`
      select course_id, data from ${this.sql(this.table)}
      where data->'trainees' @> ${this.sql.json([{ empNo }])}
        and coalesce(data->>'archivedAt', '') = ''
      order by coalesce(data->>'createdAt', ''), course_id
    `;
    return rows.flatMap((row) => {
      const data = { ...emptyData(), ...(row.data as Partial<DbData>) };
      const trainee = data.trainees.find((t) => t.empNo === empNo);
      return trainee ? [{ courseId: row.course_id as string, course: data.course, trainee }] : [];
    });
  }

  /** 사번 하나의 로그인 기록을 "잠금 → 읽기 → 계산 → 쓰기"로 한 번에 처리한다 (서버가 여러 대여도 같은 사번은 한 번에 하나씩) */
  private async updateLoginRecord<T>(
    empNo: string,
    work: (current: LoginRecord | null) => { next: LoginRecord | null; result: T },
  ): Promise<T> {
    return (await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`login:${empNo}`}))`;
      const rows = await tx`select fails, locked_until from ${tx(this.loginTable)} where emp_no = ${empNo}`;
      const current: LoginRecord | null = rows[0]
        ? {
            fails: rows[0].fails as number,
            ...(rows[0].locked_until ? { lockedUntil: new Date(rows[0].locked_until as string).toISOString() } : {}),
          }
        : null;
      const { next, result } = work(current);
      if (next === null) {
        // 지울 기록이 없어도 같은 모양의 쓰기를 한 번 한다 (응답 시간으로 "있는 사번인지" 알아내지 못하게)
        await tx`delete from ${tx(this.loginTable)} where emp_no = ${empNo}`;
      } else {
        await tx`
          insert into ${tx(this.loginTable)} (emp_no, fails, locked_until, updated_at)
          values (${empNo}, ${next.fails}, ${next.lockedUntil ?? null}, now())
          on conflict (emp_no) do update set fails = excluded.fails, locked_until = excluded.locked_until, updated_at = now()
        `;
      }
      return result;
    })) as T;
  }

  /** 연결을 닫는다 (테스트 끝에서 쓴다) */
  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
