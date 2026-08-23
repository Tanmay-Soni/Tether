import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { PipelineError } from "../src/errors.js";
import {
  OASDIFF_RAW_SCHEMA,
  OASDIFF_RAW_SCHEMA_STDOUT_SHA256,
  OASDIFF_UPSTREAM_METADATA,
} from "../src/oasdiff/raw-schema.generated.js";
import {
  assertRuntimeSchema,
  parseAndValidateRawChanges,
} from "../src/oasdiff/raw-schema.js";

describe("generated oasdiff raw schema", () => {
  it("matches the exact official v1.29.1 schema command stdout digest", () => {
    const commandStdout = `${JSON.stringify(OASDIFF_RAW_SCHEMA, null, 2)}\n`;
    expect(createHash("sha256").update(commandStdout).digest("hex")).toBe(
      OASDIFF_RAW_SCHEMA_STDOUT_SHA256,
    );
    expect(OASDIFF_UPSTREAM_METADATA).toMatchObject({
      release: "v1.29.1",
      commit: "2bb87bada404d350cb56e5504e8bd5d76f6159bf",
      licenseSpdx: "Apache-2.0",
    });
  });

  it("accepts the retained real OpenAI v1.29.1 array fixture", async () => {
    const fixture = await readFile(
      new URL(
        "../../../contracts/fixtures/oasdiff/openai-geography.breaking.json",
        import.meta.url,
      ),
    );
    const changes = parseAndValidateRawChanges(fixture);
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.operationId)).toEqual([
      "create-project",
      "modify-project",
    ]);
  });

  it("accepts empty output and changes with only the required level", () => {
    expect(parseAndValidateRawChanges(Buffer.from("[]"))).toEqual([]);
    expect(parseAndValidateRawChanges(Buffer.from('[{"level":1}]'))).toEqual([
      { level: 1 },
    ]);
  });

  it.each([
    ["invalid JSON", "{"],
    ["object root", "{}"],
    ["missing required level", "[{}]"],
    ["wrong level type", '[{"level":"2"}]'],
    ["unknown field", '[{"level":2,"unknown":true}]'],
    ["invalid source field", '[{"level":2,"baseSource":{"line":"1"}}]'],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseAndValidateRawChanges(Buffer.from(raw))).toThrowError();
  });

  it("accepts only the exact checked-in runtime schema", () => {
    expect(() =>
      assertRuntimeSchema(structuredClone(OASDIFF_RAW_SCHEMA)),
    ).not.toThrow();
    try {
      assertRuntimeSchema({
        ...OASDIFF_RAW_SCHEMA,
        $id: "https://example.test/schema",
      });
      throw new Error("expected schema rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).code).toBe("OASDIFF_SCHEMA_INVALID");
    }
  });

  it("contains no remote schema references", () => {
    const references: string[] = [];
    collectReferences(OASDIFF_RAW_SCHEMA, references);
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((reference) => reference.startsWith("#/"))).toBe(
      true,
    );
  });
});

function collectReferences(value: unknown, references: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string") references.push(item);
    collectReferences(item, references);
  }
}
