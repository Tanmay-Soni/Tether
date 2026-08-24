import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["test/fixture/**/*.test.ts"], testTimeout: 30_000 },
});
