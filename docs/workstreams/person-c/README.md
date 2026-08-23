# Person C: local product integration and golden path

This is the complete work package for Person C. It requires no chat history.
Read this file, the adjacent `AGENTS.md`, root `AGENTS.md`, and
`../../design/dashboard.md` completely before editing.

## Mission

Integrate Person A's provider/oasdiff package and Person B's Greptile/evidence
package into the full laptop-only TetherIn hackathon product:

- one Bun operator command surface;
- a local Next.js dashboard and bounded runner;
- durable append-only workflow evidence and projections in SQLite;
- Codex migrations through the official local SDK in a disposable checkout;
- safe local Git and authenticated `gh` operations against one dedicated
  consumer repository;
- a real draft PR, exact-head checks, Greptile review, composite validation, and
  human-only merge;
- one rehearsed real golden path plus a clearly labeled retained genuine run for
  asynchronous fallback.

Person C owns the glue and outcome. Do not reimplement provider diffing, impact
analysis, Greptile transport, or validation policy. Consume the exported A/B
interfaces and record their immutable handoff SHAs.

## Explicit boundary

TetherIn runs on the operator's laptop and accepts no inbound remote traffic.
There is no customer installer, remote TetherIn service, repository-auth app,
remote account or infrastructure surface, unattended worker fleet, or merge
capability. External calls are limited to official provider/spec
sources, OpenAI/Codex, Greptile, and the configured GitHub repository/PR.

The operator uses:

```bash
bun install
cp .env.example .env.local
bun run setup
bun run demo
```

At planning time only `verify:planning` exists. Implement every other named root
script in this work package. Do not make documentation pass by adding no-op
scripts or fixture-only aliases.

## Prerequisites and branch

Required system tools:

- Bun `1.4.x` for packages, application processes, scripts, and tests;
- Node `>=22.18 <25` only for the officially supported Codex SDK sidecar;
- Git, GitHub CLI, `rg`, `jq`, and a SHA-256 utility;
- an authenticated `gh` session with write access to the dedicated demo repo;
- an absolute, separate, clean checkout of that repo;
- OpenAI and Greptile credentials for live mode only;
- the verified Person B handoff SHA below; Person A may still be pending.

Read `../BASELINES.md`, copy `PLANNING_BASE_SHA`, and verify it is on
`origin/main`. Person B is a concrete completed input. Fetch and prove its exact
remote head before merging:

```bash
git fetch origin --tags
git cat-file -e <PLANNING_BASE_SHA>^{commit}
git switch --detach <PLANNING_BASE_SHA>
git switch -c person-c/integration

git fetch origin person-b/greptile-evidence
test "$(git rev-parse origin/person-b/greptile-evidence)" = "57a602ba9de7357fd0385f20e23460b8642b74a9"
git merge --no-ff 57a602ba9de7357fd0385f20e23460b8642b74a9
bun install
bun run --filter @tetherin/greptile test
bun run --filter @tetherin/greptile test:fixtures
```

Person A is independent and may not yet have a remote handoff. Begin C scaffolding
with the checked-in `contracts/examples/openai-geography.manifest.json`; label it
fixture input. Once the coordinator supplies A's immutable SHA, fetch it, verify
its branch head, merge it with `--no-ff`, run A's actual Bun acceptance commands,
and replace fixture plumbing with its public provider API. Do not choose a local
or ambiguous A commit. Final live completion still requires A.

Inspect both handoff notes and confirm ownership, schema versions, dependency
licenses, fixture/live labels, test results, and limitations. If A changes a
shared contract without a versioned proposal, stop with a concrete integration
blocker. Do not substitute a local stub and call it done.

## Verified completed Person B input

Remote inspection on 2026-08-23 found exactly one non-main implementation branch
and no open or closed PR:

```text
branch  origin/person-b/greptile-evidence
head    57a602ba9de7357fd0385f20e23460b8642b74a9
commit  feat(greptile): implement evidence adapter
base    37472c40de06251bf5a49b53239f912471a9b8f9
```

