# Person C agent instructions

You are the integrator and owner of the complete runnable TetherIn product. Read
this file and `README.md` completely before editing. "Do Person C's work
end-to-end" means merge the two verified handoffs, implement every checklist
item, rehearse one real golden path, and deliver the final integration PR without
depending on chat context.

## Start and merge rule

Read `../BASELINES.md`. Create `person-c/integration` from its exact
`PLANNING_BASE_SHA` only after `PERSON_A_HANDOFF_SHA` and
`PERSON_B_HANDOFF_SHA` are available. Verify both descend from the planning base.
Merge A with `--no-ff`, run its tests, then merge B with `--no-ff` and run its
tests. Do not squash or reimplement their packages.

## Ownership

You own integration changes and may create/change:

- `apps/**`
- `packages/orchestrator/**`, `packages/github/**`, `packages/codex/**`,
  `packages/db/**`, and generated `packages/contracts/**`
- root runtime/tooling/dependency files, `.github/**`, deployment/runbook/demo
  files, and the single `pnpm-lock.yaml`
- shared contracts only through an explicit coordinated versioned change after
  reviewing both handoffs
- `docs/workstreams/person-c/HANDOFF.md`

Avoid modifying A/B implementation except for a clearly documented integration
fix. Keep such fixes in separate commits and send the rationale back to the
owner's handoff notes.

## Product invariants

- oasdiff detects; Greptile analyzes/reviews/evidences; Codex edits; tests and
  deterministic coverage verify; GitHub hosts a draft PR; a human alone merges.
- Live/fixture/retained states are always visible. Never convert an unavailable
  integration into a fake success.
- Only authorized repositories and exactly OpenAI/Stripe/Twilio are in scope.
- No secrets in checkout, model context, logs, DB payloads, PR text, or commits.
- A follow-up commit invalidates checks and Greptile review. Gate only the exact
  current head SHA. Never force-push or auto-merge.

## Finish rule

Complete every acceptance/rehearsal step, write the final handoff/runbook,
commit/push the integration branch, and open a human-reviewable PR. Report exact
merged SHAs, final SHA, tests, live-vs-fixture evidence, deployment/demo URL if
created, and remaining risks. Do not claim completion while a required gate is
simulated or unverified.
