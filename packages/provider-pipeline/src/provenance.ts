import { createHash } from "node:crypto";

import { PipelineError } from "./errors.js";
import type { Provider, SpecRevision } from "./types.js";

const FULL_COMMIT = /^[0-9a-f]{40}$/u;
const SAFE_TWILIO_SERVICE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.yaml$/u;

export interface OfficialProviderConfiguration {
  readonly provider: Provider;
  readonly owner: string;
  readonly repository: string;
  readonly repositoryUrl: `https://github.com/${string}`;
  readonly defaultBranch: "main" | "master";
  readonly fixedPath?: string;
  readonly additionalPaths?: readonly string[];
}

const PROVIDERS: Readonly<
  Partial<Record<string, OfficialProviderConfiguration>>
> = {
  openai: {
    provider: "openai",
    owner: "openai",
    repository: "openai-openapi",
    repositoryUrl: "https://github.com/openai/openai-openapi",
    defaultBranch: "main",
    fixedPath: "openapi.yaml",
  },
  stripe: {
    provider: "stripe",
    owner: "stripe",
    repository: "openapi",
    repositoryUrl: "https://github.com/stripe/openapi",
    defaultBranch: "master",
    fixedPath: "latest/openapi.spec3.yaml",
    additionalPaths: ["openapi/spec3.yaml"],
  },
  twilio: {
    provider: "twilio",
    owner: "twilio",
    repository: "twilio-oai",
    repositoryUrl: "https://github.com/twilio/twilio-oai",
    defaultBranch: "main",
  },
};

export function officialProviderConfiguration(
  provider: Provider,
): OfficialProviderConfiguration {
  const configuration = PROVIDERS[provider];
  if (configuration === undefined) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Only the OpenAI, Stripe, and Twilio provider repositories are supported",
      { provider },
    );
  }
  return configuration;
}

export function assertFullCommit(commit: string): void {
  if (!FULL_COMMIT.test(commit)) {
    throw new PipelineError(
      "REVISION_INVALID",
      "The resolved provider revision must be a full lowercase commit SHA",
      { field: "commit" },
    );
  }
}

export function twilioSpecPath(service: string | undefined): string {
  if (
    service === undefined ||
    !SAFE_TWILIO_SERVICE.test(service) ||
    service === ".yaml" ||
    service.includes("..")
  ) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Twilio requires one safe .yaml service basename",
      { field: "selection.service" },
    );
  }
  return `spec/yaml/${service}`;
}

export function buildOfficialRawUrl(
  configuration: OfficialProviderConfiguration,
  commit: string,
  path: string,
): `https://raw.githubusercontent.com/${string}` {
  assertFullCommit(commit);
  assertAllowedPath(configuration, path);
  return `https://raw.githubusercontent.com/${configuration.owner}/${configuration.repository}/${commit}/${path}`;
}

export function assertOfficialRevision(revision: SpecRevision): void {
  const configuration = officialProviderConfiguration(revision.provider);
  assertFullCommit(revision.commit);

  if (revision.repositoryUrl !== configuration.repositoryUrl) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider revision repository identity does not match the official repository",
      { field: "repositoryUrl", provider: revision.provider },
    );
  }
  if ((revision as { readonly licenseSpdx: unknown }).licenseSpdx !== "MIT") {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider revision must retain the official MIT license provenance",
      { field: "licenseSpdx", provider: revision.provider },
    );
  }

  assertAllowedPath(configuration, revision.path);
  const expectedRawUrl = buildOfficialRawUrl(
    configuration,
    revision.commit,
    revision.path,
  );
  if (revision.rawUrl !== expectedRawUrl) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider revision raw URL does not match its official immutable identity",
      { field: "rawUrl", provider: revision.provider },
    );
  }

  const parsed = new URL(revision.rawUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "raw.githubusercontent.com" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider revision raw URL must be canonical credential-free HTTPS",
      { field: "rawUrl", provider: revision.provider },
    );
  }
}

export function assertCompatibleRevisionPair(
  oldRevision: SpecRevision,
  newRevision: SpecRevision,
): void {
  assertOfficialRevision(oldRevision);
  assertOfficialRevision(newRevision);
  if (oldRevision.provider !== newRevision.provider) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider revisions in a comparison must use the same provider",
      { field: "provider" },
    );
  }
  if (
    oldRevision.repositoryUrl !== newRevision.repositoryUrl ||
    oldRevision.path !== newRevision.path
  ) {
    throw new PipelineError(
      "REVISION_INVALID",
      oldRevision.provider === "twilio"
        ? "Twilio comparisons must use the same service basename"
        : "Provider revisions in a comparison must use the same official spec path",
      { field: "path", provider: oldRevision.provider },
    );
  }
}

export function revisionIdentity(revision: SpecRevision): string {
  assertOfficialRevision(revision);
  return [
    revision.provider,
    revision.repositoryUrl,
    revision.commit,
    revision.path,
    revision.rawUrl,
    revision.licenseSpdx,
  ].join("\u0000");
}

export function revisionCacheKey(revision: SpecRevision): string {
  return createHash("sha256").update(revisionIdentity(revision)).digest("hex");
}

function assertAllowedPath(
  configuration: OfficialProviderConfiguration,
  path: string,
): void {
  const allowed =
    configuration.provider === "twilio"
      ? path.startsWith("spec/yaml/") &&
        path === twilioSpecPath(path.slice("spec/yaml/".length))
      : path === configuration.fixedPath ||
        configuration.additionalPaths?.includes(path) === true;

  if (!allowed) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider revision path is not allowlisted for the official adapter",
      { field: "path", provider: configuration.provider },
    );
  }
}
