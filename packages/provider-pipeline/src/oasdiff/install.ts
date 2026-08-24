import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { PipelineError, asPipelineError } from "../errors.js";

export const OASDIFF_VERSION = "1.29.1";
export const OASDIFF_RELEASE_TAG = `v${OASDIFF_VERSION}`;
export const OASDIFF_RELEASE_COMMIT =
  "2bb87bada404d350cb56e5504e8bd5d76f6159bf";

const RELEASE_BASE_URL = `https://github.com/oasdiff/oasdiff/releases/download/${OASDIFF_RELEASE_TAG}`;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;
const MAX_LICENSE_BYTES = 1024 * 1024;
const MAX_EXECUTABLE_BYTES = 64 * 1024 * 1024;
const VERSION_TIMEOUT_MS = 5_000;
const LOCK_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const DOWNLOAD_ATTEMPTS = 3;
const INSTALL_RECEIPT_SCHEMA = "tetherin.oasdiff-install/v1";

interface ReleaseAsset {
  readonly asset: string;
  readonly sha256: string;
}

export const OASDIFF_RELEASE_ASSETS = Object.freeze({
  darwin_all: Object.freeze({
    asset: "oasdiff_1.29.1_darwin_all.tar.gz",
    sha256: "759cc5703d9335c441ad84a7074c705486b2c493f79bcfdf251c7a9c788b1171",
  }),
  linux_amd64: Object.freeze({
    asset: "oasdiff_1.29.1_linux_amd64.tar.gz",
    sha256: "541f7c66c933495fceef24eaf5c48aa66c19069f366f7bd0a60a6a4820c5e533",
  }),
  linux_arm64: Object.freeze({
    asset: "oasdiff_1.29.1_linux_arm64.tar.gz",
    sha256: "8bc247f0280f62ca73599265db0d984e853d7df6e714dad6ead85afc7cfc5883",
  }),
});

export interface InstallOasdiffOptions {
  readonly cacheDir: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly signal?: AbortSignal;
}

export interface ResolveOasdiffOptions extends InstallOasdiffOptions {
  readonly binaryPath?: string;
}

interface InstallReleaseOptions extends InstallOasdiffOptions {
  readonly release: ReleaseAsset;
  readonly platformKey: string;
  readonly releaseUrl: string;
  readonly lockTimeoutMs?: number;
  readonly downloadTimeoutMs?: number;
  readonly downloadAttempts?: number;
}

interface ExtractedArchive {
  readonly executable: Buffer;
  readonly license: Buffer;
}

interface VersionCommandResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface InstallReceipt {
  readonly schema: typeof INSTALL_RECEIPT_SCHEMA;
  readonly version: typeof OASDIFF_VERSION;
  readonly releaseCommit: typeof OASDIFF_RELEASE_COMMIT;
  readonly platformKey: string;
  readonly asset: string;
  readonly archiveSha256: string;
  readonly executableSha256: string;
  readonly licenseSha256: string;
}

export function getOasdiffPlatformKey(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): keyof typeof OASDIFF_RELEASE_ASSETS {
  if (
    platform === "darwin" &&
    (architecture === "arm64" || architecture === "x64")
  ) {
    return "darwin_all";
  }
  if (platform === "linux" && architecture === "x64") {
    return "linux_amd64";
  }
  if (platform === "linux" && architecture === "arm64") {
    return "linux_arm64";
  }
  throw new PipelineError(
    "UNSUPPORTED_PLATFORM",
    `oasdiff ${OASDIFF_VERSION} is not pinned for ${platform}/${architecture}`,
    { platform, architecture },
  );
}

export async function resolveOasdiffBinary(
  options: ResolveOasdiffOptions,
): Promise<string> {
  const override = options.binaryPath ?? process.env["OASDIFF_BIN"];
  if (override !== undefined && override.trim() !== "") {
    const resolvedOverride = resolve(override);
    await assertOasdiffVersion(resolvedOverride, options.signal);
    return resolvedOverride;
  }
  return installOasdiff(options);
}

