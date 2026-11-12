// 규칙 자동 검사(vitest) 설정.
// 화면이 아닌 규칙·엑셀 처리 코드만 검사하므로 브라우저 흉내(jsdom) 없이 node 환경으로 실행한다.
// resolve.tsconfigPaths: 코드의 `@/`(= src/) 경로를 테스트에서도 그대로 쓰게 해 준다.
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
