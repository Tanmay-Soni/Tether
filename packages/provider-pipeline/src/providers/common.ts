import { PipelineError } from "../errors.js";
import {
  fetchOfficialBytes,
  GITHUB_JSON_CONTENT_TYPES,
  materializeSpec,
  resolveProviderFetchOptions,
  type ProviderFetchOptions,
} from "../spec-cache.js";
import {
  buildOfficialRawUrl,
  officialProviderConfiguration,
  type OfficialProviderConfiguration,
} from "../provenance.js";
import type {
  LocalSpec,
  NormalizedChange,
  Provider,
  ProviderAdapter,
  ProviderGuidance,
  ProviderSelection,
  SpecRevision,
} from "../types.js";

const FULL_COMMIT = /^[0-9a-f]{40}$/u;
const COMMIT_LIKE = /^[0-9a-fA-F]{7,64}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;

export interface ProviderAdapterOptions extends ProviderFetchOptions {
  githubToken?: string;
}

export type SpecPathResolver = (selection?: ProviderSelection) => string;
export type GuidanceResolver = (
  changes: NormalizedChange[],
) => ProviderGuidance[];

export class OfficialProviderAdapter implements ProviderAdapter {
  readonly provider: Provider;
  readonly #configuration: OfficialProviderConfiguration;
  readonly #pathResolver: SpecPathResolver;
  readonly #options: ProviderAdapterOptions;
  readonly #guidanceResolver: GuidanceResolver;

  constructor(
    provider: Provider,
    pathResolver: SpecPathResolver,
    options: ProviderAdapterOptions = {},
    guidanceResolver: GuidanceResolver = () => [],
  ) {
    this.provider = provider;
    this.#configuration = officialProviderConfiguration(provider);
    this.#pathResolver = pathResolver;
    this.#options = options;
    this.#guidanceResolver = guidanceResolver;
    if (
      options.githubToken !== undefined &&
      (options.githubToken === "" || /[\r\n]/u.test(options.githubToken))
    ) {
      throw new PipelineError(
        "FETCH_INVALID",
        "GitHub token must be nonempty and may not contain header delimiters",
        { field: "githubToken" },
      );
    }
    resolveProviderFetchOptions(options);
  }

