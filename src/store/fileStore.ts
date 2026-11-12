// 개발용 파일 저장 구현 (PLAN 작업 4).
// 내 컴퓨터에서 개발·확인할 때만 쓴다. data/db.json 한 파일에 전체 데이터를 JSON으로 저장한다.
// ⚠ Vercel에서는 파일이 유지되지 않으므로, Part 5 배포 전에 데이터베이스 구현으로 교체한다 (이 파일만 바꾸면 된다).
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Course, DbData, Reply, Trainee } from "@/domain/types";
import { applyChanges, emptyData } from "./applyChanges";
import type { Store, StoreChanges } from "./index";

export class FileStore implements Store {
  // 저장 요청을 한 줄로 세운다: 동시에 여러 요청이 와도 "읽고 → 고치고 → 쓰기"가 겹치지 않게 한다
  private queue: Promise<unknown> = Promise.resolve();

  // transaction 전용 줄: "읽고 → 검사 → 저장"이 통째로 한 번에 하나씩만 실행되게 한다 (위의 queue는 개별 저장만 줄 세운다)
  private txQueue: Promise<unknown> = Promise.resolve();
  // 지금 실행 중인 코드가 이미 transaction 안인가 (안에서 또 부르면 줄을 서지 않고 이어서 실행해야 서로 기다리며 멈추지 않는다)
  private readonly inTransaction = new AsyncLocalStorage<true>();

  constructor(private readonly filePath: string) {}

  transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.inTransaction.getStore()) return work();
    const run = this.txQueue.catch(() => undefined).then(() => this.inTransaction.run(true, work));
    this.txQueue = run;
    return run;
  }

  async readAll(): Promise<DbData> {
    // 대기 중인 저장이 끝난 뒤에 읽어서, 방금 저장한 내용이 반드시 보이게 한다
    await this.queue.catch(() => undefined);
    return this.load();
  }

  async getCourse(): Promise<Course | null> {
    return (await this.readAll()).course;
  }

  async getTraineeByEmpNo(empNo: string): Promise<Trainee | null> {
    const data = await this.readAll();
    return data.trainees.find((t) => t.empNo === empNo) ?? null;
  }

  async getReply(traineeId: string): Promise<Reply | null> {
    const data = await this.readAll();
    return data.replies.find((r) => r.traineeId === traineeId) ?? null;
  }

  commit(changes: StoreChanges): Promise<void> {
    const run = this.queue.catch(() => undefined).then(async () => {
      const next = applyChanges(await this.load(), changes); // 규칙 위반이면 여기서 던져지고 아무것도 저장되지 않는다
      await this.save(next);
    });
    this.queue = run;
    return run;
  }

  /** 파일에서 읽는다. 파일이 아직 없으면 빈 데이터. (읽을 때마다 새 복사본이므로 호출한 쪽이 고쳐도 저장된 내용은 안 바뀐다) */
  private async load(): Promise<DbData> {
    try {
      return { ...emptyData(), ...(JSON.parse(await readFile(this.filePath, "utf8")) as Partial<DbData>) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
      throw error;
    }
  }

  /** 임시 파일에 먼저 쓰고 이름을 바꿔서 저장한다 → 저장 도중 멈춰도 기존 파일이 깨지지 않는다 */
  private async save(data: DbData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    try {
      await rename(tmp, this.filePath);
    } catch {
      // OneDrive 등이 파일을 잠깐 잡고 있어 이름 바꾸기가 실패하면 직접 덮어쓴다
      await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
      await rm(tmp, { force: true });
    }
  }
}
