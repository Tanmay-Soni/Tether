# Provenance and dependency pins

Research anchor: 2026-08-23. Runtime jobs always record the exact artifacts they
actually use; these planning anchors are not a license to follow mutable heads.

## oasdiff

- Official repository: <https://github.com/oasdiff/oasdiff>
- Documentation: <https://github.com/oasdiff/oasdiff/blob/v1.29.1/docs/BREAKING-CHANGES.md>
- Release: <https://github.com/oasdiff/oasdiff/releases/tag/v1.29.1>
- Release commit: `2bb87bada404d350cb56e5504e8bd5d76f6159bf`
- Official checksums: <https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/checksums.txt>
- License: Apache-2.0

Pinned archive SHA-256 values used by Person A:

```text
759cc5703d9335c441ad84a7074c705486b2c493f79bcfdf251c7a9c788b1171  oasdiff_1.29.1_darwin_all.tar.gz
541f7c66c933495fceef24eaf5c48aa66c19069f366f7bd0a60a6a4820c5e533  oasdiff_1.29.1_linux_amd64.tar.gz
8bc247f0280f62ca73599265db0d984e853d7df6e714dad6ead85afc7cfc5883  oasdiff_1.29.1_linux_arm64.tar.gz
```

Run `oasdiff --version`, not `oasdiff version`. Generate and retain the raw output
schema with `oasdiff schema`.

## Provider sources

| Provider | Repository/default branch | Spec path | Planning head | License |
| --- | --- | --- | --- | --- |
| OpenAI | <https://github.com/openai/openai-openapi> `main` | `openapi.yaml` | `f85dbe223d40e1a31cba812ab2d755c7e98a92a3` | MIT |
| Stripe | <https://github.com/stripe/openapi> `master` | `openapi/spec3.yaml` or JSON equivalent verified by adapter | `f6c2a48fbac2819d1feba8143d942ffc65e1c0d2` | MIT |
| Twilio | <https://github.com/twilio/twilio-oai> `main` | service files under `spec/yaml` | `b02705eb7dbf63e0925375779730a4fc93c3b0b4` | MIT |

Person A must verify path existence at each selected immutable commit. Twilio is
a directory of service specs, not one invented aggregate file; compare the same
service file across revisions or build a deterministic documented bundle.

## OpenAI golden fixture

- Old commit: <https://github.com/openai/openai-openapi/commit/13c6a94fca988f8be3c5de09d73f012709985d10>
- New commit: <https://github.com/openai/openai-openapi/commit/f85dbe223d40e1a31cba812ab2d755c7e98a92a3>
- Old spec SHA-256: `a85b8a1274f0f65bcddbb8762993da9075846e2c97a5c81cf6822c9568038c33`
- New spec SHA-256: `db5d7478feae10b4d331834c60d9765a8aa042e38419f9b1694288c11aa8ebc8`
- Retained pretty JSON SHA-256: `b379acf15f4b0663c43da2701b387acaa9924c11e8005a2a3cea9be521fe9746`

## Codex

- Official SDK docs: <https://developers.openai.com/codex/sdk>
- Planning SDK package anchor: `@openai/codex-sdk@0.149.0`
- Official GitHub Action docs: <https://developers.openai.com/codex/github-action>
- Optional action source: <https://github.com/openai/codex-action>
- `v1` commit at research time: `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`

Person C must reverify the selected package/action and pin it exactly in the
lockfile/workflow. Do not silently upgrade during a demo run.

## Greptile

- Official docs index: <https://www.greptile.com/docs/llms.txt>
- MCP setup: <https://www.greptile.com/docs/mcp-v2/setup>
- MCP tools: <https://www.greptile.com/docs/mcp-v2/tools>
- Graph context: <https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context>
- PR review anatomy: <https://www.greptile.com/docs/code-review/first-pr-review>

Greptile is a hosted integration, not vendored code. Save tool names, request
metadata with secrets removed, response digests, IDs, timestamps, KB versions,
truncation, and execution mode. Do not commit customer response bodies.
