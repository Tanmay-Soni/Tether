import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PipelineError } from "../src/errors.js";
import {
  buildMigrationManifest,
  getNormalizationDiagnostics,
} from "../src/oasdiff/normalize.js";
import type {
  LocalSpec,
  NormalizationInput,
  OasdiffRawChange,
} from "../src/types.js";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const FIXTURE = path.join(
  REPOSITORY_ROOT,
  "fixtures/providers/openai/geography-removal",
);
const SCHEMA = path.join(
  REPOSITORY_ROOT,
  "contracts/migration-manifest.schema.json",
);

const OLD_COMMIT = "13c6a94fca988f8be3c5de09d73f012709985d10";
const NEW_COMMIT = "f85dbe223d40e1a31cba812ab2d755c7e98a92a3";

function spec(
  revision: "old" | "new",
  overrides: Partial<LocalSpec> = {},
): LocalSpec {
  const old = revision === "old";
  const commit = old ? OLD_COMMIT : NEW_COMMIT;
  return {
    provider: "openai",
    repositoryUrl: "https://github.com/openai/openai-openapi",
    commit,
    path: "openapi.yaml",
    rawUrl: `https://raw.githubusercontent.com/openai/openai-openapi/${commit}/openapi.yaml`,
    licenseSpdx: "MIT",
    filePath: path.join(FIXTURE, `${revision}.yaml`),
    sha256: old
      ? "a85b8a1274f0f65bcddbb8762993da9075846e2c97a5c81cf6822c9568038c33"
      : "db5d7478feae10b4d331834c60d9765a8aa042e38419f9b1694288c11aa8ebc8",
    byteLength: 1,
    fetchedAt: old ? "2026-08-23T22:00:00Z" : "2026-08-23T22:00:01Z",
    ...overrides,
  };
}

async function inputFor(
  rawChanges: OasdiffRawChange[],
  overrides: Partial<NormalizationInput> = {},
): Promise<NormalizationInput> {
  const directory = await mkdtemp(path.join(tmpdir(), "tetherin-normalize-"));
  const rawArtifactPath = path.join(directory, "oasdiff.json");
  const bytes = `${JSON.stringify(rawChanges)}\n`;
  await writeFile(rawArtifactPath, bytes);
  return {
    provider: "openai",
    oldSpec: spec("old"),
    newSpec: spec("new"),
    rawChanges,
    rawArtifactPath,
    rawSha256: createHash("sha256").update(bytes).digest("hex"),
    rawMode: "breaking",
    detectedAt: "2026-08-23T22:00:02Z",
    manifestSchemaPath: SCHEMA,
    ...overrides,
  };
}

