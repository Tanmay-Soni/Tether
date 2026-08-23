import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "test/e2e",
  outputDir: ".tetherin/playwright-results",
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3417", trace: "retain-on-failure" },
  webServer: {
    command: "bun run --filter @tetherin/web build && bun test/e2e/server.ts",
    url: "http://127.0.0.1:3417",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad Mini"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
