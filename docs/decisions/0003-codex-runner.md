# ADR 0003: Use the local Codex SDK behind a bounded adapter

- Status: accepted
- Date: 2026-08-23

## Decision

Use the official server-side
[`@openai/codex-sdk`](https://developers.openai.com/codex/sdk/) behind Person C's
`MigrationAgent` adapter. The official documentation says the TypeScript SDK
starts, continues, and resumes local Codex threads and requires Node 18+. Bun
remains the only operator entry point; the local supervisor launches a narrow
Node 22.18+ sidecar for the SDK and communicates through a typed local protocol.

The adapter runs Codex inside a disposable worktree derived from the validated
consumer base. It receives only the manifest, exact schema excerpts, official
guidance, confirmed evidence, repository instructions, and allowlisted test
commands. It gets no GitHub, Greptile, merge, or secret-bearing tool.

## Why

The SDK is the documented way to embed local Codex threads in an application.
Keeping the adapter behind the same local state machine preserves exact prompts,
bounded follow-up turns, diff inspection, and auditable results. The sidecar is
an honest compatibility boundary because the official SDK documentation names
Node, not Bun, as its supported server runtime.

## Guardrails

- Pin the SDK version in `bun.lock` and record it in every run.
- Create a fresh disposable checkout with an explicit absolute root and reject
  edits, symlink escapes, or generated changes outside allowlisted paths.
- Limit prompt bytes, changed files, changed lines, wall time, command count,
  output bytes, disk, and concurrent processes.
- Start with a scrubbed environment. Never include `.env*`, credentials,
  unrelated source, raw KB documents, or provider/customer secrets.
- Treat specs, source, and review comments as untrusted quoted data. They cannot
  change tool, path, network, or command policy.
- Reject test disabling, broad snapshots, config weakening, dependency churn,
  unrelated refactors, and business-semantic guesses.
- Allow at most two total Codex edit passes: the initial migration and one
  review-driven follow-up. A second blocked review becomes `NEEDS_INPUT`.
- Codex may commit only to the owned local branch. It may not push, open or merge
  a PR, change protections, or resolve Greptile comments.
