// 로그인 확인 코드 (PLAN 작업 7, DESIGN 4.6). 로그인 관련 코드는 이 파일에만 둔다.
// → 나중에 실제 직원 로그인 방식(사내 계정 연동 등)이 정해지면 이 파일만 바꾸면 되게 하려는 것이다.
//
// 방식: 비밀번호가 맞으면 "서명된 쿠키"를 브라우저에 준다. 서명 키(SESSION_SECRET)를 모르면 쿠키를 위조할 수 없다.
// 비밀번호와 서명 키는 `.env`에서만 읽고, 코드에 직접 쓰지 않으며, 화면·로그에 출력하지 않는다.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LOCK_MINUTES, MAX_LOGIN_FAILS, decideLogin, parseLoginEmpNo } from "@/domain/login";
import { EMP_NO_PATTERN, type Trainee } from "@/domain/types";
import type { Store } from "@/store";

export const ADMIN_COOKIE = "admin_session";
/** 담당자 로그인 유지 시간: 8시간 (DESIGN 4.6) */
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const ADMIN_PAYLOAD = "admin";

// ───────────────────────── 서명된 쿠키 값 (순수 계산) ─────────────────────────

const MIN_SECRET_LENGTH = 32;

/** 서명 키를 `.env`에서 읽는다. 없거나 너무 짧으면 null (위조하기 쉬운 키로는 서명하지 않는다) */
function readSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * 서명된 값을 만든다: `내용.서명` 모양이며, 내용에는 "무엇을 위한 값인지(payload)"와 "만료 시각"이 들어 있다.
 * payload 예: 담당자는 "admin", (이후 작업에서) 교육생은 "trainee:001234"
 */
export function signToken(payload: string, expiresAtMs: number, secret: string | null = readSecret()): string {
  if (!secret) throw new Error("SESSION_SECRET이 없거나 너무 짧습니다(32자 이상 필요). .env를 확인하세요.");
  const body = Buffer.from(JSON.stringify({ p: payload, e: expiresAtMs })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** 서명된 값을 확인한다. 위조·만료·형식 오류면 null. 키가 없는 설정 오류일 때도 null(= 로그인 안 된 것으로 취급) */
export function verifyToken(
  token: string | undefined | null,
  now: number = Date.now(),
  secret: string | null = readSecret(),
): { payload: string; expiresAt: number } | null {
  if (!token || !secret) return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null; // 서명이 다르면 위조

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p?: unknown; e?: unknown };
    if (typeof parsed.p !== "string" || typeof parsed.e !== "number") return null;
    if (now >= parsed.e) return null; // 만료
    return { payload: parsed.p, expiresAt: parsed.e };
  } catch {
    return null;
  }
}

// ───────────────────────── 담당자 로그인 ─────────────────────────

/** 로그인에 필요한 설정(.env)이 준비되어 있는가 */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) && readSecret() !== null;
}

