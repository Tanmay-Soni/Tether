import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractSchemaExcerpt } from "../src/oasdiff/excerpt.js";
import type { SourceLocation } from "../src/types.js";

async function yamlFile(source: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "tetherin-excerpt-"));
  const filePath = path.join(directory, "spec.yaml");
  await writeFile(filePath, source);
  return filePath;
}

function location(
  source: string,
  startNeedle: string,
  endNeedle: string = startNeedle,
): SourceLocation {
  const startLineOffset = source.indexOf(startNeedle);
  const startOffset =
    startLineOffset + (startNeedle.length - startNeedle.trimStart().length);
  const endStart = source.indexOf(endNeedle, startOffset);
  if (startLineOffset < 0 || endStart < 0)
    throw new Error("test needle missing");
  const endOffset = endStart + endNeedle.length;
  const position = (offset: number): { line: number; column: number } => {
    const prefix = source.slice(0, offset);
    const lines = prefix.split("\n");
    return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
  };
  const start = position(startOffset);
  const end = position(endOffset);
  return {
    file: "https://example.test/spec.yaml",
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

describe("extractSchemaExcerpt", () => {
  it("uses CST ranges to return the smallest exact property node and pointer", async () => {
    const source = `openapi: 3.1.0
components:
  schemas:
    Request:
      type: object
      properties:
        geography:
          anyOf:
            - type: string
            - type: "null"
          description: Geography for the project.
`;
    const filePath = await yamlFile(source);
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: location(
          source,
          "        geography:",
          "          description: Geography for the project.",
        ),
        subjectKind: "request-property",
        subjectName: "geography",
      }),
    ).resolves.toEqual({
      value: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description: "Geography for the project.",
      },
      jsonPointer: "/components/schemas/Request/properties/geography",
    });
  });

  it("escapes JSON Pointer segments exactly", async () => {
    const source = `components:
  schemas:
    Request:
      properties:
        a/b~c:
          type: string
`;
    const filePath = await yamlFile(source);
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: location(source, "        a/b~c:", "          type: string"),
        subjectKind: "response-property",
        subjectName: "a/b~c",
      }),
    ).resolves.toMatchObject({
      value: { type: "string" },
      jsonPointer: "/components/schemas/Request/properties/a~1b~0c",
    });
  });

  it("follows one unambiguous local ref from the located schema only", async () => {
    const source = `paths:
  /projects:
    post:
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Request"
components:
  schemas:
    Request:
      type: object
      properties:
        geography:
          type: string
`;
    const filePath = await yamlFile(source);
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: location(
          source,
          "            schema:",
          '              $ref: "#/components/schemas/Request"',
        ),
        subjectKind: "request-property",
        subjectName: "geography",
      }),
    ).resolves.toEqual({
      value: { type: "string" },
      jsonPointer: "/components/schemas/Request/properties/geography",
    });
  });

  it("returns null instead of guessing across ambiguous ref branches", async () => {
    const source = `paths:
  /projects:
    post:
      requestBody:
        content:
          application/json:
            schema:
              oneOf:
                - $ref: "#/components/schemas/A"
                - $ref: "#/components/schemas/B"
components:
  schemas:
    A:
      properties:
        geography:
          type: string
    B:
      properties:
        geography:
          type: integer
`;
    const filePath = await yamlFile(source);
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: location(
          source,
          "            schema:",
          '                - $ref: "#/components/schemas/B"',
        ),
        subjectKind: "request-property",
        subjectName: "geography",
      }),
    ).resolves.toEqual({ value: null, limitation: "ambiguous-location" });
  });

  it("caps local ref cycles without resolving remote refs", async () => {
    const cycle = `components:
  schemas:
    A:
      $ref: "#/components/schemas/B"
    B:
      $ref: "#/components/schemas/A"
`;
    const cycleFile = await yamlFile(cycle);
    await expect(
      extractSchemaExcerpt({
        filePath: cycleFile,
        location: location(
          cycle,
          "    A:",
          '      $ref: "#/components/schemas/B"',
        ),
        subjectKind: "request-property",
        subjectName: "geography",
      }),
    ).resolves.toEqual({ value: null, limitation: "local-ref-cycle" });

    const remote = `components:
  schemas:
    Request:
      $ref: "https://example.test/schema.yaml"
`;
    const remoteFile = await yamlFile(remote);
    await expect(
      extractSchemaExcerpt({
        filePath: remoteFile,
        location: location(
          remote,
          "    Request:",
          '      $ref: "https://example.test/schema.yaml"',
        ),
        subjectKind: "response-property",
        subjectName: "geography",
      }),
    ).resolves.toEqual({ value: null, limitation: "remote-ref" });
  });

  it("enforces a local ref depth cap", async () => {
    const schemas = Array.from({ length: 15 }, (_, index) => {
      const name = `S${String(index)}`;
      return index === 14
        ? `    ${name}:\n      properties:\n        geography:\n          type: string`
        : `    ${name}:\n      $ref: "#/components/schemas/S${String(index + 1)}"`;
    }).join("\n");
    const source = `components:\n  schemas:\n${schemas}\n`;
    const filePath = await yamlFile(source);
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: location(
          source,
          "    S0:",
          '      $ref: "#/components/schemas/S1"',
        ),
        subjectKind: "request-property",
        subjectName: "geography",
      }),
    ).resolves.toEqual({ value: null, limitation: "local-ref-depth" });
  });

  it("returns explicit null limitations for missing, invalid, and absent locations", async () => {
    const source = "components:\n  schemas: {}\n";
    const filePath = await yamlFile(source);
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: undefined,
        subjectKind: "schema",
      }),
    ).resolves.toEqual({ value: null, limitation: "missing-location" });
    await expect(
      extractSchemaExcerpt({
        filePath,
        location: {
          file: "https://example.test/spec.yaml",
          line: 999,
          column: 1,
        },
        subjectKind: "schema",
      }),
    ).resolves.toEqual({ value: null, limitation: "location-not-found" });
    await expect(
      extractSchemaExcerpt({
        filePath: path.join(path.dirname(filePath), "missing.yaml"),
        location: {
          file: "https://example.test/spec.yaml",
          line: 1,
          column: 1,
        },
        subjectKind: "schema",
      }),
    ).resolves.toEqual({ value: null, limitation: "parse-error" });
  });
});