The commit adds only `packages/greptile/**`, `fixtures/greptile/**`, and
`docs/workstreams/person-b/HANDOFF.md`. Merge the exact commit, never a moving
branch name alone, and do not rewrite its algorithms.

The real public entry point exports:

```ts
import {
  createGreptileEvidenceAdapter,
  createCodeValidationGate,
  FixtureGreptileTransport,
  GreptileAdapterError,
  buildLiteralQueries,
  sdkMethodCandidates,
  type AuthorizedConsumerRevision,
  type CheckResult,
  type CodeValidationGate,
  type ConfirmedGreptileTool,
  type CoverageResult,
  type GateOptions,
  type GreptileEvidenceAdapter,
  type GreptileOptions,
  type GreptileTransport,
  type PullRequestRevision,
  type ReviewComment,
  type ReviewEvidence,
  type ReviewHandle,
} from "@tetherin/greptile";
```

Invoke it with the exact implemented signatures:

```ts
const greptile = createGreptileEvidenceAdapter({
  apiKeyEnv: "GREPTILE_API_KEY",
  endpoint: "https://api.greptile.com/mcp",
  maxPollMs: 8 * 60_000,
});

const blastRadiusUnknown = await greptile.enrichBlastRadius({
  manifest,
  consumer: {
    repository: configuredOwnerRepo,
    defaultBranch: configuredBaseBranch,
    baseSha: frozenConsumerBaseSha,
    authorizedAt: runCreatedAt,
  },
  checkoutPath: readOnlyConsumerCheckout,
  executionMode,
  signal,
});
// Validate/canonicalize tetherin.blast-radius-report/v1 before persistence.

const reviewHandle = await greptile.triggerReview({
  repository: configuredOwnerRepo,
  defaultBranch: configuredBaseBranch,
  prNumber,
  branch: migrationBranch,
  expectedHeadSha: currentPrHeadSha,
  executionMode,
});
// Persist reviewHandle before polling.

const review = await greptile.awaitReview({
  handle: reviewHandle,
  readCurrentHead: () => githubCli.readPullRequestHead(prNumber),
  signal,
});

const validationUnknown = createCodeValidationGate().evaluate({
  manifestId,
  pullRequest: exactDraftPullRequestRevision,
  executionMode,
  checks: exactHeadCheckResults,
  coverage: coverageAccounting,
  greptile: review,
});
// Validate/canonicalize tetherin.validation-report/v1 before persistence.
```

The concrete package pins MCP SDK `1.30.0`, AJV `8.20.0`, ajv-formats `3.0.1`,
TypeScript `5.9.3`, Vitest `4.1.11`, Prettier `3.9.6`, and Node types `24.10.1`.
Its handoff reports 3 test files and 11 tests passing under Node 24 with its old
lockless package-manager command surface. No live Greptile smoke ran because the
environment lacked a key, authorized demo PR, and confirmed KB rollout.

Person C must close two local integration gaps without changing B's evidence or
gate logic:

1. Re-run B under the new Bun workspace and final `bun.lock`. Its package export
   points to `dist/index.js` but defines no build script. Add a C-owned runtime
   adapter or root build step that compiles the exact B source and tests the
   public package import; do not patch algorithms or import private modules.
2. Run a Bun compatibility smoke for the MCP transport and Node built-ins. If
   Bun cannot run the exact public adapter, host it in a separate C-owned local
   Node 22 sidecar with a typed, secret-safe protocol. Keep Bun as the operator
   entry and do not combine the Greptile key with the Codex sidecar.

Preserve B's documented limits in state and UI: KB search is literal substring
search over synthesized untrusted Markdown; rollout/repository visibility can be
missing; AST confirmation is JavaScript/TypeScript only; quotas are unpublished;
responses do not always contain a structured reviewed commit SHA; freshness is
an unchanged-head plus `hasNewCommitsSinceReview === false` inference; fixture
mode never passes; and live behavior remains unverified until Person C runs it.

