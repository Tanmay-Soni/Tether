import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import type { OasdiffRawChange, Provider } from "../../src/types.js";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const PROVIDER_FIXTURES = path.join(REPOSITORY_ROOT, "fixtures/providers");
const OPENAI = path.join(PROVIDER_FIXTURES, "openai/geography-removal");
const STRIPE = path.join(
  PROVIDER_FIXTURES,
  "stripe/issuing-description-deprecation",
);
const TWILIO = path.join(PROVIDER_FIXTURES, "twilio/accounts-v1-no-change");
const require = createRequire(import.meta.url);
const addFormats =
  require("ajv-formats") as typeof import("ajv-formats").default;

interface RevisionMetadata {
  commit: string;
  sourceUrl: string;
  fullSpecSha256: string;
  fragmentSha256: string;
}

interface FixtureMetadata {
  schemaVersion: string;
  provider: Provider;
  repositoryUrl: `https://github.com/${string}`;
  specPath: string;
  licenseSpdx: "MIT";
  licenseUrl: string;
  licenseSha256: string;
  old: RevisionMetadata;
  new: RevisionMetadata;
  generatedAt: string;
  oasdiff: Record<string, unknown>;
  heroEligible?: boolean;
  manifestLimitation?: string;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function metadata(directory: string): Promise<FixtureMetadata> {
  return JSON.parse(
    await readFile(path.join(directory, "metadata.json"), "utf8"),
  ) as FixtureMetadata;
}

async function expectCanonicalJson(filePath: string): Promise<unknown> {
  const bytes = await readFile(filePath, "utf8");
  const parsed = JSON.parse(bytes) as unknown;
  expect(bytes).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

function availablePinnedBinary(): string | undefined {
  const candidates = [process.env["OASDIFF_BIN"], "oasdiff"].filter(
    (candidate): candidate is string => candidate !== undefined,
  );
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      shell: false,
      timeout: 5_000,
    });
    if (
      result.status === 0 &&
      `${result.stdout}${result.stderr}`.trim() === "oasdiff version 1.29.1"
    ) {
      return candidate;
    }
  }
  return undefined;
}

