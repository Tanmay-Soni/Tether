# Person C — integration, Codex/GitHub workflow, dashboard, and golden path

This is the complete work package for Person C. It requires no chat history.

## Mission

Integrate Person A's provider/oasdiff pipeline and Person B's Greptile evidence
pipeline into a complete TetherIn product:

- durable idempotent workflow and audit trail;
- authorized least-privilege GitHub App;
- isolated Codex migration runner;
- independent checks and diff policy;
- draft PR lifecycle and Greptile review/follow-up loop;
- four-stage evidence dashboard;
- one honest end-to-end provider-to-customer golden path;
- local/deployment runbooks and a rehearsed recovery path.

You own the full outcome. You do not replace oasdiff, make Greptile edit code,
let Codex approve itself, or automatically merge.

## Prerequisites, base, and integration order

Install Git, GitHub CLI, Node 22.18+ (Node 24 preferred), Corepack, Docker with
Compose, PostgreSQL client tools, `jq`, and `rg`. Obtain development credentials
through a secret manager only after fixture mode is green:

- a GitHub App installed on the dedicated authorized consumer demo repository;
- `OPENAI_API_KEY` for the server-side Codex SDK runner;
- `GREPTILE_API_KEY` and the same consumer repo enabled in Greptile;
- KB rollout if live pre-migration KB evidence is part of the demo.

Read root `AGENTS.md`, all contracts/ADRs/research/security/demo docs, A/B
handoffs, and this directory's `AGENTS.md`. Then use exact SHAs supplied by the
coordinator/handoff files:

```bash
git fetch origin --tags
git switch --detach <PLANNING_BASE_SHA>
git switch -c person-c/integration
test "$(git merge-base <PERSON_A_HANDOFF_SHA> <PLANNING_BASE_SHA>)" = "<PLANNING_BASE_SHA>"
test "$(git merge-base <PERSON_B_HANDOFF_SHA> <PLANNING_BASE_SHA>)" = "<PLANNING_BASE_SHA>"
git merge --no-ff <PERSON_A_HANDOFF_SHA>
corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm install --lockfile=false
pnpm --filter @tetherin/provider-pipeline test
git merge --no-ff <PERSON_B_HANDOFF_SHA>
pnpm install --lockfile=false
pnpm --filter @tetherin/greptile test
```

Stop if either handoff modifies files outside its documented ownership, changes a
shared schema without coordination, commits a lockfile/secret/full provider
spec, implements a custom diff, or fabricates live Greptile evidence. Resolve the
boundary before application work.

## Owned runtime layout and pinned planning anchors

Create:

```text
apps/web/                         Next.js dashboard/API routes
packages/contracts/              Generated TS types + AJV validators
packages/db/                     Drizzle schema/migrations/repositories
packages/orchestrator/           State machine, worker, artifact/audit services
packages/github/                 App auth, webhooks, checkout/branch/PR/checks
packages/codex/                  Isolated @openai/codex-sdk migration adapter
.github/workflows/               CI only; no hidden migration orchestrator
Dockerfile
compose.yaml                     Web + worker + local Postgres
docs/runbooks/{local,deployment,recovery}.md
docs/demo/REHEARSAL.md
docs/workstreams/person-c/HANDOFF.md
pnpm-lock.yaml
```

Use strict TypeScript, Next.js App Router, React, PostgreSQL, Drizzle ORM,
`postgres`, Octokit App/Webhooks, AJV, Vitest, and Playwright. Pin exact versions
and commit one lockfile. Versions observed at planning time (reverify once, then
pin; never float during rehearsal):

```text
next 16.3.2                  react 19.2.8
drizzle-orm 0.45.2           postgres 3.4.9
@octokit/app 16.1.4          @octokit/webhooks 14.2.0
@openai/codex-sdk 0.149.0    ajv 8.20.0
typescript 7.0.2             vitest 4.1.11
playwright 1.62.1            pnpm 11.23.0
```