## Ownership and required layout

Person C may create or change shared/root integration files after merging A and
B. Preserve their package behavior and focused tests.

```text
apps/web/
  app/{layout,page,runs/[runId]/page,diagnostics/page}.tsx
  app/api/{preflight,runs,runs/[runId],runs/[runId]/events,runs/[runId]/actions}/**
  components/**
  styles/{tokens,globals,patterns}.css
  tests/**
apps/runner/
  src/{main,supervisor,worker}.ts
  test/**
packages/orchestrator/
  src/{state-machine,actions,idempotency,leases,receipts}.ts
  test/**
packages/local-state/
  src/{database,migrate,events,projections,artifacts}.ts
  migrations/*.sql
  test/**
packages/codex-runner/
  src/{client,protocol,prompt,policy,diff-inspector,redaction}.ts
  sidecar/{main,adapter}.ts
  test/**
packages/git-local/
  src/{repository,branch,worktree,commands,guards}.ts
  test/**
packages/github-cli/
  src/{auth,repository,pull-request,checks,commands}.ts
  test/**
packages/greptile-runtime/       C-owned public-import/build or sidecar glue only
  src/**
  test/**
packages/config/
  src/{load,schema,redaction}.ts
  test/**
scripts/{setup,demo,demo-reset}.ts
docs/runbooks/local-demo.md
docs/workstreams/person-c/HANDOFF.md
bun.lock
```

Root `package.json` is the only public command surface. Person C owns its final
scripts and workspaces, the final lock, TypeScript/lint/format/test configuration,
and coordinated schema versions if an accepted A/B proposal requires one.

## Stack decision and pins

Use strict TypeScript throughout. The planning anchors below were current on
2026-08-23; reverify compatibility once, pin exact versions, and record changes
in `HANDOFF.md`:

```text
bun                         1.4.0
next                        16.3.2
react / react-dom           19.2.8
@radix-ui/themes            3.3.0
@phosphor-icons/react       2.1.10
@openai/codex-sdk           0.149.0
ajv                         8.20.0
vitest                      4.1.11
@playwright/test            1.62.1
```

Use one UI foundation: Radix Themes plus Radix Primitives and custom native CSS
tokens. Do not add shadcn, Material, Carbon, Fluent, Tailwind component packs,
or a second icon library. Use `@phosphor-icons/react` for every interface icon;
never draw an SVG icon path. Use Geist and Geist Mono from the documented font
source and the supplied chain icon asset, not the misspelled source wordmark.

Use Bun's built-in SQLite API in the Bun web/runner processes. Run Next with Bun
and prove dev/build/test behavior on the target laptop. The Codex SDK official
page guarantees Node 18+, not Bun, so isolate it in a local Node 22 sidecar with
a small versioned newline-delimited JSON protocol. The sidecar receives no DB,
GitHub, or Greptile credentials.

## Root command contract

Implement these scripts exactly:

| Script | Contract |
| --- | --- |
| `bun run setup` | Run all readiness checks, install/smoke the pinned oasdiff through Person A, migrate SQLite, and print a redacted summary. No migration run starts. |
| `bun run demo` | Use `TETHERIN_MODE`, start web and runner, print mode and localhost URL, propagate failure, and shut down children cleanly on SIGINT/SIGTERM. |
| `bun run demo:fixture` | Force fixture mode even if `.env.local` says live. Disable remote write actions and live-ready gate. |
| `bun run demo:live` | Force live mode and refuse startup unless live readiness is fully green. |
| `bun run demo:reset -- --run <id>` | Perform the guarded, dedicated-repo-only recovery contract from `docs/demo/golden-path.md`. |
| `bun run format:check` | Check all owned and merged source without rewriting. |
| `bun run lint` | Run static lint with zero warnings. |
| `bun run typecheck` | Typecheck every workspace and sidecar protocol. |
| `bun run test` | Run deterministic unit and contract suites. |
| `bun run test:fixtures` | Run all A/B fixture tests and fixture UI/state flow without network. |
| `bun run test:integration` | Exercise SQLite, subprocesses, Git, `gh` fixture shim, crash/retry, and exact-head rules. |
| `bun run test:e2e` | Run Playwright behavior, accessibility, responsive, and screenshot checks. |
| `bun run build` | Create a local release build of web and runner. |

