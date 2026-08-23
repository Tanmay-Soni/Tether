# Person B — Greptile evidence, impact confirmation, and validation

This is the complete work package for Person B. It requires no chat history.

## Mission

Build an implementation-ready Greptile adapter that:

1. enriches pre-migration impact analysis with documented Greptile knowledge-base
   MCP tools for an authorized consumer repository;
2. confirms exact files/symbols/usages deterministically with `rg` and AST search;
3. triggers and collects Greptile's independent migration PR review; and
4. evaluates an honest TetherIn validation report using Greptile review evidence,
   test results, deterministic coverage, and head-SHA freshness.

Your output stops at evidence/reports. You do not fetch provider specs, run
oasdiff, edit code with Codex, create GitHub branches/PRs, persist job state,
build the dashboard, or merge anything.

## Prerequisites and branch

1. Install Bun 1.4.x, Git, `jq`, and `rg`.
2. Read root `AGENTS.md`, all four schemas in `contracts/`,
   `docs/decisions/0002-greptile-evidence-boundary.md`,
   `docs/research/greptile-capabilities.md`, `docs/security/threat-model.md`, and
   this directory's `AGENTS.md`.
3. Get `PLANNING_BASE_SHA` from `../BASELINES.md`, then:

```bash
git fetch origin --tags
test "$(git rev-parse HEAD)" = "<PLANNING_BASE_SHA>"
git switch -c person-b/greptile-evidence
bun --version
```

Live tests additionally require a Greptile organization API key, the consumer
repository selected/enabled through Greptile's own GitHub integration, and knowledge-base
rollout enabled if KB evidence is expected. Put the key only in the process
environment as `GREPTILE_API_KEY`. This is Greptile authorization, not a
TetherIn repository-auth mechanism. Use `bun install --no-save`; do not commit
`bun.lock`. Person C regenerates the single root lock after integration.

## Ownership and package layout

Create only:

```text
packages/greptile/
  package.json
  tsconfig.json
  src/index.ts
  src/types.ts
  src/mcp/{transport,schemas,errors}.ts
  src/knowledge-base/{client,queries,normalize}.ts
  src/impact/{analyzer,deterministic,typescript-ast,confidence}.ts
  src/review/{client,poll,normalize}.ts
  src/validation/gate.ts
  src/redaction.ts
  test/**
fixtures/greptile/
  README.md
  kb/**
  review/**
docs/workstreams/person-b/HANDOFF.md
```

Use the official Model Context Protocol TypeScript SDK for Streamable HTTP,
`ajv` + `ajv-formats` for checked-in schemas, the TypeScript compiler API for
JS/TS AST analysis, and Node child processes for `rg`. Pin runtime/dev versions
in the package manifest. Avoid a custom MCP wire implementation and large agent
framework. Person C owns the final root lockfile.

## Required public API

Export these stable concepts from `packages/greptile/src/index.ts`:

```ts
export interface GreptileTransport {
  callTool<T>(name: ConfirmedGreptileTool, input: unknown, signal?: AbortSignal): Promise<T>;
  close(): Promise<void>;
}

export type ConfirmedGreptileTool =
  | "list_knowledge_bases"
  | "list_knowledge_base_documents"
  | "get_knowledge_base_document"
  | "search_knowledge_base"
  | "trigger_code_review"
  | "list_code_reviews"
  | "get_code_review"
  | "get_merge_request"
  | "list_merge_request_comments";

export interface GreptileEvidenceAdapter {
  enrichBlastRadius(input: {
    manifest: unknown;             // validate migration-manifest/v1 first
    consumer: AuthorizedConsumerRevision;
    checkoutPath: string;          // exact consumer.baseSha, read-only
    executionMode: "live" | "fixture";
    signal?: AbortSignal;
  }): Promise<unknown>;            // validated blast-radius-report/v1

  triggerReview(input: {
    repository: string;
    defaultBranch: string;
    prNumber: number;
    branch: string;
    expectedHeadSha: string;
    executionMode: "live" | "fixture";
  }): Promise<ReviewHandle>;

  awaitReview(input: {
    handle: ReviewHandle;
    readCurrentHead: () => Promise<string>;
    signal?: AbortSignal;
  }): Promise<ReviewEvidence>;
}

export interface CodeValidationGate {
  evaluate(input: {
    manifestId: string;
    pullRequest: PullRequestRevision;
    executionMode: "live" | "fixture";
    checks: CheckResult[];
    coverage: CoverageResult;
    greptile: ReviewEvidence;
  }): unknown;                     // validated validation-report/v1
}

export function createGreptileEvidenceAdapter(options: GreptileOptions): GreptileEvidenceAdapter;
export function createCodeValidationGate(options?: GateOptions): CodeValidationGate;
```