If a version no longer resolves or violates an engine/peer constraint, choose
the nearest compatible stable version, pin it, record the reason/source in the
handoff, and rerun all tests. Do not silently use prerelease/canary tags.

## Generated contract package

`packages/contracts` reads the checked-in Draft 2020-12 schemas, compiles AJV
validators at build time, and exports generated TypeScript types plus:

```ts
parseMigrationManifest(value: unknown): MigrationManifest;
parseBlastRadiusReport(value: unknown): BlastRadiusReport;
parseValidationReport(value: unknown): ValidationReport;
parseWorkflowEvent(value: unknown): WorkflowEvent;
canonicalJson(value: unknown): string;
sha256Canonical(value: unknown): string;
```

Generation must be deterministic and CI must fail if generated files differ.
Every DB/external/package boundary parses `unknown`. A coordinated schema change
requires a new `schemaVersion`, fixtures, generators, A/B adapter changes, DB
migration/backward-read policy, and ADR; never patch a v1 schema in place after
data exists.

## Persistence model

Use PostgreSQL as the durable source of truth and a transactional outbox/leased
worker instead of adding Redis for the hackathon. Required tables:

```text
github_installations
  id, account_login, encrypted_installation_metadata, permissions_json, created_at
consumer_repositories
  github_node_id UNIQUE, installation_id, owner, name, default_branch,
  enabled, authorized_at, test_commands_json, retention_policy_json
provider_checkpoints
  provider PRIMARY KEY, last_commit, checked_at
migration_jobs
  id UUID, idempotency_key UNIQUE, provider, old_commit, new_commit,
  consumer_repository_id, consumer_base_sha, state, attempt, lease_owner,
  lease_expires_at, next_run_at, created_at, updated_at
artifacts
  id, job_id, kind, schema_version, sha256, storage_key, execution_mode,
  redacted_summary_json, created_at
external_runs
  id, job_id, kind, external_id, status, expected_head_sha, attempts,
  next_poll_at, safe_metadata_json, created_at, updated_at
pull_requests
  job_id UNIQUE, number, url, branch, base_sha, head_sha, draft, updated_at
job_events
  job_id, sequence, event_id UNIQUE, type, actor, occurred_at,
  payload_digest, safe_payload_json, PRIMARY KEY(job_id, sequence)
outbox
  id, job_id, event_type, available_at, lease fields, attempts, delivered_at
```

Encrypt any installation metadata that cannot be recomputed; never store App
private key, webhook secret, OpenAI key, Greptile key, GitHub tokens, raw model
transcripts, full customer source, or full KB documents. Store artifacts in a
job/tenant-scoped local directory for dev and an interface-backed object store
for deployment. Specs are public content-addressed cache; consumer artifacts are
encrypted/private with retention deletion.

The idempotency key is SHA-256 over length-prefixed provider, old/new spec commit,
consumer GitHub node ID, and consumer base SHA. Add a unique constraint and a
per-consumer advisory lock around branch/PR mutation. Outbox insert and state
transition occur in one transaction.

## State machine and worker contract

Implement exactly the states/transitions in `docs/architecture/overview.md`.
Handlers are short, idempotent steps; no HTTP request waits for oasdiff, Codex,
tests, or Greptile. Each handler:

1. acquires a lease with expiration;
2. reloads current state and returns if already completed;
3. persists any external ID before waiting/polling;
4. writes artifact/event/next state atomically;
5. classifies retryable vs permanent/needs-input errors;
6. releases lease or lets it expire safely after a crash.

Use exponential backoff with jitter and per-step caps. Never retry auth,
authorization, checksum, schema, unsupported-provider, unsafe-diff, or branch
ownership failures automatically. Poll Greptile asynchronously using Person B's
review handle; no invented Greptile webhook. GitHub webhook events may enqueue a
wake-up but cannot mark review complete.

Required workflow events use `contracts/workflow-event.schema.json`. Event
payloads contain IDs/hashes/statuses/reason codes and redacted excerpts only.

