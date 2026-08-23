import { describe, expect, it, vi } from "vitest";

import { PipelineError } from "../src/errors.js";
import {
  createProviderAdapter,
  type ProviderAdapterOptions,
} from "../src/providers/index.js";

const OPENAI_SHA = "1111111111111111111111111111111111111111";
const STRIPE_SHA = "2222222222222222222222222222222222222222";
const TWILIO_SHA = "3333333333333333333333333333333333333333";
const TAG_OBJECT_SHA = "4444444444444444444444444444444444444444";

describe("official provider ref resolution", () => {
  it("uses a full immutable SHA without a network lookup", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const adapter = createProviderAdapter("openai", { fetch });

    await expect(adapter.resolveRevision(OPENAI_SHA)).resolves.toEqual({
      provider: "openai",
      repositoryUrl: "https://github.com/openai/openai-openapi",
      commit: OPENAI_SHA,
      path: "openapi.yaml",
      rawUrl: `https://raw.githubusercontent.com/openai/openai-openapi/${OPENAI_SHA}/openapi.yaml`,
      licenseSpdx: "MIT",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves only the provider's named default branch through GitHub", async () => {
    const requests: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      requests.push(requestUrl(input));
      return Promise.resolve(jsonResponse({ sha: STRIPE_SHA }));
    };
    const adapter = createProviderAdapter("stripe", { fetch });

    const revision = await adapter.resolveRevision("master");

    expect(requests).toEqual([
      "https://api.github.com/repos/stripe/openapi/commits/master",
    ]);
    expect(revision).toMatchObject({
      provider: "stripe",
      commit: STRIPE_SHA,
      path: "latest/openapi.spec3.yaml",
      rawUrl: `https://raw.githubusercontent.com/stripe/openapi/${STRIPE_SHA}/latest/openapi.spec3.yaml`,
    });
  });

  it("resolves a lightweight tag through the official Git tag endpoint", async () => {
    const requests: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      requests.push(requestUrl(input));
      return Promise.resolve(
        jsonResponse({ object: { sha: OPENAI_SHA, type: "commit" } }),
      );
    };
    const adapter = createProviderAdapter("openai", { fetch });

    const revision = await adapter.resolveRevision("v2.0/preview");

    expect(revision.commit).toBe(OPENAI_SHA);
    expect(requests).toEqual([
      "https://api.github.com/repos/openai/openai-openapi/git/ref/tags/v2.0/preview",
    ]);
  });

  it("dereferences annotated tags with a bounded official API chain", async () => {
    const requests: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.includes("/git/ref/tags/")) {
        return Promise.resolve(
          jsonResponse({ object: { sha: TAG_OBJECT_SHA, type: "tag" } }),
        );
      }
      return Promise.resolve(
        jsonResponse({ object: { sha: TWILIO_SHA, type: "commit" } }),
      );
    };
    const adapter = createProviderAdapter("twilio", { fetch });

    const revision = await adapter.resolveRevision("v1.2.3", {
      service: "twilio_api_v2010.yaml",
    });

    expect(revision.commit).toBe(TWILIO_SHA);
    expect(revision.path).toBe("spec/yaml/twilio_api_v2010.yaml");
    expect(requests).toEqual([
      "https://api.github.com/repos/twilio/twilio-oai/git/ref/tags/v1.2.3",
      `https://api.github.com/repos/twilio/twilio-oai/git/tags/${TAG_OBJECT_SHA}`,
    ]);
  });

  it("turns missing branches or tags into typed invalid-revision errors", async () => {
    const fetch: typeof globalThis.fetch = () =>
      Promise.resolve(jsonResponse({ message: "not found" }, 404));
    const adapter = createProviderAdapter("openai", { fetch });

    await expect(
      adapter.resolveRevision("not-a-real-tag"),
    ).rejects.toMatchObject({
      code: "REVISION_INVALID",
    });
  });

  it.each([
    "ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
    "abcdefa",
    "refs/../heads/main",
    "bad@{ref",
    ".hidden",
    "refs/heads/main.lock",
  ])("rejects unsafe or non-full commit-like ref %s", async (ref) => {
    const adapter = createProviderAdapter("openai", {
      fetch: vi.fn<typeof globalThis.fetch>(),
    });
    await expect(adapter.resolveRevision(ref)).rejects.toMatchObject({
      code: "REVISION_INVALID",
    });
  });
});

