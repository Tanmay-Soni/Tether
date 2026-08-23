import { constants as fsConstants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  type FileHandle,
  unlink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";

import { PipelineError, asPipelineError } from "./errors.js";
import {
  assertOfficialRevision,
  revisionCacheKey,
  revisionIdentity,
} from "./provenance.js";
import type { LocalSpec, SpecRevision } from "./types.js";

const SHA256 = /^[0-9a-f]{64}$/u;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_LOCK_BYTES = 4 * 1024;

export interface ProviderFetchOptions {
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  maxSpecBytes?: number;
  maxApiBytes?: number;
  lockTimeoutMs?: number;
}

export interface OfficialFetchInput {
  url: string;
  allowedHosts: ReadonlySet<string>;
  allowedContentTypes: ReadonlySet<string>;
  maxBytes: number;
  headers?: Readonly<Record<string, string>>;
  validateUrl?: (url: URL) => boolean;
}

interface ResolvedFetchOptions {
  fetch: typeof globalThis.fetch;
  clock: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
  requestTimeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  maxSpecBytes: number;
  maxApiBytes: number;
  lockTimeoutMs: number;
}

interface CachePaths {
  root: string;
  base: string;
  blobs: string;
  revisions: string;
  locks: string;
}

interface CacheMetadata {
  version: 1;
  identity: string;
  revision: SpecRevision;
  sha256: string;
  byteLength: number;
  fetchedAt: string;
}

interface BodyReadResult {
  done: boolean;
  value?: Uint8Array;
}

interface BodyReader {
  read(): Promise<BodyReadResult>;
  cancel(): Promise<void>;
  releaseLock(): void;
}

interface LockRecord {
  token: string;
  pid: number;
  createdAt: string;
}

class RetryableFetchError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableFetchError";
    if (status !== undefined) this.status = status;
  }
}

class FetchTimeoutError extends RetryableFetchError {
  constructor() {
    super("Official provider request timed out");
    this.name = "FetchTimeoutError";
  }
}

const inflightMaterializations = new Map<string, Promise<LocalSpec>>();

export const YAML_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/octet-stream",
  "application/x-yaml",
  "application/yaml",
  "text/plain",
  "text/x-yaml",
  "text/yaml",
]);

export const GITHUB_JSON_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/json",
  "application/vnd.github+json",
]);

export function resolveProviderFetchOptions(
  options: ProviderFetchOptions = {},
): ResolvedFetchOptions {
  return {
    fetch: options.fetch ?? globalThis.fetch,
    clock: options.clock ?? (() => new Date()),
    sleep:
      options.sleep ??
      (async (milliseconds) => {
        await new Promise<void>((resolveSleep) => {
          setTimeout(resolveSleep, milliseconds);
        });
      }),
    requestTimeoutMs: positiveInteger(
      options.requestTimeoutMs,
      15_000,
      "requestTimeoutMs",
    ),
    maxAttempts: positiveInteger(options.maxAttempts, 3, "maxAttempts"),
    retryBaseDelayMs: nonnegativeInteger(
      options.retryBaseDelayMs,
      100,
      "retryBaseDelayMs",
    ),
    maxSpecBytes: positiveInteger(
      options.maxSpecBytes,
      32 * 1024 * 1024,
      "maxSpecBytes",
    ),
    maxApiBytes: positiveInteger(
      options.maxApiBytes,
      1024 * 1024,
      "maxApiBytes",
    ),
    lockTimeoutMs: positiveInteger(
      options.lockTimeoutMs,
      30_000,
      "lockTimeoutMs",
    ),
  };
}

