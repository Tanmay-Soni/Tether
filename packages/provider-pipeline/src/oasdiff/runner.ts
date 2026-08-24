import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, mkdir, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";

import { PipelineError, asPipelineError } from "../errors.js";
import { assertCompatibleRevisionPair } from "../provenance.js";
import type {
  ContractDiffEngine,
  OasdiffOptions,
  OasdiffRawChange,
} from "../types.js";
import { resolveOasdiffBinary } from "./install.js";
import {
  assertRuntimeSchema,
  parseAndValidateRawChanges,
} from "./raw-schema.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_SCHEMA_BYTES = 64 * 1024;
const FORCE_KILL_DELAY_MS = 250;

interface CommandResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
  readonly stderr: string;
}

interface ExecuteOptions {
  readonly binaryPath: string;
  readonly args: readonly string[];
  readonly outputPath: string;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly signal?: AbortSignal;
  readonly oversizedCode: "OASDIFF_OUTPUT_INVALID" | "OASDIFF_SCHEMA_INVALID";
}

class OasdiffEngine implements ContractDiffEngine {
  readonly #options: OasdiffOptions;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;
  #binaryPromise: Promise<string> | undefined;

  constructor(options: OasdiffOptions) {
    this.#options = options;
    this.#timeoutMs = positiveInteger(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      "timeoutMs",
    );
    this.#maxOutputBytes = positiveInteger(
      options.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
      "maxOutputBytes",
    );
  }

  async compare(input: {
    oldSpec: Parameters<ContractDiffEngine["compare"]>[0]["oldSpec"];
    newSpec: Parameters<ContractDiffEngine["compare"]>[0]["newSpec"];
    mode: "breaking" | "changelog";
    artifactDir: string;
    matchPath?: string;
    signal?: AbortSignal;
  }): Promise<{
    rawMode: "breaking" | "changelog";
    rawChanges: OasdiffRawChange[];
    rawArtifactPath: string;
    rawSha256: string;
    matchPath?: string;
  }> {
    throwIfAborted(input.signal);
    assertCompatibleRevisionPair(input.oldSpec, input.newSpec);
    const mode: unknown = input.mode;
    if (mode !== "breaking" && mode !== "changelog") {
      throw new PipelineError(
        "OASDIFF_FAILED",
        "invalid oasdiff comparison mode",
        {
          mode: String(mode),
        },
      );
    }
    const binaryPath = await this.#getBinary(input.signal);
    throwIfAborted(input.signal);

    const artifactDirectory = resolve(input.artifactDir);
    await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
    await this.#verifyRuntimeSchema(
      binaryPath,
      artifactDirectory,
      input.signal,
    );

    if (
      input.matchPath !== undefined &&
      (input.matchPath.length > 256 ||
        !/^[\^$A-Za-z0-9_/().?+*|{}-]+$/u.test(input.matchPath))
    ) {
      throw new PipelineError(
        "OASDIFF_FAILED",
        "invalid oasdiff match-path filter",
        { field: "matchPath" },
      );
    }
    const temporaryPath = join(
      artifactDirectory,
      `.oasdiff-${mode}.${String(process.pid)}.${randomUUID()}.tmp`,
    );
    try {
      const result = await executeToFile({
        binaryPath,
        args: [
          mode,
          "--format",
          "json",
          ...(input.matchPath === undefined
            ? []
            : ["--match-path", input.matchPath]),
          resolve(input.oldSpec.filePath),
          resolve(input.newSpec.filePath),
        ],
        outputPath: temporaryPath,
        timeoutMs: this.#timeoutMs,
        maxStdoutBytes: this.#maxOutputBytes,
        oversizedCode: "OASDIFF_OUTPUT_INVALID",
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });

      if (result.code !== 0 || result.signal !== null) {
        throw new PipelineError("OASDIFF_FAILED", "oasdiff comparison failed", {
          command: mode,
          exitCode: result.code,
          signal: result.signal,
          stderr: result.stderr,
        });
      }

      const rawChanges = parseAndValidateRawChanges(result.stdout);
      const rawSha256 = createHash("sha256")
        .update(result.stdout)
        .digest("hex");
      const rawArtifactPath = join(
        artifactDirectory,
        `oasdiff-${mode}-${rawSha256}.json`,
      );
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, rawArtifactPath);
      await syncDirectory(artifactDirectory);
      return {
        rawMode: mode,
        rawChanges,
        rawArtifactPath,
        rawSha256,
        ...(input.matchPath === undefined
          ? {}
          : { matchPath: input.matchPath }),
      };
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async #getBinary(signal?: AbortSignal): Promise<string> {
    this.#binaryPromise ??= resolveOasdiffBinary({
      cacheDir: this.#options.cacheDir,
      ...(this.#options.binaryPath === undefined
        ? {}
        : { binaryPath: this.#options.binaryPath }),
      ...(this.#options.fetch === undefined
        ? {}
        : { fetch: this.#options.fetch }),
      ...(signal === undefined ? {} : { signal }),
    });
    try {
      return await this.#binaryPromise;
    } catch (error) {
      this.#binaryPromise = undefined;
      throw error;
    }
  }

  async #verifyRuntimeSchema(
    binaryPath: string,
    artifactDirectory: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const schemaTemporaryPath = join(
      artifactDirectory,
      `.oasdiff-schema.${String(process.pid)}.${randomUUID()}.tmp`,
    );
    try {
      const result = await executeToFile({
        binaryPath,
        args: ["schema"],
        outputPath: schemaTemporaryPath,
        timeoutMs: Math.min(this.#timeoutMs, 10_000),
        maxStdoutBytes: MAX_SCHEMA_BYTES,
        oversizedCode: "OASDIFF_SCHEMA_INVALID",
        ...(signal === undefined ? {} : { signal }),
      });
      if (result.code !== 0 || result.signal !== null) {
        throw new PipelineError(
          "OASDIFF_SCHEMA_INVALID",
          "unable to read the oasdiff runtime schema",
          {
            exitCode: result.code,
            signal: result.signal,
            stderr: result.stderr,
          },
        );
      }

      let schema: unknown;
      try {
        schema = JSON.parse(result.stdout.toString("utf8")) as unknown;
      } catch (error) {
        throw new PipelineError(
          "OASDIFF_SCHEMA_INVALID",
          "oasdiff schema command emitted invalid JSON",
          {},
          { cause: error },
        );
      }
      assertRuntimeSchema(schema);
    } finally {
      await rm(schemaTemporaryPath, { force: true });
    }
  }
}

