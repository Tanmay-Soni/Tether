import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  Ajv2020,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import { PipelineError } from "../errors.js";
import { assertCompatibleRevisionPair } from "../provenance.js";
import type {
  LocalSpec,
  ManifestSourceLocation,
  NormalizationDiagnostic,
  NormalizationInput,
  NormalizedChange,
  OasdiffRawChange,
} from "../types.js";
import { extractSchemaExcerpt } from "./excerpt.js";
import { parseAndValidateRawChanges } from "./raw-schema.js";

const OASDIFF_RELEASE_COMMIT = "2bb87bada404d350cb56e5504e8bd5d76f6159bf";
const OASDIFF_RELEASE_URL =
  "https://github.com/oasdiff/oasdiff/releases/tag/v1.29.1";
const normalizationDiagnostics = new WeakMap<
  object,
  readonly NormalizationDiagnostic[]
>();
const require = createRequire(import.meta.url);
const addFormats =
  require("ajv-formats") as typeof import("ajv-formats").default;

type SubjectKind = NormalizedChange["subject"]["kind"];

interface IdRule {
  kind: Exclude<SubjectKind, "other">;
  namePattern?: RegExp;
  nameGroup?: number;
}

interface ValidationIssue {
  path: string;
  keyword: string;
}

const ID_RULES: Readonly<Record<string, IdRule>> = {
  "api-path-removed-without-deprecation": { kind: "endpoint" },
  "api-path-removed-with-deprecation": { kind: "endpoint" },
  "api-removed-without-deprecation": { kind: "endpoint" },
  "api-removed-with-deprecation": { kind: "endpoint" },
  "endpoint-deprecated": { kind: "endpoint" },
  "endpoint-deprecated-with-sunset": { kind: "endpoint" },
  "endpoint-reactivated": { kind: "endpoint" },

  "request-property-removed": {
    kind: "request-property",
    namePattern: /^removed the request property `([^`\r\n]+)`$/,
  },
  "new-required-request-property": {
    kind: "request-property",
    namePattern: /^added the new required request property `([^`\r\n]+)`$/,
  },
  "new-required-request-property-with-default": {
    kind: "request-property",
    namePattern:
      /^added the new required request property `([^`\r\n]+)` with a default value$/,
  },
  "new-optional-request-property": {
    kind: "request-property",
    namePattern: /^added the new optional request property `([^`\r\n]+)`$/,
  },

  "response-optional-property-removed": {
    kind: "response-property",
    namePattern:
      /^removed the optional property `([^`\r\n]+)` from the response with the `[^`\r\n]+` status$/,
  },
  "response-optional-property-added": {
    kind: "response-property",
    namePattern:
      /^added the optional property `([^`\r\n]+)` to the response with the `[^`\r\n]+` status$/,
  },
  "response-required-property-removed": {
    kind: "response-property",
    namePattern:
      /^removed the required property `([^`\r\n]+)` from the response with the `[^`\r\n]+` status$/,
  },
  "response-required-property-added": {
    kind: "response-property",
    namePattern:
      /^added the required property `([^`\r\n]+)` to the response with the `[^`\r\n]+` status$/,
  },

  "request-parameter-removed": {
    kind: "parameter",
    namePattern: /^deleted the `[^`\r\n]+` request parameter `([^`\r\n]+)`$/,
  },
  "request-parameter-removed-with-deprecation": {
    kind: "parameter",
    namePattern:
      /^deleted the deprecated `[^`\r\n]+` request parameter `([^`\r\n]+)`$/,
  },
  "new-required-request-parameter": {
    kind: "parameter",
    namePattern:
      /^added the new required `[^`\r\n]+` request parameter `([^`\r\n]+)`$/,
  },
  "new-optional-request-parameter": {
    kind: "parameter",
    namePattern:
      /^added the new optional `[^`\r\n]+` request parameter `([^`\r\n]+)`$/,
  },

  "api-schema-removed": {
    kind: "schema",
    namePattern: /^removed the schema `([^`\r\n]+)`$/,
  },

  "api-security-added": { kind: "security" },
  "api-security-removed": { kind: "security" },
  "api-security-scope-added": { kind: "security" },
  "api-security-scope-removed": { kind: "security" },
  "api-global-security-added": { kind: "security" },
  "api-global-security-removed": { kind: "security" },
  "api-global-security-scope-added": { kind: "security" },
  "api-global-security-scope-removed": { kind: "security" },
};

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requireRawString(
  raw: OasdiffRawChange,
  field: "fingerprint" | "id" | "operation" | "path" | "text",
  index: number,
): string {
  const value = raw[field];
  if (typeof value !== "string" || value.length === 0) {
    throw invalidManifest([
      { path: `/rawChanges/${String(index)}/${field}`, keyword: "required" },
    ]);
  }
  return value;
}

function severity(level: number, index: number): NormalizedChange["severity"] {
  if (level === 3) return "error";
  if (level === 2) return "warning";
  if (level === 1) return "info";
  throw invalidManifest([
    { path: `/rawChanges/${String(index)}/level`, keyword: "enum" },
  ]);
}

function subjectFor(
  id: string,
  text: string,
): {
  kind: SubjectKind;
  name?: string;
} {
  const rule = ID_RULES[id];
  if (!rule) return { kind: "other" };
  if (!rule.namePattern) return { kind: rule.kind };
  const match = rule.namePattern.exec(text);
  const name = match?.[rule.nameGroup ?? 1];
  return name ? { kind: rule.kind, name } : { kind: "other" };
}

function locationFor(
  location: OasdiffRawChange["baseSource"],
  spec: LocalSpec,
  field: "baseSource.file" | "revisionSource.file",
): ManifestSourceLocation | null {
  if (!location) return null;
  if (location.file.startsWith("https://")) {
    if (location.file !== spec.rawUrl) {
      throw new PipelineError(
        "REVISION_INVALID",
        "oasdiff source URL does not match the immutable provider revision",
        { field },
      );
    }
  } else if (!matchesLocalSource(location.file, spec.filePath)) {
    throw new PipelineError(
      "REVISION_INVALID",
      "oasdiff local source does not match the materialized provider revision",
      { field },
    );
  }
  const normalized: ManifestSourceLocation = {
    url: spec.rawUrl,
    line: location.line,
    column: location.column,
  };
  if (location.endLine !== undefined) normalized.endLine = location.endLine;
  if (location.endColumn !== undefined)
    normalized.endColumn = location.endColumn;
  return normalized;
}

function matchesLocalSource(source: string, filePath: string): boolean {
  if (path.resolve(source) === path.resolve(filePath)) return true;
  return (
    !source.includes("/") &&
    !source.includes("\\") &&
    source === path.basename(filePath)
  );
}

function changeSortKey(change: NormalizedChange): readonly string[] {
  return [
    change.path,
    change.method,
    change.operationId ?? "",
    change.oasdiffId,
    change.fingerprint,
  ];
}

function compareChanges(
  left: NormalizedChange,
  right: NormalizedChange,
): number {
  const leftKey = changeSortKey(left);
  const rightKey = changeSortKey(right);
  for (let index = 0; index < leftKey.length; index += 1) {
    const compared = lexicalCompare(
      leftKey[index] ?? "",
      rightKey[index] ?? "",
    );
    if (compared !== 0) return compared;
  }
  return 0;
}

function deterministicManifestId(
  input: NormalizationInput,
  fingerprints: readonly string[],
): string {
  const digest = createHash("sha256")
    .update(input.provider)
    .update("\0")
    .update(input.oldSpec.commit)
    .update("\0")
    .update(input.newSpec.commit)
    .update("\0")
    .update(fingerprints.join("\0"))
    .digest("hex");
  return `${input.provider}:${digest.slice(0, 32)}`;
}

function validationIssues(
  errors: ErrorObject[] | null | undefined,
): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    keyword: error.keyword,
  }));
}

function invalidManifest(issues: readonly ValidationIssue[]): PipelineError {
  return new PipelineError(
    "MANIFEST_INVALID",
    "Migration manifest validation failed",
    { validationErrors: issues },
  );
}

async function firstAccessible(paths: readonly string[]): Promise<string> {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next repository layout. The final error contains paths only.
    }
  }
  throw new PipelineError(
    "MANIFEST_INVALID",
    "Migration manifest schema could not be located",
    { attemptedPaths: paths },
  );
}

async function manifestValidator(
  explicitPath: string | undefined,
): Promise<ValidateFunction> {
  const modulePath = fileURLToPath(import.meta.url);
  const schemaPath =
    explicitPath ??
    (await firstAccessible([
      path.resolve(
        path.dirname(modulePath),
        "../../../../contracts/migration-manifest.schema.json",
      ),
      path.resolve(process.cwd(), "contracts/migration-manifest.schema.json"),
      path.resolve(
        process.cwd(),
        "../../contracts/migration-manifest.schema.json",
      ),
    ]));

  let schema: unknown;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8")) as unknown;
  } catch (error) {
    throw new PipelineError(
      "MANIFEST_INVALID",
      "Migration manifest schema could not be loaded",
      { schemaPath },
      { cause: error },
    );
  }
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
  });
  addFormats(ajv);
  return ajv.compile(schema as AnySchema);
}

async function normalizeChange(
  raw: OasdiffRawChange,
  index: number,
  input: NormalizationInput,
): Promise<{
  change: NormalizedChange;
  diagnostics: NormalizationDiagnostic[];
}> {
  const oasdiffId = requireRawString(raw, "id", index);
  const fingerprint = requireRawString(raw, "fingerprint", index);
  const method = requireRawString(raw, "operation", index);
  const apiPath = requireRawString(raw, "path", index);
  const text = requireRawString(raw, "text", index);
  const subject = subjectFor(oasdiffId, text);

  const [oldExcerpt, newExcerpt] = await Promise.all([
    extractSchemaExcerpt({
      filePath: input.oldSpec.filePath,
      location: raw.baseSource,
      subjectKind: subject.kind,
      ...(subject.name === undefined ? {} : { subjectName: subject.name }),
    }),
    extractSchemaExcerpt({
      filePath: input.newSpec.filePath,
      location: raw.revisionSource,
      subjectKind: subject.kind,
      ...(subject.name === undefined ? {} : { subjectName: subject.name }),
    }),
  ]);

  const normalizedSubject: NormalizedChange["subject"] = {
    kind: subject.kind,
  };
  if (subject.name !== undefined) normalizedSubject.name = subject.name;
  const pointer = oldExcerpt.jsonPointer ?? newExcerpt.jsonPointer;
  if (pointer !== undefined) normalizedSubject.jsonPointer = pointer;

  const change: NormalizedChange = {
    oasdiffId,
    fingerprint,
    severity: severity(raw.level, index),
    breaking: raw.level === 2 || raw.level === 3,
    method,
    path: apiPath,
    operationId: raw.operationId ?? null,
    text,
    subject: normalizedSubject,
    oldLocation: locationFor(raw.baseSource, input.oldSpec, "baseSource.file"),
    newLocation: locationFor(
      raw.revisionSource,
      input.newSpec,
      "revisionSource.file",
    ),
    schemaExcerpts: {
      old: oldExcerpt.value,
      new: newExcerpt.value,
    },
  };
  const diagnostics: NormalizationDiagnostic[] = [];
  if (oldExcerpt.limitation !== undefined) {
    diagnostics.push({
      fingerprint,
      side: "old",
      limitation: oldExcerpt.limitation,
    });
  }
  if (newExcerpt.limitation !== undefined) {
    diagnostics.push({
      fingerprint,
      side: "new",
      limitation: newExcerpt.limitation,
    });
  }
  return { change, diagnostics };
}

function validateMode(
  mode: unknown,
  path: "/rawMode",
): asserts mode is "breaking" | "changelog" {
  if (mode !== "breaking" && mode !== "changelog") {
    throw new PipelineError(
      "MANIFEST_INVALID",
      "Normalization mode must be breaking or changelog",
      { validationErrors: [{ path, keyword: "enum" }] },
    );
  }
}

const OFFICIAL_DOCS_HOSTS: Readonly<
  Record<NormalizationInput["provider"], ReadonlySet<string>>
> = {
  openai: new Set(["developers.openai.com", "platform.openai.com"]),
  stripe: new Set(["docs.stripe.com"]),
  twilio: new Set(["www.twilio.com"]),
};

function validateGuidance(input: NormalizationInput): void {
  const repositoryUrl = new URL(input.oldSpec.repositoryUrl);
  const repositoryPath = repositoryUrl.pathname.replace(/\/$/u, "");
  const repositoryPathPrefix = `${repositoryPath}/`;
  for (const [index, guidance] of (input.guidance ?? []).entries()) {
    let url: URL;
    try {
      url = new URL(guidance.url);
    } catch {
      throw invalidManifest([
        { path: `/providerGuidance/${String(index)}/url`, keyword: "format" },
      ]);
    }
    const credentialFreeHttps =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "";
    const official =
      guidance.source === "provider-repository"
        ? credentialFreeHttps &&
          url.origin === repositoryUrl.origin &&
          url.pathname.startsWith(repositoryPathPrefix) &&
          !url.pathname.includes("%") &&
          url.search === "" &&
          url.hash === ""
        : credentialFreeHttps &&
          OFFICIAL_DOCS_HOSTS[input.provider].has(url.hostname);
    if (!official) {
      throw invalidManifest([
        { path: `/providerGuidance/${String(index)}/url`, keyword: "pattern" },
      ]);
    }
  }
}

export function getNormalizationDiagnostics(
  manifest: unknown,
): readonly NormalizationDiagnostic[] {
  if (typeof manifest !== "object" || manifest === null) return [];
  return normalizationDiagnostics.get(manifest) ?? [];
}

async function verifyRawArtifact(input: NormalizationInput): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(input.rawArtifactPath);
  } catch (error) {
    throw new PipelineError(
      "MANIFEST_INVALID",
      "Retained oasdiff artifact could not be read",
      { path: "/rawArtifactPath" },
      { cause: error },
    );
  }
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== input.rawSha256) {
    throw new PipelineError(
      "CHECKSUM_MISMATCH",
      "Retained oasdiff artifact checksum does not match its provenance",
      { path: "/rawSha256" },
    );
  }
  const artifactChanges = parseAndValidateRawChanges(bytes);
  if (!isDeepStrictEqual(artifactChanges, input.rawChanges)) {
    throw invalidManifest([{ path: "/rawChanges", keyword: "const" }]);
  }
}

export async function buildMigrationManifest(
  input: NormalizationInput,
): Promise<unknown> {
  const mode: unknown = input.rawMode;
  validateMode(mode, "/rawMode");
  if (
    input.provider !== input.oldSpec.provider ||
    input.provider !== input.newSpec.provider
  ) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Manifest provider must match both retained spec revisions",
      { field: "provider" },
    );
  }
  assertCompatibleRevisionPair(input.oldSpec, input.newSpec);
  validateGuidance(input);
  await verifyRawArtifact(input);

  if (input.rawChanges.length === 0) {
    throw invalidManifest([{ path: "/changes", keyword: "minItems" }]);
  }

  const normalized = await Promise.all(
    input.rawChanges.map((raw, index) => normalizeChange(raw, index, input)),
  );
  const changes = normalized.map((result) => result.change);
  changes.sort(compareChanges);
  const fingerprints = changes
    .map((change) => change.fingerprint)
    .sort(lexicalCompare);

  const manifest = {
    schemaVersion: "tetherin.migration-manifest/v1",
    manifestId: deterministicManifestId(input, fingerprints),
    provider: input.provider,
    source: {
      repositoryUrl: input.oldSpec.repositoryUrl,
      licenseSpdx: "MIT",
      old: {
        commit: input.oldSpec.commit,
        specUrl: input.oldSpec.rawUrl,
        sha256: input.oldSpec.sha256,
      },
      new: {
        commit: input.newSpec.commit,
        specUrl: input.newSpec.rawUrl,
        sha256: input.newSpec.sha256,
      },
      fetchedAt: input.newSpec.fetchedAt,
    },
    engine: {
      name: "oasdiff",
      version: "1.29.1",
      releaseCommit: OASDIFF_RELEASE_COMMIT,
      releaseUrl: OASDIFF_RELEASE_URL,
      command: [
        "oasdiff",
        mode,
        "--format",
        "json",
        ...(input.matchPath === undefined
          ? []
          : ["--match-path", input.matchPath]),
        "OLD_SPEC_PATH",
        "NEW_SPEC_PATH",
      ],
      outputFormat: "json",
      rawOutputSha256: input.rawSha256,
    },
    changes,
    ...(input.guidance === undefined
      ? {}
      : { providerGuidance: input.guidance }),
    detectedAt: input.detectedAt ?? input.newSpec.fetchedAt,
  };

  const validate = await manifestValidator(input.manifestSchemaPath);
  if (!validate(manifest)) {
    throw invalidManifest(validationIssues(validate.errors));
  }
  const diagnostics = normalized
    .flatMap((result) => result.diagnostics)
    .sort((left, right) =>
      lexicalCompare(
        `${left.fingerprint}\0${left.side}\0${left.limitation}`,
        `${right.fingerprint}\0${right.side}\0${right.limitation}`,
      ),
    );
  normalizationDiagnostics.set(manifest, Object.freeze(diagnostics));
  return manifest;
}
