import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/fixture/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    maxWorkers: 1,
  },
});
