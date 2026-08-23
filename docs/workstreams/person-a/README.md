# Person A — official specs, oasdiff, and migration manifests

This is the complete work package for Person A. It requires no chat history.

## Mission

Build an implementation-ready provider ingestion package that fetches immutable
official OpenAPI revisions for OpenAI, Stripe, and Twilio, verifies and runs
oasdiff v1.29.1, preserves real raw JSON, and emits a validated
`tetherin.migration-manifest/v1` with exact provenance and schema excerpts.

Your output stops at the manifest. You do not inspect consumer repositories,
call Greptile/Codex, create customer branches/PRs, build the dashboard/database,
or orchestrate jobs.

## Prerequisites and branch

1. Install Bun 1.4.x, Git, `jq`, and a SHA-256 utility. Network is required only
   for official GitHub/release downloads.
2. Clone this repository and read root `AGENTS.md`, `contracts/README.md`,
   `docs/decisions/0001-oasdiff-foundation.md`, `docs/provenance.md`, and this
   directory's `AGENTS.md`.
3. Get the immutable `PLANNING_BASE_SHA` from `../BASELINES.md` and run:

```bash
git fetch origin --tags
test "$(git rev-parse HEAD)" = "<PLANNING_BASE_SHA>"
git switch -c person-a/provider-diff
bun --version
```

If the branch already exists, resume it only when its merge base with the
planning SHA equals that SHA. During development use
`bun install --no-save`; do not commit `bun.lock`. Person C regenerates the
single root lock after integration.

## Ownership and dependency boundary

Create:

```text
packages/provider-pipeline/
  package.json
  tsconfig.json
  src/index.ts
  src/types.ts
  src/providers/{openai,stripe,twilio}.ts
  src/spec-cache.ts
  src/oasdiff/{install,runner,raw-schema,normalize,excerpt}.ts
  src/provenance.ts
  src/errors.ts
  test/**
  scripts/install-oasdiff.mjs
fixtures/providers/
  openai/geography-removal/**
  stripe/<selected-versioned-change>/**
  twilio/<selected-service-change>/**
docs/workstreams/person-a/HANDOFF.md
```

Package runtime dependencies should be small and pinned in its `package.json`:
use `ajv` + `ajv-formats` for contracts, `yaml` for syntax/CST positions, and
Node built-ins for HTTP, hashing, files, archives, and child processes where
practical. Pin dev TypeScript/Vitest versions. Do not add a competing OpenAPI diff
library. Person C will generate the final root lockfile.

## Required public API

Export these names from `packages/provider-pipeline/src/index.ts`. Exact internal
classes may differ; behavior may not.

```ts
export type Provider = "openai" | "stripe" | "twilio";

export interface SpecRevision {
  provider: Provider;
  repositoryUrl: `https://github.com/${string}`;
  commit: string;            // exactly 40 lowercase hex characters
  path: string;              // allowlisted by adapter
  rawUrl: `https://raw.githubusercontent.com/${string}`;
  licenseSpdx: "MIT";
}

export interface LocalSpec extends SpecRevision {
  filePath: string;          // inside content-addressed cache
  sha256: string;
  byteLength: number;
  fetchedAt: string;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  resolveRevision(ref: string, selection?: { service?: string }): Promise<SpecRevision>;
  materialize(revision: SpecRevision, cacheDir: string): Promise<LocalSpec>;
  guidance(changes: NormalizedChange[]): Promise<ProviderGuidance[]>;
}

export interface OasdiffRawChange {
  id?: string;
  text?: string;
  comment?: string;
  disclaimers?: string[];
  level: number;             // upstream: 3 ERR, 2 WARN, 1 INFO
  operation?: string;
  operationId?: string;
  path?: string;
  section?: string;
  attributes?: Record<string, unknown>;
  baseSource?: SourceLocation;
  revisionSource?: SourceLocation;
  fingerprint?: string;
}

export interface ContractDiffEngine {
  compare(input: {
    oldSpec: LocalSpec;
    newSpec: LocalSpec;
    mode: "breaking" | "changelog";
    artifactDir: string;
    signal?: AbortSignal;
  }): Promise<{
    rawChanges: OasdiffRawChange[];
    rawArtifactPath: string;
    rawSha256: string;
  }>;
}