export async function fetchOfficialBytes(
  input: OfficialFetchInput,
  options: ProviderFetchOptions | ResolvedFetchOptions = {},
): Promise<Uint8Array> {
  const resolved = isResolvedOptions(options)
    ? options
    : resolveProviderFetchOptions(options);
  assertFetchUrl(new URL(input.url), input);

  let lastRetryable: RetryableFetchError | undefined;
  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
    try {
      return await fetchAttempt(input, resolved);
    } catch (error) {
      if (!(error instanceof RetryableFetchError)) throw error;
      lastRetryable = error;
      if (attempt === resolved.maxAttempts) break;
      await resolved.sleep(resolved.retryBaseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw new PipelineError(
    "FETCH_FAILED",
    "Official provider request failed after bounded retries",
    {
      attempts: resolved.maxAttempts,
      ...(lastRetryable?.status === undefined
        ? {}
        : { status: lastRetryable.status }),
    },
    lastRetryable === undefined ? undefined : { cause: lastRetryable },
  );
}

export async function materializeSpec(
  revision: SpecRevision,
  cacheDir: string,
  options: ProviderFetchOptions = {},
): Promise<LocalSpec> {
  assertOfficialRevision(revision);
  const resolvedOptions = resolveProviderFetchOptions(options);
  const cachePaths = await prepareCachePaths(cacheDir);
  const key = revisionCacheKey(revision);
  const metadataPath = join(cachePaths.revisions, `${key}.json`);

  const cached = await readCachedSpec(
    revision,
    cachePaths,
    metadataPath,
    resolvedOptions.maxSpecBytes,
  );
  if (cached !== undefined) return cached;

  const inflight = inflightMaterializations.get(metadataPath);
  if (inflight !== undefined) return inflight;

  const materialization = materializeWithLock(
    revision,
    cachePaths,
    metadataPath,
    resolvedOptions,
  );
  inflightMaterializations.set(metadataPath, materialization);
  try {
    return await materialization;
  } finally {
    if (inflightMaterializations.get(metadataPath) === materialization) {
      inflightMaterializations.delete(metadataPath);
    }
  }
}

async function materializeWithLock(
  revision: SpecRevision,
  cachePaths: CachePaths,
  metadataPath: string,
  options: ResolvedFetchOptions,
): Promise<LocalSpec> {
  const lockPath = join(cachePaths.locks, `${revisionCacheKey(revision)}.lock`);
  const releaseLock = await acquireLock(
    lockPath,
    revision,
    cachePaths,
    metadataPath,
    options,
  );
  if (typeof releaseLock !== "function") return releaseLock;

  try {
    const cached = await readCachedSpec(
      revision,
      cachePaths,
      metadataPath,
      options.maxSpecBytes,
    );
    if (cached !== undefined) return cached;

    const bytes = await fetchOfficialBytes(
      {
        url: revision.rawUrl,
        allowedHosts: new Set(["raw.githubusercontent.com"]),
        allowedContentTypes: YAML_CONTENT_TYPES,
        maxBytes: options.maxSpecBytes,
        headers: {
          accept: "application/yaml, text/yaml, text/plain;q=0.9",
          "user-agent": "TetherIn-provider-pipeline/0.1",
        },
        validateUrl: (url) => url.href === revision.rawUrl,
      },
      options,
    );

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const blobPath = join(cachePaths.blobs, `${sha256}.yaml`);
    await storeContentAddressedBlob(blobPath, cachePaths.blobs, bytes, sha256);
    const fetchedAt = options.clock().toISOString();
    const metadata: CacheMetadata = {
      version: 1,
      identity: revisionIdentity(revision),
      revision: { ...revision },
      sha256,
      byteLength: bytes.byteLength,
      fetchedAt,
    };
    await atomicWriteNew(
      metadataPath,
      cachePaths.revisions,
      new TextEncoder().encode(`${JSON.stringify(metadata)}\n`),
    );
    return {
      ...revision,
      filePath: blobPath,
      sha256,
      byteLength: bytes.byteLength,
      fetchedAt,
    };
  } catch (error) {
    throw asPipelineError(
      error,
      "FETCH_FAILED",
      "Failed to materialize the official provider spec",
    );
  } finally {
    await releaseLock();
  }
}

async function fetchAttempt(
  input: OfficialFetchInput,
  options: ResolvedFetchOptions,
): Promise<Uint8Array> {
  let currentUrl = new URL(input.url);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await timedFetch(currentUrl.href, input.headers, options);
    const responseUrl =
      response.url === "" ? currentUrl : new URL(response.url);
    assertFetchUrl(responseUrl, input);

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectCount === 3) {
        await cancelResponseBody(response);
        throw new PipelineError(
          "FETCH_INVALID",
          "Official provider response exceeded the redirect limit",
          { redirects: redirectCount + 1 },
        );
      }
      const location = response.headers.get("location");
      await cancelResponseBody(response);
      if (location === null) {
        throw new PipelineError(
          "FETCH_INVALID",
          "Official provider redirect omitted its Location header",
        );
      }
      const redirectUrl = new URL(location, currentUrl);
      assertFetchUrl(redirectUrl, input);
      currentUrl = redirectUrl;
      continue;
    }

    if (RETRYABLE_STATUSES.has(response.status)) {
      await cancelResponseBody(response);
      throw new RetryableFetchError(
        "Official provider returned a retryable HTTP status",
        response.status,
      );
    }
    if (!response.ok) {
      await cancelResponseBody(response);
      throw new PipelineError(
        "FETCH_FAILED",
        "Official provider returned a non-success HTTP status",
        { status: response.status },
      );
    }

    const contentTypeHeader = response.headers.get("content-type");
    const contentType = contentTypeHeader
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (
      contentType === undefined ||
      !input.allowedContentTypes.has(contentType)
    ) {
      await cancelResponseBody(response);
      throw new PipelineError(
        "FETCH_INVALID",
        "Official provider response used an unsupported content type",
        { contentType: contentType ?? null },
      );
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader !== null) {
      if (!/^[0-9]+$/u.test(contentLengthHeader)) {
        await cancelResponseBody(response);
        throw new PipelineError(
          "FETCH_INVALID",
          "Official provider response used an invalid Content-Length",
        );
      }
      const contentLength = Number(contentLengthHeader);
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength > input.maxBytes
      ) {
        await cancelResponseBody(response);
        throw new PipelineError(
          "FETCH_INVALID",
          "Official provider response exceeded the configured size limit",
          { maxBytes: input.maxBytes },
        );
      }
    }

    return readBoundedBody(response, input.maxBytes, options.requestTimeoutMs);
  }

  throw new PipelineError(
    "FETCH_INVALID",
    "Official provider redirect processing failed",
  );
}

