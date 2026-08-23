import { describe, expect, it } from "vitest";

import { PipelineError } from "../src/errors.js";
import {
  assertCompatibleRevisionPair,
  assertOfficialRevision,
  buildOfficialRawUrl,
  officialProviderConfiguration,
  revisionCacheKey,
  revisionIdentity,
  twilioSpecPath,
} from "../src/provenance.js";
import type { SpecRevision } from "../src/types.js";

const OLD_SHA = "1111111111111111111111111111111111111111";
const NEW_SHA = "2222222222222222222222222222222222222222";

describe("official provider provenance", () => {
  it("builds and validates one canonical immutable raw URL", () => {
    const configuration = officialProviderConfiguration("openai");
    const rawUrl = buildOfficialRawUrl(configuration, OLD_SHA, "openapi.yaml");
    const revision: SpecRevision = {
      provider: "openai",
      repositoryUrl: "https://github.com/openai/openai-openapi",
      commit: OLD_SHA,
      path: "openapi.yaml",
      rawUrl,
      licenseSpdx: "MIT",
    };

    expect(() => assertOfficialRevision(revision)).not.toThrow();
    expect(rawUrl).toBe(
      `https://raw.githubusercontent.com/openai/openai-openapi/${OLD_SHA}/openapi.yaml`,
    );
  });

  it.each([
    ["repositoryUrl", "https://github.com/openai/openai-openapi-fork"],
    ["commit", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ["path", "../openapi.yaml"],
    ["licenseSpdx", "Apache-2.0"],
    [
      "rawUrl",
      `https://raw.githubusercontent.com/stripe/openapi/${OLD_SHA}/openapi.yaml`,
    ],
  ] as const)("rejects a mismatched %s", (field, value) => {
    const revision = openAIRevision(OLD_SHA);
    expect(() =>
      assertOfficialRevision({ ...revision, [field]: value } as SpecRevision),
    ).toThrowError(PipelineError);
  });

  it("derives a deterministic identity and SHA-256 cache key", () => {
    const revision = openAIRevision(OLD_SHA);

    expect(revisionIdentity(revision)).toBe(revisionIdentity({ ...revision }));
    expect(revisionCacheKey(revision)).toMatch(/^[0-9a-f]{64}$/u);
    expect(revisionCacheKey(openAIRevision(NEW_SHA))).not.toBe(
      revisionCacheKey(revision),
    );
  });

  it("accepts only safe Twilio service basenames", () => {
    expect(twilioSpecPath("twilio_api_v2010.yaml")).toBe(
      "spec/yaml/twilio_api_v2010.yaml",
    );
    for (const service of [
      undefined,
      "",
      ".yaml",
      "../api.yaml",
      "nested/api.yaml",
      "api.yml",
      "api..yaml",
    ]) {
      expect(() => twilioSpecPath(service)).toThrowError(PipelineError);
    }
  });

  it("requires old and new Twilio revisions to use the same service file", () => {
    const oldRevision = twilioRevision(OLD_SHA, "twilio_api_v2010.yaml");
    const newRevision = twilioRevision(NEW_SHA, "twilio_api_v2010.yaml");
    expect(() =>
      assertCompatibleRevisionPair(oldRevision, newRevision),
    ).not.toThrow();
    expect(() =>
      assertCompatibleRevisionPair(
        oldRevision,
        twilioRevision(NEW_SHA, "twilio_messaging_v1.yaml"),
      ),
    ).toThrowError(PipelineError);
  });
});

function openAIRevision(commit: string): SpecRevision {
  return {
    provider: "openai",
    repositoryUrl: "https://github.com/openai/openai-openapi",
    commit,
    path: "openapi.yaml",
    rawUrl: `https://raw.githubusercontent.com/openai/openai-openapi/${commit}/openapi.yaml`,
    licenseSpdx: "MIT",
  };
}

function twilioRevision(commit: string, service: string): SpecRevision {
  const path = twilioSpecPath(service);
  return {
    provider: "twilio",
    repositoryUrl: "https://github.com/twilio/twilio-oai",
    commit,
    path,
    rawUrl: `https://raw.githubusercontent.com/twilio/twilio-oai/${commit}/${path}`,
    licenseSpdx: "MIT",
  };
}
