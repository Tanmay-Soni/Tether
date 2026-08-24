import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createProviderAdapter } from "../../src/index.js";
import type { Provider } from "../../src/types.js";

const liveDescribe =
  process.env["TETHERIN_LIVE_PROVIDER_TESTS"] === "1"
    ? describe
    : describe.skip;

const cases: readonly {
  provider: Provider;
  service?: string;
  old: { commit: string; sha256: string };
  new: { commit: string; sha256: string };
}[] = [
  {
    provider: "openai",
    old: {
      commit: "13c6a94fca988f8be3c5de09d73f012709985d10",
      sha256:
        "a85b8a1274f0f65bcddbb8762993da9075846e2c97a5c81cf6822c9568038c33",
    },
    new: {
      commit: "f85dbe223d40e1a31cba812ab2d755c7e98a92a3",
      sha256:
        "db5d7478feae10b4d331834c60d9765a8aa042e38419f9b1694288c11aa8ebc8",
    },
  },
  {
    provider: "stripe",
    old: {
      commit: "d0f9e4c144d0927877afa13586f6efc78da5b0fc",
      sha256:
        "dd1a5abc19f904062b0a429857c9a87ae036c7e590e6470d28d52ea770a99b7b",
    },
    new: {
      commit: "d608561910d9b3a8c36da7bb503a51d8c201618f",
      sha256:
        "c931738711512db72e6c477ff43c02020d622bb6b15f0e050bc47af3aea0fb13",
    },
  },
  {
    provider: "twilio",
    service: "twilio_accounts_v1.yaml",
    old: {
      commit: "591755b562834daae097da2371e821f349c5f489",
      sha256:
        "d1a3624923ab21eb34ad1d60ed7987b9132049589a612b37ead592ea18e46f50",
    },
    new: {
      commit: "b02705eb7dbf63e0925375779730a4fc93c3b0b4",
      sha256:
        "d1a3624923ab21eb34ad1d60ed7987b9132049589a612b37ead592ea18e46f50",
    },
  },
];

liveDescribe("official provider adapters (opt-in network)", () => {
  const cacheDirectories: string[] = [];

  afterAll(async () => {
    await Promise.all(
      cacheDirectories.map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it.each(cases)(
    "materializes an immutable official $provider pair through the common interface",
    async ({ provider, service, old, new: next }) => {
      const cacheDirectory = await mkdtemp(
        join(tmpdir(), `tetherin-live-${provider}-`),
      );
      cacheDirectories.push(cacheDirectory);
      const adapter = createProviderAdapter(provider);
      expect(adapter.provider).toBe(provider);
      expect(typeof adapter.resolveRevision).toBe("function");
      expect(typeof adapter.materialize).toBe("function");
      expect(typeof adapter.guidance).toBe("function");

      const locals = [];
      for (const selected of [old, next]) {
        const revision = await adapter.resolveRevision(
          selected.commit,
          service === undefined ? undefined : { service },
        );
        const local = await adapter.materialize(revision, cacheDirectory);
        expect(local.commit).toBe(selected.commit);
        expect(local.sha256).toBe(selected.sha256);
        expect(local.byteLength).toBeGreaterThan(0);
        expect(local.rawUrl).toContain(`/${selected.commit}/`);
        locals.push(local);
      }
      expect(locals[0]?.provider).toBe(locals[1]?.provider);
      expect(locals[0]?.path).toBe(locals[1]?.path);
    },
    30_000,
  );
});