async function timedFetch(
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
  options: ResolvedFetchOptions,
): Promise<Response> {
  const controller = new AbortController();
  const fetchPromise = Promise.resolve().then(() =>
    options.fetch(url, {
      method: "GET",
      ...(headers === undefined ? {} : { headers }),
      redirect: "manual",
      signal: controller.signal,
    }),
  );
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<Response>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new FetchTimeoutError());
      controller.abort();
    }, options.requestTimeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof FetchTimeoutError) observeLateFetch(fetchPromise);
    if (
      error instanceof PipelineError ||
      error instanceof RetryableFetchError
    ) {
      throw error;
    }
    throw new RetryableFetchError(
      "Official provider network request failed",
      undefined,
      {
        cause: error,
      },
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  timeoutMs: number,
): Promise<Uint8Array> {
  if (response.body === null) {
    throw new PipelineError(
      "FETCH_INVALID",
      "Official provider response did not contain a body",
    );
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const reader = response.body.getReader() as unknown as BodyReader;
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<BodyReadResult>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new RetryableFetchError("Official provider response body timed out"),
      );
    }, timeoutMs);
    timeout.unref();
  });
  try {
    for (;;) {
      const result = await Promise.race([reader.read(), timeoutPromise]);
      if (result.done) break;
      const chunk = result.value;
      if (chunk === undefined) {
        throw new PipelineError(
          "FETCH_INVALID",
          "Official provider response body produced an invalid stream chunk",
        );
      }
      byteLength += chunk.byteLength;
      if (byteLength > maxBytes) {
        throw new PipelineError(
          "FETCH_INVALID",
          "Official provider response exceeded the configured size limit",
          { maxBytes },
        );
      }
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    reader.releaseLock();
  }

  if (byteLength === 0) {
    throw new PipelineError(
      "FETCH_INVALID",
      "Official provider response was empty",
    );
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body === null) return;
  await response.body.cancel().catch(() => undefined);
}

function observeLateFetch(fetchPromise: Promise<Response>): void {
  // Attaching reactions observes rejection and cancels a late body without a
  // module-global collection retaining fetches that ignore AbortSignal forever.
  void fetchPromise.then(
    async (response) => {
      await cancelResponseBody(response);
    },
    () => undefined,
  );
}