All external responses are `unknown` until runtime-validated. Errors are typed
as authentication, authorization/not-visible, not-enrolled, invalid-response,
rate-limited, timeout/aborted, transient, permanent, or fixture-mismatch. Error
objects contain safe metadata and redacted bodies only.

## Confirmed MCP request contracts

Call `https://api.greptile.com/mcp` with a bearer token through the MCP SDK. The
adapter may only invoke documented tools and parameters.

### Knowledge base

```ts
list_knowledge_bases({ limit: 100, offset: number })
// -> { knowledgeBases: [{ repoNamespaceExternalId, repoName, ... }], total, returned, ... }

list_knowledge_base_documents({
  repoNamespaceExternalId,
  limit: 100,
  offset: number,
})
// -> { repoName, indexPresent, sectionVersions, documentPaths, total, returned }

search_knowledge_base({
  repoNamespaceExternalId,
  query,                       // trimmed 2..200 chars
  sections: ["docs"],
  limit: 50,
})
// -> versioned Markdown paths/snippets plus truncation/failure metadata

get_knowledge_base_document({ repoNamespaceExternalId, path })
// -> { document: { path, versionId, content, ... }, untrustedContent: true, notice }
```

KB is rollout gated. `list_knowledge_bases` can be empty; a visible repo can have
zero documents. Reads follow current section versions, not historical snapshots.
Search is case-insensitive substring search in one repository. It can stop for
document/character/response limits or a 15-second time budget. Preserve
`truncated`, reason, failed documents/sections, versions, `untrustedContent`, and
notice. A miss under truncation is not absence.

### PR review

```ts
trigger_code_review({
  name: "owner/repo",
  remote: "github",
  defaultBranch,
  prNumber,
  branch,
})
// -> { codeReviewId, status: "PENDING", message }

get_code_review({ codeReviewId })
list_code_reviews({ name, remote: "github", defaultBranch, prNumber, limit, offset })
get_merge_request({ name, remote: "github", defaultBranch, prNumber })
list_merge_request_comments({
  name,
  remote: "github",
  defaultBranch,
  prNumber,
  greptileGenerated: true,
  addressed: false,
})
```

Documented review states are `PENDING`, `REVIEWING_FILES`,
`GENERATING_SUMMARY`, `COMPLETED`, `FAILED`, and `SKIPPED`. Persist the trigger
response before polling. `defaultBranch` is required. Greptile skips draft PRs
by default, so always trigger the TetherIn draft explicitly.

No current public outbound completion webhook is documented. A GitHub webhook
may wake the job, but completion comes from the MCP review/read tools. General
MCP request quotas are not published in the reviewed docs; respect `Retry-After`
when present, use jittered bounded retries, and never invent a requests/minute
number.

## Blast-radius algorithm

The requested product feature is implemented honestly as TetherIn orchestration:

1. Validate the manifest and consumer authorization/base SHA. Prove the checkout
   resolves to exactly that SHA and contains no path escape/symlink traversal.
2. Page `list_knowledge_bases`; exact-match the authorized `owner/repo`. Never
   fuzzy-match or fall back to another namespace/team.
3. List documents and record `docs`/`reverts` version IDs. If rollout/enrollment
   is unavailable, mark it and continue deterministic analysis; do not mock in a
   live report.
4. Build bounded literal query terms for each change: operationId, full endpoint,
   distinctive endpoint segment, changed property/parameter/schema name, and
   provider SDK method candidates derived deterministically from operationId.
   Deduplicate case-insensitively and cap total queries. Never send free-form
   secrets/source or ask an undocumented natural-language blast-radius question.
5. Search each literal separately. Fetch only returned relevant docs, cap bytes,
   store hashes/short references rather than full documents, and mark all KB
   content untrusted.
6. Run `rg --json` with literal/fixed-string modes over allowlisted source/test
   extensions, excluding `.git`, dependencies, build output, generated files,
   secrets, and files above a size cap. Spawn with argument arrays, no shell.
