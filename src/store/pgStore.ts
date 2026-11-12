// 배포용 저장 구현: Supabase(Postgres) (CHECK.md 보안 High — 파일 저장은 Vercel에서 유지되지 않는다).
// 전체 데이터(DbData)를 표 `app_state`의 한 행(JSONB)에 저장한다. 화면·규칙 코드는 `Store` 인터페이스만 보므로 파일 저장과 똑같이 쓴다.
// - transaction: 진짜 DB 거래 + 그 행에 대한 `for update` 잠금 → 서버가 여러 대여도 "읽고 → 검사 → 저장"이 한 번에 하나씩만 실행된다.
// - commit: transaction 안이면 같은 거래에서 저장하고, 밖이면 스스로 거래를 열어 잠그고 저장한다(변경 묶음이 통째로 저장되거나 통째로 안 된다).
// - 접속 정보(DATABASE_URL)는 서버 환경 변수에만 있다. 표에는 접근 규칙(RLS)을 켜서 공개 키로는 읽을 수 없다.
import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import type { Course, DbData, Reply, Trainee } from "@/domain/types";
import { applyChanges, emptyData } from "./applyChanges";
import type { Store, StoreChanges } from "./index";

type Db = postgres.Sql | postgres.TransactionSql;

const TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

export class PgStore implements Store {
  private readonly sql: postgres.Sql;
  private readonly table: string;
  // 지금 실행 중인 코드가 이미 거래 안인가 (안에서 또 transaction을 불러도 같은 거래를 이어서 쓴다)
  private readonly current = new AsyncLocalStorage<postgres.TransactionSql>();

  constructor(databaseUrl: string, options: { table?: string } = {}) {
    this.table = options.table ?? "app_state";
    if (!TABLE_NAME.test(this.table)) throw new Error("표 이름이 올바르지 않습니다.");
    this.sql = postgres(databaseUrl, {
      max: 3, // 서버리스에서 연결을 많이 잡지 않는다
      prepare: false, // Supabase 연결 풀러(거래 모드)는 준비된 문장을 지원하지 않는다
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }

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
    const apply = async (tx: postgres.TransactionSql) => {
      const next = applyChanges(await this.load(tx, true), changes); // 규칙 위반이면 여기서 던져지고 아무것도 저장되지 않는다
      await this.save(tx, next);
    };
    const inside = this.current.getStore();
    if (inside) return apply(inside);
    await this.sql.begin(apply);
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.current.getStore()) return work();
    return this.sql.begin(async (tx) => {
      await this.load(tx, true); // 행을 잠가 다른 transaction이 끝날 때까지 기다리게 한다
      return this.current.run(tx, work);
    }) as Promise<T>;
  }

  /** 연결을 닫는다 (테스트 끝에서 쓴다) */
  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  /** 한 행을 읽는다. lock이 true면 `for update`로 잠근다. 행이 없으면 빈 데이터 */
  private async load(db: Db, lock: boolean): Promise<DbData> {
    const rows = lock
      ? await db`select data from ${db(this.table)} where id = 1 for update`
      : await db`select data from ${db(this.table)} where id = 1`;
    const stored = rows[0]?.data as Partial<DbData> | undefined;
    return { ...emptyData(), ...(stored ?? {}) };
  }

  private async save(db: Db, data: DbData): Promise<void> {
    await db`
      insert into ${db(this.table)} (id, data, updated_at)
      values (1, ${db.json(data as never)}, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
  }
}
