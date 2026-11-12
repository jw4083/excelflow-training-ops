// 저장 창구 (PLAN 작업 4, DESIGN 6번).
// 앱의 모든 저장·조회는 반드시 이 파일의 `Store`를 거친다. 화면과 규칙 코드는 "어디에 어떻게 저장되는지"를 모른다.
// 그래서 Part 5 배포 전에 저장 방식(파일 → 데이터베이스)을 바꿀 때는 `getStore()`가 돌려주는 구현만 교체하면 된다.
//
// 이 창구에는 일부러 "삭제"와 "기록 수정" 메서드가 없다 (PRD M1-4, M1-7):
//  - 교육생은 지우지 않고 상태만 바꾼다 → 저장은 upsert(있으면 수정, 없으면 추가)만 가능
//  - 추첨 기록·선별 기록·변경 이력은 추가(append)만 가능 → 이미 있는 id를 다시 저장하면 거부
import path from "node:path";
import type {
  Course,
  DbData,
  DrawRecord,
  History,
  Reply,
  SelectionRecord,
  Trainee,
} from "@/domain/types";
import { FileStore } from "./fileStore";

/** 한 번에 저장할 변경 묶음. 묶음 안의 변경은 전부 저장되거나 전부 저장되지 않는다(중간까지만 저장되는 일이 없다). */
export interface StoreChanges {
  course?: Course; // 과정 정보 저장 (덮어쓰기, 과정은 1개뿐)
  upsertTrainees?: Trainee[]; // id가 같으면 수정, 없으면 추가
  upsertReplies?: Reply[]; // 교육생당 최신 1건 (traineeId가 같으면 덮어씀)
  appendSelections?: SelectionRecord[]; // 추가만 가능
  appendDraws?: DrawRecord[]; // 추가만 가능
  appendHistory?: History[]; // 추가만 가능
}

export interface Store {
  /** 전체 데이터 조회 — 담당자 화면 전용 (교육생 화면에서 쓰지 않는다) */
  readAll(): Promise<DbData>;
  /** 과정 정보 조회 (아직 입력 전이면 null) */
  getCourse(): Promise<Course | null>;
  /**
   * 교육생 화면 전용 조회: 사번으로 **본인 1명만** 돌려준다 (PRD M2-1).
   * 다른 교육생 정보는 이 함수로 얻을 수 없다. 없는 사번이면 null.
   */
  getTraineeByEmpNo(empNo: string): Promise<Trainee | null>;
  /** 교육생 한 명의 최신 회신 (없으면 null) */
  getReply(traineeId: string): Promise<Reply | null>;
  /** 변경 묶음을 저장한다. 규칙에 어긋나면 `StoreError`를 던지고 아무것도 저장하지 않는다. */
  commit(changes: StoreChanges): Promise<void>;
  /**
   * "읽고 → 규칙 검사 → 저장"을 한 덩어리로 실행한다. 같은 저장소의 다른 transaction은 이 덩어리가 끝난 뒤에 시작하므로,
   * 거의 동시에 온 두 요청이 같은 예전 내용을 읽고 서로를 덮어쓰는 일이 없다 (예: 재회신과 충원 확정이 겹침).
   * transaction 안에서 다시 transaction을 불러도 멈추지 않고 그대로 이어서 실행된다.
   * 값을 바꾸는 기능은 읽기부터 저장까지를 반드시 이 안에서 한다. (읽기만 하는 화면은 쓰지 않아도 된다)
   */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * 개발용 파일 저장 위치: 프로젝트의 data/db.json (data/ 폴더는 .gitignore에 등록되어 커밋되지 않는다).
 * 확인용 서버(`npm run dev:test`)처럼 실제 data/를 건드리고 싶지 않을 때는 환경 값 DATA_FILE로 다른 파일을 지정한다.
 */
const DEFAULT_DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json");

// 개발 서버가 코드를 다시 불러와도 같은 저장소 하나만 쓰도록 globalThis에 보관한다
// (저장소가 둘이 되면 서로의 저장 순서를 몰라 데이터가 덮어써질 수 있다)
const globalForStore = globalThis as unknown as { __educationStore?: Store };

/**
 * 앱 전체에서 쓰는 저장소를 돌려준다.
 * ⚠ Part 5 배포 전에 여기만 데이터베이스 구현으로 바꾸면 된다. (Vercel에서는 파일 저장이 유지되지 않는다)
 */
export function getStore(): Store {
  globalForStore.__educationStore ??= new FileStore(DEFAULT_DATA_FILE);
  return globalForStore.__educationStore;
}

export { StoreError } from "./applyChanges";
