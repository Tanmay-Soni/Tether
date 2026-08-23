# Immutable workstream baselines

This is the coordinator handoff for autonomous implementation agents. Read it on
current `main`, copy the exact values below, and then create a separate checkout.
The coordination commit containing this file is intentionally one descendant of
the planning base; the copy inside the detached base is historical. Use the
values copied from current `main`.

## Current local-only planning base

| Artifact | Commit |
| --- | --- |
| Foundation, contracts, research, assets | `ce4b757642a5de1761dc8cc78e78c9764f78d102` |
| Person A planning package | `85d59f4a6a593c33bd02f2ad5a0e1eaa8fbb1b1d` |
| Person B planning package | `9c2f9a8ae4bf46d53bbc1ae550546133deeb8662` |
| Superseded hosted Person C package | `37472c40de06251bf5a49b53239f912471a9b8f9` |
| Local-only Bun/SQLite/`gh` Person C rewrite | `c619c8510816f854599d8d0f3704cb3d833b8c0e` |
| Premium dashboard contract | `2aa7434a93783bee4ecde67f5e502c6176c214c5` |
| Completed B verification | `6247ce9e7c07333ddcabd49f424b868e885b9bdb` |
| Earlier local coordination pin | `fbae67b468f4d7522ffb8d946ba336c713b166c7` |
| Concrete A+B integration evidence and Person C plan | `13d5209ebb44fe9934d15c3508f9faa1091d60f2` |

The only new implementation work is Person C. Its immutable base is:

```text
PLANNING_BASE_SHA=13d5209ebb44fe9934d15c3508f9faa1091d60f2
```

This base contains the definitive laptop-only runtime plan, dashboard contract,
correct OpenAI raw digest, Bun lock, root AJV resolution, exact A/B APIs and
limits, and verified test evidence. Person A and B are already complete; do not
start duplicate workstreams.

## Completed handoffs

```text
PERSON_A_BRANCH=origin/person-a/provider-diff
PERSON_A_HANDOFF_SHA=da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3
PERSON_A_ORIGINAL_BASE_SHA=37472c40de06251bf5a49b53239f912471a9b8f9

PERSON_B_BRANCH=origin/person-b/greptile-evidence
PERSON_B_HANDOFF_SHA=57a602ba9de7357fd0385f20e23460b8642b74a9
PERSON_B_ORIGINAL_BASE_SHA=37472c40de06251bf5a49b53239f912471a9b8f9
```

Remote inspection on 2026-08-23 found both exact branches and no open or closed
PR. Do not rebase, amend, recreate, squash, or force-push either handoff. Their
implementation and `HANDOFF.md` files live at those exact tips.

Person A delivers `@tetherin/provider-pipeline`: official OpenAI, Stripe, and
Twilio adapters, checksum-pinned oasdiff 1.29.1 execution, retained raw output,
manifest normalization, and provenance. Person B delivers
`@tetherin/greptile`: Greptile MCP/fixture transports, KB enrichment,
deterministic impact confirmation, PR review polling, and the fail-closed
composite validation gate. Person C's README records their actual exports and
exact invocation shapes.

## Person C start and merge order

Merge A first and B second. This exact order was tested in an isolated worktree
and produced no merge conflicts:

```bash
git fetch origin --tags
git cat-file -e 13d5209ebb44fe9934d15c3508f9faa1091d60f2^{commit}
git merge-base --is-ancestor 13d5209ebb44fe9934d15c3508f9faa1091d60f2 origin/main
git switch --detach 13d5209ebb44fe9934d15c3508f9faa1091d60f2
git switch -c person-c/integration

git fetch origin person-a/provider-diff person-b/greptile-evidence
test "$(git rev-parse origin/person-a/provider-diff)" = "da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3"
test "$(git rev-parse origin/person-b/greptile-evidence)" = "57a602ba9de7357fd0385f20e23460b8642b74a9"
git merge --no-ff da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3
git merge --no-ff 57a602ba9de7357fd0385f20e23460b8642b74a9
bun install
```

Keep root `overrides.ajv = "8.20.0"` and regenerate `bun.lock`. Without that
C-owned resolution, Bun installs A's 8.17.1 beside B/root's 8.20.0 and A's
strict typecheck fails. Do not edit A's algorithms or dependency declaration.

Run the real post-merge checks:

```bash
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

The isolated Bun 1.4.0 merge passed A format/lint/typecheck, 111 unit tests,
8 checksum-backed fixture tests, build, and all 3 opt-in live provider adapter
tests. It passed B format/lint/typecheck, 11 unit tests, and 1 fixture test. No
live Greptile smoke ran because no authorized key, demo PR, or verified KB
rollout was available; Person C must retain that limitation until a real smoke.

## Integration gaps owned by Person C

- B's package export targets `dist/index.js` but has no build script. Add
  C-owned build/public-import glue and smoke the package name; do not import B's
  private modules or replace its logic.
- A's public package builds and imports. Its installer script is committed but
  not publicly exported; setup runs that script/fixture smoke, while runtime
  uses public `createOasdiffEngine().compare()`.
- A's handoff prose passes raw changes to `guidance`, but the actual type accepts
  normalized changes and current providers return `[]`. Omit optional guidance
  rather than casting raw changes; record the mismatch without changing A.
- A's v1 manifest cannot represent `[]`; persist an honest no-change workflow
  outcome and never fabricate a manifest.
- The selected live golden path is OpenAI's real geography removal. A proved the
  Stripe research pair and Twilio pair yield no semantic change.
- Validate every A output as `tetherin.migration-manifest/v1` before B consumes
  it, then validate B's blast-radius and validation reports at C's boundary.

## Ownership and final handoff

C owns `apps/**`, local integration packages, root configuration/lock, SQLite,
Codex and Git/`gh` glue, B packaging glue, the dashboard, tests, and runbooks.
A/B package algorithms and focused tests remain untouched. A conflict outside
root/shared coordination paths is a reason to stop and inspect, not to discard a
side.

Person C records the planning base, both handoff SHAs, merge commits, contract
versions, final lock digest, exact commands/results, live/fixture evidence, real
consumer draft PR, Greptile status, screenshots, recovery result, and remaining
risks in `docs/workstreams/person-c/HANDOFF.md`.

```text
PERSON_C_FINAL_SHA=<40-character commit from person-c/integration>
```
