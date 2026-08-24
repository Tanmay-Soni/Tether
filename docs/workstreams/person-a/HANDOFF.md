# Person A handoff — provider ingestion and API change detection

## Delivery identifiers

- Branch: `person-a/provider-diff`
- Immutable planning base: `37472c40de06251bf5a49b53239f912471a9b8f9`
- Provider-pipeline implementation commit: `cd9a06f`
- Code-and-fixtures handoff commit: `ac9cfc2`
- This document is committed as a descendant of `ac9cfc2`; use the pushed
  branch tip reported with the delivery when integrating so this document is
  included.

The branch is based directly on the required planning SHA. It contains only
Person A-owned paths: `packages/provider-pipeline/**`, `fixtures/providers/**`,
and this file.

## Exported API and integration flow

`@tetherin/provider-pipeline@0.1.0` exports:

- `createProviderAdapter(provider)` and the common `ProviderAdapter` interface;
- `createOasdiffEngine(options)` and `ContractDiffEngine`;
- `buildMigrationManifest(input)`;
- `getNormalizationDiagnostics(manifest)`;
- `PipelineError`, all public input/output types, and typed error codes.

The retained comparison result contains `rawMode`, `rawChanges`,
`rawArtifactPath`, and `rawSha256`. Spread that result into normalization; the
executed oasdiff mode is intentionally carried by the result rather than
accepted as a second caller-controlled value.

```ts
const adapter = createProviderAdapter("openai");
const oldRevision = await adapter.resolveRevision(oldCommit);
const newRevision = await adapter.resolveRevision(newCommit);
const oldSpec = await adapter.materialize(oldRevision, specCacheDir);
const newSpec = await adapter.materialize(newRevision, specCacheDir);

const engine = createOasdiffEngine({ cacheDir: toolCacheDir });
const comparison = await engine.compare({
  oldSpec,
  newSpec,
  mode: "breaking",
  artifactDir,
});

const manifest = await buildMigrationManifest({
  provider: adapter.provider,
  oldSpec,
  newSpec,
  ...comparison,
  guidance: await adapter.guidance(comparison.rawChanges),
});
const excerptDiagnostics = getNormalizationDiagnostics(manifest);
```

`getNormalizationDiagnostics` uses an object-identity side channel so it does
not alter the stable v1 JSON Schema. Person C must record these diagnostics
before serializing or transferring the manifest.

Package versions are exact: Node `>=22.18 <25`, pnpm `11.23.0`, `ajv@8.17.1`,
`ajv-formats@3.0.1`, `yaml@2.8.1`, `@eslint/js@9.34.0`,
`@types/node@24.3.0`, `eslint@9.34.0`, `prettier@3.6.2`,
`typescript@5.9.2`, `typescript-eslint@8.41.0`, and `vitest@3.2.4`.

## Provider coverage and fixture provenance

All adapters resolve a branch, tag, or full SHA to a lowercase full commit;
materialize only canonical immutable HTTPS raw URLs; verify response host,
content type, size, and checksum; and use the same `ProviderAdapter` interface.
Cache hits are rehashed, writes are atomic, retries are bounded, and unsafe
paths, redirects, symlinks, and file types are rejected.

### OpenAI

- Repository/path/default branch: `openai/openai-openapi`, `openapi.yaml`,
  `main`; repository license MIT.
- Fixture pair: `13c6a94fca988f8be3c5de09d73f012709985d10` ->
  `f85dbe223d40e1a31cba812ab2d755c7e98a92a3`.
- Full spec SHA-256: old
  `a85b8a1274f0f65bcddbb8762993da9075846e2c97a5c81cf6822c9568038c33`;
  new `db5d7478feae10b4d331834c60d9765a8aa042e38419f9b1694288c11aa8ebc8`.
- Official breaking output SHA-256:
  `07640494838ec2e0ebce6af7098cf6e46fd269999e051aa6fa2d694e837ee382`.
- Official changelog output SHA-256:
  `417e8be303beedeec97b5c26fabc9ef94e85f29ccfb6c0c6f8693bf1feb0aea2`.
- Canonical manifest SHA-256:
  `b4458eec684a821e95199debdd9b0c1a4aafad4b10b83bc88f357809413ddcad`.
- Result: two warning/breaking `request-property-removed` findings for
  `create-project` and `modify-project`, with exact fingerprints, source URLs,
  source ranges, property pointers, and source-derived excerpts.

This remains the verified demo fallback.

### Stripe

- Production repository/path/default branch: `stripe/openapi`,
  `latest/openapi.spec3.yaml`, `master`; repository license MIT.
