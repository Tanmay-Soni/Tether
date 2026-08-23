# Greptile capability truth table

> Scope note: references below to Greptile's own GitHub App, network, or service
> options describe the external Greptile product as documented. They are not
> TetherIn runtime requirements. The hackathon TetherIn app is laptop-only and
> uses local Git plus the operator's authenticated `gh` session.

Research date: 2026-08-23. Sources are current official Greptile documentation.
Public interfaces can change; Person B must rerun this check before coding and
record any delta. When docs do not establish a property, this table says so.

| Product need | Confirmed official behavior/interface | TetherIn use | Boundary |
| --- | --- | --- | --- |
| Authorized repository access | Greptile's GitHub App can be installed for all or only selected repositories, then repos are enabled in Greptile. [Quickstart](https://www.greptile.com/docs/quickstart) | Require the consumer repo to appear in the authorized Greptile organization/team before live mode. | TetherIn cannot infer consent from a repo URL or GitHub token. |
| Whole-repo context | Greptile says it builds a graph of files, functions, classes, calls, imports, dependencies, and usage relationships, then queries it during code review. [Graph-based context](https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context) | Rely on this for independent PR review of wrappers/tests/downstream effects. | The docs do not expose that internal graph as a general source graph API. |
| Knowledge-base discovery | MCP `list_knowledge_bases` lists readable repos and returns the required `repoNamespaceExternalId`; default/max page sizes are 20/100 and scans cap at 2,000 repos. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools) | Resolve exact authorized repo namespace before any KB operation. | KB synthesis is an organization rollout, not enabled by default; empty can mean not enrolled. |
| Knowledge-base documents | `list_knowledge_base_documents` lists versioned `index.md`, `docs/**.md`, and optionally `reverts/**.md`; `get_knowledge_base_document` reads current Markdown up to an 80 KB response ceiling. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools) | Read index/relevant subsystem docs and record section version IDs. | Historical versions cannot be requested; content is synthesized and explicitly untrusted. |
| Knowledge-base search | `search_knowledge_base` does case-insensitive substring search in one repo; query 2–200 chars; default/max results 10/50. It returns paths, line snippets, versions, truncation/failure metadata, and `untrustedContent: true`. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools) | Search exact operationId, endpoint, removed property, SDK method candidates, then normalize relevant context. | This is not semantic/natural-language source search and does not prove exhaustive blast radius. |
| Pre-PR blast-radius endpoint | **Not documented in the current public docs index or MCP tool list.** The documented KB tool is substring search over synthesized docs. [Docs index](https://www.greptile.com/docs/llms.txt), [MCP tools](https://www.greptile.com/docs/mcp-v2/tools) | `enrichBlastRadius` is a TetherIn orchestration over KB reads plus deterministic source analysis. | Never call it an official Greptile blast-radius API or claim KB-only completeness. |
| Trigger PR review | MCP `trigger_code_review` accepts repository name, remote, default branch, PR number, optional branch; response contains `codeReviewId` and `PENDING`. Draft PRs are skipped by default unless configured/explicitly triggered. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools), [Developer essentials](https://www.greptile.com/docs/code-review/developer-essentials) | Trigger explicitly after draft PR creation and persist the returned ID. | `defaultBranch` is required; do not rely on automatic draft review. |
| Review status | `list_code_reviews`/`get_code_review` expose `PENDING`, `REVIEWING_FILES`, `GENERATING_SUMMARY`, `COMPLETED`, `FAILED`, `SKIPPED`. Greptile describes typical review duration as about 3 minutes. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools), [Anatomy of a review](https://www.greptile.com/docs/code-review/first-pr-review) | Bounded exponential polling with persisted ID; surface actual async state. | No current official outbound Greptile-to-TetherIn webhook is documented. GitHub events may wake polling, but are not Greptile completion proof. |
| Review comments/staleness | `get_merge_request` includes Greptile/human comments, review completeness, and `hasNewCommitsSinceReview`; `list_merge_request_comments` filters Greptile-generated/addressed comments. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools) | Normalize comments and reject a review when new commits exist or reviewed SHA differs. | Two bot identities are documented; use `isGreptileComment`, not username guesses. |
| Review confidence | Greptile's PR summary can show a 0–5 confidence score based on issue severity/count, complexity, and codebase alignment. [Anatomy of a review](https://www.greptile.com/docs/code-review/first-pr-review) | Record when returned, but gate on explicit status/comments/head SHA/checks rather than score alone. | Confidence is not a proof of correctness. |
| Local review | CLI v3.2.3 docs show `greptile review`, `--json`, `review status`, and exit codes; it reviews committed branch changes. [Greptile CLI](https://www.greptile.com/docs/code-review/greptile-cli) | Optional developer diagnostic/fallback, not the hosted PR evidence of record. | Do not install `latest` in CI; pin and verify if used. |
| Authentication | MCP is `https://api.greptile.com/mcp` with `Authorization: Bearer ...`; API keys come from organization settings. [MCP setup](https://www.greptile.com/docs/mcp-v2/setup) | Read `GREPTILE_API_KEY` from the server secret store and redact it everywhere. | Never put literal keys in MCP project config, logs, fixtures, or PRs. |
| "Code validator" | **No official product/API by that name is documented.** Greptile offers PR/CLI review, status, comments, confidence, and context. | `CodeValidationGate` is TetherIn's honest composite abstraction. | Fixture mode cannot assert a live validator pass. |
| Rate/async limits | KB search documents a 15-second work deadline and scan/character/response caps with explicit truncation reasons. Current public docs reviewed here do not publish general MCP request-rate quotas. [MCP tools](https://www.greptile.com/docs/mcp-v2/tools) | Honor truncation, page, timeout, 429/5xx retry hints; cap retries and show `partial`. | Do not invent a requests/minute quota. Plan capacity from measured live behavior/account terms. |
| Network privacy | Greptile documents cloud traffic from `18.97.34.0/29`; self-hosted options exist. [Network rules](https://www.greptile.com/docs/security/network-rules), [Deployment options](https://www.greptile.com/docs/deployment-options) | Document source/context leaving the customer boundary; allowlist only if customer policy requires it. | An IP range is not a privacy guarantee. Follow the customer's Greptile agreement and deployment choice. |

## Adapter rule

Live `enrichBlastRadius` performs this bounded sequence:

1. `list_knowledge_bases` with paging; match exact GitHub `owner/repo` and team.
2. `list_knowledge_base_documents`; record section version IDs and `indexPresent`.
3. Search separately for exact operationId, endpoint, changed property, known SDK
   method names, and webhook/type names. Store every query and truncation flag.
4. Fetch only the relevant original KB documents; mark content untrusted.
5. Run deterministic `rg` and language AST searches against the exact consumer
   base SHA. Assign `confirmed`, `possible`, or `rejected` with evidence.
6. Set completeness `partial` on any KB or deterministic truncation/failure.

This is TetherIn orchestration. Only steps 1–4 are Greptile MCP capabilities.

## Review and validation rule

After Codex pushes the tested head SHA, Person B's adapter calls
`trigger_code_review`, polls the persisted review ID, then reads the merge request
and unaddressed Greptile comments. A pass is impossible if the review is not
`COMPLETED`, comments are unresolved, the head changed, evidence is fixture, or
the deterministic/test inputs fail. Person C owns the final state transition;
Greptile never merges.