  async resolveRevision(
    ref: string,
    selection?: ProviderSelection,
  ): Promise<SpecRevision> {
    const path = this.#pathResolver(selection);
    const commit = await resolveOfficialGitHubRef(
      this.#configuration,
      ref,
      this.#options,
    );
    return {
      provider: this.provider,
      repositoryUrl: this.#configuration.repositoryUrl,
      commit,
      path,
      rawUrl: buildOfficialRawUrl(this.#configuration, commit, path),
      licenseSpdx: "MIT",
    };
  }

  materialize(revision: SpecRevision, cacheDir: string): Promise<LocalSpec> {
    if (revision.provider !== this.provider) {
      return Promise.reject(
        new PipelineError(
          "REVISION_INVALID",
          "A provider adapter cannot materialize another provider's revision",
          { provider: this.provider, revisionProvider: revision.provider },
        ),
      );
    }
    return materializeSpec(revision, cacheDir, this.#options);
  }

  guidance(changes: NormalizedChange[]): Promise<ProviderGuidance[]> {
    return Promise.resolve(this.#guidanceResolver(changes));
  }
}

export async function resolveOfficialGitHubRef(
  configuration: OfficialProviderConfiguration,
  ref: string,
  options: ProviderAdapterOptions = {},
): Promise<string> {
  if (FULL_COMMIT.test(ref)) return ref;
  if (COMMIT_LIKE.test(ref)) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Commit references must be full 40-character lowercase SHA values",
      { field: "ref" },
    );
  }
  assertSafeRef(ref);

  if (ref === configuration.defaultBranch) {
    const commitUrl = githubApiUrl(
      configuration,
      `commits/${encodeURIComponent(ref)}`,
    );
    const commit = await fetchGithubJson(commitUrl, options);
    return requireSha(commit, "commit");
  }

  const encodedTag = ref
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const tagRefUrl = githubApiUrl(configuration, `git/ref/tags/${encodedTag}`);
  const tagRef = await fetchGithubJson(tagRefUrl, options);
  let target = requireGitObject(tagRef, "tag reference");
  for (let depth = 0; target.type === "tag" && depth < 4; depth += 1) {
    const tagUrl = githubApiUrl(
      configuration,
      `git/tags/${encodeURIComponent(target.sha)}`,
    );
    const annotatedTag = await fetchGithubJson(tagUrl, options);
    target = requireGitObject(annotatedTag, "annotated tag");
  }
  if (target.type !== "commit") {
    throw new PipelineError(
      "REVISION_INVALID",
      "GitHub tag did not resolve to a commit within the dereference limit",
      { field: "ref" },
    );
  }
  return target.sha;
}

async function fetchGithubJson(
  url: string,
  options: ProviderAdapterOptions,
): Promise<Readonly<Record<string, unknown>>> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "TetherIn-provider-pipeline/0.1",
    "x-github-api-version": "2022-11-28",
  };
  if (options.githubToken !== undefined) {
    headers["authorization"] = `Bearer ${options.githubToken}`;
  }

  let bytes: Uint8Array;
  try {
    bytes = await fetchOfficialBytes(
      {
        url,
        allowedHosts: new Set(["api.github.com"]),
        allowedContentTypes: GITHUB_JSON_CONTENT_TYPES,
        maxBytes: options.maxApiBytes ?? 1024 * 1024,
        headers,
        validateUrl: (candidate) => candidate.href === url,
      },
      options,
    );
  } catch (error) {
    if (
      error instanceof PipelineError &&
      error.code === "FETCH_FAILED" &&
      (error.details["status"] === 404 || error.details["status"] === 422)
    ) {
      throw new PipelineError(
        "REVISION_INVALID",
        "Official GitHub ref does not exist in the provider repository",
        { field: "ref" },
        { cause: error },
      );
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    throw new PipelineError(
      "FETCH_INVALID",
      "Official GitHub API response was not valid UTF-8 JSON",
      {},
      { cause: error },
    );
  }
  if (!isRecord(value)) {
    throw new PipelineError(
      "FETCH_INVALID",
      "Official GitHub API response did not contain the expected object",
    );
  }
  return value;
}

function githubApiUrl(
  configuration: OfficialProviderConfiguration,
  suffix: string,
): string {
  return `https://api.github.com/repos/${configuration.owner}/${configuration.repository}/${suffix}`;
}

function requireSha(
  value: Readonly<Record<string, unknown>>,
  description: string,
): string {
  const sha = value["sha"];
  if (typeof sha !== "string" || !FULL_COMMIT.test(sha)) {
    throw new PipelineError(
      "FETCH_INVALID",
      `Official GitHub ${description} response omitted a full commit SHA`,
    );
  }
  return sha;
}

function requireGitObject(
  value: Readonly<Record<string, unknown>>,
  description: string,
): { sha: string; type: string } {
  const object = value["object"];
  if (!isRecord(object)) {
    throw new PipelineError(
      "FETCH_INVALID",
      `Official GitHub ${description} response omitted its target object`,
    );
  }
  const sha = object["sha"];
  const type = object["type"];
  if (
    typeof sha !== "string" ||
    !FULL_COMMIT.test(sha) ||
    typeof type !== "string"
  ) {
    throw new PipelineError(
      "FETCH_INVALID",
      `Official GitHub ${description} target was malformed`,
    );
  }
  return { sha, type };
}

function assertSafeRef(ref: string): void {
  if (
    !SAFE_REF.test(ref) ||
    ref.includes("..") ||
    ref.includes("//") ||
    ref.includes("@{") ||
    ref.startsWith(".") ||
    ref.endsWith(".") ||
    ref.endsWith("/") ||
    ref.endsWith(".lock")
  ) {
    throw new PipelineError(
      "REVISION_INVALID",
      "Provider ref is not a safe full SHA, default branch, or tag name",
      { field: "ref" },
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
