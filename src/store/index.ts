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
  ReplyNotice,
  SelectionRecord,
  Trainee,
} from "@/domain/types";
import { FileCatalog } from "./fileCatalog";
import { PgCatalog } from "./pgCatalog";

/** 한 번에 저장할 변경 묶음. 묶음 안의 변경은 전부 저장되거나 전부 저장되지 않는다(중간까지만 저장되는 일이 없다). */
export interface StoreChanges {
  course?: Course; // 과정 정보 저장 (덮어쓰기. 이 저장소는 과정 하나만 다룬다)
  archivedAt?: string | null; // 보관(일시) / 보관 해제(null). 보관된 과정은 이것 말고 다른 변경을 받지 않는다
  upsertTrainees?: Trainee[]; // id가 같으면 수정, 없으면 추가
  upsertReplies?: Reply[]; // 교육생당 최신 1건 (traineeId가 같으면 덮어씀)
  appendSelections?: SelectionRecord[]; // 추가만 가능
  appendDraws?: DrawRecord[]; // 추가만 가능
  appendHistory?: History[]; // 추가만 가능
  appendNotices?: ReplyNotice[]; // 회신 알림 추가 (같은 id는 거부 = 같은 회신의 알림이 두 번 생기지 않는다)
  markNoticesRead?: { ids: string[]; at: string }; // 알림 읽음 처리. 보관된 과정에서도 할 수 있다(내용을 바꾸는 일이 아니다)
  /** 명단 초기화: 교육생·선별·추첨·회신·알림·이력을 모두 비우고 정원을 지운다(과정 정보는 그대로). 이어서 오는 appendHistory(초기화 기록)는 비운 뒤에 추가된다 */
  resetRoster?: true;
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

// ───────────────────────── 여러 과정 (카탈로그) ─────────────────────────

/** 로그인 실패 기록: 과정이 아니라 사번 하나에 하나만 둔다 (여러 과정에 등록돼도 5번 틀리면 15분 잠금) */
export interface LoginRecord {
  fails: number;
  lockedUntil?: string;
}

/** 사번별 로그인 실패 기록 저장. 읽기와 쓰기를 한 덩어리로 실행해 동시에 여러 번 시도해도 횟수가 덜 세어지지 않는다 */
export interface LoginAttemptStore {
  update<T>(
    empNo: string,
    work: (current: LoginRecord | null) => { next: LoginRecord | null; result: T },
  ): Promise<T>;
}

/** 담당자 과정 목록용: 과정 번호와 그 과정의 전체 데이터 */
export interface CourseEntry {
  id: string;
  data: DbData;
}

/** 교육생이 등록된 과정 한 건 (보관되지 않은 과정만) */
export interface Enrollment {
  courseId: string;
  course: Course | null;
  trainee: Trainee;
}

/**
 * 과정 목록과 과정별 저장소의 입구. **과정 하나의 데이터는 `openCourse`가 돌려주는 `Store`로만 읽고 쓴다.**
 * 그 `Store`는 자기 과정의 행(파일)만 볼 수 있어서, 다른 과정의 데이터와 섞일 방법이 없다.
 */
export interface Catalog {
  /** 담당자 전용: 모든 과정(보관 포함)을 만든 순서대로 */
  listCourses(): Promise<CourseEntry[]>;
  /** 과정 저장소를 연다. 번호 형식이 틀리거나 없는 과정이면 null */
  openCourse(courseId: string): Promise<Store | null>;
  /** 새 과정을 만든다 (과정 정보 포함). 새 과정 번호를 돌려준다 */
  createCourse(course: Course, now: string): Promise<string>;
  /** 교육생 로그인·목록 전용: 이 사번이 등록된 "보관되지 않은" 과정들. 본인 레코드만 돌려준다 */
  findEnrollments(empNo: string): Promise<Enrollment[]>;
  readonly loginAttempts: LoginAttemptStore;
}

/**
 * 개발용 파일 저장 위치: 프로젝트의 data/ 폴더 (.gitignore에 등록되어 커밋되지 않는다). 과정마다 data/courses/<번호>.json 한 파일.
 * 확인용 서버(`npm run dev:test`)처럼 실제 data/를 건드리고 싶지 않을 때는 환경 값 DATA_FILE로 다른 파일을 지정하고,
 * 그 파일이 있는 폴더를 저장 폴더로 쓴다. 예전(과정 1개) db.json이 있으면 첫 번째 과정으로 옮긴다.
 */
const DEFAULT_DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json");

// 개발 서버가 코드를 다시 불러와도 같은 저장소 하나만 쓰도록 globalThis에 보관한다
// (저장소가 둘이 되면 서로의 저장 순서를 몰라 데이터가 덮어써질 수 있다)
const globalForStore = globalThis as unknown as { __educationCatalog?: Catalog };

/**
 * 앱 전체에서 쓰는 카탈로그를 돌려준다. 저장 방식을 바꾸는 곳은 여기 한 곳이다.
 * - DATABASE_URL이 있고 DATA_FILE이 없으면: Supabase(Postgres) (배포용, 서버가 여러 대여도 안전)
 * - 그 밖에는: 파일 저장 (내 컴퓨터 개발·확인용. 확인용 서버 `npm run dev:test`는 DATA_FILE을 정해서 항상 파일을 쓴다)
 */
export function getCatalog(): Catalog {
  const url = process.env.DATABASE_URL;
  globalForStore.__educationCatalog ??=
    url && !process.env.DATA_FILE
      ? new PgCatalog(url)
      : new FileCatalog(path.dirname(DEFAULT_DATA_FILE), DEFAULT_DATA_FILE);
  return globalForStore.__educationCatalog;
}

export { StoreError } from "./applyChanges";
