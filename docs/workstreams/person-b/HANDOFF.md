# Person B handoff — Greptile evidence layer

## SHAs

- Planning baseline: `37472c40de06251bf5a49b53239f912471a9b8f9`
- Branch: `person-b/greptile-evidence`
- Handoff commit: recorded after commit creation

## Package exports

`@tetherin/greptile` exports the Person B contract surface:

- `createGreptileEvidenceAdapter(options)`
- `createCodeValidationGate(options)`
- `GreptileTransport`
- `ConfirmedGreptileTool`
- `GreptileEvidenceAdapter`
- `CodeValidationGate`
- `FixtureGreptileTransport`
- typed review/check/coverage/consumer/PR structures

The package validates `tetherin.migration-manifest/v1`,
`tetherin.blast-radius-report/v1`, and `tetherin.validation-report/v1` at runtime
with AJV. It does not modify consumer code, create PRs, persist orchestration
state, or run provider/oasdiff/Codex/dashboard work.

## Dependencies and licenses

- `@modelcontextprotocol/sdk@1.30.0` for Streamable HTTP MCP client transport.
- `ajv@8.20.0` and `ajv-formats@3.0.1` for runtime contract validation.
- `typescript@5.9.3` for strict build and JavaScript/TypeScript AST analysis.
- `vitest@4.1.11`, `prettier@3.9.6`, and `@types/node@24.10.1` for tests and
  verification.

All package dependencies are npm packages used from the lockless workspace
install. No lockfile is committed on this branch.

## Confirmed Greptile capabilities used

Research rerun on 2026-08-23 against official Greptile docs:

- MCP endpoint/auth: `https://api.greptile.com/mcp` with bearer token from
  `GREPTILE_API_KEY`.
- KB discovery: `list_knowledge_bases({ limit, offset })`.
- KB docs: `list_knowledge_base_documents({ repoNamespaceExternalId, limit,
offset })`.
- KB read/search boundary: `search_knowledge_base({ repoNamespaceExternalId,
query, sections: ["docs"], limit: 50 })`; search is substring search over
  synthesized untrusted Markdown, not a semantic source-query API.
- PR review trigger: `trigger_code_review({ name, remote: "github",
defaultBranch, prNumber, branch })`.
- Review polling: `get_code_review({ codeReviewId })`.
- Merge-request freshness/comment context: `get_merge_request(...)` and
  `list_merge_request_comments(..., greptileGenerated: true, addressed: false)`.

Sources:

- https://www.greptile.com/docs/mcp-v2/tools
- https://www.greptile.com/docs/mcp-v2/setup
- https://www.greptile.com/docs/quickstart
- https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context
- https://www.greptile.com/docs/code-review/developer-essentials
- https://www.greptile.com/docs/code-review/first-pr-review
- https://www.greptile.com/docs/llms.txt

No implementation claims a Greptile pre-PR blast-radius API or a Greptile
product named "code validator".

## Implementation summary

- MCP transport uses the official SDK, bearer env auth, response caps, abortable
  timeouts, redacted typed errors, confirmed-tool allowlist, and bounded retry
  for retryable/rate-limited/transient failures.
- KB enrichment exact-matches the authorized `owner/repo`, records rollout,
  enrollment, version, truncation, document-failure, and untrusted-content state,
  then searches bounded literal terms derived from manifest changes.
- Deterministic confirmation runs `git rev-parse HEAD`, fixed-string `rg --json`
  over source/test extensions with dependency/build/secrets exclusions, and
  TypeScript compiler API analysis for direct SDK calls, HTTP calls, wrappers,
  transforms, types, tests, and downstream assumptions.
- Confidence is policy-based: AST-confirmed findings can reach 1.0, confirmed
  literal source semantics 0.9, KB+source possible 0.7, KB-only possible 0.45,
  rejected/generated/vendor/comment-only evidence 0.1.
- Review polling persists the handle, polls documented states, collects
  unaddressed Greptile comments, and infers reviewed head only when the supplied
  PR head is unchanged before/after collection and
  `hasNewCommitsSinceReview === false`.
- `CodeValidationGate` is pure and fail-closed. A pass requires live mode, draft
  PR, all checks passed, full coverage, completed live Greptile review for the
  exact head, no new commits, no unaddressed comments, and human approval still
  required.

## Fixture/demo behavior