export function createProviderAdapter(provider: Provider): ProviderAdapter;
export function createOasdiffEngine(options: OasdiffOptions): ContractDiffEngine;
export function buildMigrationManifest(input: NormalizationInput): Promise<unknown>;
```

`buildMigrationManifest` returns data already validated against
`contracts/migration-manifest.schema.json`. On a validation error it throws a
typed error with JSON paths but no source content.

## Official adapter rules

| Provider | Repository | Branch only for ref resolution | Allowlisted spec selection |
| --- | --- | --- | --- |
| OpenAI | `https://github.com/openai/openai-openapi` | `main` | `openapi.yaml` |
| Stripe | `https://github.com/stripe/openapi` | `master` | GA public `latest/openapi.spec3.yaml`; legacy `openapi/spec3.yaml` only for an explicitly labeled historical fixture |
| Twilio | `https://github.com/twilio/twilio-oai` | `main` | one exact `spec/yaml/*.yaml` service file selected by safe basename; never invent an aggregate |

Ref resolution may use the GitHub API, but the resulting spec fetch always uses
the full resolved commit. Validate repository identity, commit shape, allowlisted
path, HTTPS host, response size/content type, redirect host, and final URL.

For Twilio, old and new selections must name the same service file. For Stripe,
frame the hero as an explicit version/deprecation migration; Stripe publishes
versioned changes, so do not claim it unexpectedly broke customer code. All
three adapters are complete when they fetch/validate a pair and are covered by
contract tests; only one provider needs the full demo consumer path.

## Pinned oasdiff installer and runner

Implement an idempotent installer under the package, not the repository root.
Use release `v1.29.1`, release commit
`2bb87bada404d350cb56e5504e8bd5d76f6159bf`, and only these official archives:

```text
759cc5703d9335c441ad84a7074c705486b2c493f79bcfdf251c7a9c788b1171  oasdiff_1.29.1_darwin_all.tar.gz
541f7c66c933495fceef24eaf5c48aa66c19069f366f7bd0a60a6a4820c5e533  oasdiff_1.29.1_linux_amd64.tar.gz
8bc247f0280f62ca73599265db0d984e853d7df6e714dad6ead85afc7cfc5883  oasdiff_1.29.1_linux_arm64.tar.gz
```

Download from
`https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/<asset>`, verify
SHA-256 before extraction, reject archive entries outside expected top-level
`oasdiff`/license files, atomically place the executable in a content-addressed
cache, and require `oasdiff --version` to report `1.29.1`. `OASDIFF_BIN` may
override the path only if the same version check passes.

Spawn with an argument array and `shell: false`; cap runtime and stdout/stderr;
disable network in the execution container; kill the process group on abort.
Run:

```text
oasdiff breaking --format json OLD_LOCAL_SPEC NEW_LOCAL_SPEC
oasdiff changelog --format json OLD_LOCAL_SPEC NEW_LOCAL_SPEC
oasdiff schema
```

Do not use `--fail-on`: breaking findings are data, not process failure. A
nonzero process exit, invalid JSON, non-array output, schema mismatch, timeout,
or oversized output is a typed pipeline error. Save stdout to a temporary file,
fsync/close, hash it, validate it against the generated upstream schema, then
atomically rename. Never normalize from an unvalidated stream.

Remote `$ref` loading stays disabled. If an official selected spec cannot be
processed without external refs, fail with an actionable error; propose a later
host-allowlisted materializer rather than enabling arbitrary access.

## Normalization rules

Use the real output shape in `contracts/fixtures/oasdiff`. Preserve every raw
field. Normalization is a projection, not a new compatibility opinion:

- severity mapping: `3 -> error`, `2 -> warning`, `1 -> info`; `breaking` is true
  only for upstream levels 2 or 3;
- copy method/path/operationId/fingerprint/source locations exactly when present;
- recognize a small explicit map of oasdiff IDs needed by selected fixtures
  (endpoint, request/response property, parameter, schema, security). Unknown IDs
  become `subject.kind: "other"`; never drop them or parse a fake semantic name;
- for recognized property IDs, extract a name only with an anchored, tested text
  pattern. A mismatch remains `other` and records the raw text;
- use YAML CST/range positions and source lines to locate the smallest exact old
  or new schema node and derive a JSON Pointer. Resolve only local `$ref`s with a
  cycle/depth cap. If unambiguous extraction fails, store `null` and a limitation
  in internal diagnostics; do not guess;
- provider guidance comes only from official repository commits/releases/docs,
  with exact URLs and short attributable excerpts. Empty guidance is valid;