## GitHub App and repository workflow

Create a GitHub App manifest/runbook with the least permissions actually used:

- Metadata: read (implicit)
- Contents: read/write (exact checkout/branch commit)
- Pull requests: read/write (draft PR lifecycle)
- Checks: read (and write only if TetherIn publishes its own check run)
- Actions: read only if collecting workflow runs
- Commit statuses: read only if required by enrolled repo policy

Do not request Administration, Members, Secrets, Environments, or repository
merge capability. Subscribe only to installation/repository selection,
pull-request, push, and selected check/workflow events the implementation uses.
Verify webhook HMAC on raw bytes, delivery ID uniqueness, event/action allowlist,
installation/repository node IDs, replay age, and payload size before enqueue.

For each job:

1. mint a short-lived installation token restricted to one authorized repo;
2. create an empty ephemeral checkout, fetch exact base SHA with partial/no tags,
   and verify `HEAD`; use an ephemeral `GIT_ASKPASS`, never credential-in-URL or
   persisted checkout credentials;
3. create branch `tetherin/<provider>/<manifest-id-short>` only if absent or
   provably owned by this idempotency key; never force-push or overwrite a human
   commit;
4. after Codex/checks/diff policy, commit with job marker/trailers and push using
   a freshly scoped token;
5. create exactly one draft PR and persist number/URL/head SHA;
6. render source spec URLs/SHAs/hashes, oasdiff version/raw digest, normalized
   changes, confirmed files/symbols, Codex summary, exact checks, fixture/live
   labels, and human-merge statement in the PR body;
7. verify base/head before every update. Base drift creates a new/rebased job;
   human branch edits move to `NEEDS_INPUT`.

PR creation is idempotent: branch marker + job ID + persisted record + GitHub
search must converge on one PR after duplicate webhooks/crashes.

## Codex MigrationAgent

Implement `packages/codex` with the official server-side
`@openai/codex-sdk`. Run in a fresh container/process with workspace-write limited
to the ephemeral checkout, network denied after dependency preparation, no
customer/provider secrets, CPU/memory/disk/time caps, and an output/diff limit.
Record SDK/model version, thread/run IDs if safe, timestamps, exit state, final
response digest, patch digest, and redacted summary—never the raw transcript.

Build the prompt deterministically from these delimited sections:

```text
SYSTEM GOAL: make the smallest correct migration; no merge/secret access/policy weakening
REPOSITORY INSTRUCTIONS: root-to-file AGENTS.md applicable to confirmed files
PROVIDER PROVENANCE: provider, official old/new URLs + commits + hashes
CONTRACT CHANGES: validated manifest change records
SCHEMA EXCERPTS: exact old/new fragments only
OFFICIAL GUIDANCE: exact cited links/excerpts or explicitly none
CONFIRMED IMPACT: deterministic files/symbols/why; KB evidence labeled untrusted
EDIT BOUNDARY: authorized checkout and allowed file classes
CHECK COMMANDS: enrollment-approved commands, not model-selected shell
DELIVERABLE: patch + concise mapping from change to edits; do not push/merge
```

The runner does not grant GitHub/Greptile tools or installation tokens. After
Codex returns, TetherIn independently checks checkout confinement, file count/
size, secret patterns, symlinks, submodules, test/config weakening, generated/
vendor changes, manifest relevance, and `git diff --check`. Reject unrelated
edits or commands requiring production secrets.

Run enrollment-approved format/typecheck/test/build commands in a clean process
with no agent privileges, time/output caps, and redaction. Capture exit code,
duration, output SHA-256, and a short safe excerpt. Do not let Codex mark a check
passed or skip a required command.

## Greptile review and Codex follow-up

After the tested draft PR exists:

1. freeze/record head SHA and call Person B's `triggerReview` explicitly;
2. persist review ID/status before returning worker lease;
3. poll through Person B's bounded adapter; show real pending/failed states;
4. combine current checks, deterministic coverage, and review evidence through
   `CodeValidationGate`;