export async function installOasdiff(
  options: InstallOasdiffOptions,
): Promise<string> {
  const platformKey = getOasdiffPlatformKey();
  const release = OASDIFF_RELEASE_ASSETS[platformKey];
  return installRelease({
    ...options,
    release,
    platformKey,
    releaseUrl: `${RELEASE_BASE_URL}/${release.asset}`,
  });
}

export async function assertOasdiffVersion(
  binaryPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await runVersionCommand(resolve(binaryPath), signal);
  if (result.code !== 0 || result.signal !== null) {
    throw new PipelineError(
      "OASDIFF_VERSION",
      `unable to validate oasdiff ${OASDIFF_VERSION}`,
      {
        exitCode: result.code,
        signal: result.signal,
        stderr: redactDiagnostic(result.stderr),
      },
    );
  }

  const output = `${result.stdout}${result.stderr}`.trim();
  if (output !== `oasdiff version ${OASDIFF_VERSION}`) {
    throw new PipelineError(
      "OASDIFF_VERSION",
      `oasdiff executable must report exactly version ${OASDIFF_VERSION}`,
      { reported: redactDiagnostic(output).slice(0, 256) },
    );
  }
}

async function installRelease(options: InstallReleaseOptions): Promise<string> {
  if (options.signal?.aborted === true) {
    throw new PipelineError("ABORTED", "oasdiff installation was aborted");
  }

  const contentDir = join(
    resolve(options.cacheDir),
    "oasdiff",
    OASDIFF_RELEASE_TAG,
    options.release.sha256,
  );
  const binaryPath = join(contentDir, "oasdiff");
  const lockPath = `${contentDir}.lock`;

  if (
    await isValidCachedBinary(
      binaryPath,
      options.release,
      options.platformKey,
      options.signal,
    )
  ) {
    return binaryPath;
  }

  await mkdir(dirname(contentDir), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + (options.lockTimeoutMs ?? LOCK_TIMEOUT_MS);

  for (;;) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) {
        throw asPipelineError(
          error,
          "OASDIFF_FAILED",
          "unable to acquire the oasdiff installation lock",
        );
      }
      if (
        await isValidCachedBinary(
          binaryPath,
          options.release,
          options.platformKey,
          options.signal,
        )
      ) {
        return binaryPath;
      }
      if (Date.now() >= deadline) {
        throw new PipelineError(
          "OASDIFF_FAILED",
          "timed out waiting for the oasdiff installation lock",
          { lockPath },
        );
      }
      await abortableDelay(25, options.signal);
    }
  }

  try {
    if (
      await isValidCachedBinary(
        binaryPath,
        options.release,
        options.platformKey,
        options.signal,
      )
    ) {
      return binaryPath;
    }

    const archive = await downloadArchive(options);
    verifyArchiveChecksum(
      archive,
      options.release.sha256,
      options.release.asset,
    );
    const extracted = extractOasdiffArchive(archive);

    await mkdir(contentDir, { recursive: true, mode: 0o700 });
    await writeFileAtomic(
      join(contentDir, "LICENSE"),
      extracted.license,
      0o600,
    );
    await writeFileAtomic(binaryPath, extracted.executable, 0o700);
    await assertOasdiffVersion(binaryPath, options.signal);
    const receipt: InstallReceipt = {
      schema: INSTALL_RECEIPT_SCHEMA,
      version: OASDIFF_VERSION,
      releaseCommit: OASDIFF_RELEASE_COMMIT,
      platformKey: options.platformKey,
      asset: options.release.asset,
      archiveSha256: options.release.sha256,
      executableSha256: sha256(extracted.executable),
      licenseSha256: sha256(extracted.license),
    };
    await writeFileAtomic(
      join(contentDir, "install-receipt.json"),
      Buffer.from(`${JSON.stringify(receipt)}\n`),
      0o600,
    );
    return binaryPath;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function downloadArchive(
  options: InstallReleaseOptions,
): Promise<Buffer> {
  const attempts = positiveInteger(options.downloadAttempts, DOWNLOAD_ATTEMPTS);
  const timeoutMs = positiveInteger(
    options.downloadTimeoutMs,
    DOWNLOAD_TIMEOUT_MS,
  );
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await downloadArchiveAttempt(options, timeoutMs);
    } catch (error) {
      if (options.signal?.aborted === true) {
        throw new PipelineError("ABORTED", "oasdiff download was aborted");
      }
      lastError = error;
      if (attempt === attempts || !isRetryableDownloadError(error)) throw error;
      await abortableDelay(50 * attempt, options.signal);
    }
  }
  throw asPipelineError(
    lastError,
    "FETCH_FAILED",
    "failed to download pinned oasdiff",
  );
}

