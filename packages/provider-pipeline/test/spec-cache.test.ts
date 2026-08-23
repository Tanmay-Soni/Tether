import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PipelineError } from "../src/errors.js";
import {
  fetchOfficialBytes,
  materializeSpec,
  YAML_CONTENT_TYPES,
} from "../src/spec-cache.js";
import { revisionCacheKey } from "../src/provenance.js";
import type { SpecRevision } from "../src/types.js";

const SHA = "1111111111111111111111111111111111111111";
const RAW_URL = `https://raw.githubusercontent.com/openai/openai-openapi/${SHA}/openapi.yaml`;
const SPEC =
  "openapi: 3.1.0\ninfo:\n  title: test\n  version: '1'\npaths: {}\n";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("content-addressed provider spec cache", () => {
  it("atomically stores a SHA-256-addressed spec with stable provenance", async () => {
    const cacheDir = await temporaryDirectory();
    const fetchedAt = new Date("2026-08-23T12:34:56.000Z");
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );

    const local = await materializeSpec(revision(), cacheDir, {
      fetch,
      clock: () => fetchedAt,
    });

    const expectedHash = createHash("sha256").update(SPEC).digest("hex");
    expect(local).toMatchObject({
      sha256: expectedHash,
      byteLength: Buffer.byteLength(SPEC),
      fetchedAt: fetchedAt.toISOString(),
    });
    expect(local.filePath).toBe(
      join(
        await realpath(cacheDir),
        "provider-specs",
        "blobs",
        `${expectedHash}.yaml`,
      ),
    );
    await expect(readFile(local.filePath, "utf8")).resolves.toBe(SPEC);
    const blobs = await readdir(join(cacheDir, "provider-specs", "blobs"));
    expect(blobs).toEqual([`${expectedHash}.yaml`]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves an offline cache hit only after rechecking content integrity", async () => {
    const cacheDir = await temporaryDirectory();
    const firstFetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );
    const first = await materializeSpec(revision(), cacheDir, {
      fetch: firstFetch,
    });
    const offlineFetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new Error("offline fetch must not run")),
    );

    const second = await materializeSpec(revision(), cacheDir, {
      fetch: offlineFetch,
    });

    expect(second).toEqual(first);
    expect(offlineFetch).not.toHaveBeenCalled();
  });

  it("fails closed on a cache hash mismatch without silently refetching", async () => {
    const cacheDir = await temporaryDirectory();
    const first = await materializeSpec(revision(), cacheDir, {
      fetch: () => Promise.resolve(yamlResponse(SPEC)),
    });
    await writeFile(first.filePath, "tampered", "utf8");
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );

    await expect(
      materializeSpec(revision(), cacheDir, { fetch }),
    ).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("coalesces concurrent materializations into one fetch and one cache object", async () => {
    const cacheDir = await temporaryDirectory();
    let releaseFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      releaseFetch = resolveGate;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await gate;
      return yamlResponse(SPEC);
    });

    const pending = Array.from({ length: 8 }, () =>
      materializeSpec(revision(), cacheDir, {
        fetch,
        clock: () => new Date("2026-08-23T00:00:00.000Z"),
      }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    releaseFetch?.();
    const results = await Promise.all(pending);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((result) => result.filePath)).size).toBe(1);
    expect(new Set(results.map((result) => result.fetchedAt)).size).toBe(1);
  });
});

