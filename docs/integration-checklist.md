# Person C integration checklist

## Before merging workstreams

- [ ] Verify A and B branch heads descend from `PLANNING_BASE_SHA`.
- [ ] Read both handoff notes; confirm schemas consumed are the checked-in v1 files.
- [ ] Run secret scan and `git diff --check` on each branch.
- [ ] Confirm A did not implement a custom diff engine or vendor full specs.
- [ ] Confirm B distinguishes live/fixture and does not claim a native Greptile blast-radius/validator endpoint.
- [ ] Merge A with `--no-ff`, run A tests; then merge B with `--no-ff`, run B tests.
- [ ] Resolve ownership violations before adding integration glue.

## Shared runtime

- [ ] Generate one pnpm lockfile and pin all production dependencies.
- [ ] Generate TypeScript/runtime validators from the four JSON Schemas.
- [ ] Add Postgres migrations with unique idempotency key and append-only events.
- [ ] Implement four-stage dashboard with provenance and live/fixture/degraded badges.
- [ ] Implement least-privilege GitHub App token/webhook verification and repo authorization.
- [ ] Implement isolated Codex SDK runner, command allowlist, diff policy, and redaction.
- [ ] Make all external operations retryable and persist IDs before polling.

## End-to-end gates

- [ ] One official provider change enters and produces raw oasdiff JSON + manifest.
- [ ] Consumer repo/base authorization is proven before source access.
- [ ] KB evidence (when available) and deterministic confirmation remain separately visible.
- [ ] Codex patch is minimal and required checks pass on recorded head SHA.
- [ ] Draft PR includes source SHAs/URLs, normalized changes, impact, and test evidence.
- [ ] Greptile review is explicitly triggered for the draft and collected asynchronously.
- [ ] Stale review, unresolved comment, failed check, partial coverage, and fixture evidence block live-ready.
- [ ] Follow-up patch invalidates prior checks/review and repeats the gate.
- [ ] Human is the only actor able to merge.

## Rehearsal and release

- [ ] Rehearse Stripe version/deprecation hero; use exact OpenAI pair if it misses rubric.
- [ ] Retain a real async rehearsal; never script a false Greptile result.
- [ ] Test duplicate webhook, base drift, rate limit, permission denial, timeout, and no-impact paths.
- [ ] Verify no customer source/secrets in logs, DB dumps, screenshots, or fixtures.
- [ ] Run all unit/integration/E2E commands, `pnpm verify:planning`, and `git diff --check`.
- [ ] Document deployment/rollback and demo recovery steps.