describe("provider identity and selection policies", () => {
  it("supports Stripe's immutable historical spec path and official Basil guidance", async () => {
    const adapter = createProviderAdapter("stripe");
    await expect(
      adapter.resolveRevision(STRIPE_SHA, { variant: "legacy-v1" }),
    ).resolves.toMatchObject({
      path: "openapi/spec3.yaml",
      rawUrl: `https://raw.githubusercontent.com/stripe/openapi/${STRIPE_SHA}/openapi/spec3.yaml`,
    });
    await expect(
      adapter.guidance([
        {
          oasdiffId: "api-path-removed-without-deprecation",
          fingerprint: "95193edec850",
          severity: "error",
          breaking: true,
          method: "GET",
          path: "/v1/invoices/upcoming",
          operationId: "GetInvoicesUpcoming",
          text: "removed the path without deprecation",
          subject: { kind: "endpoint" },
          oldLocation: null,
          newLocation: null,
          schemaExcerpts: { old: null, new: null },
        },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        source: "provider-changelog",
        url: "https://docs.stripe.com/changelog/basil/2025-03-31/invoice-preview-api-deprecations",
      }),
    ]);
  });

  it("requires one safe Twilio .yaml service basename", async () => {
    const adapter = createProviderAdapter("twilio");

    await expect(adapter.resolveRevision(TWILIO_SHA)).rejects.toMatchObject({
      code: "REVISION_INVALID",
    });
    await expect(
      adapter.resolveRevision(TWILIO_SHA, { service: "../aggregate.yaml" }),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    await expect(
      adapter.resolveRevision(TWILIO_SHA, { service: "aggregate.yml" }),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
  });

  it("rejects service selection for the fixed OpenAI and Stripe paths", async () => {
    await expect(
      createProviderAdapter("openai").resolveRevision(OPENAI_SHA, {
        service: "other.yaml",
      }),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    await expect(
      createProviderAdapter("stripe").resolveRevision(STRIPE_SHA, {
        service: "openapi/spec3.yaml",
      }),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
  });

  it("rejects a forged repository, path, or raw URL before fetching", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const adapter = createProviderAdapter("openai", { fetch });
    const official = await adapter.resolveRevision(OPENAI_SHA);

    for (const revision of [
      { ...official, repositoryUrl: "https://github.com/evil/fork" },
      { ...official, path: "other.yaml" },
      {
        ...official,
        rawUrl: `https://raw.githubusercontent.com/openai/openai-openapi/${STRIPE_SHA}/openapi.yaml`,
      },
    ]) {
      await expect(
        adapter.materialize(revision as typeof official, "/tmp/not-used"),
      ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects redirects even when they attempt to leave an official API request", async () => {
    const fetch: typeof globalThis.fetch = () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/spec.yaml" },
        }),
      );
    const adapter = createProviderAdapter("openai", { fetch });

    await expect(adapter.resolveRevision("main")).rejects.toMatchObject({
      code: "FETCH_INVALID",
    });
  });

  it("returns empty guidance rather than synthesizing migration advice", async () => {
    await expect(createProviderAdapter("openai").guidance([])).resolves.toEqual(
      [],
    );
    await expect(createProviderAdapter("stripe").guidance([])).resolves.toEqual(
      [],
    );
    await expect(createProviderAdapter("twilio").guidance([])).resolves.toEqual(
      [],
    );
  });

  it("rejects providers outside the closed runtime enum", () => {
    expect(() => createProviderAdapter("github" as never)).toThrowError(
      PipelineError,
    );
  });

  it("never includes an injected token in a typed API error", async () => {
    const token = "github_pat_secret-value";
    const options: ProviderAdapterOptions = {
      githubToken: token,
      fetch: () => Promise.resolve(jsonResponse({ message: token }, 401)),
    };

    let caught: unknown;
    try {
      await createProviderAdapter("openai", options).resolveRevision("main");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PipelineError);
    expect(JSON.stringify(caught)).not.toContain(token);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requestUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}
