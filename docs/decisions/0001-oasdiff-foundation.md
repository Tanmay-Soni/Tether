# ADR 0001: Pin oasdiff as the contract-diff foundation

- Status: accepted
- Date: 2026-08-23

## Decision

Use the official [`oasdiff`](https://github.com/oasdiff/oasdiff) executable as
the only semantic OpenAPI diff engine. Pin release `v1.29.1`, whose tag resolves
to commit `2bb87bada404d350cb56e5504e8bd5d76f6159bf`, and verify its official
`checksums.txt` before extraction. Run both `breaking --format json` and
`changelog --format json`; preserve raw outputs and normalize them only after
validation against `oasdiff schema`.

## Why

oasdiff already maintains the compatibility catalog, request/response direction
rules, severity model, OpenAPI parsing, and JSON Schema for its output. Rewriting
these rules would produce a shallow, unauditable demo. TetherIn adds provenance,
provider adapters, consumer impact, migration, and review—not a competing diff.

## Constraints

- Numeric oasdiff levels are `3=ERR`, `2=WARN`, `1=INFO`; ERR and WARN are
  breaking according to upstream `checker.Level.IsBreaking`.
- Do not use floating download URLs, container tags, package versions, or `main`.
- Do not run `--allow-external-refs` by default. Materialize allowed references
  inside an isolated cache and record them explicitly if a provider requires it.
- Upgrading oasdiff requires fixture regeneration, schema compatibility review,
  checksum changes, and an ADR update.
- Preserve the Apache-2.0 license/notice obligations documented in `NOTICE.md`.

## Consequences

TetherIn's normalized manifest is intentionally smaller than the raw oasdiff
format, but always links back to raw JSON, source lines, version, and hashes. A
normalizer bug cannot erase the retained upstream evidence.
