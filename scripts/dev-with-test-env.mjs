// 확인용 개발 서버: 가짜 비밀번호로 앱을 실행한다 (포트 3100).
// 실행: npm run dev:test
// - 담당자 비밀번호: test-admin-pass / 교육생 실습용 비밀번호: test-trainee-pass  (둘 다 가짜 값)
// - 서명 키는 실행할 때마다 새로 무작위로 만든다 (그래서 서버를 껐다 켜면 로그인이 풀린다)
// 이미 설정된 환경 값은 `.env`보다 우선하므로, 실제 `.env`의 비밀번호는 읽지도 바꾸지도 않는다.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
// 확인용 서버는 프로젝트의 data/ 대신 임시 폴더에 저장한다 (실제 data/를 건드리지 않는다)
const testDataFile = join(tmpdir(), "education-app-test", "db.json");

const child = spawn(process.execPath, [nextBin, "dev", "-p", "3100"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ADMIN_PASSWORD: "test-admin-pass",
    TRAINEE_TEST_PASSWORD: "test-trainee-pass",
    DATA_FILE: testDataFile,
    SESSION_SECRET: randomBytes(32).toString("hex"),
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
