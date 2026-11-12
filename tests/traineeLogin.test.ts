// 작업 16 확인용 검사: 교육생 로그인(사번 + 실습용 비밀번호), 잠금, 로그인 쿠키를 저장소까지 포함해 본다.
// 실제 .env 값은 쓰지 않고, 이 검사 안에서만 가짜 값을 환경에 넣는다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Status, Trainee } from "@/domain/types";
import {
  TRAINEE_LOGIN_MESSAGES,
  checkTraineePassword,
  createAdminToken,
  createTraineeToken,
  isAdminToken,
  isTraineeConfigured,
  loginTrainee,
  signToken,
  traineeEmpNoFromToken,
} from "@/lib/auth";
import type { Store } from "@/store";
import { FileStore } from "@/store/fileStore";

const PASSWORD = "test-trainee-pass"; // 검사용 가짜 비밀번호
const SECRET = "x".repeat(64); // 검사용 가짜 서명 키
const NOW = "2026-11-15T10:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60 * 1000).toISOString();

let dir: string;
let store: FileStore;
beforeEach(async () => {
  vi.stubEnv("TRAINEE_TEST_PASSWORD", PASSWORD);
  vi.stubEnv("SESSION_SECRET", SECRET);
  dir = await mkdtemp(path.join(tmpdir(), "trainee-login-test-"));
  store = new FileStore(path.join(dir, "db.json"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

const person = (empNo: string, extra: Partial<Trainee> = {}, status: Status = "선정"): Trainee => ({
  id: `p${empNo}`,
  empNo,
  name: `김테스트${empNo}`,
  dept: "인재개발부",
  status,
  isManual: false,
  loginFails: 0,
  createdAt: "2026-11-12T09:00:00+09:00",
  updatedAt: "2026-11-12T09:00:00+09:00",
  ...extra,
});
const seed = (...list: Trainee[]) => store.commit({ upsertTrainees: list });
const trainee = async (empNo: string) => (await store.getTraineeByEmpNo(empNo)) as Trainee;
const login = (empNo: string, password: string, now = NOW) => loginTrainee(store, { empNo, password }, now);

describe("작업 16: 교육생 로그인", () => {
  it("명단에 있는 사번 + 맞는 비밀번호면 로그인된다 (본인 이름을 돌려준다)", async () => {
    await seed(person("100001"));
    expect(await login("100001", PASSWORD)).toEqual({ ok: true, empNo: "100001", name: "김테스트100001" });
  });

  it("앞자리 0 사번도 글자 그대로 로그인된다", async () => {
    await seed(person("001234"), person("1234".padStart(6, "9")));
    expect(await login("001234", PASSWORD)).toMatchObject({ ok: true, empNo: "001234" });
    expect(await login(" 001234 ", PASSWORD)).toMatchObject({ ok: true }); // 앞뒤 공백은 무시
  });

  it("명단에 있으면 상태(신청·선정·대기·미선정·불참·제외)와 상관없이 로그인할 수 있다", async () => {
    const statuses: Status[] = ["신청", "선정", "대기", "미선정", "불참", "제외"];
    await seed(...statuses.map((s, i) => person(String(100010 + i), {}, s)));
    for (let i = 0; i < statuses.length; i++) expect(await login(String(100010 + i), PASSWORD)).toMatchObject({ ok: true });
  });

  it("비밀번호가 틀리면 거부한다 (비슷한 값, 빈 값, 대소문자 다름 모두)", async () => {
    // 같은 사번으로 5번 틀리면 잠기므로(다음 검사), 틀린 값마다 다른 사번으로 확인한다
    const wrong = ["틀림", "", PASSWORD + " ", PASSWORD.toUpperCase(), PASSWORD.slice(1)];
    await seed(...wrong.map((_, i) => person(String(100020 + i))));
    for (const [i, bad] of wrong.entries()) {
      expect(await login(String(100020 + i), bad)).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("없는 사번과 비밀번호 틀림은 같은 문구라서 어느 쪽이 틀렸는지 알 수 없다", async () => {
    await seed(person("100001"));
    const unknown = await login("999999", PASSWORD); // 비밀번호는 맞지만 없는 사번
    const wrongPw = await login("100001", "틀림");
    expect(unknown).toMatchObject({ ok: false, reason: "invalid", message: TRAINEE_LOGIN_MESSAGES.failed });
    expect(wrongPw).toMatchObject({ ok: false, reason: "invalid", message: TRAINEE_LOGIN_MESSAGES.failed });
    expect(unknown).toEqual(wrongPw);
  });

  it("거부 문구에는 이름·부서 같은 힌트가 없다", async () => {
    await seed(person("100001"));
    const r = await login("100001", "틀림");
    expect(JSON.stringify(r)).not.toMatch(/김테스트|인재개발부|100001/);
  });

  it("사번이 6자리 숫자가 아니면 조회 없이 안내하고, 실패 횟수에는 세지 않는다", async () => {
    await seed(person("100001"));
    for (let i = 0; i < 12; i++) {
      for (const bad of ["12345", "1234567", "12A456", ""]) {
        expect(await login(bad, "아무거나")).toMatchObject({ ok: false, reason: "format", message: "사번은 숫자 6자리입니다." });
      }
    }
    expect((await trainee("100001")).loginFails).toBe(0);
    expect(await login("100001", PASSWORD)).toMatchObject({ ok: true }); // 잠기지 않았다
  });

  it("로그인 시도는 명단의 변경이 아니라서 최종 수정 일시(updatedAt)를 바꾸지 않는다", async () => {
    await seed(person("100001"));
    await login("100001", "틀림");
    await login("100001", PASSWORD);
    expect((await trainee("100001")).updatedAt).toBe("2026-11-12T09:00:00+09:00");
  });

  it("비밀번호나 서명 키 설정이 없으면 로그인할 수 없다 (설정 안내만 하고 저장하지 않는다)", async () => {
    await seed(person("100001"));
    vi.stubEnv("TRAINEE_TEST_PASSWORD", "");
    expect(isTraineeConfigured()).toBe(false);
    expect(await login("100001", "")).toMatchObject({ ok: false, reason: "unconfigured" });
    vi.stubEnv("TRAINEE_TEST_PASSWORD", PASSWORD);
    vi.stubEnv("SESSION_SECRET", "짧음");
    expect(await login("100001", PASSWORD)).toMatchObject({ ok: false, reason: "unconfigured" });
    expect((await trainee("100001")).loginFails).toBe(0);
  });
});

describe("작업 16: 5회 연속 실패하면 15분 잠금", () => {
  it("틀릴 때마다 실패 횟수가 저장되고, 5번째에서 바로 잠금 안내가 나온다", async () => {
    await seed(person("100001"));
    for (let i = 1; i <= 4; i++) {
      expect(await login("100001", "틀림")).toMatchObject({ reason: "invalid" });
      expect((await trainee("100001")).loginFails).toBe(i);
    }
    const fifth = await login("100001", "틀림");
    // 잠금이 걸렸어도 화면에 보이는 문구는 다른 실패와 같다 (reason은 검사용이며 화면에 나오지 않는다)
    expect(fifth).toMatchObject({ ok: false, reason: "locked", message: TRAINEE_LOGIN_MESSAGES.failed });
    const saved = await trainee("100001");
    expect(saved.loginFails).toBe(5);
    expect(saved.lockedUntil).toBe(at(15));
  });

  it("잠금 중에는 맞는 비밀번호도 거부하고, 잠금 시각은 늘어나지 않는다", async () => {
    await seed(person("100001", { loginFails: 5, lockedUntil: at(15) }));
    expect(await login("100001", PASSWORD, at(5))).toMatchObject({ ok: false, reason: "locked" });
    expect(await login("100001", "틀림", at(10))).toMatchObject({ ok: false, reason: "locked" });
    expect((await trainee("100001")).lockedUntil).toBe(at(15));
  });

  it("15분이 지나면 다시 로그인할 수 있고, 성공하면 실패 기록이 지워진다", async () => {
    await seed(person("100001", { loginFails: 5, lockedUntil: at(15) }));
    expect(await login("100001", PASSWORD, at(15))).toMatchObject({ ok: true });
    const saved = await trainee("100001");
    expect(saved.loginFails).toBe(0);
    expect(saved.lockedUntil).toBeUndefined();
  });

  it("잠금이 풀린 뒤 또 틀리면 처음부터 다시 센다 (바로 다시 잠기지 않는다)", async () => {
    await seed(person("100001", { loginFails: 5, lockedUntil: at(15) }));
    expect(await login("100001", "틀림", at(20))).toMatchObject({ reason: "invalid" });
    const saved = await trainee("100001");
    expect(saved.loginFails).toBe(1);
    expect(saved.lockedUntil).toBeUndefined();
  });

  it("4번 틀리고 한 번 맞으면 횟수가 지워진다", async () => {
    await seed(person("100001"));
    for (let i = 0; i < 4; i++) await login("100001", "틀림");
    expect(await login("100001", PASSWORD)).toMatchObject({ ok: true });
    expect((await trainee("100001")).loginFails).toBe(0);
  });

  it("한 사람이 잠겨도 다른 사람은 로그인할 수 있다", async () => {
    await seed(person("100001"), person("100002"));
    for (let i = 0; i < 5; i++) await login("100001", "틀림");
    expect(await login("100001", PASSWORD)).toMatchObject({ reason: "locked" });
    expect(await login("100002", PASSWORD)).toMatchObject({ ok: true });
  });

  it("동시에 20번 틀린 비밀번호를 보내도 잠금을 피할 수 없다 (한 번에 하나씩 처리)", async () => {
    await seed(person("100001"));
    const results = await Promise.all(Array.from({ length: 20 }, () => login("100001", "틀림")));
    const saved = await trainee("100001");
    expect(saved.loginFails).toBe(5); // 20번이 모두 1로 덮어써지지 않고 정확히 세어졌다
    expect(saved.lockedUntil).toBeDefined();
    expect(results.filter((r) => !r.ok && r.reason === "locked").length).toBeGreaterThanOrEqual(16); // 5번째부터 잠금
    expect(await login("100001", PASSWORD)).toMatchObject({ reason: "locked" });
  });

  it("잠금과 실패 횟수는 저장 파일에도 남는다 (새 저장소로 열어도 잠겨 있다)", async () => {
    await seed(person("100001"));
    for (let i = 0; i < 5; i++) await login("100001", "틀림");
    const reopened = new FileStore(path.join(dir, "db.json"));
    expect(await loginTrainee(reopened, { empNo: "100001", password: PASSWORD }, at(1))).toMatchObject({ reason: "locked" });
  });
});

/** 저장소에 몇 번 썼는지 세는 감시용 저장소 (응답 시간 차이를 만들 수 있는 "쓰기 횟수"가 같은지 보려는 것) */
function countingStore(inner: FileStore) {
  let commits = 0;
  const wrapper: Store = {
    readAll: () => inner.readAll(),
    getCourse: () => inner.getCourse(),
    getTraineeByEmpNo: (e) => inner.getTraineeByEmpNo(e),
    getReply: (id) => inner.getReply(id),
    transaction: (work) => inner.transaction(work),
    commit: (changes) => {
      commits++;
      return inner.commit(changes);
    },
  };
  return {
    wrapper,
    /** 지금까지 센 쓰기 횟수를 돌려주고 0으로 되돌린다 */
    take: () => {
      const n = commits;
      commits = 0;
      return n;
    },
  };
}

describe("작업 16 보강: 사번이 명단에 있는지·잠겨 있는지가 새지 않는다", () => {
  it("없는 사번·비밀번호 틀림·5번째 실패·잠금 중(맞는 비밀번호 포함) 모두 화면 문구가 똑같다", async () => {
    await seed(person("100001"));
    const shown: string[] = [];
    const see = async (empNo: string, password: string, now = NOW) => {
      const r = await login(empNo, password, now);
      expect(r.ok).toBe(false);
      if (!r.ok) shown.push(r.message);
    };

    for (let i = 0; i < 8; i++) await see("999999", i % 2 ? PASSWORD : "틀림"); // 없는 사번을 여러 번
    for (let i = 0; i < 5; i++) await see("100001", "틀림"); // 있는 사번을 5번 틀려 잠금이 걸림 (4번 + 5번째)
    await see("100001", "틀림", at(1)); // 잠금 중, 틀린 비밀번호
    await see("100001", PASSWORD, at(2)); // 잠금 중, 맞는 비밀번호

    expect(shown).toHaveLength(15);
    expect(new Set(shown).size).toBe(1); // 15번 모두 한 가지 문구
    expect(shown[0]).toBe(TRAINEE_LOGIN_MESSAGES.failed);
  });

  it("그 문구에는 잠금 규칙(5번, 15분)이 항상 적혀 있어서, 실제로 잠긴 교육생도 무엇을 해야 하는지 알 수 있다", () => {
    expect(TRAINEE_LOGIN_MESSAGES.failed).toContain("확인되지 않았습니다");
    expect(TRAINEE_LOGIN_MESSAGES.failed).toContain("5번");
    expect(TRAINEE_LOGIN_MESSAGES.failed).toContain("15분");
    expect(TRAINEE_LOGIN_MESSAGES.failed).not.toContain("(를)");
  });

  it("실패의 종류와 상관없이 응답에서 달라지는 것은 내부용 reason뿐이다 (ok와 message는 같다)", async () => {
    await seed(person("100001"), person("100002", { loginFails: 5, lockedUntil: at(15) }));
    const results = [
      await login("999999", PASSWORD), // 없는 사번
      await login("100001", "틀림"), // 비밀번호 틀림
      await login("100002", PASSWORD, at(1)), // 잠금 중
    ];
    expect(new Set(results.map((r) => JSON.stringify({ ok: r.ok, message: r.ok ? "" : r.message }))).size).toBe(1);
  });

  it("실패하는 모든 경우가 저장소에 똑같이 한 번씩 쓴다 (응답 시간 차이로 사번 존재·잠금을 알아낼 수 없다)", async () => {
    await seed(person("100001"), person("100002", { loginFails: 5, lockedUntil: at(15) }));
    const { wrapper, take } = countingStore(store);
    const attempt = (empNo: string, password: string, now = NOW) => loginTrainee(wrapper, { empNo, password }, now);

    await attempt("999999", "틀림"); // 없는 사번
    expect(take()).toBe(1);
    await attempt("999999", PASSWORD); // 없는 사번 + 맞는 비밀번호
    expect(take()).toBe(1);
    await attempt("100001", "틀림"); // 있는 사번 + 틀린 비밀번호 (실패 횟수 기록)
    expect(take()).toBe(1);
    await attempt("100002", "틀림", at(1)); // 잠금 중 + 틀린 비밀번호
    expect(take()).toBe(1);
    await attempt("100002", PASSWORD, at(1)); // 잠금 중 + 맞는 비밀번호
    expect(take()).toBe(1);
  });

  it("빈 쓰기는 명단·실패 기록·최종 수정 일시를 바꾸지 않는다", async () => {
    await seed(person("100001"), person("100002", { loginFails: 5, lockedUntil: at(15) }));
    const before = JSON.stringify(await store.readAll());
    await login("999999", "틀림"); // 없는 사번
    await login("100002", PASSWORD, at(1)); // 잠금 중
    expect(JSON.stringify(await store.readAll())).toBe(before);
  });

  it("없는 사번을 아무리 시도해도 명단에는 아무것도 생기지 않는다 (실패 기록이 쌓여 저장소가 커지지 않는다)", async () => {
    await seed(person("100001"));
    for (let i = 0; i < 30; i++) await login(String(900000 + i), "틀림");
    const all = await store.readAll();
    expect(all.trainees).toHaveLength(1);
    expect(JSON.stringify(all)).not.toContain("9000");
  });
});

describe("작업 16: 교육생 로그인 쿠키", () => {
  const NOW_MS = Date.parse(NOW);

  it("본인 사번만 담긴 서명된 값을 만들고, 사번을 꺼낼 수 있다 (앞자리 0 유지)", () => {
    expect(traineeEmpNoFromToken(createTraineeToken("001234", NOW_MS), NOW_MS)).toBe("001234");
  });

  it("8시간 동안만 유효하다", () => {
    const token = createTraineeToken("100001", NOW_MS);
    expect(traineeEmpNoFromToken(token, NOW_MS + 8 * 3600 * 1000 - 1)).toBe("100001");
    expect(traineeEmpNoFromToken(token, NOW_MS + 8 * 3600 * 1000)).toBeNull();
  });

  it("위조하거나 고친 값은 거부한다", () => {
    const token = createTraineeToken("100001", NOW_MS);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "trainee:100002", e: NOW_MS + 100000 })).toString("base64url");
    expect(traineeEmpNoFromToken(`${forged}.${sig}`, NOW_MS)).toBeNull(); // 다른 사람 사번으로 바꿔치기
    for (const bad of [body, "", "abc", "a.b.c", undefined, null]) expect(traineeEmpNoFromToken(bad as string, NOW_MS)).toBeNull();
    expect(traineeEmpNoFromToken(signToken("trainee:100001", NOW_MS + 1000, "y".repeat(64)), NOW_MS)).toBeNull(); // 다른 서명 키
  });

  it("담당자용 값은 교육생 로그인으로, 교육생용 값은 담당자 로그인으로 인정되지 않는다", () => {
    expect(traineeEmpNoFromToken(createAdminToken(NOW_MS), NOW_MS)).toBeNull();
    expect(isAdminToken(createTraineeToken("100001", NOW_MS), NOW_MS)).toBe(false);
  });

  it("사번 모양이 이상한 값은 서명이 맞아도 거부한다", () => {
    for (const odd of ["trainee:", "trainee:12345", "trainee:abcdef", "trainee:1234567", "trainee:100001:x", "admin"]) {
      expect(traineeEmpNoFromToken(signToken(odd, NOW_MS + 1000), NOW_MS)).toBeNull();
    }
  });

  it("실습용 비밀번호 비교는 .env 값과 같을 때만 통과한다", () => {
    expect(checkTraineePassword(PASSWORD)).toBe(true);
    for (const bad of ["", "틀림", PASSWORD + "x"]) expect(checkTraineePassword(bad)).toBe(false);
    vi.stubEnv("TRAINEE_TEST_PASSWORD", "");
    expect(checkTraineePassword("")).toBe(false);
    expect(checkTraineePassword("아무거나")).toBe(false);
  });
});