function runOasdiff(
  binary: string,
  directory: string,
  mode: "breaking" | "changelog",
): string {
  const result = spawnSync(
    binary,
    [mode, "--format", "json", "old.yaml", "new.yaml"],
    {
      cwd: directory,
      encoding: "utf8",
      shell: false,
      timeout: 30_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return result.stdout;
}

describe("provider fixture provenance", () => {
  it("retains only minimal source fragments with exact immutable metadata", async () => {
    for (const directory of [OPENAI, STRIPE, TWILIO]) {
      const fixtureMetadata = await metadata(directory);
      expect(fixtureMetadata.schemaVersion).toBe(
        "tetherin.provider-fixture/v1",
      );
      expect(fixtureMetadata.old.commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(fixtureMetadata.new.commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(fixtureMetadata.old.sourceUrl).toBe(
        `https://raw.githubusercontent.com/${new URL(fixtureMetadata.repositoryUrl).pathname.slice(1)}/${fixtureMetadata.old.commit}/${fixtureMetadata.specPath}`,
      );
      expect(fixtureMetadata.new.sourceUrl).toBe(
        `https://raw.githubusercontent.com/${new URL(fixtureMetadata.repositoryUrl).pathname.slice(1)}/${fixtureMetadata.new.commit}/${fixtureMetadata.specPath}`,
      );
      expect(fixtureMetadata.licenseSpdx).toBe("MIT");
      expect(fixtureMetadata.generatedAt).toMatch(/Z$/u);

      for (const revision of ["old", "new"] as const) {
        const fragment = await readFile(
          path.join(directory, `${revision}.yaml`),
        );
        expect(fragment.byteLength).toBeLessThan(10_000);
        expect(sha256(fragment)).toBe(fixtureMetadata[revision].fragmentSha256);
      }
      const licenseName =
        fixtureMetadata.provider === "openai"
          ? "LICENSE.openai-openapi.txt"
          : fixtureMetadata.provider === "stripe"
            ? "LICENSE.stripe-openapi.txt"
            : "LICENSE.twilio-oai.txt";
      expect(sha256(await readFile(path.join(directory, licenseName)))).toBe(
        fixtureMetadata.licenseSha256,
      );
    }
  });

  it("pins every retained JSON output in canonical byte form", async () => {
    const files = [
      path.join(OPENAI, "fragment.breaking.json"),
      path.join(OPENAI, "fragment.changelog.json"),
      path.join(OPENAI, "official.breaking.json"),
      path.join(OPENAI, "official.changelog.json"),
      path.join(OPENAI, "manifest.json"),
      path.join(OPENAI, "metadata.json"),
      path.join(STRIPE, "breaking.json"),
      path.join(STRIPE, "changelog.json"),
      path.join(STRIPE, "metadata.json"),
      path.join(TWILIO, "breaking.json"),
      path.join(TWILIO, "changelog.json"),
      path.join(TWILIO, "metadata.json"),
    ];
    await Promise.all(files.map((file) => expectCanonicalJson(file)));

    expect(
      sha256(await readFile(path.join(OPENAI, "official.breaking.json"))),
    ).toBe("07640494838ec2e0ebce6af7098cf6e46fd269999e051aa6fa2d694e837ee382");
    expect(
      sha256(await readFile(path.join(OPENAI, "official.changelog.json"))),
    ).toBe("417e8be303beedeec97b5c26fabc9ef94e85f29ccfb6c0c6f8693bf1feb0aea2");
    expect(sha256(await readFile(path.join(OPENAI, "manifest.json")))).toBe(
      "b4458eec684a821e95199debdd9b0c1a4aafad4b10b83bc88f357809413ddcad",
    );
  });

  it("retains the exact official OpenAI eight-change changelog", async () => {
    const changelog = (await expectCanonicalJson(
      path.join(OPENAI, "official.changelog.json"),
    )) as OasdiffRawChange[];
    expect(changelog).toHaveLength(8);
    expect(changelog.filter((change) => change.level === 2)).toHaveLength(2);
    expect(changelog.filter((change) => change.level === 1)).toHaveLength(6);
    expect(changelog.slice(0, 2).map((change) => change.fingerprint)).toEqual([
      "5b9288552958",
      "a37619d658f2",
    ]);
  });

  it("labels Stripe as description-only and Twilio as an honest no-manifest pair", async () => {
    const stripe = await metadata(STRIPE);
    const twilio = await metadata(TWILIO);
    expect(stripe.heroEligible).toBe(false);
    expect(await readFile(path.join(STRIPE, "breaking.json"), "utf8")).toBe(
      "[]\n",
    );
    expect(await readFile(path.join(STRIPE, "changelog.json"), "utf8")).toBe(
      "[]\n",
    );
    expect(twilio.old.fullSpecSha256).toBe(twilio.new.fullSpecSha256);
    expect(twilio.manifestLimitation).toContain("minItems=1");
  });

  it("validates the canonical manifest generated from the full immutable OpenAI specs", async () => {
    const manifest = (await expectCanonicalJson(
      path.join(OPENAI, "manifest.json"),
    )) as Record<string, unknown>;
    const schema = JSON.parse(
      await readFile(
        path.join(REPOSITORY_ROOT, "contracts/migration-manifest.schema.json"),
        "utf8",
      ),
    ) as object;
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
    addFormats(ajv);
    expect(ajv.validate(schema, manifest)).toBe(true);

    const engine = manifest["engine"] as Record<string, unknown>;
    expect(engine["rawOutputSha256"]).toBe(
      "07640494838ec2e0ebce6af7098cf6e46fd269999e051aa6fa2d694e837ee382",
    );
    expect(engine["command"]).toEqual([
      "oasdiff",
      "breaking",
      "--format",
      "json",
      "OLD_SPEC_PATH",
      "NEW_SPEC_PATH",
    ]);
    const changes = manifest["changes"] as Record<string, unknown>[];
    expect(changes.map((change) => change["oldLocation"])).toEqual([
      expect.objectContaining({ line: 45660, endLine: 45668 }),
      expect.objectContaining({ line: 46372, endLine: 46376 }),
    ]);
  });

  it("does not accidentally retain a full provider specification", async () => {
    const files = [
      path.join(OPENAI, "old.yaml"),
      path.join(OPENAI, "new.yaml"),
      path.join(STRIPE, "old.yaml"),
      path.join(STRIPE, "new.yaml"),
      path.join(TWILIO, "old.yaml"),
      path.join(TWILIO, "new.yaml"),
    ];
    for (const file of files) {
      expect((await stat(file)).size).toBeLessThan(10_000);
    }
  });
});

const PINNED_OASDIFF = availablePinnedBinary();

describe("actual pinned oasdiff fixture execution", () => {
  it("reproduces OpenAI breaking and changelog fragment output", async () => {
    const binary = PINNED_OASDIFF;
    if (!binary) throw new Error("skip guard failed");
    for (const mode of ["breaking", "changelog"] as const) {
      const stdout = runOasdiff(binary, OPENAI, mode);
      const canonical = `${JSON.stringify(JSON.parse(stdout) as unknown, null, 2)}\n`;
      expect(canonical).toBe(
        await readFile(path.join(OPENAI, `fragment.${mode}.json`), "utf8"),
      );
    }
  });

  it("reproduces Stripe and Twilio no-change outputs in both modes", async () => {
    const binary = PINNED_OASDIFF;
    if (!binary) throw new Error("skip guard failed");
    for (const directory of [STRIPE, TWILIO]) {
      for (const mode of ["breaking", "changelog"] as const) {
        expect(runOasdiff(binary, directory, mode)).toBe(
          await readFile(path.join(directory, `${mode}.json`), "utf8"),
        );
      }
    }
  });
});
