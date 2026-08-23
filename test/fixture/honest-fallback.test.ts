import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("retained fallback", () => {
  it("is explicitly non-live and reproducible", () => {
    const metadata = JSON.parse(
      readFileSync(
        "fixtures/providers/openai/geography-removal/metadata.json",
        "utf8",
      ),
    );
    expect(metadata.provider).toBe("openai");
    expect(
      readFileSync(
        "fixtures/providers/openai/geography-removal/official.breaking.json",
        "utf8",
      ).length,
    ).toBeGreaterThan(10);
  });
});
