# Golden-path demo and rehearsal

The demo proves one complete customer migration. It does not pretend all three
provider adapters have run live. Stripe is preferred when Person A can produce a
crisp official, version/deprecation-aware historical pair and a consumer sample
that genuinely needs migration. Otherwise the exact OpenAI `geography` removal
fixture is the deterministic fallback.

## Required pre-demo evidence

- official old/new spec URLs, commits, licenses, and SHA-256 values;
- oasdiff v1.29.1 checksum, command, raw breaking/changelog JSON, and manifest;
- an authorized consumer demo repository pinned to a base SHA;
- a live or visibly fixture Greptile mode indicator;
- a Codex runner with no production secrets and a scoped GitHub App;
- recorded test/typecheck commands that fail before or exercise the migration;
- a real retained rehearsal artifact for any async fallback shown.

## Seven-minute customer narrative

1. **Change detected.** Show old/new official source links and the exact semantic
   oasdiff finding—not a prose changelog summary.
2. **Impact identified.** Show Greptile KB context separately from confirmed
   `rg`/AST files/symbols and explain confidence/limitations.
3. **Codex migrates.** Open the narrow patch; show which manifest change and
   evidence caused each edit.
4. **Checks run.** Show real commands, exit codes, tested commit SHA, and redacted
   output digests.
5. **Draft PR opens.** Show upstream provenance, affected code, and test evidence
   in the PR body. Emphasize that no merge has occurred.
6. **Independent review.** Show the actual Greptile state/comments for the exact
   head SHA. If Greptile finds a missed wrapper/test/downstream effect, let Codex
   make the follow-up patch and re-run checks/review.
7. **Human ready.** Show the composite gate: tests, deterministic coverage,
   Greptile review, current SHA, and human approval requirement.

## Honest review-loop rehearsal

Do not prewrite a Greptile finding or label a fixture as live. To rehearse the
loop, use a separate fault-injection branch containing a known downstream usage
that the first patch does not update. Run the real deterministic gate and live
Greptile review, retain their actual timestamped outputs, and record which one
found it. The stage presentation follows the observed result:

- if Greptile flags it, show the real comment/review ID and Codex follow-up;
- if only deterministic coverage/tests flag it, say so and show that gate;
- if the live review is unavailable, show `pending` or the clearly labeled
  retained real rehearsal—never a simulated completed review.

The final clean state must be re-reviewed at the new head SHA. A clean old review
is not reusable.

## Demo stop conditions

Stop and explain rather than papering over the system when:

- provider bytes or oasdiff checksum differs from recorded provenance;
- consumer authorization/base SHA cannot be proven;
- evidence is truncated but UI claims completeness;
- Codex changes unrelated code, weakens tests, or requires a secret;
- checks fail or no meaningful check covers the changed behavior;
- Greptile review is failed/stale/unavailable but UI claims validation;
- branch push would overwrite human work.

## Positioning answers

- **Why not a changelog?** A changelog informs a human; TetherIn connects the
  exact contract change to affected customer code and a tested patch.
- **Why not Dependabot?** A package bump changes a version; TetherIn migrates
  behavior across wrappers, webhook payloads, transforms, tests, and downstream
  assumptions, even when no dependency version changes.
- **Why not auto-merge?** API behavior and business semantics require human
  ownership. TetherIn prepares evidence; it does not take that decision away.
- **What does a provider gain?** One official contract/migration publication can
  fan out into correct draft PRs for consenting customers.
