import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand, scrubbedEnv } from "@tetherin/git-local";

export interface PullRequestRecord {
  number: number;
  url: string;
  isDraft: boolean;
  state: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
  body?: string;
  headRepositoryOwner?: { login: string };
}

export function resolvePullRequestHead(
  repository: string,
  branch: string,
): { branch: string; owner: string } {
  const separator = branch.indexOf(":");
  if (separator < 0)
    return { branch, owner: repository.split("/", 1)[0] ?? "" };
  return {
    owner: branch.slice(0, separator),
    branch: branch.slice(separator + 1),
  };
}

export async function verifyGhAuth(cwd: string): Promise<{ login: string }> {
  await runCommand(["gh", "auth", "status"], { cwd, outputLimit: 16_384 });
  const token = await runCommand(["gh", "auth", "token"], {
    cwd,
    outputLimit: 8_192,
  });
  if (!token.stdout.trim()) throw new Error("GH_TOKEN_UNAVAILABLE");
  const user = await runCommand(["gh", "api", "user", "--jq", ".login"], {
    cwd,
    env: scrubbedEnv(),
  });
  return { login: user.stdout.trim() };
}

export async function verifyRepository(
  cwd: string,
  repository: string,
): Promise<{ nameWithOwner: string; defaultBranch: string; url: string }> {
  const result = await runCommand(
    [
      "gh",
      "repo",
      "view",
      repository,
      "--json",
      "nameWithOwner,defaultBranchRef,url",
    ],
    { cwd, timeoutMs: 60_000 },
  );
  const parsed = JSON.parse(result.stdout) as {
    nameWithOwner: string;
    defaultBranchRef: { name: string };
    url: string;
  };
  if (parsed.nameWithOwner.toLowerCase() !== repository.toLowerCase())
    throw new Error("GH_REPOSITORY_MISMATCH");
  return {
    nameWithOwner: parsed.nameWithOwner,
    defaultBranch: parsed.defaultBranchRef.name,
    url: parsed.url,
  };
}

export async function findPullRequest(
  cwd: string,
  repository: string,
  branch: string,
  base: string,
): Promise<PullRequestRecord | null> {
  const expectedHead = resolvePullRequestHead(repository, branch);
  const result = await runCommand(
    [
      "gh",
      "pr",
      "list",
      "--repo",
      repository,
      "--state",
      "all",
      "--head",
      expectedHead.branch,
      "--base",
      base,
      "--json",
      "number,url,isDraft,state,headRefName,headRefOid,headRepositoryOwner,baseRefName,baseRefOid,body",
    ],
    { cwd },
  );
  const records = (JSON.parse(result.stdout) as PullRequestRecord[]).filter(
    (record) =>
      record.headRefName === expectedHead.branch &&
      record.headRepositoryOwner?.login.toLowerCase() ===
        expectedHead.owner.toLowerCase(),
  );
  if (records.length > 1) throw new Error("DUPLICATE_PULL_REQUESTS");
  return records[0] ?? null;
}

export async function createOrFindDraftPullRequest(input: {
  cwd: string;
  repository: string;
  branch: string;
  base: string;
  title: string;
  body: string;
  runMarker: string;
}): Promise<PullRequestRecord> {
  const existing = await findPullRequest(
    input.cwd,
    input.repository,
    input.branch,
    input.base,
  );
  if (existing) {
    if (!existing.body?.includes(input.runMarker))
      throw new Error("PULL_REQUEST_NOT_OWNED");
    return existing;
  }
  const directory = mkdtempSync(join(tmpdir(), "tetherin-pr-"));
  const bodyFile = join(directory, "body.md");
  try {
    writeFileSync(bodyFile, input.body, { mode: 0o600 });
    chmodSync(bodyFile, 0o600);
    await runCommand(
      [
        "gh",
        "pr",
        "create",
        "--draft",
        "--repo",
        input.repository,
        "--base",
        input.base,
        "--head",
        input.branch,
        "--title",
        input.title,
        "--body-file",
        bodyFile,
      ],
      { cwd: input.cwd, timeoutMs: 120_000 },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const created = await findPullRequest(
    input.cwd,
    input.repository,
    input.branch,
    input.base,
  );
  if (!created) throw new Error("PULL_REQUEST_CREATE_NOT_FOUND");
  return created;
}

export async function readPullRequest(
  cwd: string,
  repository: string,
  number: number,
): Promise<PullRequestRecord> {
  const result = await runCommand(
    [
      "gh",
      "pr",
      "view",
      String(number),
      "--repo",
      repository,
      "--json",
      "number,url,isDraft,state,headRefName,headRefOid,baseRefName,baseRefOid,body",
    ],
    { cwd },
  );
  return JSON.parse(result.stdout) as PullRequestRecord;
}
