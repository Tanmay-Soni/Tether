# Person A agent instructions

You own the provider-to-manifest pipeline. Read this file and `README.md` in this
directory completely before editing. The phrase "Do Person A's work end-to-end"
authorizes every task and verification step in that README, but not Person B or
Person C work.

## Start rule

Read `../BASELINES.md`, verify `git rev-parse HEAD` equals its
`PLANNING_BASE_SHA`, and create exactly `person-a/provider-diff`. Stop if your
branch contains implementation commits not descending from that base.

## Ownership

You may create or change only:

- `packages/provider-pipeline/**`
- `fixtures/providers/**`
- `docs/workstreams/person-a/HANDOFF.md`

Do not edit root files, `contracts/**`, apps, Person B/C packages or plans, or
`bun.lock`. If a shared contract/config change is necessary, put a precise
proposal in `HANDOFF.md`; Person C applies it after integration.

## Non-negotiable behavior

- `oasdiff` v1.29.1 is the sole semantic diff engine. Do not implement a second
  compatibility algorithm or silently reinterpret its verdict.
- Accept only official OpenAI, Stripe, and Twilio repositories/specs. Every
  runtime spec URL must contain a full 40-character commit and be SHA-256 hashed.
- Preserve raw `breaking` and `changelog` JSON before normalization.
- Verify the upstream binary checksum and `oasdiff --version`; never download a
  floating `latest`, use a mutable spec URL, or invoke through a shell string.
- Reject/mark unsupported raw changes honestly; never fabricate a property,
  operationId, schema excerpt, guidance link, or source location.
- Do not vendor full specs. Test fixtures must be the minimum source-derived
  fragments needed and must include provenance/license metadata.
- Never log credentials or enable remote `$ref` fetching by default.

## Finish rule

Run every command in the README acceptance section, write `HANDOFF.md`, commit
all owned files, and report the immutable handoff SHA. Do not push to main, merge
another workstream, or squash after handoff.
