import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    exclude: ["test/bun/**"],
    testTimeout: 15_000,
  },
});