The final `bun run demo` command is a supervisor, not two manual terminal steps.
It uses process groups, waits until both child readiness endpoints succeed,
prints one URL, and forwards shutdown with a bounded grace period before kill.

## Configuration and setup readiness

Load only ignored `.env.local`, validate with one strict schema, and reject
unknown security-sensitive keys. Required fields are those in `.env.example`.
Never add a GitHub token field. Resolve every configured local path to an
absolute canonical path before use.

`bun run setup` must perform the following in order and return nonzero on any
required live failure:

1. Verify supported Bun and Node versions plus executable Git, `rg`, `jq`, `gh`,
   and SHA-256 utility. Print versions, never environment contents.
2. Validate base URL binds to loopback only; SQLite and run directories resolve
   below `.tetherin/`; create directories mode `0700` and DB mode `0600`.
3. Confirm mode. Fixture mode reports missing OpenAI/Greptile keys as expected;
   live mode checks presence without printing length, prefix, or value.
4. Invoke Person A's installer API for exact `OASDIFF_VERSION`, verify archive
   hash and `oasdiff --version`, then run its committed smoke fixture.
5. Open SQLite, enable foreign keys and WAL, apply idempotent migrations, verify
   schema version, append/read a temporary setup event in a rollback transaction,
   and confirm a second process can read.
6. Canonicalize `TETHERIN_CONSUMER_REPO_PATH`. Reject this repository, its parent
   or child, a symlink escape, non-Git path, dirty worktree, wrong base branch,
   missing origin, or origin that does not normalize to `TETHERIN_CONSUMER_REPO`.
7. Run `gh auth status`, obtain authentication only through a scrubbed
   `gh auth token` child process, then use `gh repo view` to verify exact repo,
   default branch, and push/PR access. Discard the token immediately.
8. In live mode, run a bounded no-write Codex SDK sidecar smoke in an empty temp
   repository and call Person B's read-only Greptile KB discovery for the exact
   configured repo. A missing Greptile KB is a visible degraded condition, not a
   mock; inability to review the PR makes live readiness fail.
9. Print and persist a readiness report with rows `PASS`, `DEGRADED`, `FIXTURE`,
   or `FAIL`, safe detail, checked time, and relevant version/digest. Print no
   token, secret, absolute home path, or raw response body.

The diagnostics screen renders this same report and offers copy-safe redacted
diagnostics. It is local preflight only.

## SQLite source of truth

Use migrations and typed repositories for at least these tables:

```text
schema_migrations(version PK, checksum, applied_at)
runs(id PK, idempotency_key UNIQUE, mode, evidence_origin, provider, state,
     manifest_id, consumer_repo, consumer_base_sha, branch_name, pr_number,
     pr_url, current_head_sha, created_at, updated_at, terminal_reason)
workflow_events(event_id PK, job_id FK, idempotency_key, sequence,
                type, occurred_at, actor, causation_event_id, correlation_id,
                payload_digest, payload_json,
                UNIQUE(job_id, sequence), UNIQUE(job_id, payload_digest, type))
action_intents(id PK, run_id FK, intent_key UNIQUE, type, expected_state,
               expected_head_sha, status, lease_owner, lease_expires_at,
               attempts, created_at, updated_at, last_error_code)
external_receipts(id PK, run_id FK, effect_key UNIQUE, kind, external_id,
                  request_digest, response_digest, bound_head_sha, created_at)
artifacts(id PK, run_id FK, kind, relative_path, sha256, bytes, media_type,
          evidence_origin, bound_head_sha, created_at,
          UNIQUE(run_id, kind, sha256))
stage_projections(run_id FK, stage, status, summary_json, updated_at,
                  PRIMARY KEY(run_id, stage))
```

