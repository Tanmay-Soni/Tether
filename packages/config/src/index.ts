import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

export type TetherInMode = "fixture" | "live";

export interface TetherInConfig {
  readonly repoRoot: string;
  readonly baseUrl: string;
  readonly mode: TetherInMode;
  readonly databasePath: string;
  readonly artifactsPath: string;
  readonly runsPath: string;
  readonly retentionDays: number;
  readonly consumerRepoPath: string;
  readonly consumerRepo: string;
  readonly consumerBaseBranch: string;
  readonly codexModel: string | undefined;
  readonly greptileMode: "fixture" | "live";
  readonly greptileMcpUrl: string;
  readonly oasdiffVersion: "1.29.1";
  readonly hasOpenAiKey: boolean;
  readonly hasGreptileKey: boolean;
}

export class ConfigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

const SENSITIVE_KEY = /(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|GITHUB_TOKEN)/i;

export function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1)
      throw new ConfigError("ENV_SYNTAX", "Invalid .env.local entry");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function redact(value: string): string {
  return value
    .replace(/(?:sk|gho|ghp|github_pat|gsk)_[A-Za-z0-9_-]+/gu, "[REDACTED]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/giu, "$1[REDACTED]")
    .replace(
      /((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,;]+/giu,
      "$1[REDACTED]",
    );
}

export function safeRelative(root: string, target: string): string {
  const value = relative(root, target);
  return value && !value.startsWith("..") ? value : "[external path]";
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value)
    throw new ConfigError(
      "CONFIG_MISSING",
      `Missing required configuration: ${name}`,
    );
  return value;
}

function localPath(repoRoot: string, value: string, key: string): string {
  const absolute = resolve(repoRoot, value);
  const rel = relative(repoRoot, absolute);
  if (!rel.startsWith(".tetherin/") && rel !== ".tetherin") {
    throw new ConfigError(
      "UNSAFE_LOCAL_PATH",
      `${key} must resolve below .tetherin`,
    );
  }
  return absolute;
}

export function loadConfig(
  options: {
    repoRoot?: string;
    env?: NodeJS.ProcessEnv;
    envFile?: string;
  } = {},
): TetherInConfig {
  const repoRoot = realpathSync(options.repoRoot ?? process.cwd());
  const sourceEnv = { ...(options.env ?? process.env) };
  const envFile = options.envFile ?? resolve(repoRoot, ".env.local");
  if (existsSync(envFile))
    Object.assign(sourceEnv, parseEnvFile(readFileSync(envFile, "utf8")));

  for (const key of Object.keys(sourceEnv)) {
    if (key.startsWith("TETHERIN_") && SENSITIVE_KEY.test(key)) {
      throw new ConfigError(
        "UNKNOWN_SENSITIVE_KEY",
        `Unsupported security-sensitive configuration key: ${key}`,
      );
    }
  }

  const baseUrl = sourceEnv.TETHERIN_BASE_URL ?? "http://localhost:3000";
  const url = new URL(baseUrl);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new ConfigError(
      "NON_LOOPBACK_URL",
      "TETHERIN_BASE_URL must use HTTP on a loopback host",
    );
  }
  const mode = sourceEnv.TETHERIN_MODE === "live" ? "live" : "fixture";
  const greptileMode = sourceEnv.GREPTILE_MODE === "live" ? "live" : "fixture";
  if (mode === "live" && greptileMode !== "live") {
    throw new ConfigError(
      "LIVE_GREPTILE_REQUIRED",
      "Live mode requires GREPTILE_MODE=live",
    );
  }

  const consumerRepoPath = required(sourceEnv, "TETHERIN_CONSUMER_REPO_PATH");
  if (!isAbsolute(consumerRepoPath))
    throw new ConfigError(
      "CONSUMER_PATH_RELATIVE",
      "Consumer repository path must be absolute",
    );
  const resolvedConsumer = resolve(consumerRepoPath);
  const home = resolve(homedir());
  if (
    resolvedConsumer === "/" ||
    resolvedConsumer === home ||
    resolvedConsumer === repoRoot
  ) {
    throw new ConfigError(
      "CONSUMER_PATH_UNSAFE",
      "Consumer repository path is too broad or targets TetherIn",
    );
  }
  const overlap = relative(repoRoot, resolvedConsumer);
  const reverseOverlap = relative(resolvedConsumer, repoRoot);
  if (
    (!overlap.startsWith("..") && overlap !== "") ||
    (!reverseOverlap.startsWith("..") && reverseOverlap !== "")
  ) {
    throw new ConfigError(
      "CONSUMER_PATH_OVERLAP",
      "Consumer repository must not contain or be contained by TetherIn",
    );
  }

  const consumerRepo = required(sourceEnv, "TETHERIN_CONSUMER_REPO");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(consumerRepo)) {
    throw new ConfigError(
      "CONSUMER_REPO_INVALID",
      "TETHERIN_CONSUMER_REPO must be owner/repository",
    );
  }
  const version = sourceEnv.OASDIFF_VERSION ?? "1.29.1";
  if (version !== "1.29.1")
    throw new ConfigError(
      "OASDIFF_VERSION_INVALID",
      "OASDIFF_VERSION must be 1.29.1",
    );

  return {
    repoRoot,
    baseUrl,
    mode,
    databasePath: localPath(
      repoRoot,
      sourceEnv.TETHERIN_DATABASE_PATH ?? ".tetherin/tetherin.db",
      "TETHERIN_DATABASE_PATH",
    ),
    artifactsPath: localPath(
      repoRoot,
      sourceEnv.TETHERIN_ARTIFACTS_PATH ?? ".tetherin/artifacts",
      "TETHERIN_ARTIFACTS_PATH",
    ),
    runsPath: localPath(
      repoRoot,
      sourceEnv.TETHERIN_RUNS_PATH ?? ".tetherin/runs",
      "TETHERIN_RUNS_PATH",
    ),
    retentionDays: Number.parseInt(
      sourceEnv.TETHERIN_RETENTION_DAYS ?? "7",
      10,
    ),
    consumerRepoPath: resolvedConsumer,
    consumerRepo,
    consumerBaseBranch: sourceEnv.TETHERIN_CONSUMER_BASE_BRANCH ?? "main",
    codexModel: sourceEnv.CODEX_MODEL || undefined,
    greptileMode,
    greptileMcpUrl:
      sourceEnv.GREPTILE_MCP_URL ?? "https://api.greptile.com/mcp",
    oasdiffVersion: version,
    hasOpenAiKey: Boolean(sourceEnv.OPENAI_API_KEY),
    hasGreptileKey: Boolean(sourceEnv.GREPTILE_API_KEY),
  };
}