export function createOasdiffEngine(
  options: OasdiffOptions,
): ContractDiffEngine {
  return new OasdiffEngine(options);
}

async function executeToFile(options: ExecuteOptions): Promise<CommandResult> {
  throwIfAborted(options.signal);
  let outputHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    outputHandle = await open(options.outputPath, "wx", 0o600);
  } catch (error) {
    throw asPipelineError(
      error,
      "OASDIFF_FAILED",
      "unable to create the temporary oasdiff output artifact",
    );
  }

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(options.binaryPath, [...options.args], {
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: isolatedChildEnvironment(),
    });
  } catch (error) {
    await outputHandle.close();
    throw asPipelineError(error, "OASDIFF_FAILED", "unable to start oasdiff");
  }
  const activeOutputHandle = outputHandle;

  let terminationError: PipelineError | undefined;
  let terminating = false;
  let forceKillTimer: NodeJS.Timeout | undefined;
  const terminate = (error: PipelineError): void => {
    terminationError ??= error;
    if (terminating) return;
    terminating = true;
    killProcessGroup(child.pid, "SIGTERM");
    forceKillTimer = setTimeout(
      () => killProcessGroup(child.pid, "SIGKILL"),
      FORCE_KILL_DELAY_MS,
    );
    forceKillTimer.unref();
  };
  const onAbort = (): void => {
    terminate(new PipelineError("ABORTED", "oasdiff execution was aborted"));
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    terminate(
      new PipelineError("OASDIFF_TIMEOUT", "oasdiff execution timed out", {
        timeoutMs: options.timeoutMs,
      }),
    );
  }, options.timeoutMs);
  timeout.unref();

  let spawnError: unknown;
  const closePromise = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveClose) => {
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, closeSignal) =>
      resolveClose({ code, signal: closeSignal }),
    );
  });

  const stdoutChunks: Buffer[] = [];
  let stdoutBytes = 0;
  const consumeStdout = async (): Promise<void> => {
    for await (const value of child.stdout) {
      const chunk = Buffer.isBuffer(value)
        ? value
        : Buffer.from(value as Uint8Array);
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > options.maxStdoutBytes) {
        terminate(
          new PipelineError(
            options.oversizedCode,
            "oasdiff stdout exceeded the safety limit",
            {
              maxBytes: options.maxStdoutBytes,
            },
          ),
        );
        continue;
      }
      stdoutChunks.push(Buffer.from(chunk));
      await activeOutputHandle.write(chunk);
    }
  };

  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  const consumeStderr = async (): Promise<void> => {
    for await (const value of child.stderr) {
      const chunk = Buffer.isBuffer(value)
        ? value
        : Buffer.from(value as Uint8Array);
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_STDERR_BYTES) {
        terminate(
          new PipelineError(
            "OASDIFF_FAILED",
            "oasdiff stderr exceeded the safety limit",
            {
              maxBytes: MAX_STDERR_BYTES,
            },
          ),
        );
        continue;
      }
      stderrChunks.push(Buffer.from(chunk));
    }
  };

  try {
    const [closeResult] = await Promise.all([
      closePromise,
      consumeStdout(),
      consumeStderr(),
    ]);
    if (spawnError !== undefined) {
      throw asPipelineError(
        spawnError,
        "OASDIFF_FAILED",
        "unable to execute oasdiff",
      );
    }
    if (terminationError !== undefined) throw terminationError;
    await activeOutputHandle.sync();
    await activeOutputHandle.close();
    outputHandle = undefined;
    return {
      ...closeResult,
      stdout: Buffer.concat(stdoutChunks, stdoutBytes),
      stderr: redactDiagnostic(
        Buffer.concat(stderrChunks, stderrBytes).toString("utf8"),
      ),
    };
  } finally {
    clearTimeout(timeout);
    if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    options.signal?.removeEventListener("abort", onAbort);
    await outputHandle?.close().catch(() => undefined);
  }
}

function isolatedChildEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "",
    http_proxy: "http://127.0.0.1:9",
    https_proxy: "http://127.0.0.1:9",
    all_proxy: "http://127.0.0.1:9",
    no_proxy: "",
  };
  for (const name of ["PATH", "SystemRoot", "WINDIR"] as const) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[^\s]+/giu, "$1[REDACTED]")
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,})\b/gu,
      "[REDACTED]",
    )
    .replace(
      /([?&](?:access_token|api_key|key|secret|token)=)[^&\s]+/giu,
      "$1[REDACTED]",
    )
    .replace(
      /\b((?:[A-Z][A-Z0-9_]*_)?(?:KEY|SECRET|TOKEN|PASSWORD)=)[^\s]+/gu,
      "$1[REDACTED]",
    );
}

function killProcessGroup(
  pid: number | undefined,
  signal: NodeJS.Signals,
): void {
  if (pid === undefined) return;
  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process may already have exited.
    }
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new PipelineError(
      "OASDIFF_FAILED",
      `${name} must be a positive integer`,
      {
        [name]: selected,
      },
    );
  }
  return selected;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new PipelineError("ABORTED", "oasdiff execution was aborted");
  }
}