7. For TypeScript/JavaScript, use the TypeScript compiler API to identify direct
   SDK calls, HTTP calls, object properties, destructuring, wrappers, transforms,
   webhooks/types, tests, and downstream uses. Record file, tight line range,
   symbol, usage kind, and why it maps to a manifest change. Generic-language
   `rg` results remain `possible` unless an implemented AST adapter confirms them.
8. Normalize/deduplicate candidates by canonical repo-relative path + line +
   symbol + change fingerprint. Reject paths outside the checkout.

Confidence is evidence policy, not model intuition:

| Evidence | Confirmation | Maximum confidence |
| --- | --- | --- |
| AST relation directly maps changed subject/operation | `confirmed` | 1.00 |
| Literal source hit + matching wrapper/test semantics | `confirmed` | 0.90 |
| KB reference + source literal, not structurally resolved | `possible` | 0.70 |
| KB reference only | `possible` | 0.45 |
| Generated/vendor/comment-only hit | `rejected` | 0.10 |

KB evidence may raise explanation quality but cannot convert an unconfirmed
source hit to `confirmed`. Any KB/deterministic truncation/failure sets overall
`completeness: "partial"`; both unavailable sets `unavailable`. A complete
deterministic result with KB not enrolled is still `partial` and carries a
limitation, though Person C may continue in visibly degraded mode.

## Review collection and head-SHA rule

Use a configurable maximum wait (default eight minutes) with jittered 10–30
second intervals. Abort immediately on caller signal; surface `FAILED`/`SKIPPED`;
return a retryable timeout without losing the review ID.

Greptile's documented MCP shape exposes review state, comments,
`hasNewCommitsSinceReview`, and commits since review, but the reviewed public
tool documentation does not promise a structured reviewed commit SHA in every
response. Do not invent one. Person C freezes the job branch and supplies
`expectedHeadSha`; this adapter:

1. reads current head immediately before trigger and requires it to match;
2. after `COMPLETED`, reads `get_merge_request`, unaddressed Greptile comments,
   and current GitHub head through the supplied callback;
3. accepts `reviewedHeadSha = expectedHeadSha` only when the head is unchanged
   across that interval and `hasNewCommitsSinceReview` is false, recording this
   as a TetherIn freshness inference;
4. otherwise returns null/stale evidence and forces re-review.

Use documented `isGreptileComment`/filters, not guessed bot usernames. Normalize
body, file/line, suggestion presence, addressed state, review ID/status/times,
and optional 0–5 confidence only when actually returned. Do not auto-apply
suggestions or resolve comments.

## CodeValidationGate policy

This is a deterministic pure function. `pass` requires all of:

- `executionMode === "live"`;
- PR remains draft and its current head/base equal the report inputs;
- every required check has `status: "passed"`;
- deterministic coverage status is `passed`, every confirmed candidate is
  accounted for, and no unresolved candidate remains;
- Greptile review is `COMPLETED`, belongs to this PR/review handle, applies to the
  exact head under the freshness rule, `hasNewCommitsSinceReview === false`, and
  has zero unaddressed Greptile comments;
- report schema validates and `humanApprovalRequired` remains true.

Confidence score is displayed and auditable but is not a substitute for explicit
comments/status/freshness. If configured as an additional threshold, a missing
score yields `pending`, never a guessed pass. Fixture, in-progress, timed-out,
not-enrolled review, missing head proof, skipped check, partial coverage, stale
review, or schema error produces `pending`/`fail` with stable reason codes.

The package never merges or changes PR readiness. A Codex follow-up changes the
head and invalidates both checks and Greptile evidence.

## Fixture contract

Because live credentials may be unavailable, provide a fixture transport that
implements the same typed tool-call boundary. Fixtures must:

- be derived from the response shapes/examples in official MCP docs and cite the
  exact source URL/research date in `fixtures/greptile/README.md`;
- use synthetic repository names/IDs/content, not copied customer data;
- include request + response + latency/status sequence, KB versions, truncation,
  untrusted notice, review comments, and stale-head cases;
- require explicit `executionMode: "fixture"` and emit that value in every
  report; never activate automatically after a live failure;
- include no key/token and never allow the validation gate to return live pass.

Add fixtures for clean review, actionable comment, pending-to-complete, failure,
KB not enrolled, no documents, truncated search, document failure, stale review,
rate limit/retry, invalid payload, and prompt-injection text treated as data.

## Implementation checklist

