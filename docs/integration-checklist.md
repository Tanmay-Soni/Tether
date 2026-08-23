# Person C integration checklist

## Handoffs and dependency graph

- [ ] Start from the exact `PLANNING_BASE_SHA`; record it in the final handoff.
- [ ] Fetch and verify Person A branch head is exactly
      `da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3`, merge it first, then verify
      Person B branch head is exactly
      `57a602ba9de7357fd0385f20e23460b8642b74a9`; merge it and run its actual Bun
      checks. Run A's actual format, lint, type, unit, fixture, build, and
      opt-in live adapter commands. Record that B had no live Greptile smoke.
- [ ] After merging, align only A's package-manifest AJV dependency from 8.17.1
      to 8.20.0. Do not use a global override: it replaces ESLint's AJV 6 and
      breaks lint. Regenerate the lock and re-run both suites.
- [ ] Preserve B's public APIs and algorithms; add only explicit C-owned build or
      Node-sidecar glue if its no-build-script/Bun compatibility gates require it.
- [ ] Resolve no shared behavior by reimplementing either package.
- [ ] Replace all workspace placeholders with exact dependency pins, run
      `bun install`, inspect the graph, and commit one `bun.lock`.

## Local runtime

- [ ] Implement the exact root scripts `setup`, `demo`, `demo:fixture`,
      `demo:live`, and guarded `demo:reset`.
- [ ] Make `setup` validate Bun, Node SDK sidecar, Git, `rg`, `jq`, `gh auth`,
      redacted mode-specific secrets, oasdiff install/smoke, SQLite migrations,
      and the dedicated repo path/remote/base/clean status.
- [ ] Start UI and runner behind one command; print URL and mode; forward
      shutdown signals; clean child processes and local leases.
- [ ] Keep SQLite and run artifacts under ignored `.tetherin/` with user-only
      permissions, content digests, retention, and recovery tests.
- [ ] Implement one bounded SQLite worker lease and idempotent side-effect
      receipts; no hidden second orchestrator.

## Workflow and evidence

- [ ] Persist every state in the shared state machine plus append-only v1 events
      and materialized projections; refresh/restart preserves a run.
- [ ] Bind provider, impact, Codex, check, PR, Greptile, and gate evidence to
      exact immutable source and consumer/PR SHAs.
- [ ] Invalidate and safely re-enter the right state after base/head drift.
- [ ] Preserve live, fixture, and retained-real origins through API, DB, UI, and
      PR body. Fixture never satisfies live-ready.
- [ ] Cap Codex at the initial pass plus one review follow-up; business choices
      and a second blocked review become `NEEDS_INPUT`.

## Git and GitHub

- [ ] Canonicalize the dedicated consumer path; reject Tether root, wrong remote,
      dirty state, symlink escape, wrong base, or unexpected head.
- [ ] Create `tetherin/<provider>/<manifest-short-id>` without force, store an
      ownership marker, and refuse to overwrite human commits.
- [ ] Use local Git plus authenticated `gh` for push, draft PR create/update,
      PR/head/check reads, and no merge operation.
- [ ] Make the PR body include provider URLs/SHAs/hashes, oasdiff version/raw
      digest, manifest, confirmed impact, Codex summary, commands/results,
      Greptile status, evidence origin, exact head, and human-merge statement.
- [ ] Crash/retry tests converge on one branch and one PR.

## Dashboard and demo

- [ ] Implement every component, token, state, responsive rule, accessibility
      requirement, and visual acceptance item in `docs/design/dashboard.md`.
- [ ] Render the four customer stages, run history, provenance, grouped impact,
      focused diff, exact-head validation, activity stream, safe actions, and
      diagnostics from real persisted data.
- [ ] Exercise empty, loading, pending, degraded, failed, needs-input, fixture,
      retained-real, and live-ready states with no fake metric or finding.
- [ ] Complete the real OpenAI `geography` removal golden path. Keep Stripe and
      Twilio as honest adapter/contract tests, not claimed live migrations.
- [ ] Retain one genuine successful run and PR as an immutable async fallback;
      rehearse the exact three-minute script from `docs/demo/golden-path.md`.
- [ ] Test guarded recovery only against the dedicated demo repository.

## Final verification

- [ ] `bun install --frozen-lockfile`
- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] `bun run test:fixtures`
- [ ] `bun run test:integration`
- [ ] `bun run test:e2e`
- [ ] `bun run build`
- [ ] `bun run verify:planning`
- [ ] `git diff --check && git fsck --no-progress && git status --short`
- [ ] No token, secret, raw transcript, customer source body, or false live claim
      exists in tracked files, SQLite exports, screenshots, logs, or PR text.
