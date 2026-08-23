import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateContract } from "@tetherin/orchestrator";

describe("shared contract integration", () => {
  it("accepts Person A's retained OpenAI fallback manifest", () => {
    const manifest = JSON.parse(
      readFileSync(
        "fixtures/providers/openai/geography-removal/manifest.json",
        "utf8",
      ),
    );
    expect(validateContract("migration-manifest", manifest)).toBe(manifest);
  });
});