/** 입력한 비밀번호가 기대값과 같은지 확인한다 (비교 시간으로 힌트가 새지 않도록 해시를 만들어 비교) */
function passwordMatches(input: string, expected: string | undefined): boolean {
  if (!expected || !input) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** 입력한 비밀번호가 `.env`의 담당자 비밀번호와 같은지 확인한다 */
export function checkAdminPassword(input: string): boolean {
  return passwordMatches(input, process.env.ADMIN_PASSWORD);
}

export function createAdminToken(now: number = Date.now()): string {
  return signToken(ADMIN_PAYLOAD, now + ADMIN_SESSION_SECONDS * 1000);
}

/** 이 쿠키 값이 유효한 담당자 로그인인가 (proxy에서도 쓴다) */
export function isAdminToken(token: string | undefined | null, now: number = Date.now()): boolean {
  return verifyToken(token, now)?.payload === ADMIN_PAYLOAD;
}

/**
 * 지금 요청이 로그인한 담당자의 것인가.
 * 이 프로젝트는 Next.js의 Cache Components를 쓰므로, 현재 시각(Date.now)은 반드시 `connection()`(= 요청이 실제로 들어온 뒤)
 * 다음에 읽어야 한다. 이 함수를 부르는 화면은 `<Suspense>` 안에 있어야 한다.
 */
export async function isAdminLoggedIn(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  await connection();
  return isAdminToken(token);
}

/**
 * 담당자 전용 서버 처리·화면의 맨 앞에서 부른다. 로그인하지 않았으면 로그인 화면으로 보낸다.
 * proxy는 화면 이동만 막으므로, 서버 액션 등은 반드시 이 함수로 한 번 더 확인해야 한다 (Next.js 문서 권장).
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminLoggedIn())) redirect("/");
}

// ───────────────────────── 교육생 로그인 (PLAN 작업 16, PRD M2-2·M2-10) ─────────────────────────
// 교육생은 모두 같은 주소(/trainee)에서 사번 + 비밀번호로 로그인한다. 지금은 실습용이라 명단에 있는 사번이 곧 가짜 계정이고,
// 비밀번호는 `.env`의 TRAINEE_TEST_PASSWORD 하나를 공통으로 쓴다. 실제 직원 로그인 방식은 회사 확인 후 정하며,
// 그때 바꿀 곳은 이 구역(로그인 확인 `loginTrainee`와 비밀번호 비교)뿐이다. 실제 직원의 비밀번호는 앱이 받거나 저장하지 않는다.

export const TRAINEE_COOKIE = "trainee_session";
/** 교육생 쿠키는 교육생 화면(/trainee)에서만 브라우저가 보낸다. 담당자 화면에는 붙지 않는다 */
export const TRAINEE_COOKIE_PATH = "/trainee";
/** 교육생 로그인 유지 시간: 8시간 (휴대폰에서 자주 다시 로그인하지 않게, DESIGN 4.3) */
export const TRAINEE_SESSION_SECONDS = 8 * 60 * 60;
const TRAINEE_PAYLOAD_PREFIX = "trainee:";

/**
 * 로그인에 실패했을 때 보여주는 문구는 **단 하나**다. 명단에 없는 사번, 비밀번호 틀림, 잠금 중을 구분하지 않는다.
 * 잠금 중일 때만 다른 문구("15분 뒤에 다시 시도")를 보여주면, 공격자가 그 문구가 나오는 사번을 "명단에 있는 사번"으로
 * 알아낼 수 있기 때문이다. 대신 잠금 규칙은 이 문구 안에 늘 함께 적어, 정말 잠긴 교육생도 무엇을 해야 하는지 알 수 있게 한다.
 */
const LOGIN_FAILED = `확인되지 않았습니다. ${MAX_LOGIN_FAILS}번 연속 틀리면 ${LOCK_MINUTES}분 동안 로그인할 수 없으니, 사번과 비밀번호를 다시 확인해 주세요.`;

/** 교육생 화면에 보여줄 문구 (사번 형식 안내와 설정 안내는 사번이 명단에 있는지와 무관한 안내라서 따로 둔다) */
export const TRAINEE_LOGIN_MESSAGES = {
  format: "사번은 숫자 6자리입니다.",
  failed: LOGIN_FAILED,
  unconfigured: "지금은 로그인할 수 없습니다. 담당자에게 문의해 주세요.",
} as const;

export function isTraineeConfigured(): boolean {
  return Boolean(process.env.TRAINEE_TEST_PASSWORD) && readSecret() !== null;
}

/** 입력한 비밀번호가 `.env`의 실습용 교육생 비밀번호와 같은지 확인한다 */
export function checkTraineePassword(input: string): boolean {
  return passwordMatches(input, process.env.TRAINEE_TEST_PASSWORD);
}

/** 로그인한 교육생의 쿠키 값: 본인 사번만 담는다 */
export function createTraineeToken(empNo: string, now: number = Date.now()): string {
  return signToken(`${TRAINEE_PAYLOAD_PREFIX}${empNo}`, now + TRAINEE_SESSION_SECONDS * 1000);
}

/** 쿠키 값에서 로그인한 교육생의 사번을 꺼낸다. 위조·만료·담당자용 값·사번이 이상한 값이면 null */
export function traineeEmpNoFromToken(token: string | undefined | null, now: number = Date.now()): string | null {
  const payload = verifyToken(token, now)?.payload;
  if (!payload?.startsWith(TRAINEE_PAYLOAD_PREFIX)) return null;
  const empNo = payload.slice(TRAINEE_PAYLOAD_PREFIX.length);
  return EMP_NO_PATTERN.test(empNo) ? empNo : null;
}

/**
 * 지금 요청이 로그인한 교육생의 것이라면 그 사번, 아니면 null.
 * 담당자용 함수와 같은 이유로 `connection()` 뒤에서 시각을 읽으며, 이 함수를 부르는 화면은 `<Suspense>` 안에 있어야 한다.
 */
export async function getTraineeEmpNo(): Promise<string | null> {
  const token = (await cookies()).get(TRAINEE_COOKIE)?.value;
  await connection();
  return traineeEmpNoFromToken(token);
}

export type TraineeLoginResult =
  | { ok: true; empNo: string; name: string }
  | { ok: false; reason: "format" | "invalid" | "locked" | "unconfigured"; message: string };

// 로그인 시도는 한 번에 하나씩 순서대로 처리한다. 동시에 여러 개를 보내 실패 횟수가 덜 세어지는 틈으로 잠금을 피하는 것을 막는다.
// (지금의 파일 저장 기준이다. 데이터베이스로 바꾸면 그 저장소의 원자적 갱신 방식에 맞게 다시 다듬어야 한다)
const globalForLogin = globalThis as unknown as { __traineeLoginQueue?: Promise<unknown> };
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalForLogin.__traineeLoginQueue ?? Promise.resolve();
  const run = previous.then(task, task);
  globalForLogin.__traineeLoginQueue = run.catch(() => undefined);
  return run;
}