`workflow_events` payloads validate against
`tetherin.workflow-event/v1` before insertion. Add SQLite triggers that reject
event update/delete. A state transition appends the event and updates projections
in one transaction. Rebuild all projections from events in a test and compare
byte-for-byte canonical JSON with the stored result.

Retain event metadata indefinitely for the demo repo. Apply
`TETHERIN_RETENTION_DAYS` only to eligible redacted artifact bodies after
recording a purge event; never silently delete exact source URLs, hashes, state,
PR identity, or human-approval requirement.

## State machine and actions

Implement the enum and transition graph in `docs/architecture/overview.md` as a
pure exhaustive reducer. No UI component may invent a state. Required linear
path:

```text
READY -> DETECTING_CHANGE -> CHANGE_DETECTED -> CALCULATING_IMPACT
-> IMPACT_CONFIRMED -> MIGRATING -> TESTING -> CREATING_PR
-> GREPTILE_REVIEW -> VALIDATING -> PR_READY
```

Required honest alternatives are `TESTS_FAILED`, `GREPTILE_PENDING`,
`GREPTILE_BLOCKED`, `NEEDS_INPUT`, and `FAILED`. `PR_READY` requires live mode,
the Person B gate pass, exact current head, and `humanApprovalRequired: true`.
Fixture completion has its own summary but never uses live `PR_READY`.

UI actions post an `intentKey`, expected state, and expected head. The server
validates the action/state pair and inserts one unique intent. Disable the button
immediately, but treat DB uniqueness as the correctness control. The local
worker leases one intent at a time with owner UUID and short expiry, heartbeats
only while active, and resumes an expired intent by reconciling receipts and
GitHub state before repeating any side effect.

Required action policy:

| Action | Allowed state | Result |
| --- | --- | --- |
| `START_RUN` | `READY` | Begin provider detection once. |
| `RETRY_IMPACT` | `NEEDS_INPUT` only after operator-supplied safe correction | Re-enter impact with new causation event. |
| `RUN_MIGRATION` | `IMPACT_CONFIRMED` | Start the first Codex pass. |
| `RETRY_CHECKS` | `TESTS_FAILED` when no source change occurred | Re-run exact allowlisted checks on same head. |
| `RUN_FOLLOWUP` | `GREPTILE_BLOCKED`, first follow-up only | New Codex pass, new head, invalidate old checks/review. |
| `RESUME_REVIEW` | `GREPTILE_PENDING` on unchanged head | Resume same persisted Greptile review handle. |
| `CREATE_OR_OPEN_PR` | checks passed, exact head, no conflicting receipt | Create once or navigate to existing draft. |

`OPEN_RETAINED_FALLBACK` is a read-only navigation action and never alters the
active live run.

## Person A and Person B integration

Validate all A/B outputs again at the boundary even if their packages already
validated them. Persist contract version and digest.

1. Call Person A with provider, exact old/new revision, and abort signal. Persist
   raw oasdiff artifact before accepting the normalized manifest.
2. Require official source URL, 40-character commits, spec hashes, oasdiff
   version/raw digest, exact schema excerpts, and supported provider enum.
3. Call Person B against the frozen consumer base in `live` or `fixture` mode.
   Persist KB availability, truncation, limitations, deterministic coverage,
   every candidate's file/symbol/reason/confidence/confirmation, and report hash.
4. A KB miss or unavailable rollout never becomes proof of no impact. Continue
   only when deterministic confirmation is sufficient and render the degraded
   limitation.
5. After draft PR creation, persist the Greptile review handle before polling.
   Respect Person B's bounded polling, resume the same handle, and never invent
   a completion callback.
6. Supply current head through the B adapter's callback. Treat review freshness
   as Person B's documented unchanged-head inference, not a guaranteed upstream
   commit field.
7. Evaluate the Person B validation gate only after rereading PR head/base and
   required checks. Persist the v1 report and reasons verbatim.

