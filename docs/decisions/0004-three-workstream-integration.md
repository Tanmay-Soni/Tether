# ADR 0004: Parallel provider and Greptile packages, single integrator

- Status: accepted
- Date: 2026-08-23

## Decision

Person A and Person B start from the same immutable planning base and own
non-overlapping packages. They exchange only the checked-in JSON contracts.
Person C waits for both handoff commits, merges A then B into
`person-c/integration`, resolves only shared configuration, and delivers the app.

Person C owns root dependency/lockfile changes because concurrent lockfiles are
mechanically conflict-prone. A and B test with `pnpm install --lockfile=false`
and do not commit `pnpm-lock.yaml`.

## Consequences

The parallel agents cannot depend on uncommitted chat decisions or each other's
branches. Any contract change is a handoff proposal, not a unilateral edit.
Integration conflicts indicate an ownership violation and must be resolved by
restoring the documented boundary before feature work continues.