Fixtures live under `fixtures/greptile/**`, are synthetic, and cite official
docs. They cover:

- clean review;
- actionable unaddressed comment;
- pending-to-complete review;
- failed/skipped/stale-head behavior;
- KB not enrolled/no documents;
- truncated KB search and document failure;
- rate-limit retry and invalid payload;
- prompt-injection text treated as untrusted data.

Fixture mode requires explicit `executionMode: "fixture"`. Reports retain that
value and validation never returns a live `pass` for fixture evidence.

## Contract versions consumed/produced

- Consumes `tetherin.migration-manifest/v1`.
- Produces `tetherin.blast-radius-report/v1`.
- Produces `tetherin.validation-report/v1`.

No schema changes were made. No proposed shared-contract changes are required
for Person C.

## Verification results

Executed with bundled Node `v24.19.0` and bundled pnpm `11.19.0` because host
Corepack failed to prepare pnpm `11.23.0` with an upstream signature-key error.
The repository `packageManager` remains unchanged and no lockfile is committed.

- `pnpm install --lockfile=false`: passed.
- `pnpm --filter @tetherin/greptile format:check`: passed.
- `pnpm --filter @tetherin/greptile lint`: passed.
- `pnpm --filter @tetherin/greptile typecheck`: passed.
- `pnpm --filter @tetherin/greptile test`: passed, 3 files / 11 tests.
- `pnpm --filter @tetherin/greptile test:fixtures`: passed, produces and
  schema-validates both blast-radius and validation reports offline.
- `pnpm verify:planning`: failed from the immutable planning baseline because
  `scripts/verify-planning.sh` requires `docs/workstreams/BASELINES.md`, while
  `37472c40de06251bf5a49b53239f912471a9b8f9` does not contain that later
  coordination file. I did not add or edit the root planning file because Person
  B ownership excludes root docs/contracts/scripts.
- `git diff --check`: passed.
- `git status --short`: clean after commit.

Live Greptile smoke tests were not run because no `GREPTILE_API_KEY`,
authorized demo PR, or confirmed KB rollout state was provided in this
environment.

## Security and ownership review

- No keys, tokens, `.env`, customer source bodies, full KB docs, or lockfile are
  committed.
- Logs/errors redact bearer tokens, API-key/token/secret/password patterns,
  OpenAI-style keys, GitHub tokens, and long secret-looking blobs.
- Tool calls are restricted to the confirmed Greptile MCP allowlist.
- Fixture prompt-injection content cannot alter tool allowlists, trust state, or
  confidence.
- Changes are limited to `packages/greptile/**`, `fixtures/greptile/**`, and
  `docs/workstreams/person-b/HANDOFF.md`.

## Remaining risks

- Live behavior still depends on Greptile organization API credentials,
  repository visibility through the Greptile GitHub App, and KB rollout access.
- Public docs do not publish a general MCP request quota; the adapter honors
  retryable/rate-limited failures and bounded retries but does not invent a
  requests-per-minute limit.
- Greptile MCP responses do not guarantee a structured reviewed commit SHA in
  every response; head freshness is a TetherIn inference from stable current head
  plus `hasNewCommitsSinceReview === false`.
- Deterministic AST coverage currently targets JavaScript/TypeScript. Other
  language hits remain possible unless Person C adds future AST adapters.
- Root planning verification should be repaired by Person C or the coordinator
  by reconciling `scripts/verify-planning.sh` with the immutable baseline tree.

## Person C handoff

1. Merge this branch after Person A according to `docs/workstreams/BASELINES.md`.
2. Inject a live `GreptileTransport` by providing `GREPTILE_API_KEY` in the
   server secret environment, or inject `FixtureGreptileTransport` only for demo
   mode with `executionMode: "fixture"`.
3. Call `enrichBlastRadius({ manifest, consumer, checkoutPath, executionMode })`
   against a read-only checkout whose `HEAD` equals `consumer.baseSha`.
4. After Codex opens the draft PR and tests pass, call `triggerReview(...)`,
   persist the returned `ReviewHandle`, then resume with `awaitReview({ handle,
readCurrentHead })`.
5. Pass `pullRequest`, check results, coverage accounting, and review evidence
   into `createCodeValidationGate().evaluate(...)`.
6. Treat `pending` or `fail` reason codes as state-machine inputs. A Codex
   follow-up changes the PR head and invalidates previous checks and Greptile
   evidence.
