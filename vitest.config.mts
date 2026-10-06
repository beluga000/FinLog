import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 서버 전용 모듈을 테스트에서 import 할 수 있게
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB 통합 테스트는 TEST_DATABASE_URL 이 있을 때만 (npm run test:db)
    exclude: process.env.TEST_DATABASE_URL ? [] : ["src/**/*.db.test.ts"],
    fileParallelism: false,
    coverage: { include: ["src/lib/finance/**"], exclude: ["src/lib/finance/index.ts", "src/lib/finance/types.ts"] },
  },
});
