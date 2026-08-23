# Git strategy and handoff protocol

All new implementation work starts from the exact `PLANNING_BASE_SHA` recorded
in `docs/workstreams/BASELINES.md`. Never start Person A from Person B or vice
versa. Use separate clones or worktrees.

## Current handoff state

```text
Person B branch  origin/person-b/greptile-evidence
Person B SHA     57a602ba9de7357fd0385f20e23460b8642b74a9
Person B base    37472c40de06251bf5a49b53239f912471a9b8f9
Person A SHA     pending coordinator confirmation
```

Remote inspection on 2026-08-23 found the one Person B implementation commit
above and no PR. The branch is pushed. Its `HANDOFF.md`, public exports,
dependencies, tests, and limitations are summarized in Person C's README.

## Branch topology

```text
main @ current planning record
├── person-a/provider-diff @ PLANNING_BASE_SHA, handoff pending
├── person-b/greptile-evidence @ 57a602b, complete
└── person-c/integration @ PLANNING_BASE_SHA
      merge --no-ff 57a602b now
      scaffold against labeled manifest fixture
      merge --no-ff A_HANDOFF_SHA when coordinator confirms it
      complete local application and demo
```

Person C verifies B by SHA, never by a moving branch alone:

```bash
git fetch origin --tags
git switch --detach <PLANNING_BASE_SHA>
git switch -c person-c/integration
git fetch origin person-b/greptile-evidence
test "$(git rev-parse origin/person-b/greptile-evidence)" = "57a602ba9de7357fd0385f20e23460b8642b74a9"
git merge --no-ff 57a602ba9de7357fd0385f20e23460b8642b74a9
bun install
bun run --filter @tetherin/greptile format:check
bun run --filter @tetherin/greptile lint
bun run --filter @tetherin/greptile typecheck
bun run --filter @tetherin/greptile test
bun run --filter @tetherin/greptile test:fixtures
```

Person A remains independent. C may build state, UI, and orchestration against
the committed OpenAI manifest fixture, but may not fabricate A exports or claim
a live provider pipeline. When the coordinator supplies the exact A SHA:

```bash
git fetch origin person-a/provider-diff
test "$(git rev-parse origin/person-a/provider-diff)" = "<PERSON_A_HANDOFF_SHA>"
git merge --no-ff <PERSON_A_HANDOFF_SHA>
bun install
bun run --filter @tetherin/provider-pipeline format:check
bun run --filter @tetherin/provider-pipeline lint
bun run --filter @tetherin/provider-pipeline typecheck
bun run --filter @tetherin/provider-pipeline test
bun run --filter @tetherin/provider-pipeline test:fixture
```

## Ownership and lock rule

Person A and B commit only owned package/fixture directories and their handoff
notes. They do not update the root lock or another workstream's plan. Person C
owns root Bun integration and final `bun.lock`. B's commit was tested with an old
Node/package-manager environment and has no package build script, so C must add
explicit runtime packaging glue and run the actual B tests under Bun without
changing B's evidence or gate algorithms.

A shared contract change is an exact versioned handoff proposal. Person C
coordinates the patch after integration. Integration conflicts outside root
configuration indicate an ownership violation and must not be resolved by
silently dropping behavior.

## Handoff commit contents

Each implementation branch ends with one immutable handoff containing:

- implementation and focused tests green;
- exact planning/handoff SHAs, commands, and results;
- exported API summary and schema versions consumed/produced;
- dependency versions and licenses;
- fixture/live labels and live smoke status;
- known limitations and proposed shared changes;
- `git diff --check` clean and no secrets.

No handed-off branch may be force-pushed. Person C records both handoff SHAs in
its integration PR and does not squash them away.
