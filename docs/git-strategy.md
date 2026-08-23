# Git strategy and handoff protocol

Person A and Person B are complete, pushed, and immutable. Person C starts from
the exact `PLANNING_BASE_SHA` recorded in `docs/workstreams/BASELINES.md`, then
merges A before B. Use a separate clone or worktree and never force push.

## Verified handoffs

```text
Person A branch  origin/person-a/provider-diff
Person A SHA     da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3
Person A base    37472c40de06251bf5a49b53239f912471a9b8f9
Person B branch  origin/person-b/greptile-evidence
Person B SHA     57a602ba9de7357fd0385f20e23460b8642b74a9
Person B base    37472c40de06251bf5a49b53239f912471a9b8f9
```

Remote inspection on 2026-08-23 found both branches and no open or closed PR.
Their `HANDOFF.md` files, exact exports, dependencies, results, and limitations
are summarized in Person C's README. A then B was merge-tested in an isolated
worktree with no conflicts.

```text
main @ local-only planning record
├── person-a/provider-diff @ da15ba9, complete
├── person-b/greptile-evidence @ 57a602b, complete
└── person-c/integration @ PLANNING_BASE_SHA
      merge --no-ff da15ba9
      merge --no-ff 57a602b
      regenerate bun.lock and verify both
      complete local application and demo
```

## Exact integration sequence

```bash
git fetch origin --tags
git switch --detach <PLANNING_BASE_SHA>
git switch -c person-c/integration
git fetch origin person-a/provider-diff person-b/greptile-evidence
test "$(git rev-parse origin/person-a/provider-diff)" = "da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3"
test "$(git rev-parse origin/person-b/greptile-evidence)" = "57a602ba9de7357fd0385f20e23460b8642b74a9"
git merge --no-ff da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3
git merge --no-ff 57a602ba9de7357fd0385f20e23460b8642b74a9
bun install

bun run --filter @tetherin/provider-pipeline format:check
bun run --filter @tetherin/provider-pipeline lint
bun run --filter @tetherin/provider-pipeline typecheck
bun run --filter @tetherin/provider-pipeline test
bun run --filter @tetherin/provider-pipeline test:fixture
bun run --filter @tetherin/provider-pipeline build
bun run --filter @tetherin/provider-pipeline test:live

bun run --filter @tetherin/greptile format:check
bun run --filter @tetherin/greptile lint
bun run --filter @tetherin/greptile typecheck
bun run --filter @tetherin/greptile test
bun run --filter @tetherin/greptile test:fixtures
```

After both merges, Person C changes only A's package-manifest AJV dependency
from 8.17.1 to the shared 8.20.0 and regenerates `bun.lock`. Without alignment,
A's strict typecheck fails at the ajv-formats boundary. Do not use a global AJV
override: Bun supports only top-level overrides, which also replace ESLint's
required AJV 6 and break lint. The selective package alignment passed A's 111
unit tests, 8 checksum-backed fixture tests, build, and 3 live adapter tests plus
B's 11 unit and 1 fixture tests.

`test:live` reads immutable official provider sources and remains opt-in for the
final product suite. It passed during planning integration. No live Greptile
smoke was possible because no authorized key/repository review context was
available; Person C must run it during live setup.

## Ownership and conflicts

Person A owns its provider package/fixtures/handoff. Person B owns its Greptile
package/fixtures/handoff. Person C owns root Bun integration, AJV alignment,
`bun.lock`, B's missing public build/import glue, application packages, and
coordinated shared docs/contracts. Do not modify A/B algorithms to fix packaging.

The verified A-then-B merge had no conflicts. A future conflict outside root
configuration or shared coordination files indicates an ownership violation;
stop and inspect both sides rather than silently dropping behavior. Do not squash
the handed-off commits, rebase them, or replace an exact SHA with moving `main`.

Each final handoff records exact parent SHAs, exported contracts, dependency and
license changes, fixture/live labels, commands/results, limitations, a clean
`git diff --check`, and no secrets.