5. on actionable comments, provide Codex only those comments as untrusted data,
   the prior manifest/evidence, and a narrow follow-up instruction;
6. rerun full diff policy/checks, commit/push, record new head, and trigger a new
   review. The prior review/checks become stale immediately;
7. cap automatic follow-up attempts at two for the hackathon. Then move to
   `NEEDS_INPUT` with evidence instead of looping forever.

Do not auto-resolve Greptile comments. Do not require Greptile confidence alone;
require completed/current review and zero unaddressed comments. A fixture review
can exercise UI/state logic but cannot enter live `READY_FOR_HUMAN`.

## Dashboard and API

Build a focused customer dashboard, not an admin-template sprawl. The job page
has four ordered stages with timestamps/status/live-fixture badges:

1. **Provider change detected** — official old/new links and SHAs, oasdiff
   severity/text, raw/manifest digests.
2. **Affected consumers and files** — authorized repo/base, Greptile KB
   availability/versions/limitations, deterministic file/symbol/why/confidence.
3. **Codex migration** — branch/head, compact diff summary, change-to-edit map,
   check commands/states.
4. **Tests + Greptile + PR ready** — check evidence, review status/comments/head
   freshness, composite gate reasons, draft PR link, human approval requirement.

Never render untrusted Markdown/HTML directly. Escape/sanitize provider,
Greptile, Codex, test, and GitHub content. No client bundle receives integration
keys or private source excerpts.

Required server routes/actions:

```text
POST /api/github/webhook             verified enqueue only; fast 2xx
GET  /api/jobs/:jobId                authorized redacted job projection
POST /api/jobs/:jobId/retry          CSRF/auth + allowed-state transition
POST /api/demo/run                   development-only fixture or authorized demo
GET  /api/artifacts/:artifactId      authorized redacted/download policy
```

Use server-sent events or bounded polling for dashboard updates; do not couple UI
requests to worker execution. Add an install/onboarding screen that states what
source/context goes to Codex/Greptile, selected-repo access, fixture meaning,
retention, no secrets, and no auto-merge.

## Golden path and provider boundary

Deliver one indisputable E2E path. Attempt the Person A Stripe fixture first only
if it is an official historical pair representing a real version/deprecation
migration and the consumer sample demonstrably uses the affected behavior.
Stripe's versioning means copy must say TetherIn prepares an upgrade migration,
not that Stripe silently broke customers.

If Stripe misses that rubric, use the official OpenAI pair:

```text
old 13c6a94fca988f8be3c5de09d73f012709985d10
new f85dbe223d40e1a31cba812ab2d755c7e98a92a3
removed geography from create-project and modify-project requests
```

The consumer demo repo must contain a realistic integration plus wrapper/test or
downstream assumption. All three adapters still require unit/contract coverage;
do not fabricate live E2E runs for the other two.

Follow `docs/demo/golden-path.md`. Rehearse a separate fault-injection branch and
record what the real deterministic gate and live Greptile review actually found.
If Greptile is unavailable/asynchronous, show pending/degraded or a visibly
labeled retained real rehearsal. Never pre-script a false finding.

## Implementation phases

### 1. Integrate and lock

- Merge A then B, run each acceptance suite, review handoffs and source licenses.
- Create root scripts/config, generate one lockfile, pin action/dependencies, add
  CI for format/lint/typecheck/unit/fixture/integration/build.
- Generate contract types/validators and add drift checks.

### 2. Persistence and orchestration

- Implement DB schema/migrations/repositories, artifact store, encrypted safe
  metadata, events/outbox, leases/backoff/idempotency, and state-transition tests.
- Wire A manifest output -> B impact report -> Codex -> checks -> GitHub -> B
  review/report without bypassing schema validation.

### 3. GitHub and Codex security boundary

- Implement App auth/webhook/repo authorization/ephemeral checkout/branch/PR.
- Implement SDK runner, prompt builder, sandbox, redaction, diff policy, check
  runner, and follow-up invalidation.