- Live adapter pair: `d0f9e4c144d0927877afa13586f6efc78da5b0fc` ->
  `d608561910d9b3a8c36da7bb503a51d8c201618f`, SHA-256
  `dd1a5abc19f904062b0a429857c9a87ae036c7e590e6470d28d52ea770a99b7b` ->
  `c931738711512db72e6c477ff43c02020d622bb6b15f0e050bc47af3aea0fb13`.
- Historical research fixture, explicitly labeled legacy:
  `openapi/spec3.yaml` at
  `60054ca82fe7b25692521645dadf4d9671f6da75` ->
  `ccf293e84c28a7f557e92434b6ff858855f30a4c`, full SHA-256
  `c87b2f4fb565e5af04a6bc49f55b495441d51ceba1a2ec3884c56b4aa00a68e9` ->
  `fec9f76d30b5f2fbe5ed297fb3072a6a19ab96dfa800a8171ad966b433250f33`.
- The historical pair adds explicit `[Deprecated]` prose but no OpenAPI
  `deprecated` field. Pinned oasdiff honestly returns `[]` in both modes.

Stripe is not hero-eligible. Its version/deprecation documentation is useful
provider guidance, but it is not a semantic breaking-change fixture; use the
OpenAI pair for the end-to-end demo.

### Twilio

- Repository/default branch: `twilio/twilio-oai`, `main`; the caller must select
  one safe `spec/yaml/*.yaml` service basename. Repository license is MIT; the
  selected spec declares Apache 2.0 and that declaration is retained.
- Fixture service: `twilio_accounts_v1.yaml`.
- Pair: `591755b562834daae097da2371e821f349c5f489` ->
  `b02705eb7dbf63e0925375779730a4fc93c3b0b4`.
- The official service blob is byte-identical at both revisions, SHA-256
  `d1a3624923ab21eb34ad1d60ed7987b9132049589a612b37ead592ea18e46f50`;
  both oasdiff modes return `[]`.

All three fixture directories include the exact upstream MIT license text and
hash. The oasdiff installer retains its upstream Apache-2.0 license.

## oasdiff pin and retained artifacts

- Version/tag/release commit: `1.29.1`, `v1.29.1`,
  `2bb87bada404d350cb56e5504e8bd5d76f6159bf`.
- Darwin universal archive:
  `759cc5703d9335c441ad84a7074c705486b2c493f79bcfdf251c7a9c788b1171`.
- Linux amd64 archive:
  `541f7c66c933495fceef24eaf5c48aa66c19069f366f7bd0a60a6a4820c5e533`.
- Linux arm64 archive:
  `8bc247f0280f62ca73599265db0d984e853d7df6e714dad6ead85afc7cfc5883`.
- Verified Darwin executable SHA-256:
  `9f3e7f3de57abcd78222bdf6fb2ae026d50a870b4a5b0ae65dc288fe8079cb08`.
- Retained oasdiff license SHA-256:
  `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`.
- Exact `oasdiff schema` stdout SHA-256:
  `c414492d132fbc2a4b230a3ebd90bebbd2f4fd51b2e44ac58e00620a89561647`.

Runtime commands are exactly:

```text
oasdiff breaking --format json OLD_LOCAL_SPEC NEW_LOCAL_SPEC
oasdiff changelog --format json OLD_LOCAL_SPEC NEW_LOCAL_SPEC
oasdiff schema
```

The runtime uses argument arrays with no shell, validates the runtime schema,
retains raw stdout before projection, hashes it, and fails visibly on nonzero
exit, timeout/abort, invalid or oversized JSON, schema drift, and artifact
checksum/content mismatch. It never implements a second semantic diff engine.

## Acceptance results

Executed on 2026-08-23 with Node 24.19.0 and pnpm 11.23.0:

- `pnpm install --lockfile=false` — passed.
- `pnpm --filter @tetherin/provider-pipeline format:check` — passed.
- `pnpm --filter @tetherin/provider-pipeline lint` — passed, zero warnings.
- `pnpm --filter @tetherin/provider-pipeline typecheck` — passed.
- `pnpm --filter @tetherin/provider-pipeline test` — 8 files, 111 tests
  passed.
- `pnpm --filter @tetherin/provider-pipeline test:fixture` — 1 file, 8 tests
  passed using the checksum-verified v1.29.1 executable; no skip path.
- `pnpm --filter @tetherin/provider-pipeline test:live` — 3/3 adapters passed
  against immutable official pairs through the common interface.
