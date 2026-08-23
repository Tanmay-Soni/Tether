# Person C agent instructions

You own the laptop-only TetherIn product integration and the real golden path.
Read root `AGENTS.md`, `../BASELINES.md`, this file, `README.md`,
`../../design/dashboard.md`, all shared contracts/decisions, the threat model,
and the demo runbook completely before editing. "Complete Person C end-to-end"
authorizes the implementation and verification in those files without chat
context.

## Start rule

Start exactly `person-c/integration` from `PLANNING_BASE_SHA`. Merge verified
Person A commit `da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3`, then verified Person B
commit `57a602ba9de7357fd0385f20e23460b8642b74a9`, both with `--no-ff`. Apply the
C-owned A package-manifest AJV alignment documented in `README.md`, regenerate
`bun.lock`, run both actual Bun suites, and record all SHAs. Do not use moving
branch tips or recreate either behavior from plans.

## Ownership

You may create or change:

- `apps/**`;
- `packages/orchestrator/**`, `packages/local-state/**`,
  `packages/codex-runner/**`, `packages/git-local/**`,
  `packages/github-cli/**`, and `packages/config/**`;
- `packages/greptile-runtime/**` for necessary public-import/build or local
  sidecar glue around exact Person B exports, never replacement algorithms;
- final root scripts/configuration and `bun.lock`;
- local runbooks, the Person C handoff, and coordinated shared-contract versions.

Preserve A/B packages and tests. A proposed contract change requires a versioned
coordinated patch and updated producer/consumer tests. Never hide an integration
failure with a second oasdiff, Greptile, impact, or validation implementation.

## Non-negotiable behavior

- Bun is the operator and workspace command surface. The Codex SDK is isolated
  in a Node 22 sidecar because its official TypeScript support names Node.
- The app binds to localhost, stores only ignored local SQLite/artifacts, and
  operates on the exact configured consumer checkout outside this repository.
- Use local Git and authenticated `gh`. Never store a GitHub token, force push,
  overwrite human commits, or provide a merge path.
- Every side effect is idempotent and receipted. Every test/review/gate binds to
  the exact head and is invalidated by drift.
- Fixture, retained-real, and live are distinct. Fixture can never reach live
  `PR_READY`; a pending live review remains pending.
- Codex edits only within the disposable allowlisted checkout. At most one
  review follow-up is allowed. Do not disable tests or guess business semantics.
- Implement the premium dashboard from `../../design/dashboard.md` using one
  Radix foundation, Phosphor icons, supplied chain icon, and no fake data/image.
- TetherIn never auto-merges. A human owns the final decision.

## Finish rule

Run every README acceptance command, complete a genuine live golden path and
guarded recovery, create `HANDOFF.md`, commit all intended integration changes,
push without force, and report immutable SHAs and URLs. A polished fixture alone,
a screen disconnected from SQLite, stale review evidence, or an unpushed branch
is not done.
