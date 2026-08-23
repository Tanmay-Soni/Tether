import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/fixture/**/*.test.ts", "test/live/**/*.test.ts"],
    coverage: { enabled: false },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