- manifest ID is deterministic over provider + revisions + sorted fingerprints;
- sort changes by path, method, operationId, oasdiff ID, fingerprint for stable
  output without altering raw artifact order.

The example manifest and fixture must remain reproducible byte-for-byte after
canonical JSON formatting chosen by the package.

## Implementation checklist

1. Scaffold package config, strict TypeScript, Vitest, exports, and typed errors.
2. Load/compile the checked-in manifest schema and generated oasdiff schema.
3. Implement secure official-ref resolution, fetch validation, SHA-256 cache,
   atomic writes, offline cache hits, and concurrency locking.
4. Implement all three provider adapters and license/provenance metadata.
5. Implement/checksum-test the platform-specific oasdiff installer.
6. Implement bounded runner for breaking/changelog/schema and raw artifacts.
7. Implement normalizer, CST-based excerpts, deterministic IDs/sorting, and
   provider guidance.
8. Reproduce the exact OpenAI official pair in the existing fixture.
9. Research and add one crisp official Stripe historical version/deprecation
   fixture. If no pair meets the rubric within the timebox, document the search
   and keep the verified OpenAI pair as hero fallback; do not manufacture one.
10. Add a minimal Twilio same-service pair that exercises the adapter. It may be
    no-change, provided no-change behavior is explicitly tested.
11. Write unit, contract, integration, security, and reproducibility tests.
12. Write `HANDOFF.md`, run acceptance commands, and commit the handoff SHA.

## Tests and failure cases

At minimum cover:

- checksum match/mismatch, unsupported platform, corrupt/traversal archive,
  wrong `--version`, concurrent installer, and cached binary;
- branch/tag/full-SHA resolution, redirect to wrong host, oversized response,
  invalid commit/path, missing Twilio service, and cache integrity mismatch;
- oasdiff nonzero exit, timeout/abort, stderr redaction, invalid/oversized JSON,
  output schema mismatch, no changes (`[]`), and offline fixture run;
- all severity mappings, missing optional fields, unknown ID, malformed text,
  absent/ambiguous location, local `$ref` cycle, stable order/ID, and schema
  validation failure;
- exact OpenAI run yields two warning/breaking `request-property-removed`
  changes for `create-project` and `modify-project` at the documented paths;
- adapters reject any provider outside the three-value enum;
- fixture metadata includes source URLs, commits, hashes, generated time,
  oasdiff version/command, and upstream license.

Network tests must be opt-in (for example `TETHERIN_LIVE_PROVIDER_TESTS=1`) and
must never be required for deterministic CI. Unit tests use a local HTTP server
or injected fetch, never third-party mocks that hide URL/checksum behavior.

## Acceptance commands

Define package scripts so these commands work from repository root:

```bash
bun install --no-save
bun run --filter @tetherin/provider-pipeline format:check
bun run --filter @tetherin/provider-pipeline lint
bun run --filter @tetherin/provider-pipeline typecheck
bun run --filter @tetherin/provider-pipeline test
bun run --filter @tetherin/provider-pipeline test:fixture
bun run verify:planning
git diff --check
git status --short
```

`test:fixture` runs oasdiff locally against retained minimal official fragments
and validates raw + normalized outputs without network. `git status --short`
must show only intended owned changes before the handoff commit and nothing
afterward.

## Handoff artifact

Create `HANDOFF.md` containing:

- handoff commit SHA and planning base SHA;
- exported API and exact package/version list;
- provider source paths, selected old/new commits, spec/output hashes, licenses;
- oasdiff version, archive/checksum, raw schema hash, exact commands;
- test command results and whether network tests ran;
- Stripe hero decision and OpenAI fallback status;
- unsupported raw IDs/limitations and every proposed shared-contract change;
- confirmation that no secrets/full specs/lockfile are committed.

Person C must be able to merge the SHA, run the commands, call the exported API,
and receive a v1 manifest without asking you a question.

## Definition of done

Done means all three official adapters, pinned/reproducible oasdiff execution,
validated raw artifacts, normalized v1 manifests, security/error handling,
focused tests, source/license provenance, and the handoff commit exist. A README
mock, hard-coded manifest, hand-written diff, or unverified binary is not done.

Out of scope: consumer source analysis, Greptile, Codex, Git/PR creation,
state persistence/UI, auto-merge, additional providers, and general migration
guidance generated without official provider sources.
