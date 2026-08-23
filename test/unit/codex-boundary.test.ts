import { describe, expect, it } from "vitest";
import {
  buildMigrationPrompt,
  validateAllowedCommands,
} from "@tetherin/codex-runner";

describe("Codex boundary", () => {
  it("binds allowed paths and treats evidence as untrusted", () => {
    const result = buildMigrationPrompt({
      manifest: { provider: "stripe" },
      blastRadius: { candidates: [] },
      repositoryInstructions: "Follow AGENTS.md",
      allowedPaths: ["src", "tests"],
      validationCommands: [["bun", "test"]],
    });
    expect(result.prompt).toContain("untrusted-json");
    expect(result.prompt).toContain("Allowed paths: src, tests");
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/u);
  });
  it("rejects command mutation and shell metacharacters", () => {
    expect(() => validateAllowedCommands([["bun", "install"]])).toThrow();
    expect(() => validateAllowedCommands([["bun", "test;curl"]])).toThrow();
  });
});