### 4. Dashboard

- Implement onboarding, job list/detail four stages, evidence/limitation views,
  retry controls, accessible responsive design, and safe rendering.

### 5. Golden path and deployment

- Add dedicated consumer demo repo fixture/seed instructions, run E2E, create
  real draft PR in an authorized demo repo, collect real review if credentials
  allow, and retain redacted evidence.
- Add Docker/Compose local flow, production config/runbook, health/readiness,
  migrations, backup/restore, observability, rollback, and recovery demo.

## Required failure-path tests

In addition to A/B suites, cover:

- duplicate/out-of-order/replayed webhook, bad signature, wrong installation/
  repo, permission drift, token expiry, base advance, branch collision, human
  branch edit, existing PR convergence, GitHub 403/404/409/422/429/5xx;
- duplicate job event/outbox delivery, crash after external call before state
  write, lease expiry, concurrent same-consumer jobs, retry cap, DB/artifact
  failure, migration rollback, retention deletion;
- Codex timeout/crash/oversized output, path/symlink/submodule escape, secret
  canary, prompt injection, network attempt, unrelated files, test disablement,
  generated/vendor changes, empty patch, check timeout/failure/redaction;
- fixture cannot produce live-ready, KB unavailable/truncated, no impact, review
  pending/failed/skipped/stale, unaddressed comment, follow-up new head, maximum
  iterations, missing head proof, gate schema failure;
- dashboard XSS from provider/KB/comment/test text, unauthorized job/artifact
  access, CSRF on mutation, key absent from client bundle/logs;
- full fixture E2E and one authorized live/rehearsal path with exact provenance.

## Acceptance commands

Person C defines consistent root scripts so final checkout supports:

```bash
corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:fixtures
pnpm test:integration
pnpm --filter @tetherin/web build
pnpm exec playwright test
pnpm verify:planning
docker compose config --quiet
git diff --check
git status --short
```

For local E2E, run documented commands equivalent to:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
pnpm worker
pnpm demo:fixture
```

Do not put usable placeholder secrets in Compose or `.env.example`. Fixture E2E
is deterministic/offline for provider/Greptile/Codex/GitHub adapters and visibly
labeled. Live demo uses separate explicit command/env gates and a selected demo
repository only.

## Final handoff artifacts

Create/update:

- `docs/workstreams/person-c/HANDOFF.md`: planning/A/B/final SHAs, merge order,
  architecture, dependency/license pins, migrations, exact test results,
  fixture/live matrix, PR/deployment URLs, risks;
- `docs/demo/REHEARSAL.md`: date, provider/source/customer SHAs, artifact/review/
  PR IDs and digests, observed loop behavior, timings, screenshots with no
  secrets, fallback/recovery result;
- local/deployment/recovery runbooks: prerequisites, secret provisioning,
  GitHub/Greptile setup, migrations, health, logs/redaction, rollback, restore,
  teardown/retention;
- integration PR body containing the two unsquashed handoff SHAs and complete
  evidence. The PR remains human-merge only.

## Definition of done

Done means A/B packages are integrated; one reproducible provider change reaches
confirmed consumer usages, an isolated Codex patch, real checks, an idempotent
draft PR, current independent Greptile review evidence, and a human-ready gate;
the four-stage dashboard explains every artifact; security/failure paths and
fixture/live boundaries are tested; runbooks/rehearsal exist; CI and final
acceptance commands pass.

If live Greptile credentials/KB enrollment are unavailable, the product may be
code-complete with deterministic fixture E2E and a documented live blocker, but
do not claim the live Greptile/golden-path acceptance criterion is complete.

Out of scope: auto-merge, production customer rollout, billing/multiregion scale,
additional providers/review vendors, a provider marketplace/protocol standard,
rewriting oasdiff, hidden workflow frameworks, and using Greptile/Codex as each
other's substitute.