function assertFetchUrl(url: URL, input: OfficialFetchInput): void {
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !input.allowedHosts.has(url.hostname) ||
    (input.validateUrl !== undefined && !input.validateUrl(url))
  ) {
    throw new PipelineError(
      "FETCH_INVALID",
      "Official provider request or redirect URL failed its identity policy",
      { host: url.hostname },
    );
  }
}

async function readCachedSpec(
  revision: SpecRevision,
  cachePaths: CachePaths,
  metadataPath: string,
  maxBytes: number,
): Promise<LocalSpec | undefined> {
  const metadataBytes = await readOptionalBoundedRegularFile(
    metadataPath,
    cachePaths.revisions,
    MAX_METADATA_BYTES,
    "Provider cache metadata",
  );
  if (metadataBytes === undefined) return undefined;

  let unknownMetadata: unknown;
  try {
    const rawMetadata = new TextDecoder("utf-8", { fatal: true }).decode(
      metadataBytes,
    );
    unknownMetadata = JSON.parse(rawMetadata) as unknown;
  } catch (error) {
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache metadata is not valid JSON",
      {},
      { cause: error },
    );
  }
  const metadata = parseCacheMetadata(unknownMetadata, revision);
  const blobPath = join(cachePaths.blobs, `${metadata.sha256}.yaml`);
  if (!isContainedPath(cachePaths.root, blobPath)) {
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache blob path escaped the cache directory",
    );
  }
  await verifyCachedBlob(
    blobPath,
    cachePaths.blobs,
    metadata.sha256,
    metadata.byteLength,
    maxBytes,
  );
  return {
    ...revision,
    filePath: blobPath,
    sha256: metadata.sha256,
    byteLength: metadata.byteLength,
    fetchedAt: metadata.fetchedAt,
  };
}

function parseCacheMetadata(
  value: unknown,
  revision: SpecRevision,
): CacheMetadata {
  if (!isRecord(value)) return invalidCacheMetadata();
  const cachedRevision = value["revision"];
  if (!isRecord(cachedRevision)) return invalidCacheMetadata();
  const sha256 = value["sha256"];
  const byteLength = value["byteLength"];
  const fetchedAt = value["fetchedAt"];
  if (
    value["version"] !== 1 ||
    value["identity"] !== revisionIdentity(revision) ||
    !sameRevision(cachedRevision, revision) ||
    typeof sha256 !== "string" ||
    !SHA256.test(sha256) ||
    typeof byteLength !== "number" ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0 ||
    typeof fetchedAt !== "string" ||
    !isCanonicalIsoDate(fetchedAt)
  ) {
    return invalidCacheMetadata();
  }
  return {
    version: 1,
    identity: revisionIdentity(revision),
    revision: { ...revision },
    sha256,
    byteLength,
    fetchedAt,
  };
}

function invalidCacheMetadata(): never {
  throw new PipelineError(
    "CACHE_INTEGRITY",
    "Provider cache metadata failed its integrity checks",
  );
}

async function verifyCachedBlob(
  blobPath: string,
  blobDir: string,
  expectedSha256: string,
  expectedByteLength: number,
  maxBytes: number,
): Promise<void> {
  let handle;
  try {
    await assertSafeDirectory(blobDir);
    handle = await open(
      blobPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size !== expectedByteLength ||
      info.size > maxBytes
    ) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache blob size or file type failed integrity checks",
      );
    }
    const bytes = await readBoundedHandle(
      handle,
      Math.min(maxBytes, expectedByteLength),
      "Provider cache blob",
    );
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (
      bytes.byteLength !== expectedByteLength ||
      actualSha256 !== expectedSha256
    ) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache blob hash failed its integrity check",
        { expectedSha256, actualSha256 },
      );
    }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache blob could not be verified",
      {},
      { cause: error },
    );
  } finally {
    await handle?.close();
  }
}