function raw(
  fingerprint: string,
  overrides: Partial<OasdiffRawChange> = {},
): OasdiffRawChange {
  return {
    id: "unknown-check",
    text: "an upstream finding retained verbatim",
    level: 1,
    operation: "GET",
    operationId: "get-example",
    path: "/example",
    fingerprint,
    ...overrides,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe("buildMigrationManifest", () => {
  it("maps only upstream levels 3/2/1 and breaking levels 3/2 exactly", async () => {
    const manifest = record(
      await buildMigrationManifest(
        await inputFor([
          raw("03", { level: 3, path: "/error" }),
          raw("02", { level: 2, path: "/warning" }),
          raw("01", { level: 1, path: "/info" }),
        ]),
      ),
    );
    const changes = manifest["changes"] as Record<string, unknown>[];
    expect(
      Object.fromEntries(
        changes.map((change) => [
          change["path"],
          [change["severity"], change["breaking"]],
        ]),
      ),
    ).toEqual({
      "/error": ["error", true],
      "/warning": ["warning", true],
      "/info": ["info", false],
    });
  });

  it("rejects every numeric level outside the exact upstream set", async () => {
    for (const level of [0, 4, -1]) {
      await expect(
        buildMigrationManifest(await inputFor([raw("01", { level })])),
      ).rejects.toMatchObject({
        code: "MANIFEST_INVALID",
        details: {
          validationErrors: [{ path: "/rawChanges/0/level", keyword: "enum" }],
        },
      });
    }
  });

  it("uses a small explicit ID projection for every supported subject family", async () => {
    const cases: {
      id: string;
      text: string;
      kind: string;
      name?: string;
    }[] = [
      {
        id: "api-removed-without-deprecation",
        text: "api removed without deprecation",
        kind: "endpoint",
      },
      {
        id: "request-property-removed",
        text: "removed the request property `request_name`",
        kind: "request-property",
        name: "request_name",
      },
      {
        id: "response-required-property-added",
        text: "added the required property `response_name` to the response with the `200` status",
        kind: "response-property",
        name: "response_name",
      },
      {
        id: "request-parameter-removed",
        text: "deleted the `query` request parameter `cursor`",
        kind: "parameter",
        name: "cursor",
      },
      {
        id: "api-schema-removed",
        text: "removed the schema `LegacyObject`",
        kind: "schema",
        name: "LegacyObject",
      },
      {
        id: "api-security-added",
        text: "the endpoint scheme security oauth was added to the API",
        kind: "security",
      },
    ];
    const manifest = record(
      await buildMigrationManifest(
        await inputFor(
          cases.map((entry, index) =>
            raw(`a${String(index)}`, {
              id: entry.id,
              text: entry.text,
              path: `/case/${String(index)}`,
            }),
          ),
        ),
      ),
    );
    const changes = manifest["changes"] as Record<string, unknown>[];
    expect(changes.map((change) => change["subject"])).toEqual(
      cases.map((entry) => ({
        kind: entry.kind,
        ...(entry.name === undefined ? {} : { name: entry.name }),
      })),
    );
  });

  it("retains unknown IDs and malformed property text as other without guessing", async () => {
    const inputs = [
      raw("aa", { id: "future-oasdiff-id", text: "raw future text" }),
      raw("bb", {
        id: "request-property-removed",
        text: "prefix removed the request property `secret` trailing",
        path: "/malformed",
      }),
    ];
    const manifest = record(
      await buildMigrationManifest(await inputFor(inputs)),
    );
    const changes = manifest["changes"] as Record<string, unknown>[];
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          oasdiffId: "future-oasdiff-id",
          text: "raw future text",
          subject: { kind: "other" },
        }),
        expect.objectContaining({
          oasdiffId: "request-property-removed",
          text: "prefix removed the request property `secret` trailing",
          subject: { kind: "other" },
        }),
      ]),
    );
  });

  it("copies exact optional source fields and extracts exact source schema nodes", async () => {
    const rawChanges = JSON.parse(
      await readFile(path.join(FIXTURE, "fragment.breaking.json"), "utf8"),
    ) as OasdiffRawChange[];
    const input = await inputFor(rawChanges, {
      guidance: [
        {
          title: "Official replacement commit",
          url: `https://github.com/openai/openai-openapi/commit/${NEW_COMMIT}`,
          source: "provider-repository",
          excerpt: "The official commit replaces geography with residency.",
        },
      ],
    });
    await writeFile(
      input.rawArtifactPath,
      await readFile(path.join(FIXTURE, "fragment.breaking.json")),
    );
    input.rawSha256 = createHash("sha256")
      .update(await readFile(input.rawArtifactPath))
      .digest("hex");

    const manifest = record(await buildMigrationManifest(input));
    const changes = manifest["changes"] as Record<string, unknown>[];
    expect(changes[0]).toMatchObject({
      operationId: "create-project",
      oldLocation: {
        url: `https://raw.githubusercontent.com/openai/openai-openapi/${OLD_COMMIT}/openapi.yaml`,
        line: 37,
        column: 9,
        endLine: 45,
        endColumn: 69,
      },
      newLocation: null,
      subject: {
        kind: "request-property",
        name: "geography",
        jsonPointer:
          "/components/schemas/ProjectCreateRequest/properties/geography",
      },
      schemaExcerpts: {
        old: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description:
            "Create the project with the specified data residency region. Your organization must have access to Data residency functionality in order to use. See [data residency controls](/docs/guides/your-data#data-residency-controls) to review the functionality and limitations of setting this field.",
        },
        new: null,
      },
    });
    expect(manifest["providerGuidance"]).toEqual(input.guidance);
    expect(record(manifest["engine"])["command"]).toEqual([
      "oasdiff",
      "breaking",
      "--format",
      "json",
      "OLD_SPEC_PATH",
      "NEW_SPEC_PATH",
    ]);
  });

  it("omits optional provider guidance when not supplied", async () => {
    const manifest = record(
      await buildMigrationManifest(await inputFor([raw("ab")])),
    );
    expect(Object.hasOwn(manifest, "providerGuidance")).toBe(false);
  });

  it("sorts changes and derives one stable ID from revisions plus sorted fingerprints", async () => {
    const firstOrder = [
      raw("cc", { path: "/z", operation: "POST", operationId: "z" }),
      raw("aa", { path: "/a", operation: "GET", operationId: "a" }),
      raw("bb", { path: "/a", operation: "DELETE", operationId: "b" }),
    ];
    const secondOrder = firstOrder.slice().reverse();
    const first = record(
      await buildMigrationManifest(await inputFor(firstOrder)),
    );
    const second = record(
      await buildMigrationManifest(await inputFor(secondOrder)),
    );
    expect(first["manifestId"]).toBe(second["manifestId"]);
    expect(first["changes"]).toEqual(second["changes"]);
    expect(
      (first["changes"] as Record<string, unknown>[]).map(
        (change) => change["fingerprint"],
      ),
    ).toEqual(["bb", "aa", "cc"]);
  });

  it("throws typed schema paths without including source content", async () => {
    const secret = "DO_NOT_ECHO_SOURCE_CONTENT";
    const input = await inputFor([raw("not-hex!", { text: secret })]);
    let caught: unknown;
    try {
      await buildMigrationManifest(input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PipelineError);
    const pipelineError = caught as PipelineError;
    expect(pipelineError.code).toBe("MANIFEST_INVALID");
    expect(pipelineError.details["validationErrors"]).toEqual(
      expect.arrayContaining([
        { path: "/changes/0/fingerprint", keyword: "pattern" },
      ]),
    );
    expect(JSON.stringify(pipelineError.details)).not.toContain(secret);
  });

  it("rejects empty changes because v1 requires at least one without fabricating", async () => {
    await expect(
      buildMigrationManifest(await inputFor([])),
    ).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
      details: {
        validationErrors: [{ path: "/changes", keyword: "minItems" }],
      },
    });
  });

  it("binds provider, compatible paths, raw bytes, checksum, and parsed changes", async () => {
    const providerMismatch = await inputFor([raw("aa")], {
      provider: "stripe",
    });
    await expect(
      buildMigrationManifest(providerMismatch),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });

    const pathMismatch = await inputFor([raw("aa")], {
      provider: "twilio",
      oldSpec: {
        ...spec("old"),
        provider: "twilio",
        repositoryUrl: "https://github.com/twilio/twilio-oai",
        path: "spec/yaml/twilio_accounts_v1.yaml",
        rawUrl:
          "https://raw.githubusercontent.com/twilio/twilio-oai/13c6a94fca988f8be3c5de09d73f012709985d10/spec/yaml/twilio_accounts_v1.yaml",
      },
      newSpec: {
        ...spec("new"),
        provider: "twilio",
        repositoryUrl: "https://github.com/twilio/twilio-oai",
        path: "spec/yaml/twilio_api_v2010.yaml",
        rawUrl:
          "https://raw.githubusercontent.com/twilio/twilio-oai/f85dbe223d40e1a31cba812ab2d755c7e98a92a3/spec/yaml/twilio_api_v2010.yaml",
      },
    });
    await expect(buildMigrationManifest(pathMismatch)).rejects.toMatchObject({
      code: "REVISION_INVALID",
      details: { field: "path" },
    });

    const badChecksum = await inputFor([raw("aa")]);
    badChecksum.rawSha256 = "0".repeat(64);
    await expect(buildMigrationManifest(badChecksum)).rejects.toMatchObject({
      code: "CHECKSUM_MISMATCH",
      details: { path: "/rawSha256" },
    });

    const mismatchedChanges = await inputFor([raw("aa")]);
    mismatchedChanges.rawChanges = [raw("bb")];
    await expect(
      buildMigrationManifest(mismatchedChanges),
    ).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
      details: {
        validationErrors: [{ path: "/rawChanges", keyword: "const" }],
      },
    });
  });

  it("validates mode, guidance origin, and raw source identity at runtime", async () => {
    const invalidMode = await inputFor([raw("aa")]);
    invalidMode.rawMode = "schema" as "breaking";
    await expect(buildMigrationManifest(invalidMode)).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
      details: {
        validationErrors: [{ path: "/rawMode", keyword: "enum" }],
      },
    });

    const unofficialGuidance = await inputFor([raw("aa")], {
      guidance: [
        {
          title: "Untrusted guidance",
          url: "https://attacker.example/migrate",
          source: "provider-docs",
        },
      ],
    });
    await expect(
      buildMigrationManifest(unofficialGuidance),
    ).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
      details: {
        validationErrors: [
          { path: "/providerGuidance/0/url", keyword: "pattern" },
        ],
      },
    });

    const traversingGuidance = await inputFor([raw("aa")], {
      guidance: [
        {
          title: "Escaped repository guidance",
          url: "https://github.com/openai/openai-openapi/../attacker/commit/abc",
          source: "provider-repository",
        },
      ],
    });
    await expect(
      buildMigrationManifest(traversingGuidance),
    ).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
      details: {
        validationErrors: [
          { path: "/providerGuidance/0/url", keyword: "pattern" },
        ],
      },
    });

    const wrongSource = raw("aa", {
      baseSource: {
        file: "https://attacker.example/openapi.yaml",
        line: 1,
        column: 1,
      },
    });
    await expect(
      buildMigrationManifest(await inputFor([wrongSource])),
    ).rejects.toMatchObject({
      code: "REVISION_INVALID",
      details: { field: "baseSource.file" },
    });
  });

  it("retains deterministic excerpt limitations outside the stable JSON schema", async () => {
    const manifest = await buildMigrationManifest(
      await inputFor([raw("bb"), raw("aa")]),
    );
    expect(getNormalizationDiagnostics(manifest)).toEqual([
      { fingerprint: "aa", side: "new", limitation: "missing-location" },
      { fingerprint: "aa", side: "old", limitation: "missing-location" },
      { fingerprint: "bb", side: "new", limitation: "missing-location" },
      { fingerprint: "bb", side: "old", limitation: "missing-location" },
    ]);
    expect(JSON.stringify(manifest)).not.toContain("missing-location");
    expect(
      getNormalizationDiagnostics(JSON.parse(JSON.stringify(manifest))),
    ).toEqual([]);
  });
});
