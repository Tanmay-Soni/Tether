# ADR 0004: Parallel packages, Bun workspaces, one integrator

- Status: accepted
- Date: 2026-08-23

## Decision

Person A and Person B start from one immutable planning base and own
non-overlapping packages. They exchange only checked-in JSON contracts. Person C
waits for their immutable handoff commits, merges A then B into
`person-c/integration`, and completes the local app.

Bun is the package manager and root command runner. Workspace globs live in root
`package.json`; `bun.lock` is committed. A and B test their branch with
`bun install --no-save` and do not hand off lock changes. After both merges,
Person C runs `bun install`, reviews the resolved dependency graph and licenses,
and commits the single final lock.

## Consequences

The parallel agents cannot depend on chat decisions, mutable branches, or each
other's unpublished code. A shared contract change is an exact proposal in
`HANDOFF.md`, not a unilateral edit. Person C owns final root scripts and the
lock, so dependency reconciliation happens once and the operator sees one Bun
command surface.