## Codex migration runner

The Bun adapter starts a Node sidecar in a scrubbed environment. Protocol input
includes run/thread ID, canonical checkout root, manifest/report digests, bounded
prompt, model pin, deadline, allowed paths, and allowed command arrays. Protocol
output includes SDK thread ID, final response digest/redacted summary, command
receipts, and typed exit status. Reject unknown fields in both directions.

Before invoking Codex:

- create a disposable worktree below the run directory at exact consumer base;
- exclude `.git` indirection, `.env*`, credentials, caches, generated output,
  dependencies, and files outside confirmed impact plus necessary repo
  instructions;
- render manifest, exact schema excerpts, provider guidance, Greptile context,
  deterministic evidence, repository instructions, and check commands in
  clearly delimited sections;
- tell Codex to make the smallest compatible patch, update focused tests, avoid
  business decisions, and never disable or skip a check;
- enforce configurable caps with conservative defaults: 12 minutes, 40 files
  inspected, 12 files changed, 500 changed lines, 8 commands, 2 MiB captured
  output, one initial pass and one follow-up.

Afterward, inspect `git diff --binary --no-ext-diff` and reject path escape,
symlink change, secret file, submodule, binary addition, test/config weakening,
lockfile churn unrelated to the migration, or limits exceeded. Store a redacted
diff artifact and digest. A required business-semantic decision becomes
`NEEDS_INPUT`; do not prompt Codex to guess.

## Tests and exact-head binding

Derive required commands from the dedicated consumer repository instructions,
then apply a checked-in demo allowlist. Spawn argument arrays without a shell,
with clean environment, timeout, output cap, and process-group cleanup. Do not
allow network-bearing package install during the migration run.

Store command array, cwd relative to consumer root, status, exit code, duration,
redacted excerpt, output digest, and tested head SHA. Required check failure
enters `TESTS_FAILED`. Skipping a required check is not pass. Any source change
after checks invalidates the full check set.

## Git and GitHub workflow

All repository mutations occur in the dedicated consumer worktree. Wrap Git and
`gh` with argument-array subprocess helpers and typed JSON parsing.

1. Revalidate canonical path, expected remote, clean base, and exact base SHA.
2. Create `tetherin/<provider>/<manifest-short-id>`, sanitized and bounded to 80
   characters. Store run and manifest markers in the commit message and PR body.
3. Commit only the inspected patch. Reread the commit tree and head SHA.
4. Before push, query remote branch. Create it only when absent; reuse only when
   its marker and expected head match the same run. Never force or rewrite.
5. Push with `git push --set-upstream origin <branch>`. If a concurrent update
   wins, stop with `NEEDS_INPUT`.
6. Look up a PR by exact repo, branch, base, and marker. If none exists, run
   `gh pr create --draft --repo <owner/repo> --base <base> --head <branch>
   --title <title> --body-file <redacted-file>`. Persist the receipt before any
   retry. If one exists, validate ownership and update only the owned evidence
   section through `gh pr edit`.
7. Read PR base/head/draft/url and check rollup with `gh ... --json`. Never parse
   human terminal formatting. Never invoke `gh pr merge` or delete a branch.

The PR body must contain:

- `LIVE`, `FIXTURE`, or `RETAINED REAL` origin at the top;
- provider, official URLs, old/new source SHAs, spec hashes, oasdiff version,
  raw digest, and manifest ID/digest;
- normalized endpoint/operation/schema/property/type change and severity;
- confirmed source/wrapper/test/downstream evidence with limitations;
- Codex thread/run summary and focused changed-file list;
- exact check commands, status, output digest, and tested head;
- Greptile review ID/status, freshness explanation, unaddressed findings, and
  reviewed head binding;
- composite gate decision/reasons and the sentence **Human merge required;
  TetherIn never auto-merges.**

Base or head drift invalidates affected stages. Never rebase a run silently.
An operator may start a new run from the new base; old evidence remains attached
to the old run.

