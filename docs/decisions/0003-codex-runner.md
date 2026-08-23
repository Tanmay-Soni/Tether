# ADR 0003: Use the Codex SDK behind a TetherIn migration adapter

- Status: accepted
- Date: 2026-08-23

## Decision

Use the official server-side [`@openai/codex-sdk`](https://developers.openai.com/codex/sdk)
as the default `MigrationAgent`. Person C pins the package version (planning
research anchor: `0.149.0`) and runs it in an ephemeral, isolated checkout with
workspace-write access, no customer secrets, restricted network, bounded time,
and an explicit allowlist of test commands.

The official [`openai/codex-action@v1`](https://developers.openai.com/codex/github-action)
is an optional deployment adapter. If enabled, pin the action to the immutable
commit behind v1 (planning anchor:
`86365089eb2b84e0a8fb0717b304f8bdcb13b20e`), use `persist-credentials: false`,
the narrowest sandbox, trusted trigger users, and separate write/post steps.

## Why

The SDK is documented for embedding Codex in an application and CI/CD. It lets
TetherIn own one observable state machine, retain thread/run evidence, and
perform follow-up turns after Greptile review. A GitHub workflow remains useful
for customers that require execution inside their own runner, but it must not
become a second hidden orchestrator.

We do not add another workflow framework in the hackathon path. In particular,
no release-sync framework may obscure oasdiff provenance, the Greptile evidence
boundary, or TetherIn's persisted job state.

## Guardrails

- Supply only the normalized manifest, exact schema excerpts, official guidance,
  confirmed evidence, and repository instructions needed for this migration.
- Never provide provider/customer credentials to the agent.
- Reject edits outside the allowlisted checkout and validate the resulting diff.
- Codex may commit to its job branch but may not merge, change branch protection,
  weaken tests, or silence the validation gate.
- A follow-up run receives exact Greptile comments as untrusted evidence and a
  scoped instruction to address or explain them; it does not blindly apply
  suggested code.