async function downloadArchiveAttempt(
  options: InstallReleaseOptions,
  timeoutMs: number,
): Promise<Buffer> {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let rejectTimeout: ((error: PipelineError) => void) | undefined;
  const timeoutPromise = new Promise<never>((_resolveTimeout, reject) => {
    rejectTimeout = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort();
    rejectTimeout?.(
      new PipelineError("FETCH_FAILED", "pinned oasdiff download timed out", {
        timeoutMs,
        retryable: true,
      }),
    );
  }, timeoutMs);
  timeout.unref();
  try {
    return await Promise.race([
      downloadArchiveOnce(options, controller.signal),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

async function downloadArchiveOnce(
  options: InstallReleaseOptions,
  signal: AbortSignal,
): Promise<Buffer> {
  const url = new URL(options.releaseUrl);
  if (url.protocol !== "https:") {
    throw new PipelineError(
      "FETCH_INVALID",
      "oasdiff release downloads must use HTTPS",
      { protocol: url.protocol },
    );
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      redirect: "follow",
      headers: { Accept: "application/octet-stream" },
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted === true) {
      throw new PipelineError("ABORTED", "oasdiff download was aborted");
    }
    throw new PipelineError(
      "FETCH_FAILED",
      "failed to download pinned oasdiff",
      { retryable: true },
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new PipelineError(
      "FETCH_FAILED",
      "failed to download pinned oasdiff",
      {
        status: response.status,
        retryable:
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500,
      },
    );
  }
  if (response.url !== "") {
    const finalUrl = new URL(response.url);
    const allowedHost =
      finalUrl.hostname === "github.com" ||
      finalUrl.hostname === "release-assets.githubusercontent.com";
    if (finalUrl.protocol !== "https:" || !allowedHost) {
      throw new PipelineError(
        "FETCH_INVALID",
        "oasdiff release redirected to an untrusted origin",
        { origin: finalUrl.origin },
      );
    }
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > MAX_ARCHIVE_BYTES) {
    throw new PipelineError("FETCH_INVALID", "oasdiff archive is too large", {
      maxBytes: MAX_ARCHIVE_BYTES,
    });
  }
  if (response.body === null) {
    throw new PipelineError(
      "FETCH_INVALID",
      "oasdiff archive response has no body",
    );
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const value: unknown = result.value;
      if (!(value instanceof Uint8Array)) {
        throw new PipelineError(
          "FETCH_INVALID",
          "oasdiff archive stream was invalid",
        );
      }
      const chunk = value;
      byteLength += chunk.byteLength;
      if (byteLength > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new PipelineError(
          "FETCH_INVALID",
          "oasdiff archive is too large",
          {
            maxBytes: MAX_ARCHIVE_BYTES,
          },
        );
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if (options.signal?.aborted === true) {
      throw new PipelineError("ABORTED", "oasdiff download was aborted");
    }
    throw new PipelineError(
      "FETCH_FAILED",
      "failed to read the oasdiff archive",
      { retryable: true },
      { cause: error },
    );
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteLength);
}

export function verifyArchiveChecksum(
  archive: Uint8Array,
  expectedSha256: string,
  asset = "oasdiff archive",
): void {
  const actualSha256 = createHash("sha256").update(archive).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new PipelineError(
      "CHECKSUM_MISMATCH",
      `checksum mismatch for ${asset}`,
      { expectedSha256, actualSha256 },
    );
  }
}

export function extractOasdiffArchive(archive: Uint8Array): ExtractedArchive {
  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch (error) {
    throw asPipelineError(
      error,
      "ARCHIVE_INVALID",
      "invalid oasdiff tar.gz archive",
    );
  }

  const entries = new Map<string, Buffer>();
  let offset = 0;
  let foundEnd = false;
  while (offset + 512 <= tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      foundEnd = true;
      break;
    }

    validateTarHeaderChecksum(header);
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const entryName = prefix === "" ? name : `${prefix}/${name}`;
    const type = header[156];
    const size = readTarOctal(header, 124, 12, "entry size");

    if (
      (type !== 0 && type !== 48) ||
      (entryName !== "oasdiff" && entryName !== "LICENSE") ||
      entryName.includes("/") ||
      entryName.includes("\\") ||
      entries.has(entryName)
    ) {
      throw new PipelineError(
        "ARCHIVE_INVALID",
        "oasdiff archive contains an unexpected entry",
        { entry: entryName, type },
      );
    }

    const sizeLimit =
      entryName === "oasdiff" ? MAX_EXECUTABLE_BYTES : MAX_LICENSE_BYTES;
    if (size <= 0 || size > sizeLimit || offset + size > tar.byteLength) {
      throw new PipelineError(
        "ARCHIVE_INVALID",
        "oasdiff archive entry has an invalid size",
        { entry: entryName, size },
      );
    }
    entries.set(entryName, Buffer.from(tar.subarray(offset, offset + size)));
    offset += Math.ceil(size / 512) * 512;
  }

  if (!foundEnd || tar.subarray(offset).some((byte) => byte !== 0)) {
    throw new PipelineError(
      "ARCHIVE_INVALID",
      "oasdiff archive has invalid trailing data",
    );
  }
  const executable = entries.get("oasdiff");
  const license = entries.get("LICENSE");
  if (executable === undefined || license === undefined || entries.size !== 2) {
    throw new PipelineError(
      "ARCHIVE_INVALID",
      "oasdiff archive must contain exactly LICENSE and oasdiff",
    );
  }
  return { executable, license };
}

function validateTarHeaderChecksum(header: Buffer): void {
  const expected = readTarOctal(header, 148, 8, "header checksum");
  let actual = 0;
  for (let index = 0; index < header.byteLength; index += 1) {
    const byte = index >= 148 && index < 156 ? 32 : header[index];
    actual += byte ?? 0;
  }
  if (actual !== expected) {
    throw new PipelineError(
      "ARCHIVE_INVALID",
      "oasdiff archive contains an invalid tar header checksum",
    );
  }
}

function readTarString(buffer: Buffer, offset: number, length: number): string {
  const value = buffer.subarray(offset, offset + length);
  const terminator = value.indexOf(0);
  return value
    .subarray(0, terminator === -1 ? value.byteLength : terminator)
    .toString("utf8");
}

function readTarOctal(
  buffer: Buffer,
  offset: number,
  length: number,
  field: string,
): number {
  const value = readTarString(buffer, offset, length).trim();
  if (!/^[0-7]+$/.test(value)) {
    throw new PipelineError(
      "ARCHIVE_INVALID",
      `oasdiff archive has an invalid tar ${field}`,
    );
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) {
    throw new PipelineError(
      "ARCHIVE_INVALID",
      `oasdiff archive has an unsafe tar ${field}`,
    );
  }
  return parsed;
}

async function writeFileAtomic(
  destination: string,
  bytes: Uint8Array,
  mode: number,
): Promise<void> {
  const temporaryPath = join(
    dirname(destination),
    `.${basename(destination)}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", mode);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, destination);
    await syncDirectory(dirname(destination));
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
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

async function isValidCachedBinary(
  binaryPath: string,
  release: ReleaseAsset,
  platformKey: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    await access(binaryPath, fsConstants.X_OK);
    const contentDirectory = dirname(binaryPath);
    const licensePath = join(contentDirectory, "LICENSE");
    const receiptPath = join(contentDirectory, "install-receipt.json");
    const [binaryStat, licenseStat, receiptStat] = await Promise.all([
      stat(binaryPath),
      stat(licensePath),
      stat(receiptPath),
    ]);
    if (
      !binaryStat.isFile() ||
      binaryStat.size <= 0 ||
      binaryStat.size > MAX_EXECUTABLE_BYTES ||
      !licenseStat.isFile() ||
      licenseStat.size <= 0 ||
      licenseStat.size > MAX_LICENSE_BYTES ||
      !receiptStat.isFile() ||
      receiptStat.size <= 0 ||
      receiptStat.size > 16 * 1024
    ) {
      return false;
    }
    const [executable, license, receiptBytes] = await Promise.all([
      readFile(binaryPath),
      readFile(licensePath),
      readFile(receiptPath),
    ]);
    const receipt = parseInstallReceipt(receiptBytes);
    if (
      receipt.schema !== INSTALL_RECEIPT_SCHEMA ||
      receipt.version !== OASDIFF_VERSION ||
      receipt.releaseCommit !== OASDIFF_RELEASE_COMMIT ||
      receipt.platformKey !== platformKey ||
      receipt.asset !== release.asset ||
      receipt.archiveSha256 !== release.sha256 ||
      receipt.executableSha256 !== sha256(executable) ||
      receipt.licenseSha256 !== sha256(license)
    ) {
      return false;
    }
    await assertOasdiffVersion(binaryPath, signal);
    return true;
  } catch (error) {
    if (error instanceof PipelineError && error.code === "ABORTED") throw error;
    return false;
  }
}

function parseInstallReceipt(bytes: Uint8Array): Partial<InstallReceipt> {
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return {};
  return parsed as Partial<InstallReceipt>;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new PipelineError(
      "FETCH_INVALID",
      "download bounds must be positive integers",
    );
  }
  return selected;
}

function isRetryableDownloadError(error: unknown): boolean {
  return (
    error instanceof PipelineError &&
    error.code === "FETCH_FAILED" &&
    error.details["retryable"] === true
  );
}

async function runVersionCommand(
  binaryPath: string,
  signal?: AbortSignal,
): Promise<VersionCommandResult> {
  if (signal?.aborted === true) {
    throw new PipelineError(
      "ABORTED",
      "oasdiff version validation was aborted",
    );
  }

  return new Promise<VersionCommandResult>((resolveResult, reject) => {
    const child = spawn(binaryPath, ["--version"], {
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: minimalChildEnvironment(),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const terminate = (): void => {
      killProcessGroup(child.pid, "SIGKILL");
    };
    const onAbort = (): void => {
      terminate();
      finish(() =>
        reject(
          new PipelineError(
            "ABORTED",
            "oasdiff version validation was aborted",
          ),
        ),
      );
    };
    const timeout = setTimeout(() => {
      terminate();
      finish(() =>
        reject(
          new PipelineError(
            "OASDIFF_VERSION",
            "timed out validating the oasdiff executable version",
          ),
        ),
      );
    }, VERSION_TIMEOUT_MS);
    timeout.unref();

    const collect = (target: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 8 * 1024) {
        terminate();
        finish(() =>
          reject(
            new PipelineError(
              "OASDIFF_VERSION",
              "oasdiff version output exceeded the safety limit",
            ),
          ),
        );
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", (error) => {
      finish(() =>
        reject(
          asPipelineError(
            error,
            "OASDIFF_VERSION",
            "unable to execute oasdiff --version",
          ),
        ),
      );
    });
    child.once("close", (code, closeSignal) => {
      finish(() =>
        resolveResult({
          code,
          signal: closeSignal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      );
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function minimalChildEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
  };
  for (const name of ["PATH", "SystemRoot", "WINDIR"] as const) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
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
    );
}

async function abortableDelay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted === true) {
    throw new PipelineError("ABORTED", "oasdiff installation was aborted");
  }
  await new Promise<void>((resolveDelay, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolveDelay();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new PipelineError("ABORTED", "oasdiff installation was aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isNodeError(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

export const installerTesting = Object.freeze({
  installRelease,
});
