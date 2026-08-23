# Git strategy and handoff protocol

All implementation branches start from the exact `PLANNING_BASE_SHA` in
`docs/workstreams/BASELINES.md`. Never start A or B from each other's branch.

```text
main @ planning base
├── person-a/provider-diff
├── person-b/greptile-evidence
└── person-c/integration
      merge --no-ff A_HANDOFF_SHA
      merge --no-ff B_HANDOFF_SHA
      complete application and demo
```

Use separate worktrees/clones:

```bash
git fetch origin --tags
git worktree add ../tetherin-a -b person-a/provider-diff <PLANNING_BASE_SHA>
git worktree add ../tetherin-b -b person-b/greptile-evidence <PLANNING_BASE_SHA>
```

Person C creates its branch only after both handoff SHAs are available:

```bash
git switch --detach <PLANNING_BASE_SHA>
git switch -c person-c/integration
git merge --no-ff <PERSON_A_HANDOFF_SHA>
git merge --no-ff <PERSON_B_HANDOFF_SHA>
```

Person A and B commit only owned directories plus a handoff note in their own
workstream directory. They do not update the root lockfile, schemas, root config,
or another workstream's plan. If a shared change is necessary, document the exact
patch proposal and reason in the handoff; Person C applies it once.

## Handoff commit contents

Each branch ends with one identifiable handoff commit containing:

- implementation and focused tests green;
- exact commands/results and fixture/live labels;
- exported API summary and schema version consumed/produced;
- dependency versions and licenses;
- known limitations/follow-ups;
- `git diff --check` clean and no secrets.

Person C records both SHAs in the integration PR and does not squash them away.
No branch may force-push after its SHA is handed off.
