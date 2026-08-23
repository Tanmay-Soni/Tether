export type Provider = "openai" | "stripe" | "twilio";
export interface ProviderSelection {
  service?: string;
  variant?: "legacy-v1";
}

export interface SpecRevision {
  provider: Provider;
  repositoryUrl: `https://github.com/${string}`;
  commit: string;
  path: string;
  rawUrl: `https://raw.githubusercontent.com/${string}`;
  licenseSpdx: "MIT";
}

export interface LocalSpec extends SpecRevision {
  filePath: string;
  sha256: string;
  byteLength: number;
  fetchedAt: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface OasdiffRawChange {
  id?: string;
  text?: string;
  comment?: string;
  disclaimers?: string[];
  level: number;
  operation?: string;
  operationId?: string;
  path?: string;
  section?: string;
  attributes?: Record<string, unknown>;
  baseSource?: SourceLocation;
  revisionSource?: SourceLocation;
  fingerprint?: string;
  [key: string]: unknown;
}

export interface NormalizedChange {
  oasdiffId: string;
  fingerprint: string;
  severity: "error" | "warning" | "info";
  breaking: boolean;
  method: string;
  path: string;
  operationId: string | null;
  text: string;
  subject: {
    kind:
      | "endpoint"
      | "request-property"
      | "response-property"
      | "parameter"
      | "schema"
      | "security"
      | "other";
    name?: string;
    jsonPointer?: string;
  };
  oldLocation: ManifestSourceLocation | null;
  newLocation: ManifestSourceLocation | null;
  schemaExcerpts: { old: unknown; new: unknown };
}

export interface ProviderGuidance {
  title: string;
  url: string;
  source: "provider-repository" | "provider-docs" | "provider-changelog";
  excerpt?: string;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  resolveRevision(
    ref: string,
    selection?: ProviderSelection,
  ): Promise<SpecRevision>;
  materialize(revision: SpecRevision, cacheDir: string): Promise<LocalSpec>;
  guidance(changes: NormalizedChange[]): Promise<ProviderGuidance[]>;
}

export interface ContractDiffEngine {
  compare(input: {
    oldSpec: LocalSpec;
    newSpec: LocalSpec;
    mode: "breaking" | "changelog";
    artifactDir: string;
    matchPath?: string;
    signal?: AbortSignal;
  }): Promise<{
    rawMode: "breaking" | "changelog";
    rawChanges: OasdiffRawChange[];
    rawArtifactPath: string;
    rawSha256: string;
    matchPath?: string;
  }>;
}

export interface OasdiffOptions {
  cacheDir: string;
  binaryPath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  fetch?: typeof globalThis.fetch;
}

export interface ManifestSourceLocation {
  url: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface NormalizationDiagnostic {
  fingerprint: string;
  side: "old" | "new";
  limitation:
    | "ambiguous-location"
    | "local-ref-cycle"
    | "local-ref-depth"
    | "location-not-found"
    | "missing-location"
    | "parse-error"
    | "remote-ref"
    | "subject-not-found";
}

export interface NormalizationInput {
  provider: Provider;
  oldSpec: LocalSpec;
  newSpec: LocalSpec;
  rawChanges: OasdiffRawChange[];
  rawArtifactPath: string;
  rawSha256: string;
  rawMode: "breaking" | "changelog";
  matchPath?: string;
  guidance?: ProviderGuidance[];
  detectedAt?: string;
  manifestSchemaPath?: string;
}
