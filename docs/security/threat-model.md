# Laptop security and privacy threat model

TetherIn can edit and push code, so a laptop-only demo still needs hard trust
boundaries. The operator explicitly selects one dedicated consumer checkout and
expected `owner/repo`. This Tether repository is never a migration target.

## Data boundary

| Destination | Allowed data | Never send |
| --- | --- | --- |
| oasdiff process | Immutable official spec bytes and local config | Credentials or consumer source |
| Greptile | Repository already authorized in Greptile, bounded manifest terms, and the real PR/diff | Secrets, unrelated repositories, `.env*`, tokens, raw local artifacts |
| Codex | Disposable checkout, manifest, exact schema excerpts, official guidance, confirmed evidence, repository instructions, allowlisted checks | Provider credentials, GitHub/Greptile tokens, unrelated source, secret files |
| GitHub | TetherIn branch commits, draft PR body, and redacted evidence summaries | OpenAI/Greptile keys, raw transcripts, unredacted command logs |
| Local SQLite/artifacts | Digests, redacted evidence, state, IDs, timestamps, bounded excerpts | Tokens, raw `.env*`, full KB documents, raw model transcripts |

## Principal threats and controls

| Threat | Required control | Verification |
| --- | --- | --- |
| Wrong repository | Canonicalize absolute path; reject Tether root, ancestors, symlink escapes, wrong remote, wrong base, dirty tree, or detached unexpected SHA | Setup matrix covers every rejection |
| GitHub credential leakage | Call `gh auth status` and `gh auth token` in a scrubbed child process; never print, persist, or pass token as a command argument | Canary token absent from logs, DB, artifacts, prompts, and PR body |
| Prompt injection in specs/source/KB/comments | Delimit as untrusted data; fixed prompt and tool policy; no secret-bearing tools; command/path allowlists | Adversarial fixture cannot execute, expand access, or mark itself trusted |
| Secret exfiltration | Scrub child environments; deny `.env*`, credential stores, home-directory traversal, and unrelated files; cap output and redact before persistence | Canary secret scan across every retained artifact |
| Supply-chain substitution | Exact versions, immutable commits, SHA-256 checks, committed `bun.lock`, and preserved notices | Hash mismatch stops before diff or execution |
| OpenAPI remote references | Disable by default; if required, allow only declared HTTPS host/path with size, redirect, timeout, and hash rules | Private-IP and path-switch fixtures are rejected |
| Archive traversal | Inspect entries and expected files before extraction into fresh `.tetherin/tools/<digest>` | Absolute, parent, symlink, and oversized entries fail |
| Unsafe command composition | Spawn argument arrays without a shell; exact executable and command allowlists; timeout and output caps | Metacharacter fixtures remain literal arguments |
| Human work overwritten | Unique branch marker, expected-head checks before commit/push/PR update, no force push | Added human commit yields `NEEDS_INPUT` |
| Duplicate branch or PR | Stable idempotency key, one local lease, persisted side-effect receipt, lookup by marker before create | Crash/retry converges on one branch and one PR |
| Stale checks or review | Bind every result to exact consumer and PR head; compare base/head before review and validation | Push-after-test/review invalidates proof |
| Test weakening | Diff policy rejects skipped/removed checks, broad snapshot churn, config relaxation, and unrelated changes | Fault fixture fails before push |
| Fabricated evidence | Persistent `live`, `fixture`, or `retained-real` origin; fixed fixture texture/label; fixture gate cannot pass | Fixture run never reaches live `PR_READY` |
| Unsafe merge | No merge method, command, token scope, or UI action exists | Capability test and source search find no merge path |
| Local artifact disclosure | `.tetherin/` ignored, user-only permissions, bounded retention, redacted excerpts, explicit purge for the selected run | Permission and retention tests plus repository status check |

## Safe local lifecycle

1. `bun run setup` validates tools and configuration without printing secret
   values. It proves the consumer path, remote, base, and clean worktree.
2. The runner acquires a bounded SQLite lease and creates a disposable worktree
   only under the configured run directory.
3. Person A materializes immutable spec evidence. Person B analyzes the frozen
   consumer base. Codex receives the smallest allowed context.
4. Local checks run with bounded time, output, disk, and processes. The diff is
   inspected before any remote write.
5. `git` pushes a new owned branch without force; `gh` creates or finds the one
   draft PR by stable marker.
6. Greptile and checks bind to the current head. A changed head invalidates old
   proof. The final UI states that human merge is still required.
7. On shutdown, the runner releases or expires its lease, kills child process
   groups, removes disposable worktrees, and retains only policy-allowed
   redacted evidence.

## Recovery boundary

The reset command must accept a run ID, then resolve the configured consumer path
and branch from SQLite. It refuses arbitrary paths, Tether root, unknown remotes,
unowned branches, human commits, dirty state, or a missing typed confirmation.
It may remove only that run's disposable worktree and restore only the dedicated
demo checkout to its recorded base using non-force Git operations. Remote branch
or PR cleanup is a separate explicit operator step and never happens implicitly.
