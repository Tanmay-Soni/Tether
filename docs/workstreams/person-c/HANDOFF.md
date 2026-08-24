# Person C implementation handoff

## Integration identity

- Planning base: `60d39a64f0e8eee17e2b942b879377214fa2f80a`
- Person A: `da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3`
- Person A merge: `40c4636`
- Person B: `57a602ba9de7357fd0385f20e23460b8642b74a9`
- Person B merge: `6ee7665`
- Dependency/build alignment: `3ca41e45ebbd46110c645f1b5c22c971152aea06`
- Product checkpoint: `89fa6d0`
- Live-boundary correction: `8f22ac3`

Both completed workstreams were merged conflict-free and retained. Person A's
algorithm remains the only OpenAPI diff/normalization layer; Person B's public
adapter remains the Greptile/deterministic evidence and composite-gate layer.

## Implemented architecture

- `packages/config`: strict loopback/local path and secret-safe configuration.
- `packages/orchestrator`: canonical hashing, shared AJV contracts, semantic
  state machine, actions, and live-ready assertion.
- `packages/local-state`: mode-0600 Bun SQLite, migrations, append-only event
  triggers, projections, idempotent intents/leases, receipts, and artifacts.
- `packages/git-local` and `packages/github-cli`: argument-array subprocesses,
  exact repository guards, bounded diffs, isolated worktrees, non-force pushes,
  idempotent draft PR discovery/creation, and exact-head reads.
- `packages/codex-runner`: official `@openai/codex-sdk` Node sidecar with
  workspace-write sandbox, no approvals/network, bounded prompt/output/time,
  checkout allowlists, and redacted execution records. It reuses Codex login or
  accepts an optional local API key.
- `apps/runner`: Stripe v1617/v1618 detection, shared-contract validation,
  Person B enrichment plus a provenance-labeled deterministic SDK-alias
  supplement, Codex migration, lock preparation, checks, GitHub, Greptile, and
  exact-head gate orchestration.
- `apps/web`: a persisted pearl/smoke control room with semantic stage rail,
  evidence panels, event ledger, action bar, diagnostics dialog, skip link,
  live announcements, keyboard focus, reduced-motion behavior, and responsive
  collapse.

## Stripe hero evidence

The live run used complete official specs at commits `d535320...` and
`9fa5188...` with only `^/v1/invoices/upcoming(/lines)?$` passed to oasdiff.
Raw evidence contained exactly the two expected level-3 findings and no
create-preview finding. The manifest adds the official Stripe Basil changelog
as separate provider guidance.

Person B plus the C-owned deterministic alias supplement confirmed the direct
SDK call, typed client boundary, API-version configuration, wrappers, route,
renewal job, fixtures, and direct/indirect tests. The supplement labels itself
as deterministic evidence and never as a Greptile result.

## Live rehearsal result and limitations

The official Codex SDK produced consumer commit
`a21406dbc650ec6e83f112213009dfed19a952c1`. The exact configured consumer check
passed with 12/12 offline tests and no Stripe credentials. Draft PR:
https://github.com/Tanmay-Soni/tetherin-stripe-demo/pull/1

The authenticated GitHub identity has `pull: true` and `push: false` on the
upstream consumer, so the commit was pushed to the same repository's GitHub fork
and PR 1 targets the required upstream `main`. Direct upstream branch ownership
remains externally blocked until a maintainer grants write permission.

The supplied Greptile credential authenticated to MCP, but
`trigger_code_review` returned a repository-not-visible response for the
consumer. No review/finding or live-ready validation was fabricated. Install or
authorize the Greptile GitHub App for `Tanmay-Soni/tetherin-stripe-demo`, then
resume review on unchanged PR head `a21406d...`.

No `.env.local`, credential, SQLite database, raw local source bundle,
temporary worktree, task runtime, or unredacted external payload is committed.
