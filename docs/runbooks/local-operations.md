# Local setup, operation, and recovery

## One-time setup

Install Bun 1.4.x and ensure `bun` is on the normal shell `PATH`; TetherIn never
depends on a task-private runtime. Node 22.18+, Git, `rg`, `jq`, `gh`, and the
Codex CLI are also required. Authenticate once with `gh auth login` and
`codex login`, then:

```bash
bun install --frozen-lockfile
cp .env.example .env.local
# Set the absolute external consumer path and owner/repository. Add live keys
# only in this ignored file; never commit or paste them into a command.
bun run setup
```

Setup validates loopback-only serving, safe paths, exact consumer remote and
clean base, GitHub/Codex authentication, SQLite, the pinned oasdiff checksum and
version, and the retained provider fixture. A Greptile key alone is not
repository authorization: the repository must also be visible to the key's
Greptile organization/GitHub App installation.

## Run

```bash
bun run demo:fixture  # retained OpenAI fallback; never live-ready
bun run demo:live     # official Stripe specs and external draft-PR path
```

Both start the runner and dashboard at the configured loopback URL. Refreshing
the browser reconstructs runs, projections, events, and artifact metadata from
SQLite. The runner leases idempotent intents and records content-addressed
evidence under ignored `.tetherin/`.

## Recovery

Stop the supervisor with Ctrl-C. Inspect before changing any Git state:

```bash
git -C "$TETHERIN_CONSUMER_REPO_PATH" status --short --branch
git -C "$TETHERIN_CONSUMER_REPO_PATH" worktree list
gh pr list --repo "$TETHERIN_CONSUMER_REPO" --state all
```

`bun run demo:reset` removes only local `.tetherin/` state after validating that
all configured state paths remain below that directory. It does not delete a
consumer checkout, local/remote branch, PR, or human commit. Worktree and remote
cleanup are deliberately manual and must target a resolved, TetherIn-owned run.

Never force-push. If an upstream repository rejects branch writes, obtain
collaborator permission; a fork-head draft PR is a valid GitHub fallback but is
recorded as a deviation from a direct upstream branch.
