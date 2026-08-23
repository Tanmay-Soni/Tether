import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const fixedNow = (): Date => new Date("2026-08-23T12:00:00.000Z");

export const manifest = {
  schemaVersion: "tetherin.migration-manifest/v1",
  manifestId: "openai.geography-removal.demo",
  provider: "openai",
  source: {
    repositoryUrl: "https://github.com/openai/openai-openapi",
    licenseSpdx: "MIT",
    old: {
      commit: "13c6a94fca988f8be3c5de09d73f012709985d10",
      specUrl:
        "https://github.com/openai/openai-openapi/blob/13c6a94fca988f8be3c5de09d73f012709985d10/openapi.yaml",
      sha256: "a".repeat(64),
    },
    new: {
      commit: "f85dbe223d40e1a31cba812ab2d755c7e98a92a3",
      specUrl:
        "https://github.com/openai/openai-openapi/blob/f85dbe223d40e1a31cba812ab2d755c7e98a92a3/openapi.yaml",
      sha256: "b".repeat(64),
    },
    fetchedAt: "2026-08-23T11:00:00.000Z",
  },
  engine: {
    name: "oasdiff",
    version: "1.29.1",
    releaseCommit: "2bb87bada404d350cb56e5504e8bd5d76f6159bf",
    releaseUrl: "https://github.com/oasdiff/oasdiff/releases/tag/v1.29.1",
    command: [
      "oasdiff",
      "breaking",
      "old.yaml",
      "new.yaml",
      "--format",
      "json",
    ],
    outputFormat: "json",
    rawOutputSha256: "c".repeat(64),
  },
  changes: [
    {
      oasdiffId: "request-property-removed",
      fingerprint: "abc123",
      severity: "error",
      breaking: true,
      method: "POST",
      path: "/v1/projects/{project_id}",
      operationId: "modifyProject",
      text: "Removed request property geography.",
      subject: {
        kind: "request-property",
        name: "geography",
        jsonPointer:
          "/components/schemas/ModifyProjectRequest/properties/geography",
      },
      oldLocation: null,
      newLocation: null,
      schemaExcerpts: {
        old: { geography: { type: "string" } },
        new: {},
      },
    },
  ],
  detectedAt: "2026-08-23T11:30:00.000Z",
};

export function createConsumerRepo(): { path: string; sha: string } {
  const path = mkdtempSync(join(tmpdir(), "tetherin-greptile-"));
  execFileSync("git", ["init"], { cwd: path });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: path,
  });
  execFileSync("git", ["config", "user.name", "TetherIn Test"], { cwd: path });
  writeFileSync(
    join(path, "client.ts"),
    [
      "export async function updateProject(openai: any) {",
      "  return openai.projects.modifyProject({ geography: 'us', name: 'demo' });",
      "}",
      "export async function raw() {",
      "  return fetch('/v1/projects/abc', { method: 'POST', body: JSON.stringify({ geography: 'us' }) });",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    join(path, "client.test.ts"),
    "import { updateProject } from './client';\ntest('uses geography', () => updateProject({}));\n",
  );
  execFileSync("git", ["add", "."], { cwd: path });
  execFileSync("git", ["commit", "-m", "fixture repo"], { cwd: path });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: path,
    encoding: "utf8",
  }).trim();
  return { path, sha };
}

export function consumer(baseSha: string) {
  return {
    repository: "synthetic/example",
    defaultBranch: "main",
    baseSha,
    authorizedAt: "2026-08-23T11:45:00.000Z",
  };
}

export const pullRequest = {
  repository: "synthetic/example",
  number: 7,
  url: "https://github.com/synthetic/example/pull/7",
  headSha: "d".repeat(40),
  baseSha: "e".repeat(40),
  draft: true as const,
};

export const passingCheck = {
  name: "unit",
  command: ["pnpm", "test"],
  status: "passed" as const,
  exitCode: 0,
  durationMs: 1234,
  outputDigest: "f".repeat(64),
};
