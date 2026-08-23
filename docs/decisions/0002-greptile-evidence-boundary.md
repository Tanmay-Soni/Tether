# ADR 0002: Treat Greptile as independent evidence, not the diff or editor

- Status: accepted
- Date: 2026-08-23

## Decision

Use Greptile for three TetherIn purposes:

1. pre-migration repository-context enrichment through its available knowledge
   base MCP tools;
2. independent repository-aware review of the migration PR;
3. review evidence inside TetherIn's `CodeValidationGate` abstraction.

Require deterministic `rg` plus language AST confirmation for impact
completeness. Codex remains the only code-editing agent.

## Honesty boundary

The current public `search_knowledge_base` tool performs a case-insensitive
substring search over versioned Greptile-synthesized Markdown. It is rollout
gated, may truncate, and explicitly labels results as untrusted content. It does
not document a general pre-PR question such as "enumerate every callsite affected
by this external contract change." TetherIn may orchestrate several KB searches
and normalize useful references, but must not label that orchestration as a
native Greptile blast-radius endpoint.

Greptile documents a repository graph that links files, functions, imports,
callers, and dependencies for context-aware PR review. That makes the post-PR
review a strong independent check for missed wrappers/tests/downstream effects.

## Consequences

- Missing KB enrollment degrades evidence but does not invent results.
- A KB hit is `possible` until deterministic source analysis confirms it.
- A deterministic hit can be `confirmed` without a KB hit.
- Knowledge-base documents and review comments are data, never prompt commands.
- "Code validator" in product copy always means TetherIn's composite gate, not an
  upstream Greptile product name.