describe("provider cache filesystem defenses", () => {
  it("rejects a symlinked top-level or internal cache directory", async () => {
    for (const internalParent of ["provider-specs", "revisions"] as const) {
      const cacheDir = await temporaryDirectory();
      const outsideDir = await temporaryDirectory();
      if (internalParent === "provider-specs") {
        await symlink(outsideDir, join(cacheDir, "provider-specs"));
      } else {
        await mkdir(join(cacheDir, "provider-specs"), { recursive: true });
        await symlink(
          outsideDir,
          join(cacheDir, "provider-specs", "revisions"),
        );
      }
      const fetch = vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(yamlResponse(SPEC)),
      );

      await expect(
        materializeSpec(revision(), cacheDir, { fetch }),
      ).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it("rejects a final metadata symlink without reading its target", async () => {
    const cacheDir = await temporaryDirectory();
    const paths = await createCacheDirectories(cacheDir);
    const outsideDir = await temporaryDirectory();
    const outsideFile = join(outsideDir, "outside.json");
    await writeFile(outsideFile, "sensitive target", "utf8");
    await symlink(outsideFile, metadataPath(paths.revisions));
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );

    await expect(
      materializeSpec(revision(), cacheDir, { fetch }),
    ).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
    await expect(readFile(outsideFile, "utf8")).resolves.toBe(
      "sensitive target",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized cache metadata before parsing it", async () => {
    const cacheDir = await temporaryDirectory();
    const paths = await createCacheDirectories(cacheDir);
    await writeFile(
      metadataPath(paths.revisions),
      "x".repeat(65 * 1024),
      "utf8",
    );
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );

    await expect(
      materializeSpec(revision(), cacheDir, { fetch }),
    ).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a non-regular lock instead of blocking on or replacing it", async () => {
    const cacheDir = await temporaryDirectory();
    const paths = await createCacheDirectories(cacheDir);
    const lockPath = revisionLockPath(paths.locks);
    await mkdir(lockPath);
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );

    await expect(
      materializeSpec(revision(), cacheDir, { fetch, lockTimeoutMs: 10 }),
    ).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not evict an old but valid lock automatically", async () => {
    const cacheDir = await temporaryDirectory();
    const paths = await createCacheDirectories(cacheDir);
    const lockPath = revisionLockPath(paths.locks);
    const oldRecord = lockRecord("00000000-0000-4000-8000-000000000000");
    await writeFile(lockPath, `${JSON.stringify(oldRecord)}\n`, "utf8");
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse(SPEC)),
    );

    await expect(
      materializeSpec(revision(), cacheDir, { fetch, lockTimeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
    await expect(readFile(lockPath, "utf8")).resolves.toBe(
      `${JSON.stringify(oldRecord)}\n`,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to delete a replacement lock with a different owner token", async () => {
    const cacheDir = await temporaryDirectory();
    const paths = await createCacheDirectories(cacheDir);
    let releaseFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      releaseFetch = resolveGate;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await gate;
      return yamlResponse(SPEC);
    });
    const pending = materializeSpec(revision(), cacheDir, { fetch });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const lockPath = revisionLockPath(paths.locks);
    await unlink(lockPath);
    const replacement = lockRecord("ffffffff-ffff-4fff-8fff-ffffffffffff");
    await writeFile(lockPath, `${JSON.stringify(replacement)}\n`, "utf8");
    releaseFetch?.();

    await expect(pending).rejects.toMatchObject({ code: "CACHE_INTEGRITY" });
    await expect(readFile(lockPath, "utf8")).resolves.toBe(
      `${JSON.stringify(replacement)}\n`,
    );
  });

  it("serializes independently instantiated cache modules through the file lock", async () => {
    const cacheDir = await temporaryDirectory();
    vi.resetModules();
    const independentCache = await import("../src/spec-cache.js");
    expect(independentCache.materializeSpec).not.toBe(materializeSpec);
    let releaseFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      releaseFetch = resolveGate;
    });
    const firstFetch = vi.fn<typeof globalThis.fetch>(async () => {
      await gate;
      return yamlResponse(SPEC);
    });
    const secondFetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(yamlResponse("must not be fetched")),
    );

    const first = materializeSpec(revision(), cacheDir, { fetch: firstFetch });
    await vi.waitFor(() => expect(firstFetch).toHaveBeenCalledTimes(1));
    const second = independentCache.materializeSpec(revision(), cacheDir, {
      fetch: secondFetch,
    });
    releaseFetch?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).not.toHaveBeenCalled();
  });
});

