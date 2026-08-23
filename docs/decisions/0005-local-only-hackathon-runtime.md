# ADR 0005: Run the hackathon product only on the operator laptop

- Status: accepted
- Date: 2026-08-23

## Decision

The hackathon product is a local control room, runner, and SQLite audit store.
The configured demo consumer repository is a separate checkout. Git and an
existing authenticated `gh` session perform branch and draft PR operations. The
app accepts no inbound remote events and has no merge capability.

## Why

One real, inspectable golden path is more valuable than infrastructure breadth.
The local boundary reduces moving parts while preserving the difficult product
work: immutable spec provenance, semantic oasdiff output, repository-aware
impact evidence, bounded Codex editing, exact-head validation, Greptile review,
and a real human-owned draft PR.

## Consequences

- SQLite events and redacted artifacts survive UI refresh and local restart.
- A bounded lease prevents two local workers from acting on one run.
- `gh auth token` supplies transient GitHub authentication at command time; it
  is never copied into configuration, logs, SQLite, or artifacts.
- External calls are limited to official provider sources, OpenAI/Codex,
  Greptile, and the configured GitHub repository and PR.
- Scaling, remote tenancy, and unattended execution are outside the hackathon
  contract and must not leak into Person C's acceptance criteria.