/** 로그인 시도 결과를 교육생에게 저장한다. 로그인 시도는 명단의 변경이 아니므로 updatedAt은 바꾸지 않는다 */
async function saveLoginRecord(store: Store, trainee: Trainee, update: { loginFails: number; lockedUntil?: string }) {
  const next: Trainee = { ...trainee, loginFails: update.loginFails };
  if (update.lockedUntil) next.lockedUntil = update.lockedUntil;
  else delete next.lockedUntil;
  await store.commit({ upsertTrainees: [next] });
}

/**
 * 교육생 로그인 확인.
 *  - 사번이 숫자 6자리가 아니면 조회 없이 바로 거부하고 실패 횟수에 세지 않는다.
 *  - 실패(명단에 없는 사번·비밀번호 틀림·잠금 중)는 모두 **같은 문구**로 거부한다. 잠금 중인지도 알려주지 않는다.
 *  - 실패하는 모든 경우가 비밀번호 비교와 저장소 쓰기를 똑같이 한 번씩 한다. 그래서 응답이 걸리는 시간으로도
 *    "이 사번이 명단에 있는지, 잠겨 있는지"를 알아낼 수 없다. (명단에 없거나 잠긴 경우는 내용이 바뀌지 않는 빈 쓰기를 한다)
 *  - 5회 연속 틀리면 15분 잠금 (규칙은 domain/login.ts). 명단에 있으면 상태(신청·선정·제외 등)와 상관없이 로그인할 수 있다.
 */
export async function loginTrainee(
  store: Store,
  input: { empNo: string; password: string },
  now: string = new Date().toISOString(),
): Promise<TraineeLoginResult> {
  if (!isTraineeConfigured()) return { ok: false, reason: "unconfigured", message: TRAINEE_LOGIN_MESSAGES.unconfigured };
  const parsed = parseLoginEmpNo(input.empNo);
  if (!parsed.ok) return { ok: false, reason: "format", message: TRAINEE_LOGIN_MESSAGES.format };

  return serialize(async (): Promise<TraineeLoginResult> => {
    const trainee = await store.getTraineeByEmpNo(parsed.empNo);
    const passwordOk = checkTraineePassword(input.password); // 없는 사번이어도 비교는 한다
    const decision = decideLogin(trainee, passwordOk, now);

    // 실패: 어떤 이유든 같은 문구 + 저장소 쓰기 한 번. reason은 검사·기록용이며 화면에는 보이지 않는다
    if (decision.kind === "locked") {
      await store.commit({}); // 잠긴 사번은 바꿀 기록이 없지만, 다른 실패와 같은 일을 해서 응답 시간 차이를 없앤다
      return { ok: false, reason: "locked", message: TRAINEE_LOGIN_MESSAGES.failed };
    }

    if (decision.kind === "invalid" || !trainee) {
      if (trainee && decision.kind === "invalid" && decision.update) {
        await saveLoginRecord(store, trainee, decision.update);
        // 이번 시도로 잠금이 걸렸어도 문구는 다른 실패와 같다 (잠금 여부를 알려주지 않는다)
        return {
          ok: false,
          reason: decision.update.lockedUntil ? "locked" : "invalid",
          message: TRAINEE_LOGIN_MESSAGES.failed,
        };
      }
      await store.commit({}); // 명단에 없는 사번: 기록할 곳이 없지만 같은 일을 한다
      return { ok: false, reason: "invalid", message: TRAINEE_LOGIN_MESSAGES.failed };
    }

    // 성공: 이전 실패 기록이 남아 있으면 지운다 (깨끗하면 저장하지 않는다)
    if (trainee.loginFails !== 0 || trainee.lockedUntil) await saveLoginRecord(store, trainee, { loginFails: 0 });
    return { ok: true, empNo: trainee.empNo, name: trainee.name };
  });
}
