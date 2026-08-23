import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PipelineError } from "../src/errors.js";
import { OASDIFF_RAW_SCHEMA } from "../src/oasdiff/raw-schema.generated.js";
import { createOasdiffEngine } from "../src/oasdiff/runner.js";
import type { LocalSpec } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
  );
});

describe("oasdiff runner", () => {
  it("passes the Stripe hero match-path as one literal argument", async () => {
    const setup = await makeSetup();
    const argumentLog = join(setup.directory, "filtered-arguments.json");
    const binaryPath = await writeFakeOasdiff(
      setup.directory,
      `await writeFile(${JSON.stringify(argumentLog)}, JSON.stringify(args));\nprocess.stdout.write('[]');`,
      { imports: 'import { writeFile } from "node:fs/promises";' },
    );
    const matchPath = "^/v1/invoices/upcoming(/lines)?$";
    const result = await createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
    }).compare({
      oldSpec: setup.oldSpec,
      newSpec: setup.newSpec,
      mode: "breaking",
      artifactDir: setup.artifactDir,
      matchPath,
    });
    expect(result.matchPath).toBe(matchPath);
    expect(JSON.parse(await readFile(argumentLog, "utf8"))).toEqual([
      "breaking",
      "--format",
      "json",
      "--match-path",
      matchPath,
      setup.oldSpec.filePath,
      setup.newSpec.filePath,
    ]);
  });

  it.each(["breaking", "changelog"] as const)(
    "runs %s with an argument array, validates schema, and atomically retains raw output",
    async (mode) => {
      const setup = await makeSetup();
      const argumentLog = join(setup.directory, "arguments.json");
      const binaryPath = await writeFakeOasdiff(
        setup.directory,
        `await writeFile(${JSON.stringify(argumentLog)}, JSON.stringify(args));\nprocess.stdout.write('[{"level":2,"id":"request-property-removed"}]');`,
        { imports: 'import { writeFile } from "node:fs/promises";' },
      );
      const engine = createOasdiffEngine({
        cacheDir: setup.cacheDir,
        binaryPath,
      });

      const result = await engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode,
        artifactDir: setup.artifactDir,
      });

      const expectedRaw = '[{"level":2,"id":"request-property-removed"}]';
      expect(result.rawMode).toBe(mode);
      expect(result.rawChanges).toEqual([
        { level: 2, id: "request-property-removed" },
      ]);
      expect(result.rawSha256).toBe(sha256(Buffer.from(expectedRaw)));
      await expect(readFile(result.rawArtifactPath, "utf8")).resolves.toBe(
        expectedRaw,
      );
      expect((await stat(result.rawArtifactPath)).mode & 0o777).toBe(0o600);
      await expect(readFile(argumentLog, "utf8")).resolves.toBe(
        JSON.stringify([
          mode,
          "--format",
          "json",
          setup.oldSpec.filePath,
          setup.newSpec.filePath,
        ]),
      );
      expect(await readdir(setup.artifactDir)).toEqual([
        `oasdiff-${mode}-${result.rawSha256}.json`,
      ]);
    },
  );

  it("does not interpret binary or spec path shell metacharacters", async () => {
    const setup = await makeSetup("spec paths;touch never");
    const binaryDirectory = join(setup.directory, "binary path;touch never");
    await mkdir(binaryDirectory);
    const argumentLog = join(setup.directory, "shell-safe-arguments.json");
    const binaryPath = await writeFakeOasdiff(
      binaryDirectory,
      `await writeFile(${JSON.stringify(argumentLog)}, JSON.stringify(args));\nprocess.stdout.write('[]');`,
      { imports: 'import { writeFile } from "node:fs/promises";' },
    );
    const result = await createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
    }).compare({
      oldSpec: setup.oldSpec,
      newSpec: setup.newSpec,
      mode: "breaking",
      artifactDir: setup.artifactDir,
    });
    expect(result.rawChanges).toEqual([]);
    const args = JSON.parse(await readFile(argumentLog, "utf8")) as string[];
    expect(args).toEqual([
      "breaking",
      "--format",
      "json",
      setup.oldSpec.filePath,
      setup.newSpec.filePath,
    ]);
    expect(args).not.toContain("--fail-on");
  });

  it("maps a nonzero exit to a typed error and redacts stderr secrets", async () => {
    const setup = await makeSetup();
    const binaryPath = await writeFakeOasdiff(
      setup.directory,
      "process.stderr.write('Bearer top-secret ghp_123456789012345678901234 TOKEN=plain-secret');\nprocess.exit(7);",
    );
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
    });
    const error = await captureError(
      engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode: "breaking",
        artifactDir: setup.artifactDir,
      }),
    );
    expect(error).toMatchObject({ code: "OASDIFF_FAILED" });
    expect(JSON.stringify(error.details)).not.toContain("top-secret");
    expect(JSON.stringify(error.details)).not.toContain(
      "ghp_123456789012345678901234",
    );
    expect(JSON.stringify(error.details)).not.toContain("plain-secret");
    expect(JSON.stringify(error.details)).toContain("[REDACTED]");
  });

  it.each([
    ["invalid JSON", "process.stdout.write('{');", "OASDIFF_OUTPUT_INVALID"],
    ["non-array JSON", "process.stdout.write('{}');", "OASDIFF_OUTPUT_INVALID"],
    [
      "schema-invalid JSON",
      'process.stdout.write(\'[{"level":"warning"}]\');',
      "OASDIFF_SCHEMA_INVALID",
    ],
    [
      "unexpected raw fields",
      'process.stdout.write(\'[{"level":2,"secret":"value"}]\');',
      "OASDIFF_SCHEMA_INVALID",
    ],
  ])("rejects %s and does not publish it", async (_label, comparison, code) => {
    const setup = await makeSetup();
    const binaryPath = await writeFakeOasdiff(setup.directory, comparison);
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
    });
    await expect(
      engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode: "breaking",
        artifactDir: setup.artifactDir,
      }),
    ).rejects.toMatchObject({ code });
    expect(await readdir(setup.artifactDir)).toEqual([]);
  });

  it("rejects oversized stdout and removes the partial artifact", async () => {
    const setup = await makeSetup();
    const binaryPath = await writeFakeOasdiff(
      setup.directory,
      "process.stdout.write('x'.repeat(8192));",
    );
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
      maxOutputBytes: 128,
    });
    await expect(
      engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode: "breaking",
        artifactDir: setup.artifactDir,
      }),
    ).rejects.toMatchObject({ code: "OASDIFF_OUTPUT_INVALID" });
    expect(await readdir(setup.artifactDir)).toEqual([]);
  });

  it("rejects a runtime schema that differs from the generated pinned schema", async () => {
    const setup = await makeSetup();
    const binaryPath = await writeFakeOasdiff(
      setup.directory,
      "process.stdout.write('[]');",
      {
        schema: {},
      },
    );
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
    });
    await expect(
      engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode: "breaking",
        artifactDir: setup.artifactDir,
      }),
    ).rejects.toMatchObject({ code: "OASDIFF_SCHEMA_INVALID" });
    expect(await readdir(setup.artifactDir)).toEqual([]);
  });

  it("times out and kills the full spawned process group", async () => {
    const setup = await makeSetup();
    const markerPath = join(setup.directory, "grandchild-survived");
    const grandchildProgram = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'bad'), 400)`;
    const binaryPath = await writeFakeOasdiff(
      setup.directory,
      `spawn(process.execPath, ['-e', ${JSON.stringify(grandchildProgram)}], { stdio: 'ignore' });\nsetInterval(() => {}, 1000);`,
      { imports: 'import { spawn } from "node:child_process";' },
    );
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
      timeoutMs: 100,
    });
    await expect(
      engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode: "breaking",
        artifactDir: setup.artifactDir,
      }),
    ).rejects.toMatchObject({ code: "OASDIFF_TIMEOUT" });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 550));
    await expect(stat(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(setup.artifactDir)).toEqual([]);
  });

  it("aborts a running comparison and removes the partial artifact", async () => {
    const setup = await makeSetup();
    const binaryPath = await writeFakeOasdiff(
      setup.directory,
      "process.stdout.write('[');\nsetInterval(() => {}, 1000);",
    );
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath,
      timeoutMs: 2_000,
    });
    await mkdir(setup.artifactDir, { recursive: true });
    const controller = new AbortController();
    const comparison = engine.compare({
      oldSpec: setup.oldSpec,
      newSpec: setup.newSpec,
      mode: "breaking",
      artifactDir: setup.artifactDir,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(comparison).rejects.toMatchObject({ code: "ABORTED" });
    expect(await readdir(setup.artifactDir)).toEqual([]);
  });

  it("rejects incompatible provider revisions before resolving or spawning oasdiff", async () => {
    const setup = await makeSetup();
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath: join(setup.directory, "does-not-exist"),
    });
    await expect(
      engine.compare({
        oldSpec: twilioSpec(setup.oldSpec.filePath, "api_accounts_v1.yaml"),
        newSpec: twilioSpec(setup.newSpec.filePath, "api_messaging_v1.yaml"),
        mode: "breaking",
        artifactDir: setup.artifactDir,
      }),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
  });

  it("rejects a runtime mode outside breaking and changelog before spawning", async () => {
    const setup = await makeSetup();
    const engine = createOasdiffEngine({
      cacheDir: setup.cacheDir,
      binaryPath: join(setup.directory, "does-not-exist"),
    });
    await expect(
      engine.compare({
        oldSpec: setup.oldSpec,
        newSpec: setup.newSpec,
        mode: "schema" as "breaking",
        artifactDir: setup.artifactDir,
      }),
    ).rejects.toMatchObject({ code: "OASDIFF_FAILED" });
  });

  it("rejects invalid execution bounds before spawning", () => {
    expectPipelineThrow(
      () => createOasdiffEngine({ cacheDir: "/tmp/unused", timeoutMs: 0 }),
      "OASDIFF_FAILED",
    );
    expectPipelineThrow(
      () =>
        createOasdiffEngine({ cacheDir: "/tmp/unused", maxOutputBytes: -1 }),
      "OASDIFF_FAILED",
    );
  });
});

interface FakeOptions {
  readonly imports?: string;
  readonly schema?: unknown;
}

async function writeFakeOasdiff(
  directory: string,
  comparisonProgram: string,
  options: FakeOptions = {},
): Promise<string> {
  const path = join(directory, "fake-oasdiff.mjs");
  const schema = JSON.stringify(options.schema ?? OASDIFF_RAW_SCHEMA);
  const program = `#!${process.execPath}
