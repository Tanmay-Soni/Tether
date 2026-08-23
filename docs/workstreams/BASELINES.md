# Immutable workstream baselines

This file is the coordinator handoff for autonomous implementation agents. Read
it on current `main` before creating any implementation branch.

## Planning commits

| Artifact | Commit | Commit message |
| --- | --- | --- |
| Foundation, contracts, research, security, assets | `ce4b757642a5de1761dc8cc78e78c9764f78d102` | `feat: establish TetherIn planning foundation and contracts` |
| Person A work package | `85d59f4a6a593c33bd02f2ad5a0e1eaa8fbb1b1d` | `docs(person-a): define provider and oasdiff workstream` |
| Person B work package | `9c2f9a8ae4bf46d53bbc1ae550546133deeb8662` | `docs(person-b): define Greptile evidence workstream` |
| Person C work package | `37472c40de06251bf5a49b53239f912471a9b8f9` | `docs(person-c): define full product integration workstream` |

The common implementation baseline is:

```text
PLANNING_BASE_SHA=37472c40de06251bf5a49b53239f912471a9b8f9
```

That commit contains the foundation plus all three plans. This file is a later
coordination record, so it is intentionally not present after detaching to the
planning base; copy the SHA before switching. Verify it is on `origin/main` and
matches the table before using it.

## Branch commands

Use separate clones or worktrees. Person A and Person B start independently from
the exact same commit:

```bash
git fetch origin
git cat-file -e 37472c40de06251bf5a49b53239f912471a9b8f9^{commit}

# Person A checkout only
git switch --detach 37472c40de06251bf5a49b53239f912471a9b8f9
git switch -c person-a/provider-diff

# Person B uses a different checkout
git switch --detach 37472c40de06251bf5a49b53239f912471a9b8f9
git switch -c person-b/greptile-evidence
```

Person C waits for the immutable A/B handoff SHAs, then:

```bash
git switch --detach 37472c40de06251bf5a49b53239f912471a9b8f9
git switch -c person-c/integration
git merge --no-ff <PERSON_A_HANDOFF_SHA>
git merge --no-ff <PERSON_B_HANDOFF_SHA>
```

Merge order is A then B. Run each workstream's focused test suite immediately
after its merge. Do not squash handoff commits, force-push a handed-off branch,
or substitute `main` for the pinned SHA.

## Handoff SHA slots

These do not exist during planning. The implementation coordinator records them
without rewriting the planning base:

```text
PERSON_A_HANDOFF_SHA=<40-character commit from person-a/provider-diff>
PERSON_B_HANDOFF_SHA=<40-character commit from person-b/greptile-evidence>
PERSON_C_FINAL_SHA=<40-character commit from person-c/integration>
```
