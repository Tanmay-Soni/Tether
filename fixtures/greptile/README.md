# Greptile fixture inventory

Research date: 2026-08-23.

These fixtures are synthetic, official-shape examples for deterministic tests and
demo mode. They are not live Greptile evidence, contain no customer source, and
must only be used when `executionMode: "fixture"` is explicit.

Official sources checked before implementation:

- Greptile MCP tools reference: https://www.greptile.com/docs/mcp-v2/tools
- Greptile MCP setup/auth: https://www.greptile.com/docs/mcp-v2/setup
- Greptile quickstart repository authorization: https://www.greptile.com/docs/quickstart
- Greptile graph-based review context: https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context
- Greptile developer essentials / draft PR behavior: https://www.greptile.com/docs/code-review/developer-essentials
- Greptile anatomy of review / confidence: https://www.greptile.com/docs/code-review/first-pr-review

Fixture files:

- `kb/not-enrolled.json`: empty `list_knowledge_bases` response, representing no
  KB rollout/enrollment or no visible repository.
- `kb/truncated-search.json`: KB visible, docs present, search response truncated
  with document failures and untrusted notice.
- `kb/prompt-injection.json`: KB text attempts to instruct the agent; tests treat
  it only as untrusted data.
- `review/clean.json`: trigger, complete review, no new commits, no unaddressed
  comments.
- `review/actionable-comment.json`: completed review with one unaddressed
  Greptile comment.
- `review/stale-head.json`: completed review where merge-request analysis
  reports new commits.
- `review/pending-failure-rate-limit-invalid.json`: pending/failure/rate-limit
  and invalid-payload cases for negative tests.

Fixture mode behavior:

- reports always carry `executionMode: "fixture"`;
- Greptile transport is reported as `fixture`, never `mcp`;
- the validation gate never returns a live `pass` for fixture evidence;
- prompt-injection text cannot alter tool allowlists, confidence, or trust state.
