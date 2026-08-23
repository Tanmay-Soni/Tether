import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { PipelineError } from "../src/errors.js";
import {
  OASDIFF_RELEASE_ASSETS,
  assertOasdiffVersion,
  extractOasdiffArchive,
  getOasdiffPlatformKey,
  installerTesting,
  resolveOasdiffBinary,
  verifyArchiveChecksum,
} from "../src/oasdiff/install.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env["OASDIFF_BIN"];
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
  );
});

describe("pinned oasdiff installer", () => {
  it("contains only the contracted platform assets and checksums", () => {
    expect(OASDIFF_RELEASE_ASSETS).toEqual({
      darwin_all: {
        asset: "oasdiff_1.29.1_darwin_all.tar.gz",
        sha256:
          "759cc5703d9335c441ad84a7074c705486b2c493f79bcfdf251c7a9c788b1171",
      },
      linux_amd64: {
        asset: "oasdiff_1.29.1_linux_amd64.tar.gz",
        sha256:
          "541f7c66c933495fceef24eaf5c48aa66c19069f366f7bd0a60a6a4820c5e533",
      },
      linux_arm64: {
        asset: "oasdiff_1.29.1_linux_arm64.tar.gz",
        sha256:
          "8bc247f0280f62ca73599265db0d984e853d7df6e714dad6ead85afc7cfc5883",
      },
    });
    expect(getOasdiffPlatformKey("darwin", "arm64")).toBe("darwin_all");
    expect(getOasdiffPlatformKey("darwin", "x64")).toBe("darwin_all");
    expect(getOasdiffPlatformKey("linux", "x64")).toBe("linux_amd64");
    expect(getOasdiffPlatformKey("linux", "arm64")).toBe("linux_arm64");
  });

  it("rejects unsupported platforms", () => {
    expectPipelineThrow(
      () => getOasdiffPlatformKey("win32", "x64"),
      "UNSUPPORTED_PLATFORM",
    );
    expectPipelineThrow(
      () => getOasdiffPlatformKey("linux", "s390x"),
      "UNSUPPORTED_PLATFORM",
    );
  });

  it("verifies checksums before extraction", () => {
    const archive = makeArchive(validEntries());
    const checksum = sha256(archive);
    expect(() => verifyArchiveChecksum(archive, checksum)).not.toThrow();
    expectPipelineThrow(
      () => verifyArchiveChecksum(archive, "0".repeat(64)),
      "CHECKSUM_MISMATCH",
    );
  });

  it("extracts only the expected minimal archive entries", () => {
    const extracted = extractOasdiffArchive(makeArchive(validEntries()));
    expect(extracted.executable.toString("utf8")).toContain(
      "oasdiff version 1.29.1",
    );
    expect(extracted.license.toString("utf8")).toBe("Apache-2.0\n");
  });

  it.each([
    [
      "traversal",
      [{ name: "../oasdiff", data: Buffer.from("bad") }, validEntries()[1]],
    ],
    [
      "absolute",
      [{ name: "/oasdiff", data: Buffer.from("bad") }, validEntries()[1]],
    ],
    [
      "unexpected",
      [...validEntries(), { name: "README", data: Buffer.from("bad") }],
    ],
    [
      "symlink",
      [
        { name: "oasdiff", data: Buffer.from("target"), type: "2" },
        validEntries()[1],
      ],
    ],
  ])("rejects a %s archive entry", (_label, entries) => {
    expectPipelineThrow(
      () => extractOasdiffArchive(makeArchive(entries as TarEntry[])),
      "ARCHIVE_INVALID",
    );
  });

  it("rejects corrupt archives and tar header tampering", () => {
    expectPipelineThrow(
      () => extractOasdiffArchive(Buffer.from("not gzip")),
      "ARCHIVE_INVALID",
    );
    const archive = makeArchive(validEntries());
    const uncompressed = Buffer.from(gunzipSync(archive));
    uncompressed[0] = (uncompressed[0] ?? 0) ^ 1;
    expectPipelineThrow(
      () => extractOasdiffArchive(gzipSync(uncompressed)),
      "ARCHIVE_INVALID",
    );
  });

  it("installs once under the archive digest during concurrent requests", async () => {
    const cacheDir = await makeTemporaryDirectory();
    const archive = makeArchive(validEntries());
    const checksum = sha256(archive);
    let fetchCalls = 0;
    const fetchImplementation: typeof fetch = async () => {
      fetchCalls += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
      return new Response(new Uint8Array(archive));
    };
    const options = {
      cacheDir,
      fetch: fetchImplementation,
      release: { asset: "oasdiff-test.tar.gz", sha256: checksum },
      platformKey: "test",
      releaseUrl:
        "https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/test.tar.gz",
    };

    const paths = await Promise.all([
      installerTesting.installRelease(options),
      installerTesting.installRelease(options),
      installerTesting.installRelease(options),
    ]);
    expect(new Set(paths).size).toBe(1);
    expect(paths[0]).toContain(checksum);
    expect(fetchCalls).toBe(1);
    await expect(readFile(paths[0], "utf8")).resolves.toContain(
      "oasdiff version 1.29.1",
    );
    await expect(
      readFile(join(dirname(paths[0]), "LICENSE"), "utf8"),
    ).resolves.toBe("Apache-2.0\n");
  });

  it("uses an already verified content-addressed binary without fetching", async () => {
    const cacheDir = await makeTemporaryDirectory();
    const archive = makeArchive(validEntries());
    const checksum = sha256(archive);
    let fetchCalls = 0;
    const baseOptions = {
      cacheDir,
      release: { asset: "oasdiff-test.tar.gz", sha256: checksum },
      platformKey: "test",
      releaseUrl:
        "https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/test.tar.gz",
    };
    const installed = await installerTesting.installRelease({
      ...baseOptions,
      fetch: () => {
        fetchCalls += 1;
        return Promise.resolve(new Response(new Uint8Array(archive)));
      },
    });
    const cached = await installerTesting.installRelease({
      ...baseOptions,
      fetch: () => Promise.reject(new Error("offline")),
    });
    expect(cached).toBe(installed);
    expect(fetchCalls).toBe(1);
  });

  it("uses an integrity receipt to detect cached executable and license tampering", async () => {
    const cacheDir = await makeTemporaryDirectory();
    const archive = makeArchive(validEntries());
    const checksum = sha256(archive);
    let fetchCalls = 0;
    const options = {
      cacheDir,
      fetch: () => {
        fetchCalls += 1;
        return Promise.resolve(new Response(new Uint8Array(archive)));
      },
      release: { asset: "oasdiff-test.tar.gz", sha256: checksum },
      platformKey: "test",
      releaseUrl:
        "https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/test.tar.gz",
    };
    const binaryPath = await installerTesting.installRelease(options);
    const contentDirectory = dirname(binaryPath);
    const receipt = JSON.parse(
      await readFile(join(contentDirectory, "install-receipt.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      schema: "tetherin.oasdiff-install/v1",
      version: "1.29.1",
      releaseCommit: "2bb87bada404d350cb56e5504e8bd5d76f6159bf",
      archiveSha256: checksum,
    });

    const originalBinary = await readFile(binaryPath);
    await writeFile(
      binaryPath,
      Buffer.concat([originalBinary, Buffer.from("\n# tampered\n")]),
    );
    await chmod(binaryPath, 0o700);
    await installerTesting.installRelease(options);
    expect(fetchCalls).toBe(2);
    await expect(readFile(binaryPath)).resolves.toEqual(originalBinary);

    await writeFile(join(contentDirectory, "LICENSE"), "tampered license\n");
    await installerTesting.installRelease(options);
    expect(fetchCalls).toBe(3);
    await expect(
      readFile(join(contentDirectory, "LICENSE"), "utf8"),
    ).resolves.toBe("Apache-2.0\n");
  });

  it("retries transient release failures within a fixed attempt bound", async () => {
    const cacheDir = await makeTemporaryDirectory();
    const archive = makeArchive(validEntries());
    let fetchCalls = 0;
    const binaryPath = await installerTesting.installRelease({
      cacheDir,
      fetch: () => {
        fetchCalls += 1;
        return Promise.resolve(
          fetchCalls === 1
            ? new Response("unavailable", { status: 503 })
            : new Response(new Uint8Array(archive)),
        );
      },
      release: { asset: "oasdiff-test.tar.gz", sha256: sha256(archive) },
      platformKey: "test",
      releaseUrl:
        "https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/test.tar.gz",
      downloadAttempts: 2,
      downloadTimeoutMs: 500,
    });
    expect(fetchCalls).toBe(2);
    await expect(assertOasdiffVersion(binaryPath)).resolves.toBeUndefined();
  });

  it("bounds unavailable downloads by timeout and retry count", async () => {
    const cacheDir = await makeTemporaryDirectory();
    let fetchCalls = 0;
    const fetchImplementation: typeof fetch = (_input, init) => {
      fetchCalls += 1;
      return new Promise<Response>((_resolveResponse, rejectResponse) => {
        const signal = init?.signal;
        if (signal instanceof AbortSignal) {
          signal.addEventListener(
            "abort",
            () => rejectResponse(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }
      });
    };
    await expect(
      installerTesting.installRelease({
        cacheDir,
        fetch: fetchImplementation,
        release: { asset: "oasdiff-test.tar.gz", sha256: "0".repeat(64) },
        platformKey: "test",
        releaseUrl:
          "https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/test.tar.gz",
        downloadAttempts: 2,
        downloadTimeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: "FETCH_FAILED" });
    expect(fetchCalls).toBe(2);
  });

  it("rejects a downloaded archive checksum mismatch", async () => {
    const cacheDir = await makeTemporaryDirectory();
    const archive = makeArchive(validEntries());
    await expect(
      installerTesting.installRelease({
        cacheDir,
        fetch: () => Promise.resolve(new Response(new Uint8Array(archive))),
        release: { asset: "oasdiff-test.tar.gz", sha256: "0".repeat(64) },
        platformKey: "test",
        releaseUrl:
          "https://github.com/oasdiff/oasdiff/releases/download/v1.29.1/test.tar.gz",
      }),
    ).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
  });

  it("rejects non-HTTPS release downloads at the install boundary", async () => {
    const cacheDir = await makeTemporaryDirectory();
    const archive = makeArchive(validEntries());
    await expect(
      installerTesting.installRelease({
        cacheDir,
        fetch: () => Promise.resolve(new Response(new Uint8Array(archive))),
        release: { asset: "oasdiff-test.tar.gz", sha256: sha256(archive) },
        platformKey: "test",
        releaseUrl: "http://github.com/oasdiff/oasdiff/test.tar.gz",
      }),
    ).rejects.toMatchObject({ code: "FETCH_INVALID" });
  });

  it("accepts OASDIFF_BIN only when it reports the exact pinned version", async () => {
    const directory = await makeTemporaryDirectory();
    const validBinary = await writeExecutable(
      directory,
      "valid-oasdiff",
      validExecutable(),
    );
    process.env["OASDIFF_BIN"] = validBinary;
    await expect(resolveOasdiffBinary({ cacheDir: directory })).resolves.toBe(
      validBinary,
    );

    const wrongBinary = await writeExecutable(
      directory,
      "wrong-oasdiff",
      "#!/bin/sh\nprintf 'oasdiff version 1.29.2\\n'\n",
    );
    process.env["OASDIFF_BIN"] = wrongBinary;
    await expect(
      resolveOasdiffBinary({ cacheDir: directory }),
    ).rejects.toMatchObject({
      code: "OASDIFF_VERSION",
    });
  });

  it("rejects version output with extra text", async () => {
    const directory = await makeTemporaryDirectory();
    const binary = await writeExecutable(
      directory,
      "noisy-oasdiff",
      "#!/bin/sh\nprintf 'oasdiff version 1.29.1\\nwarning\\n'\n",
    );
    await expect(assertOasdiffVersion(binary)).rejects.toMatchObject({
      code: "OASDIFF_VERSION",
    });
  });
});

interface TarEntry {
  readonly name: string;
  readonly data: Buffer;
  readonly type?: string;
}

function validEntries(): TarEntry[] {
  return [
    { name: "oasdiff", data: Buffer.from(validExecutable()) },
    { name: "LICENSE", data: Buffer.from("Apache-2.0\n") },
  ];
}

function validExecutable(): string {
  return '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  printf \'oasdiff version 1.29.1\\n\'\nfi\n';
}

function makeArchive(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    writeTarString(header, 0, 100, entry.name);
    writeTarOctal(header, 100, 8, entry.name === "oasdiff" ? 0o755 : 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, entry.data.byteLength);
    writeTarOctal(header, 136, 12, 0);
    header.fill(32, 148, 156);
    header[156] = (entry.type ?? "0").charCodeAt(0);
    writeTarString(header, 257, 6, "ustar");
    writeTarString(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    const checksumText = checksum.toString(8).padStart(6, "0");
    header.write(checksumText, 148, 6, "ascii");
    header[154] = 0;
    header[155] = 32;
    parts.push(
      header,
      entry.data,
      Buffer.alloc(paddedSize(entry.data.byteLength)),
    );
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

function paddedSize(size: number): number {
  return (512 - (size % 512)) % 512;
}

function writeTarString(
  header: Buffer,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > length)
    throw new PipelineError("ARCHIVE_INVALID", "test name too long");
  bytes.copy(header, offset);
}

function writeTarOctal(
  header: Buffer,
  offset: number,
  length: number,
  value: number,
): void {
  const encoded = value.toString(8).padStart(length - 1, "0");
  header.write(encoded, offset, length - 1, "ascii");
  header[offset + length - 1] = 0;
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tetherin-oasdiff-install-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeExecutable(
  directory: string,
  name: string,
  contents: string,
): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, contents, { mode: 0o700 });
  await chmod(path, 0o700);
  return path;
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
