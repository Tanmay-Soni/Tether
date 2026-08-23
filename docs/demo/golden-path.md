# Golden-path demo and recovery runbook

This runbook describes the implemented laptop-only product and its retained
Stripe rehearsal.

## Select one real change

Use the official Stripe v1617/v1618 pair as the live hero:

```text
old d53532098351a147bbe01f765f6e72497520e4d5 (v1617)
new 9fa5188b0933d46d2ac3c601d2d9c50904fb54de (v1618)
match ^/v1/invoices/upcoming(/lines)?$
GET /v1/invoices/upcoming removed (95193edec850)
GET /v1/invoices/upcoming/lines removed (ccc1bbbd2eab)
```

Stripe's create-preview replacement is provider-authored changelog guidance,
not an oasdiff finding. The OpenAI geography fixture remains the offline
fallback. The dedicated consumer repository contains a direct integration plus at
least one wrapper, one test, and one downstream assumption. Those must be real
committed files in the demo repository, not dashboard-only sample data. All
three provider adapters receive unit and contract tests, but the presentation
claims only this one live end-to-end run.

## Rehearsal gates

Before demo day:

1. Run the selected change from a clean dedicated checkout through a real draft
   PR, real local checks, and real Greptile review.
2. Retain one successful run's redacted artifacts, SQLite export, source links,
   PR URL, exact SHAs, review ID/status, and timestamps. Label it
   `retained-real`; never copy or relabel a fixture.
3. Use a separate fault-rehearsal branch with a known wrapper, test, or
   downstream use omitted from the first patch. Record what actually caught it:
   Greptile, deterministic coverage, or a test. Never prewrite a Greptile
   comment. Re-run the final head through review and validation.
4. Reset a separate live-demo checkout with the guarded command below. Keep the
   retained run immutable as the asynchronous fallback.
5. Run `bun run setup` immediately before judges arrive. Every live readiness
   row must be green. Fixture mode is not a substitute.

## Exact three-minute script

| Time         | Operator action                                                                                                          | What the judge sees and hears                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00 to 0:20 | Start target `bun run demo:live`; open printed localhost URL.                                                            | Top bar says **LIVE**, names the exact consumer repo, and shows local preflight ready. "API providers publish changelogs. TetherIn turns official spec changes into tested customer migration PRs."                                        |
| 0:20 to 0:45 | Open **API Change** and start the prepared run.                                                                          | Exact provider old/new commits, source links, spec hashes, oasdiff v1.29.1, raw digest, endpoint, operation ID, and normalized change. No invented summary.                                                                                |
| 0:45 to 1:15 | Advance to **Blast Radius**.                                                                                             | Evidence grouped as source, wrapper, tests, and downstream assumptions, each with path, symbol, reason, confidence, and Greptile or deterministic provenance. Explain that Greptile enriches context and `rg`/AST confirms source.         |
| 1:15 to 1:50 | Open **Codex Migration**.                                                                                                | Codex operates in a disposable checkout. Show bounded activity, changed files, focused diff, and exact checks. Say that Codex edits; Greptile independently reviews.                                                                       |
| 1:50 to 2:20 | Open **Validation & PR** and follow the real draft PR link.                                                              | PR body binds provider provenance, manifest, affected code, Codex summary, exact commands/results, Greptile state, and current head. State clearly that merge remains human-only.                                                          |
| 2:20 to 2:45 | If live Greptile is complete, show its real review and composite gate. If still pending, use **Open retained real run**. | Pending remains visibly pending. The retained view keeps its own timestamp, PR, and SHAs. If the real rehearsal found a missed use, show the actual comment or deterministic/test failure and one bounded Codex follow-up on the new head. |
| 2:45 to 3:00 | Return to the final gate summary.                                                                                        | Tests, deterministic coverage, Greptile freshness, unresolved findings, exact PR head, and **Human merge required**. Close with: "One official change, one verified customer PR, no auto-merge."                                           |

## Stop conditions

Stop and explain the evidence instead of papering over it when:

- official spec bytes, oasdiff version, or a recorded digest differs;
- the consumer path, remote, clean base, or authorization cannot be proven;
- deterministic analysis is truncated while the UI claims completeness;
- Codex touches unrelated files, weakens checks, or needs a business decision;
- tests fail, Greptile is stale, or the PR head changes;
- a push would overwrite a human commit;
- the only available evidence is fixture data.

## Scoped recovery

Person C must implement and test this target command:

```bash
bun run demo:reset -- --run <run-id>
```

It must print the resolved consumer path, expected `owner/repo`, base SHA,
TetherIn-owned branch, PR number, and planned local actions, then require the
operator to type the exact run ID. It must refuse this Tether repository, an
unknown path or remote, a dirty checkout, an unowned branch, a branch with human
commits, or any SHA mismatch. It never force pushes and never silently closes a
PR or removes a remote branch.

The safe result is:

1. stopped dashboard/runner child processes and expired local lease;
2. removed disposable worktree registered to that run only;
3. dedicated live checkout switched to its recorded base branch and updated by
   fast-forward only;
4. owned local demo branch removed only when already merged or explicitly
   confirmed and no human commit exists;
5. the run retained in SQLite as historical evidence, with reset event and
   artifact retention policy applied.

If the guard refuses, recover manually with read-only inspection first:

```bash
git -C "$TETHERIN_CONSUMER_REPO_PATH" status --short --branch
git -C "$TETHERIN_CONSUMER_REPO_PATH" remote get-url origin
git -C "$TETHERIN_CONSUMER_REPO_PATH" log --oneline --decorate -8
gh pr view <number> --repo "$TETHERIN_CONSUMER_REPO" --json isDraft,state,headRefName,headRefOid,baseRefOid,url
```

Do not use a broad cleanup command. Closing a demo PR or deleting its remote
branch is a separate, explicit human choice after reviewing the exact PR URL.

## Positioning answers

- A changelog informs a human. TetherIn connects an exact contract change to
  affected code and a tested patch.
- Dependabot bumps a package. TetherIn migrates behavior across wrappers,
  payload transforms, webhook handling, tests, and downstream assumptions.
- Codex makes the change. Greptile supplies independent repository-aware review
  evidence. oasdiff remains the contract-change authority.
- TetherIn does not auto-merge because API behavior and business semantics still
  require human ownership.
- The longer-term provider opportunity is one open, provider-authored executable
  migration protocol. The hackathon demo remains customer-focused.