- Full official OpenAI URL `breaking` and `changelog` runs — canonical output
  matched both retained official fixtures exactly.
- Full-spec OpenAI manifest regeneration — byte-identical to `manifest.json`;
  full source hashes matched the values above.
- Manifest schema compilation/validation and runtime oasdiff schema validation —
  passed in unit/fixture suites.
- `git diff --check` — passed after source-fixture whitespace normalization.
- Secret, generated-junk, fixture-size, scope, and unrelated-change review —
  passed. No secret, full provider spec, dependency lockfile, build output, or
  unrelated file is committed.

`pnpm verify:planning` reports
`missing required file: docs/workstreams/BASELINES.md` on the required Person A
base because that file does not exist at `37472c4`. The same command passes in a
separate current-`origin/main` worktree at
`acdb2229d837d1e7cba43f189f10ea783d1d1be7`. This branch does not modify shared
planning files to mask the baseline mismatch.

## Limitations and proposed shared changes

No stable JSON Schema was changed.

1. `docs/provenance.md` and
   `contracts/examples/openai-geography.manifest.json` retain the stale raw
   output hash
   `b379acf15f4b0663c43da2701b387acaa9924c11e8005a2a3cea9be521fe9746`.
   The bytes in `contracts/fixtures/oasdiff/openai-geography.breaking.json`
   actually hash to
   `07640494838ec2e0ebce6af7098cf6e46fd269999e051aa6fa2d694e837ee382`.
   Person C should update those shared references and may replace the hand-made
   example with Person A's deterministic manifest; Person A did not edit them.
2. The v1 manifest schema requires `changes.minItems = 1`. An honest no-change
   oasdiff result therefore cannot become a v1 manifest. Person C must model it
   as a visible no-change workflow outcome and must not fabricate a change. A
   future schema version could add an explicit no-change result.
3. On a completely fresh pnpm 11 checkout, the shared workspace should allow
   the exact `esbuild` install script required by Vitest (for example
   `allowBuilds: { esbuild: true }`) before generating the integration lockfile.
   That shared-file decision belongs to Person C.
4. Unknown oasdiff IDs are retained with `subject.kind = "other"`; only the
   explicit endpoint, request/response property, parameter, schema, and security
   ID map is projected semantically. Malformed required fields or levels fail
   with `MANIFEST_INVALID` rather than being guessed.
5. Excerpt extraction resolves local references only, with cycle/depth caps.
   Remote references, ambiguous/missing locations, parse failures, and subjects
   that cannot be found return `null` plus a deterministic internal diagnostic.
6. oasdiff may report a bare input basename. The normalizer accepts only the
   exact expected basename in that case; full paths and source URLs must match
   exactly. The bounded local runner and immutable artifact checksum are the
   surrounding trust boundary.
7. A malicious same-user process with write access to the cache can still race
   a cooperative lock cleanup. Cache directories are mode `0700`, entries are
   rehashed, and symlinks/unsafe types are rejected, but the cache is not a
   security boundary against an already-compromised local account.
8. Provider guidance currently returns an honest empty list unless the caller
   supplies validated official repository/docs/changelog entries. No generic or
   generated migration guidance is synthesized.

## Exact Person C handoff

1. Fetch `origin/person-a/provider-diff` and verify it descends directly from
   `37472c40de06251bf5a49b53239f912471a9b8f9`.
2. On Person C's integration branch, merge the pushed Person A branch tip (do
   not merge Person A into `main` directly). Preserve commits `cd9a06f` and
   `ac9cfc2` plus the descendant documentation commit.
3. Add the package to the shared pnpm lockfile and make the narrow shared
   `esbuild` build-policy decision described above. Do not change Person A's
   exact dependency versions or oasdiff pin.
4. Apply the stale shared-hash correction above. Keep the stable v1 schema
   unchanged unless a separately reviewed schema-version change is approved.
5. Use the exported flow shown above. Retain `rawArtifactPath`, `rawSha256`, and
   `rawMode`; record excerpt diagnostics before serialization; handle `[]` as a
   no-change outcome before calling `buildMigrationManifest`.
6. Use OpenAI's geography-removal pair for the golden end-to-end run. Do not
   present the Stripe prose-only pair or Twilio byte-identical pair as a
   breaking migration.
7. Run every acceptance command in the previous section from the integrated
   tree, including the opt-in live test when network is available, then run the
   product-level Person C contract and orchestration suites.

No Person B Greptile behavior or Person C orchestration, dashboard, Codex,
GitHub PR lifecycle, database, UI, or deployment code is included.