describe("bounded official HTTPS fetching", () => {
  const input = {
    url: RAW_URL,
    allowedHosts: new Set(["raw.githubusercontent.com"]),
    allowedContentTypes: YAML_CONTENT_TYPES,
    maxBytes: 1024,
    validateUrl: (url: URL) => url.href === RAW_URL,
  };

  it("retries transient statuses with bounded backoff", async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const bytes = await fetchOfficialBytes(input, {
      fetch: () => {
        attempts += 1;
        return Promise.resolve(
          attempts < 3
            ? new Response("busy", {
                status: 503,
                headers: { "content-type": "text/plain" },
              })
            : yamlResponse(SPEC),
        );
      },
      maxAttempts: 3,
      retryBaseDelayMs: 7,
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        return Promise.resolve();
      },
    });

    expect(new TextDecoder().decode(bytes)).toBe(SPEC);
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([7, 14]);
  });

  it("returns a typed failure after the configured retry bound", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new Error("network down")),
    );
    await expect(
      fetchOfficialBytes(input, {
        fetch,
        maxAttempts: 2,
        retryBaseDelayMs: 0,
      }),
    ).rejects.toMatchObject({ code: "FETCH_FAILED", details: { attempts: 2 } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects redirects to another host or another immutable path", async () => {
    for (const location of [
      "https://attacker.example/spec.yaml",
      `https://raw.githubusercontent.com/openai/openai-openapi/${"2".repeat(40)}/openapi.yaml`,
    ]) {
      await expect(
        fetchOfficialBytes(input, {
          fetch: () =>
            Promise.resolve(
              new Response(null, { status: 302, headers: { location } }),
            ),
        }),
      ).rejects.toMatchObject({ code: "FETCH_INVALID" });
    }
  });

  it("rejects missing or unexpected content types", async () => {
    for (const response of [
      new Response(new TextEncoder().encode(SPEC)),
      new Response(SPEC, { headers: { "content-type": "text/html" } }),
    ]) {
      await expect(
        fetchOfficialBytes(input, { fetch: () => Promise.resolve(response) }),
      ).rejects.toMatchObject({ code: "FETCH_INVALID" });
    }
  });

  it("rejects an oversized declared or streamed response", async () => {
    await expect(
      fetchOfficialBytes(input, {
        fetch: () =>
          Promise.resolve(
            new Response("small", {
              headers: {
                "content-type": "text/plain",
                "content-length": "2048",
              },
            }),
          ),
      }),
    ).rejects.toMatchObject({ code: "FETCH_INVALID" });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700));
        controller.enqueue(new Uint8Array(700));
        controller.close();
      },
    });
    await expect(
      fetchOfficialBytes(input, {
        fetch: () =>
          Promise.resolve(
            new Response(stream, { headers: { "content-type": "text/plain" } }),
          ),
      }),
    ).rejects.toMatchObject({ code: "FETCH_INVALID" });
  });

  it("bounds a fetch implementation that ignores the abort signal", async () => {
    await expect(
      fetchOfficialBytes(input, {
        fetch: () => new Promise<Response>(() => undefined),
        requestTimeoutMs: 5,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });

  it("does not require a strong registry for repeated never-settling fetches", async () => {
    const neverSettles = new Promise<Response>(() => undefined);
    const codes = await Promise.all(
      Array.from({ length: 32 }, () =>
        fetchOfficialBytes(input, {
          fetch: () => neverSettles,
          requestTimeoutMs: 2,
          maxAttempts: 1,
        }).then(
          () => "unexpected-success",
          (error: unknown) =>
            error instanceof PipelineError ? error.code : "unexpected-error",
        ),
      ),
    );

    expect(new Set(codes)).toEqual(new Set(["FETCH_FAILED"]));
  });

  it("retains a timed-out fetch and cancels a response that arrives late", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const lateFetch = new Promise<Response>((resolveLateFetch) => {
      resolveFetch = resolveLateFetch;
    });
    let cancelled = false;
    const pending = fetchOfficialBytes(input, {
      fetch: () => lateFetch,
      requestTimeoutMs: 5,
      maxAttempts: 1,
    });
    await expect(pending).rejects.toMatchObject({ code: "FETCH_FAILED" });

    const lateBody = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    resolveFetch?.(
      new Response(lateBody, { headers: { "content-type": "text/plain" } }),
    );
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it("bounds a response body that never finishes streaming", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("openapi: 3.1.0\n"));
      },
    });
    await expect(
      fetchOfficialBytes(input, {
        fetch: () =>
          Promise.resolve(
            new Response(stream, { headers: { "content-type": "text/plain" } }),
          ),
        requestTimeoutMs: 5,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });

  it("awaits stream cancellation before rejecting an exceptional body read", async () => {
    let cancellationStarted = false;
    let releaseCancellation: (() => void) | undefined;
    const cancellationGate = new Promise<void>((resolveCancellation) => {
      releaseCancellation = resolveCancellation;
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700));
        controller.enqueue(new Uint8Array(700));
      },
      async cancel() {
        cancellationStarted = true;
        await cancellationGate;
      },
    });
    let settled = false;
    const pending = fetchOfficialBytes(input, {
      fetch: () =>
        Promise.resolve(
          new Response(stream, { headers: { "content-type": "text/plain" } }),
        ),
      maxAttempts: 1,
    });
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => expect(cancellationStarted).toBe(true));
    expect(settled).toBe(false);
    releaseCancellation?.();
    await expect(pending).rejects.toMatchObject({ code: "FETCH_INVALID" });
  });
});

function revision(): SpecRevision {
  return {
    provider: "openai",
    repositoryUrl: "https://github.com/openai/openai-openapi",
    commit: SHA,
    path: "openapi.yaml",
    rawUrl: RAW_URL,
    licenseSpdx: "MIT",
  };
}

function yamlResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/plain" } });
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tetherin-provider-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

interface TestCachePaths {
  root: string;
  revisions: string;
  locks: string;
}

async function createCacheDirectories(
  cacheDir: string,
): Promise<TestCachePaths> {
  const root = await realpath(cacheDir);
  const base = join(root, "provider-specs");
  const blobs = join(base, "blobs");
  const revisions = join(base, "revisions");
  const locks = join(base, "locks");
  await Promise.all(
    [blobs, revisions, locks].map((path) =>
      mkdir(path, { recursive: true, mode: 0o700 }),
    ),
  );
  return { root, revisions, locks };
}

function metadataPath(revisionsDir: string): string {
  return join(revisionsDir, `${revisionCacheKey(revision())}.json`);
}

function revisionLockPath(locksDir: string): string {
  return join(locksDir, `${revisionCacheKey(revision())}.lock`);
}

function lockRecord(token: string): {
  token: string;
  pid: number;
  createdAt: string;
} {
  return { token, pid: 1, createdAt: "2000-01-01T00:00:00.000Z" };
}