${options.imports ?? ""}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("oasdiff version 1.29.1\\n");
} else if (args.length === 1 && args[0] === "schema") {
  process.stdout.write(${JSON.stringify(schema)});
} else {
  ${comparisonProgram}
}
`;
  await writeFile(path, program, { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

interface Setup {
  readonly directory: string;
  readonly cacheDir: string;
  readonly artifactDir: string;
  readonly oldSpec: LocalSpec;
  readonly newSpec: LocalSpec;
}

async function makeSetup(pathSegment = "specs"): Promise<Setup> {
  const directory = await mkdtemp(join(tmpdir(), "tetherin-oasdiff-runner-"));
  temporaryDirectories.push(directory);
  const cacheDir = join(directory, "cache");
  const artifactDir = join(directory, "artifacts");
  const specDirectory = join(directory, pathSegment);
  await mkdir(specDirectory, { recursive: true });
  const oldPath = join(specDirectory, "old spec.yaml");
  const newPath = join(specDirectory, "new spec.yaml");
  await writeFile(
    oldPath,
    "openapi: 3.0.0\ninfo: {title: old, version: 1}\npaths: {}\n",
  );
  await writeFile(
    newPath,
    "openapi: 3.0.0\ninfo: {title: new, version: 2}\npaths: {}\n",
  );
  return {
    directory,
    cacheDir,
    artifactDir,
    oldSpec: localSpec(oldPath, "a".repeat(64)),
    newSpec: localSpec(newPath, "b".repeat(64)),
  };
}

function localSpec(filePath: string, sha: string): LocalSpec {
  return {
    provider: "openai",
    repositoryUrl: "https://github.com/openai/openai-openapi",
    commit: "a".repeat(40),
    path: "openapi.yaml",
    rawUrl:
      "https://raw.githubusercontent.com/openai/openai-openapi/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/openapi.yaml",
    licenseSpdx: "MIT",
    filePath,
    sha256: sha,
    byteLength: 1,
    fetchedAt: "2026-08-23T00:00:00.000Z",
  };
}

function twilioSpec(filePath: string, service: string): LocalSpec {
  const commit = "a".repeat(40);
  return {
    provider: "twilio",
    repositoryUrl: "https://github.com/twilio/twilio-oai",
    commit,
    path: `spec/yaml/${service}`,
    rawUrl: `https://raw.githubusercontent.com/twilio/twilio-oai/${commit}/spec/yaml/${service}`,
    licenseSpdx: "MIT",
    filePath,
    sha256: "c".repeat(64),
    byteLength: 1,
    fetchedAt: "2026-08-23T00:00:00.000Z",
  };
}

async function captureError(promise: Promise<unknown>): Promise<PipelineError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PipelineError) return error;
    throw error;
  }
  throw new Error("expected promise to reject");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectPipelineThrow(
  callback: () => unknown,
  code: PipelineError["code"],
): void {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(PipelineError);
    expect((error as PipelineError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}
