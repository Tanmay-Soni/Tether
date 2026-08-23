# @tetherin/provider-pipeline

Person A's package turns two immutable official provider specifications into a
validated `tetherin.migration-manifest/v1`. It supports exactly OpenAI, Stripe,
and Twilio and uses oasdiff v1.29.1 as its only semantic contract-diff engine.

## Flow

1. Create an adapter with `createProviderAdapter(provider)`.
2. Resolve a full SHA, the provider's default branch, or a tag. Twilio also
   requires one safe `*.yaml` service basename.
3. Materialize both revisions in a content-addressed cache.
4. Compare them with `createOasdiffEngine(options).compare(...)` in both
   `breaking` and `changelog` mode. Each call retains validated raw JSON.
5. Pass one retained result to `buildMigrationManifest(...)`. The result is
   already validated against the repository's v1 manifest schema.

`getNormalizationDiagnostics(manifest)` returns deterministic internal excerpt
limitations (for example an ambiguous location or local-ref cycle) without
changing the stable cross-package JSON schema. Manifest command operands use
portable `OLD_SPEC_PATH`/`NEW_SPEC_PATH` labels; the immutable URLs, hashes, and
retained raw artifact bind those labels to the actual runner inputs.

The installer downloads only the pinned official oasdiff archive for the local
platform, verifies its SHA-256, extracts only `oasdiff` and `LICENSE`, validates
`oasdiff --version`, and records an integrity receipt. `OASDIFF_BIN` is accepted
only when it reports the same exact pinned version.

## Trust boundaries

- Runtime spec URLs always contain a lowercase 40-character commit.
- Provider and redirect hosts, repository identity, paths, response types, and
  response sizes are checked before bytes are cached.
- Cache hits are rehashed. Cache paths and locks reject symlinks and unsafe file
  types.
- Remote OpenAPI references are not enabled. Unsupported or ambiguous excerpt
  extraction returns `null`; the normalizer never invents a name or pointer.
- Empty raw diffs are valid engine results. The unchanged v1 manifest contract
  requires at least one change, so callers must not fabricate a no-change
  manifest.

Provider fixtures under `../../fixtures/providers` retain minimum
source-derived fragments, exact immutable provenance, raw outputs, and upstream
license text. They are not full provider specifications or evidence of a live
consumer migration.