async function storeContentAddressedBlob(
  blobPath: string,
  blobDir: string,
  bytes: Uint8Array,
  sha256: string,
): Promise<void> {
  try {
    await verifyCachedBlob(
      blobPath,
      blobDir,
      sha256,
      bytes.byteLength,
      bytes.byteLength,
    );
    return;
  } catch (error) {
    if (
      error instanceof PipelineError &&
      error.code === "CACHE_INTEGRITY" &&
      !(await pathExists(blobPath))
    ) {
      // The content-addressed blob has not been stored yet.
    } else {
      throw error;
    }
  }

  const temporaryPath = `${blobPath}.${randomUUID()}.tmp`;
  await writeExclusiveFile(temporaryPath, blobDir, bytes);
  try {
    await assertSafeDirectory(blobDir);
    await link(temporaryPath, blobPath);
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
    await verifyCachedBlob(
      blobPath,
      blobDir,
      sha256,
      bytes.byteLength,
      bytes.byteLength,
    );
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
  }
}

async function atomicWriteNew(
  path: string,
  parentDir: string,
  bytes: Uint8Array,
): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeExclusiveFile(temporaryPath, parentDir, bytes);
  try {
    await assertSafeDirectory(parentDir);
    if (await pathExists(path)) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache metadata appeared before its atomic placement",
      );
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function writeExclusiveFile(
  path: string,
  parentDir: string,
  bytes: Uint8Array,
): Promise<void> {
  await assertSafeDirectory(parentDir);
  const handle = await open(
    path,
    fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function acquireLock(
  lockPath: string,
  revision: SpecRevision,
  cachePaths: CachePaths,
  metadataPath: string,
  options: ResolvedFetchOptions,
): Promise<(() => Promise<void>) | LocalSpec> {
  const token = randomUUID();
  const record: LockRecord = {
    token,
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  const recordBytes = new TextEncoder().encode(`${JSON.stringify(record)}\n`);
  const candidatePath = `${lockPath}.${token}.candidate`;
  const startedAt = performance.now();
  while (performance.now() - startedAt <= options.lockTimeoutMs) {
    await writeExclusiveFile(candidatePath, cachePaths.locks, recordBytes);
    let acquired = false;
    try {
      await assertSafeDirectory(cachePaths.locks);
      await link(candidatePath, lockPath);
      acquired = true;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) {
        throw new PipelineError(
          "CACHE_INTEGRITY",
          "Provider cache lock could not be acquired",
          {},
          { cause: error },
        );
      }
    } finally {
      await unlink(candidatePath).catch((error: unknown) => {
        if (!isNodeError(error, "ENOENT")) throw error;
      });
    }
    if (acquired) {
      return createTokenCheckedRelease(lockPath, cachePaths.locks, token);
    }

    await readLockRecord(lockPath, cachePaths.locks);

    const cached = await readCachedSpec(
      revision,
      cachePaths,
      metadataPath,
      options.maxSpecBytes,
    );
    if (cached !== undefined) return cached;
    await options.sleep(25);
  }
  throw new PipelineError(
    "CACHE_INTEGRITY",
    "Timed out waiting for the provider cache concurrency lock",
    { timeoutMs: options.lockTimeoutMs },
  );
}

function createTokenCheckedRelease(
  lockPath: string,
  lockDir: string,
  token: string,
): () => Promise<void> {
  return async () => {
    const record = await readLockRecord(lockPath, lockDir);
    if (record === undefined || record.token !== token) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache lock ownership changed before release",
      );
    }
    await assertSafeDirectory(lockDir);
    await unlink(lockPath);
  };
}

async function readLockRecord(
  lockPath: string,
  lockDir: string,
): Promise<LockRecord | undefined> {
  const bytes = await readOptionalBoundedRegularFile(
    lockPath,
    lockDir,
    MAX_LOCK_BYTES,
    "Provider cache lock",
  );
  if (bytes === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache lock record is invalid",
      {},
      { cause: error },
    );
  }
  if (!isRecord(value)) return invalidLockRecord();
  const token = value["token"];
  const pid = value["pid"];
  const createdAt = value["createdAt"];
  if (
    typeof token !== "string" ||
    token.length !== 36 ||
    typeof pid !== "number" ||
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    typeof createdAt !== "string" ||
    !isCanonicalIsoDate(createdAt)
  ) {
    return invalidLockRecord();
  }
  return { token, pid, createdAt };
}

function invalidLockRecord(): never {
  throw new PipelineError(
    "CACHE_INTEGRITY",
    "Provider cache lock record failed its integrity checks",
  );
}