1. Scaffold strict package config, runtime schemas, redaction, and typed errors.
2. Implement MCP SDK transport with bearer env auth, timeouts, size caps,
   structured validation, safe logging, close/abort, and injectable fixture
   transport. Never accept a literal key in serialized options.
3. Implement exact repo KB discovery, paging, document listing/reads, literal
   query builder, search truncation/failure propagation, and normalization.
4. Implement safe `rg --json` runner and JS/TS AST analyzer at exact base SHA.
5. Implement evidence merge/dedup, fixed confidence policy, limitations, and
   validation against `blast-radius-report/v1`.
6. Implement review trigger, persisted handle, bounded poll/status/comment
   collection, head-freeze inference, and retry classifications.
7. Implement pure validation gate and validate `validation-report/v1`.
8. Build clearly labeled official-shape fixtures and fixture transport.
9. Write unit, contract, integration, security, and optional live smoke tests.
10. Write `HANDOFF.md`, run acceptance commands, and commit the handoff SHA.

## Required tests and failure modes

At minimum cover:

- missing/invalid key, auth/authorization error, malformed MCP result, unknown
  tool/status, disconnect, timeout/abort, response cap, 429 `Retry-After`, 5xx,
  bounded retry exhaustion, and log redaction;
- exact repo/team match, >100 paging, 2,000-repo truncation metadata, not
  enrolled, no docs, missing index, current version IDs, invalid doc path,
  80-KB truncation, every KB search truncation reason, partial document failure,
  and untrusted-content propagation;
- query trim/length/dedup/cap, literal rather than regex behavior, secret-like
  term rejection, and one-repo-per-search;
- checkout SHA mismatch, symlink/path escape, huge/binary/generated/dependency
  exclusion, `rg` failure/abort, AST syntax errors, direct SDK/HTTP/wrapper/type/
  transform/webhook/test/downstream candidates, false-positive rejection, stable
  ordering, and partial/unavailable completeness;
- explicit draft review trigger, required default branch, all status transitions,
  timeout resume with same review ID, failure/skipped, two bot identities through
  normalized flag, addressed/unaddressed filtering, no-new-commits, head drift,
  and missing structured SHA inference;
- gate truth table: clean live pass; fixture never pass; test/coverage/review/
  comment/stale/missing-head/schema failures; follow-up head invalidation; human
  approval always true;
- prompt-injection fixtures cannot change tool allowlist, read secrets, execute a
  command, alter confidence, or mark themselves trusted.

Live tests are opt-in with `TETHERIN_LIVE_GREPTILE_TESTS=1`, use a dedicated
authorized demo repo/PR, never create one automatically, and skip with an
explicit reason when KB rollout is unavailable. Deterministic CI uses fixtures.

## Acceptance commands

Define scripts so these work from repository root:

```bash
bun install --no-save
bun run --filter @tetherin/greptile format:check
bun run --filter @tetherin/greptile lint
bun run --filter @tetherin/greptile typecheck
bun run --filter @tetherin/greptile test
bun run --filter @tetherin/greptile test:fixtures
bun run verify:planning
git diff --check
git status --short
```

`test:fixtures` must produce and schema-validate both report types without
network. `git status --short` shows only owned intended files before the handoff
commit and nothing afterward.

## Handoff artifact

Create `HANDOFF.md` with:

- handoff/planning SHAs, package exports, dependencies/licenses, and consumed/
  produced contract versions;
- every official MCP tool/parameter used and source URL/research date;
- fixture inventory and explicit statement that it is not live evidence;
- live smoke result if run, KB enrollment state, and no fabricated findings;
- exact deterministic language/usage coverage and limitations;
- review polling/head-freshness/gate reason-code policy;
- all commands/results, known risks, and proposed shared-contract changes;
- confirmation that no key/customer data/lockfile is committed.

Person C must be able to merge your SHA, inject a transport and GitHub-head
callback, produce both v1 reports, and render every degraded/fixture state without
asking you a question.

## Definition of done

Done means documented MCP KB enrichment, deterministic impact confirmation,
PR review trigger/collection, composite validation policy, explicit
fixtures, robust security/error handling, schema-validated outputs, focused
tests, and an immutable handoff commit exist.

Out of scope: provider ingestion/oasdiff, code editing, GitHub branch/PR writes,
state persistence/UI, resolving comments, auto-merge, undocumented
Greptile endpoints, general source-graph access, and additional code-review
vendors.