## Local API contract

The Next server is the only UI endpoint. It reads projections and inserts action
intents through `packages/local-state`; the runner never trusts browser state.
Implement:

```text
GET  /api/preflight
GET  /api/runs?cursor=<event-sequence>&limit=50
POST /api/runs
GET  /api/runs/:runId
GET  /api/runs/:runId/events?after=<sequence>&limit=200
POST /api/runs/:runId/actions
```

Every response includes `schemaVersion`, `mode`, `evidenceOrigin`, `generatedAt`,
and safe error metadata. POST bodies require an `intentKey` and expected state;
head-sensitive actions also require `expectedHeadSha`. Return `409` for stale or
duplicate intent, `422` for disallowed transition, and no secret-bearing error
detail. Update the UI by bounded polling or local SSE sourced from persisted
events; dropped connections must not lose state.

## Dashboard implementation

Implement `docs/design/dashboard.md` exactly. The running components are the
visual artifact. Do not create a fake screenshot or generated dashboard image.
The dashboard must render persisted real data for:

- compact top bar with chain icon, TetherIn text, LIVE/FIXTURE origin, configured
  repo, preflight, and diagnostics;
- run history rail;
- workflow rail and the four named stages: API Change, Blast Radius, Codex
  Migration, Validation & PR;
- exact provenance, grouped impact, focused diff, test/review/gate evidence,
  event stream, and safe action bar;
- honest empty, loading, pending, degraded, failed, needs-input, fixture,
  retained-real, and live-ready states;
- desktop, tablet, and sub-768px layouts, keyboard order, skip link, ARIA live
  updates, visible focus, reduced motion, WCAG AA contrast, and screen-reader
  status text.

Do not introduce fake metrics, generic status dots, rainbow statuses, excessive
badges, Lucide, emojis, glass effects, glows, or a dark-mode control. The theme
is the single locked pearl/smoke light theme defined in the design contract.

## Demo implementation

Follow `docs/demo/golden-path.md`.

- Person A still completes and tests all three provider adapters.
- Select Stripe only for a crisp official version/deprecation change that passes
  the rubric; otherwise use the proven OpenAI geography removal.
- Use a believable dedicated consumer repo containing direct use, wrapper, test,
  and downstream assumption. Never target this Tether repository.
- Complete and retain one genuine live run/PR as `retained-real`; prepare a
  separate clean checkout for the live presentation.
- Rehearse a real fault branch and report what actually catches it. Never script
  a Greptile finding that did not happen.
- Keep Codex repair to the initial migration plus one review-driven follow-up.
- Rehearse the three-minute script, asynchronous fallback, and guarded reset.

## Implementation order

1. Merge and verify exact Person B commit `57a602b`, add only required runtime
   packaging glue, and scaffold against the committed manifest fixture. Merge
   and verify Person A when its coordinator-confirmed handoff arrives. Then pin
   the final dependency graph and `bun.lock`.
2. Implement strict config, subprocess/redaction utilities, setup checks, and
   dedicated-repository guards before any write path.
3. Implement SQLite migrations, immutable event append, projection rebuild,
   action intents, leases, receipts, artifacts, and state reducer tests.
4. Integrate Person A detect/manifest and Person B impact/review/gate boundaries
   with schema validation and artifact digests.
5. Implement Codex Node sidecar protocol, disposable worktrees, prompt policy,
   limits, diff inspection, commands, and exact-head checks.
6. Implement safe Git/`gh` branch, commit, push, draft PR, update, and read paths
   with idempotent receipts and drift tests.
7. Implement the root setup/demo/reset scripts and clean child lifecycle.
8. Implement the dashboard shell, four stages, evidence surfaces, activity,
   actions, diagnostics, all state variants, responsive behavior, and a11y.
9. Add fixture, integration, E2E, visual, accessibility, crash/retry, security,
   and opt-in live tests.
10. Complete one real golden path, retain honest fallback evidence, rehearse the
    three-minute script and recovery, then write `HANDOFF.md`.

