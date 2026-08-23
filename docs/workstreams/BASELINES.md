# Immutable workstream baselines

This is the coordinator handoff for autonomous implementation agents. Read it on
current `main`, copy the required SHA, and then create a separate checkout. This
file is intentionally committed after the base it identifies.

## Current local-only planning base

| Artifact | Commit | Commit message |
| --- | --- | --- |
| Original foundation, contracts, research, assets | `ce4b757642a5de1761dc8cc78e78c9764f78d102` | `feat: establish TetherIn planning foundation and contracts` |
| Person A work package | `85d59f4a6a593c33bd02f2ad5a0e1eaa8fbb1b1d` | `docs(person-a): define provider and oasdiff workstream` |
| Person B work package | `9c2f9a8ae4bf46d53bbc1ae550546133deeb8662` | `docs(person-b): define Greptile evidence workstream` |
| Earlier Person C package | `37472c40de06251bf5a49b53239f912471a9b8f9` | superseded by local-only plan |
| Local-only Bun/SQLite/`gh` Person C rewrite | `c619c8510816f854599d8d0f3704cb3d833b8c0e` | `docs: rebuild Person C for local-only Bun runtime` |
| Premium dashboard contract | `2aa7434a93783bee4ecde67f5e502c6176c214c5` | `docs(design): specify premium local control-room dashboard` |
| Completed B evidence and planning verification | `6247ce9e7c07333ddcabd49f424b868e885b9bdb` | `docs: verify completed Person B and local planning consistency` |

The common base for every not-yet-started Person A or Person C agent is:

```text
PLANNING_BASE_SHA=6247ce9e7c07333ddcabd49f424b868e885b9bdb
```

It contains the local-only architecture, Bun lock/toolchain, rewritten Person C,
dashboard contract, Person B exact integration evidence, and executable planning
checks. This coordination file is one later commit and therefore is not present
after detaching to the base. Copy the SHA first.

## Person B is complete

Remote inspection on 2026-08-23 found exactly these branches: `main` and
`person-b/greptile-evidence`. No PR was open or closed. Person B is pinned as:

```text
PERSON_B_BRANCH=origin/person-b/greptile-evidence
PERSON_B_HANDOFF_SHA=57a602ba9de7357fd0385f20e23460b8642b74a9
PERSON_B_ORIGINAL_BASE_SHA=37472c40de06251bf5a49b53239f912471a9b8f9
```

Do not rebase, amend, recreate, or force-push B. Its remote `HANDOFF.md` and
implementation live at that SHA. The planning-base verification merged the exact
commit into an isolated worktree and passed its real scripts under Bun 1.4.0:

```text
format:check   passed
lint           passed
typecheck      passed
test           passed, 3 files and 11 tests
test:fixtures  passed, 1 file and 1 test
```

No live Greptile smoke was run. Person C must preserve that limitation and run
the live check with the authorized demo repo and credentials. B's package export
targets unbuilt `dist/index.js`; Person C owns the explicit root build/public
import glue described in its README, not changes to B's algorithms.

## Person A is independent and pending

No remote `person-a/provider-diff` branch was present at the inspection time. If
Person A has not started, it must start from the new planning base. If a local or
otherwise unpushed candidate exists, the coordinator must supply its exact SHA;
do not select or infer one.

```bash
git fetch origin --tags
git cat-file -e 6247ce9e7c07333ddcabd49f424b868e885b9bdb^{commit}
git merge-base --is-ancestor 6247ce9e7c07333ddcabd49f424b868e885b9bdb origin/main
git switch --detach 6247ce9e7c07333ddcabd49f424b868e885b9bdb
git switch -c person-a/provider-diff
bun install --no-save
```

Person A does not commit `bun.lock`. It reports one immutable handoff SHA and
Person C verifies its remote branch before merging.

## Person C start and merge order

Person C may begin immediately by merging verified B, then scaffold provider
input only from the explicitly labeled committed OpenAI manifest fixture while A
is pending:

```bash
git fetch origin --tags
git switch --detach 6247ce9e7c07333ddcabd49f424b868e885b9bdb
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

When the coordinator supplies Person A's immutable SHA:

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

Final live completion requires both handoffs. C then regenerates the single
`bun.lock`, runs the entire root suite, and records all parent/handoff SHAs. Do
not squash A or B, rewrite a handed-off branch, or substitute mutable `main` for
the pinned base.

## Handoff SHA slots

```text
PERSON_A_HANDOFF_SHA=<coordinator-confirmed 40-character commit or pending>
PERSON_B_HANDOFF_SHA=57a602ba9de7357fd0385f20e23460b8642b74a9
PERSON_C_FINAL_SHA=<40-character commit from person-c/integration>
```
