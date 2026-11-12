// 배포용 과정 저장소 구현: Supabase(Postgres)의 표 `course_state`에서 **과정 하나의 행**만 읽고 쓴다.
// 과정의 전체 데이터(DbData)를 그 행의 JSONB에 저장한다. 화면·규칙 코드는 `Store` 인터페이스만 보므로 파일 저장과 똑같이 쓴다.
// - 이 저장소는 만들 때 받은 과정 번호의 행만 건드린다 → 다른 과정의 데이터와 섞일 수 없다.
// - transaction: 진짜 DB 거래 + 그 행에 대한 `for update` 잠금 → 같은 과정에서는 "읽고 → 검사 → 저장"이 한 번에 하나씩만 실행된다.
//   잠금은 과정(행)마다 따로라서 서로 다른 과정은 서로를 기다리지 않는다.
// - commit: transaction 안이면 같은 거래에서 저장하고, 밖이면 스스로 거래를 열어 잠그고 저장한다(변경 묶음이 통째로 저장되거나 통째로 안 된다).
// - 접속 정보(DATABASE_URL)는 서버 환경 변수에만 있다. 표에는 접근 규칙(RLS)을 켜서 공개 키로는 읽을 수 없다.
import { AsyncLocalStorage } from "node:async_hooks";
import type postgres from "postgres";
import type { Course, DbData, Reply, Trainee } from "@/domain/types";
import { applyChanges, emptyData } from "./applyChanges";
import type { Store, StoreChanges } from "./index";

type Db = postgres.Sql | postgres.TransactionSql;

export class PgCourseStore implements Store {
  // 지금 실행 중인 코드가 이미 거래 안인가 (안에서 또 transaction을 불러도 같은 거래를 이어서 쓴다)
  private readonly current = new AsyncLocalStorage<postgres.TransactionSql>();

  constructor(
    private readonly sql: postgres.Sql,
    private readonly table: string,
    private readonly courseId: string,
  ) {}

  async readAll(): Promise<DbData> {
    return this.load(this.current.getStore() ?? this.sql, false);
  }

  async getCourse(): Promise<Course | null> {
    return (await this.readAll()).course;
  }

  async getTraineeByEmpNo(empNo: string): Promise<Trainee | null> {
    return (await this.readAll()).trainees.find((t) => t.empNo === empNo) ?? null;
  }

  async getReply(traineeId: string): Promise<Reply | null> {
    return (await this.readAll()).replies.find((r) => r.traineeId === traineeId) ?? null;
  }

  async commit(changes: StoreChanges): Promise<void> {
    const apply = async (tx: postgres.TransactionSql, alreadyLocked: boolean) => {
      // transaction() 안에서는 그 행을 이미 잠갔으므로 다시 잠그며 읽지 않는다 (DB 왕복 1번 절약)
      const next = applyChanges(await this.load(tx, !alreadyLocked), changes); // 규칙 위반이면 여기서 던져지고 아무것도 저장되지 않는다
      await this.save(tx, next);
    };
    const inside = this.current.getStore();
    if (inside) return apply(inside, true);
    await this.sql.begin((tx) => apply(tx, false));
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.current.getStore()) return work();
    return this.sql.begin(async (tx) => {
      await this.load(tx, true); // 행을 잠가 같은 과정의 다른 transaction이 끝날 때까지 기다리게 한다
      return this.current.run(tx, work);
    }) as Promise<T>;
  }

  /** 한 행을 읽는다. lock이 true면 `for update`로 잠근다. 행이 없으면 빈 데이터 */
  private async load(db: Db, lock: boolean): Promise<DbData> {
    const rows = lock
      ? await db`select data from ${db(this.table)} where course_id = ${this.courseId} for update`
      : await db`select data from ${db(this.table)} where course_id = ${this.courseId}`;
    const stored = rows[0]?.data as Partial<DbData> | undefined;
    return { ...emptyData(), ...(stored ?? {}) };
  }

  private async save(db: Db, data: DbData): Promise<void> {
    const rows = await db`
      update ${db(this.table)} set data = ${db.json(data as never)}, updated_at = now()
      where course_id = ${this.courseId}
      returning course_id
    `;
    if (rows.length === 0) throw new Error("저장할 과정을 찾을 수 없습니다.");
  }
}