## Required test matrix

At minimum cover:

- config unknown/missing values, mode rules, secret redaction, loopback URL,
  directory permissions, Bun/Node/tool version failure, and readiness output;
- consumer path equals Tether, parent/child overlap, symlink escape, wrong remote,
  dirty tree, wrong base, missing push access, expired `gh` auth, and token canary;
- every allowed/forbidden state transition, projection rebuild, concurrent event
  sequence, duplicate intent, lease expiry/heartbeat/takeover, and restart;
- crash before/after spec fetch, Codex commit, push, PR create, review trigger,
  and validation receipt; each retry converges once;
- provider raw/manifest mismatch, no impact, partial/truncated evidence, KB not
  enrolled, and fixture-to-live contamination rejection;
- Codex protocol malformed frame, timeout, abort, crash, prompt cap, path escape,
  secret read, binary/submodule, diff limits, test removal, and second follow-up;
- check pass/fail/timeout/skip, output cap/redaction, command injection literal,
  same-head proof, source change invalidation, and no-network policy;
- remote branch collision, human commit, PR mismatch, base/head drift, `gh` JSON
  error, permission failure, rate limit, and absence of any force/merge command;
- Greptile pending/fail/skip/stale/actionable/clean, unaddressed comments,
  unchanged-head inference, and exact Person B gate reason mapping;
- fixture never live-ready, retained run remains immutable, and current live run
  cannot borrow its review or checks;
- UI empty/loading/error/degraded/needs-input/success, duplicate clicks, refresh
  recovery, keyboard flow, screen reader announcements, reduced motion, contrast,
  responsive collapse, no horizontal page scroll, and screenshot matrix.

Live tests are opt-in with `TETHERIN_LIVE_E2E=1` and require the configured
dedicated repo. They never create a repository or select another one implicitly.
The deterministic suite uses A/B fixtures and a local fake `gh` executable with
recorded typed JSON shapes; it may not impersonate a live pass.

## Acceptance commands

After implementing the scripts, all must pass from repository root:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:fixtures
bun run test:integration
bun run test:e2e
bun run build
bun run verify:planning
git diff --check
git fsck --no-progress
git status --short
```

Also run target `bun run setup`, start each fixture/live demo mode, verify one
Ctrl-C leaves no child or lease, refresh an in-progress run, exercise guarded
reset on the dedicated demo repo, and inspect the real draft PR at its exact head.

## Handoff artifact

Create `docs/workstreams/person-c/HANDOFF.md` containing:

- planning, A handoff, verified B handoff
  `57a602ba9de7357fd0385f20e23460b8642b74a9`, and final commit SHAs;
- exact package/runtime/tool versions and license notes;
- final contract versions, database schema version, migrations, and lock digest;
- operator commands and redacted setup readiness result;
- selected provider/change and why Stripe or OpenAI was chosen;
- consumer repo name, base/head SHAs, branch, draft PR URL, and evidence origin;
- provider/oasdiff/manifest digests, impact completeness, Codex thread digest,
  check receipts, Greptile ID/status/freshness, and final gate reasons;
- every automated command/result and visual/a11y screenshot matrix;
- retained-real run provenance, live demo rehearsal result, recovery result, and
  any remaining risk without fabricated success.

Commit all integration work, push `person-c/integration` without force, and open
a normal review PR for this Tether repository if the repository workflow calls
for one. This integration PR is distinct from the consumer migration draft PR.

## Definition of done

Done means the four-stage local control room survives refresh/restart, all
evidence is honest and exact-head-bound, one real change produces one real draft
consumer PR, Greptile review and the composite gate are visible, the human merge
requirement is inescapable, every target command works, the design contract and
test matrix pass, recovery is scoped, and the immutable handoff is pushed.

Out of scope: auto-merge, additional providers, remote TetherIn execution,
customer account flows, unattended scaling, general-purpose code repair, and
business-semantic decisions made by an agent.