async function prepareCachePaths(cacheDir: string): Promise<CachePaths> {
  const requestedRoot = resolve(cacheDir);
  try {
    await mkdir(requestedRoot, { recursive: true, mode: 0o700 });
    const requestedInfo = await lstat(requestedRoot);
    if (requestedInfo.isSymbolicLink() || !requestedInfo.isDirectory()) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache root must be a real directory, not a link or special file",
      );
    }
    const root = await realpath(requestedRoot);
    await assertSafeDirectory(root);
    const base = await ensureSafeChildDirectory(root, "provider-specs");
    const blobs = await ensureSafeChildDirectory(base, "blobs");
    const revisions = await ensureSafeChildDirectory(base, "revisions");
    const locks = await ensureSafeChildDirectory(base, "locks");
    return { root, base, blobs, revisions, locks };
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache directory hierarchy failed its integrity checks",
      {},
      { cause: error },
    );
  }
}

async function ensureSafeChildDirectory(
  parentDir: string,
  basename: string,
): Promise<string> {
  await assertSafeDirectory(parentDir);
  const path = join(parentDir, basename);
  if (!isContainedPath(parentDir, path)) {
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache directory escaped its canonical parent",
    );
  }
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
  }
  await assertSafeDirectory(path);
  return path;
}

async function assertSafeDirectory(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache path component is not a real directory",
      );
    }
    if ((await realpath(path)) !== path) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        "Provider cache path component is not canonical",
      );
    }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError(
      "CACHE_INTEGRITY",
      "Provider cache directory could not be verified",
      {},
      { cause: error },
    );
  }
}

async function readOptionalBoundedRegularFile(
  path: string,
  parentDir: string,
  maxBytes: number,
  description: string,
): Promise<Uint8Array | undefined> {
  await assertSafeDirectory(parentDir);
  if (!isContainedPath(parentDir, path)) {
    throw new PipelineError(
      "CACHE_INTEGRITY",
      `${description} escaped its canonical cache directory`,
    );
  }

  let handle: FileHandle;
  try {
    handle = await open(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw new PipelineError(
      "CACHE_INTEGRITY",
      `${description} could not be opened without following links`,
      {},
      { cause: error },
    );
  }

  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) {
      throw new PipelineError(
        "CACHE_INTEGRITY",
        `${description} is not a bounded regular file`,
        { maxBytes },
      );
    }
    return await readBoundedHandle(handle, maxBytes, description);
  } finally {
    await handle.close();
  }
}

async function readBoundedHandle(
  handle: FileHandle,
  maxBytes: number,
  description: string,
): Promise<Uint8Array> {
  const buffer = Buffer.alloc(maxBytes + 1);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.byteLength - offset,
      null,
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > maxBytes) {
    throw new PipelineError(
      "CACHE_INTEGRITY",
      `${description} exceeded its bounded read limit`,
      { maxBytes },
    );
  }
  return buffer.subarray(0, offset);
}

function isContainedPath(parentDir: string, path: string): boolean {
  const relativePath = relative(parentDir, path);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

function sameRevision(
  value: Readonly<Record<string, unknown>>,
  revision: SpecRevision,
): boolean {
  return (
    value["provider"] === revision.provider &&
    value["repositoryUrl"] === revision.repositoryUrl &&
    value["commit"] === revision.commit &&
    value["path"] === revision.path &&
    value["rawUrl"] === revision.rawUrl &&
    value["licenseSpdx"] === revision.licenseSpdx
  );
}

function isCanonicalIsoDate(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function isResolvedOptions(
  options: ProviderFetchOptions | ResolvedFetchOptions,
): options is ResolvedFetchOptions {
  return (
    options.fetch !== undefined &&
    options.clock !== undefined &&
    options.sleep !== undefined &&
    options.requestTimeoutMs !== undefined &&
    options.maxAttempts !== undefined &&
    options.retryBaseDelayMs !== undefined &&
    options.maxSpecBytes !== undefined &&
    options.maxApiBytes !== undefined &&
    options.lockTimeoutMs !== undefined
  );
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new PipelineError(
      "FETCH_INVALID",
      `${field} must be a positive integer`,
      {
        field,
      },
    );
  }
  return result;
}

function nonnegativeInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new PipelineError(
      "FETCH_INVALID",
      `${field} must be a nonnegative integer`,
      { field },
    );
  }
  return result;
}
