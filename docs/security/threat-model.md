# Security and privacy threat model

TetherIn is authorized to change customer code, so a polished demo without a
strict trust model is unsafe. The minimum deployment boundary is one isolated
job environment per consumer repository and migration.

## Data sent outside TetherIn

| Destination | Allowed data | Never send |
| --- | --- | --- |
| oasdiff process | Official spec bytes in a network-disabled local process | Credentials, customer source |
| Greptile | Only repositories the customer enabled in Greptile; manifest search terms; PR branch/diff through its installed app | Secrets, unrelated repos, raw `.env`, tokens |
| Codex | Ephemeral authorized checkout, normalized manifest, exact schema excerpts, official guidance, confirmed evidence, test commands | Provider/customer production credentials, other repos, secret store contents |
| GitHub | Branch commits, draft PR evidence, check summaries | OpenAI/Greptile keys, unredacted logs |

The dashboard must disclose this boundary during installation. Log an explicit
authorization record containing GitHub installation/repository IDs and time.

## Principal threats and controls

| Threat | Required control | Verification |
| --- | --- | --- |
| Unauthorized repo access | GitHub App installation token scoped to one installation and selected repository; verify repository node ID on every job | Denied-repo integration test; audit authorization event |
| Excessive GitHub permissions | App permissions: Metadata read, Contents read/write, Pull requests read/write, Checks/Actions/Commit statuses read as actually needed; no Administration/Members/Secrets/Environments/Merge permission | Installation manifest snapshot and permission assertion test |
| Prompt injection in specs/source/KB/comments | Delimit all external text as untrusted data; fixed orchestration prompt; no secret-bearing tools; command allowlist; ignore instructions embedded in evidence | Adversarial fixture attempts file exfiltration/test bypass |
| Secret exfiltration | Empty job environment except short-lived scoped tokens; redact secret patterns; mount credentials outside checkout; network deny-by-default | Canary-secret test produces no output/artifact hit |
| Supply-chain substitution | Immutable commits/versions plus SHA-256 for oasdiff/specs/actions; lockfile after integration | Checksum failure test stops before execution |
| OpenAPI external-reference fetch | Disable remote refs by default; explicit HTTPS host allowlist, size/time limits, content hashes if required | Malicious `$ref` fixture cannot reach metadata/private IPs |
| Malicious archive/path traversal | Verify archive hash, inspect entries, extract only expected executable/LICENSE into a fresh cache | Traversal fixture rejected |
| Cross-tenant cache leak | Content-addressed cache with tenant-independent public specs only; consumer artifacts tenant/job scoped and encrypted | Tenant isolation test |
| Stale or wrong-base migration | Pin consumer base SHA; compare before push/PR; reject drift or rebase through a new job | Base advances during job test |
| Duplicate branches/PRs | Unique idempotency key and per-repo lock; search existing branch/PR by job marker | Duplicate webhook/retry test creates one PR |
| Force overwrite of human work | Never force-push; verify branch ownership marker and expected head | Human commit causes `needs-input` |
| Test weakening | Diff policy flags removed/skipped tests, config relaxations, or snapshots unrelated to manifest; Greptile independent review | Fixture where agent disables a test fails gate |
| Stale Greptile review | Require completed review for exact current PR head and `hasNewCommitsSinceReview=false` | Push-after-review test returns pending |
| Fabricated fixture evidence | Persist `executionMode`; fixture banner and gate policy prevent live-ready | Fixture report cannot enter `READY_FOR_HUMAN` |
| Automatic unsafe merge | No merge API in orchestrator capability; branch protection/human review | Capability/permission assertion test |

## Job lifecycle

1. Mint a short-lived GitHub installation token for one repository.
2. Create an empty ephemeral volume; clone exact base SHA without persisted
   credentials.
3. Materialize only the manifest/evidence needed for the job.
4. Run deterministic analysis, Codex, and allowlisted tests with bounded CPU,
   memory, disk, and time.
5. Scan/redact output and inspect the diff before minting a separate short-lived
   write token for branch push/PR creation.
6. Revoke/expire tokens, destroy the volume, and retain only content digests,
   redacted evidence, source links, IDs, and audit events according to policy.

## Logging and retention

Never log request authorization headers, private keys, source file bodies,
customer prompts, raw model transcripts, or full Greptile KB documents. The MVP
stores redacted excerpts only when necessary to explain a migration, and always
stores a digest. Make retention configurable; deletion removes customer payloads
but retains minimal immutable security/audit metadata when legally permitted.
