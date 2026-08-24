import { existsSync, lstatSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { runCommand } from "./subprocess.js";

export interface RepositorySnapshot {
  readonly path: string;
  readonly repository: string;
  readonly branch: string;
  readonly headSha: string;
  readonly remoteUrl: string;
  readonly clean: boolean;
}

export class RepositoryGuardError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryGuardError";
  }
}

export function normalizeGitHubRemote(remote: string): string | null {
  const trimmed = remote.trim().replace(/\.git$/u, "");
  const ssh = /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(
    trimmed,
  );
  if (ssh) return ssh[1]!.toLowerCase();
  const https =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(
      trimmed,
    );
  return https?.[1]?.toLowerCase() ?? null;
}

function overlaps(left: string, right: string): boolean {
  const forward = relative(left, right);
  const reverse = relative(right, left);
  return (
    forward === "" ||
    reverse === "" ||
    (!forward.startsWith("..") && !forward.startsWith("/")) ||
    (!reverse.startsWith("..") && !reverse.startsWith("/"))
  );
}

export async function validateConsumerRepository(input: {
  path: string;
  tetherRoot: string;
  expectedRepository: string;
  expectedBranch: string;
  requireClean?: boolean;
}): Promise<RepositorySnapshot> {
  if (!resolve(input.path).startsWith("/"))
    throw new RepositoryGuardError(
      "PATH_NOT_ABSOLUTE",
      "Consumer path must be absolute",
    );
  if (!existsSync(input.path))
    throw new RepositoryGuardError(
      "PATH_MISSING",
      "Consumer path does not exist",
    );
  if (lstatSync(input.path).isSymbolicLink())
    throw new RepositoryGuardError(
      "PATH_SYMLINK",
      "Consumer path may not be a symlink",
    );
  const path = realpathSync(input.path);
  const tetherRoot = realpathSync(input.tetherRoot);
  if (path === "/" || overlaps(path, tetherRoot))
    throw new RepositoryGuardError(
      "PATH_OVERLAP",
      "Consumer repository overlaps TetherIn",
    );
  const gitRoot = (
    await runCommand(["git", "rev-parse", "--show-toplevel"], { cwd: path })
  ).stdout.trim();
  if (realpathSync(gitRoot) !== path)
    throw new RepositoryGuardError(
      "NESTED_REPOSITORY",
      "Configured path must be the Git repository root",
    );
  const [branchResult, headResult, remoteResult, statusResult] =
    await Promise.all([
      runCommand(["git", "branch", "--show-current"], { cwd: path }),
      runCommand(["git", "rev-parse", "HEAD"], { cwd: path }),
      runCommand(["git", "remote", "get-url", "origin"], { cwd: path }),
      runCommand(
        ["git", "status", "--porcelain=v1", "--untracked-files=normal"],
        { cwd: path },
      ),
    ]);
  const branch = branchResult.stdout.trim();
  const remoteUrl = remoteResult.stdout.trim();
  const repository = normalizeGitHubRemote(remoteUrl);
  if (repository !== input.expectedRepository.toLowerCase())
    throw new RepositoryGuardError(
      "REMOTE_MISMATCH",
      "Consumer origin does not match configured owner/repository",
    );
  if (branch !== input.expectedBranch)
    throw new RepositoryGuardError(
      "BRANCH_MISMATCH",
      "Consumer checkout is not on the configured base branch",
    );
  const clean = statusResult.stdout.trim() === "";
  if (input.requireClean !== false && !clean)
    throw new RepositoryGuardError(
      "DIRTY_WORKTREE",
      "Consumer repository has uncommitted changes",
    );
  return {
    path,
    repository: input.expectedRepository,
    branch,
    headSha: headResult.stdout.trim(),
    remoteUrl,
    clean,
  };
}

export function migrationBranch(provider: string, manifestId: string): string {
  const short = manifestId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(-42)
    .replace(/^-+/u, "");
  return `tetherin/${provider}/${short}`.slice(0, 80);
}

export async function createIsolatedWorktree(input: {
  sourceRepo: string;
  worktreePath: string;
  baseSha: string;
  branch: string;
}): Promise<void> {
  await runCommand(["git", "fetch", "origin", "--prune"], {
    cwd: input.sourceRepo,
    timeoutMs: 120_000,
  });
  const branchExists = await runCommand(
    ["git", "show-ref", "--verify", "--quiet", `refs/heads/${input.branch}`],
    { cwd: input.sourceRepo, allowFailure: true },
  );
  if (branchExists.exitCode === 0)
    throw new RepositoryGuardError(
      "BRANCH_COLLISION",
      "Migration branch already exists locally",
    );
  await runCommand(
    [
      "git",
      "worktree",
      "add",
      "-b",
      input.branch,
      input.worktreePath,
      input.baseSha,
    ],
    { cwd: input.sourceRepo, timeoutMs: 120_000 },
  );
}

export async function commitPatch(input: {
  checkout: string;
  runId: string;
  manifestId: string;
  message: string;
}): Promise<string> {
  await runCommand(["git", "add", "--all"], { cwd: input.checkout });
  const staged = await runCommand(["git", "diff", "--cached", "--quiet"], {
    cwd: input.checkout,
    allowFailure: true,
  });
  if (staged.exitCode === 0)
    throw new RepositoryGuardError(
      "EMPTY_PATCH",
      "Codex produced no migration patch",
    );
  const body = `${input.message}\n\nTetherIn-Run: ${input.runId}\nTetherIn-Manifest: ${input.manifestId}`;
  await runCommand(
    [
      "git",
      "-c",
      "user.name=TetherIn",
      "-c",
      "user.email=tetherin@users.noreply.github.com",
      "commit",
      "-m",
      body,
    ],
    { cwd: input.checkout, timeoutMs: 60_000 },
  );
  return (
    await runCommand(["git", "rev-parse", "HEAD"], { cwd: input.checkout })
  ).stdout.trim();
}

export async function pushOwnedBranch(input: {
  checkout: string;
  branch: string;
  expectedHeadSha: string;
  remote?: string;
}): Promise<void> {
  const current = (
    await runCommand(["git", "rev-parse", "HEAD"], { cwd: input.checkout })
  ).stdout.trim();
  if (current !== input.expectedHeadSha)
    throw new RepositoryGuardError(
      "HEAD_DRIFT",
      "Local branch changed before push",
    );
  const remoteName = input.remote ?? "origin";
  if (!/^[A-Za-z0-9_.-]+$/u.test(remoteName))
    throw new RepositoryGuardError(
      "REMOTE_NAME_INVALID",
      "Push remote name is unsafe",
    );
  const remote = await runCommand(
    ["git", "ls-remote", "--heads", remoteName, `refs/heads/${input.branch}`],
    { cwd: input.checkout, timeoutMs: 60_000 },
  );
  if (remote.stdout.trim())
    throw new RepositoryGuardError(
      "REMOTE_BRANCH_COLLISION",
      "Remote migration branch already exists",
    );
  await runCommand(
    ["git", "push", "--set-upstream", remoteName, input.branch],
    { cwd: input.checkout, timeoutMs: 120_000 },
  );
}
