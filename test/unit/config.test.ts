import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, redact } from "@tetherin/config";

function roots() {
  const root = mkdtempSync(join(tmpdir(), "tether-config-"));
  const consumer = join(root, "..", `consumer-${Date.now()}`);
  mkdirSync(consumer);
  return { root, consumer };
}
describe("configuration boundary", () => {
  it("accepts loopback and a separate absolute consumer", () => {
    const { root, consumer } = roots();
    expect(
      loadConfig({
        repoRoot: root,
        env: {
          TETHERIN_CONSUMER_REPO_PATH: consumer,
          TETHERIN_CONSUMER_REPO: "owner/repo",
        },
      }),
    ).toMatchObject({ mode: "fixture", consumerRepo: "owner/repo" });
  });
  it("refuses broad paths and redacts credentials", () => {
    const { root } = roots();
    expect(() =>
      loadConfig({
        repoRoot: root,
        env: {
          TETHERIN_CONSUMER_REPO_PATH: "/",
          TETHERIN_CONSUMER_REPO: "owner/repo",
        },
      }),
    ).toThrow();
    expect(
      redact("authorization: Bearer secret-value token=plain"),
    ).not.toContain("secret-value");
  });
});
