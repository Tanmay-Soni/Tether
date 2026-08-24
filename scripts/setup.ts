import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, redact } from "@tetherin/config";
import { validateConsumerRepository } from "@tetherin/git-local";
import { LocalStateStore } from "@tetherin/local-state";
import { createGreptileEvidenceAdapter } from "@tetherin/greptile";

type Check = { name: string; ok: boolean; detail: string; required: boolean };
const checks: Check[] = [];

async function run(
  name: string,
  command: string[],
  required = true,
): Promise<boolean> {
  try {
    const child = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: Bun.env.PATH ?? "", HOME: Bun.env.HOME ?? "" },
    });
    const [code, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ]);
    checks.push({
      name,
      ok: code === 0,
      detail:
        code === 0
          ? stdout.trim().split("\n")[0]!.slice(0, 100) || "ready"
          : `exit ${code}`,
      required,
    });
    return code === 0;
  } catch {
    checks.push({ name, ok: false, detail: "not found", required });
    return false;
  }
}

await run("Bun", [process.execPath, "--version"]);
await run("Git", ["git", "--version"]);
await run("ripgrep", ["rg", "--version"]);
await run("jq", ["jq", "--version"]);
await run("GitHub CLI", ["gh", "auth", "status"]);

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
  checks.push({
    name: "Configuration",
    ok: true,
    detail: ".env.local validated without exposing values",
    required: true,
  });
} catch (error) {
  console.error(
    `Configuration blocked: ${redact(error instanceof Error ? error.message : "unknown")}`,
  );
  process.exit(1);
}

const installer = join(
  config.repoRoot,
  "packages/provider-pipeline/scripts/install-oasdiff.mjs",
);
await run("oasdiff v1.29.1", [
  "node",
  installer,
  join(config.repoRoot, ".tetherin/tools"),
]);

try {
  const store = new LocalStateStore(config.databasePath, config.repoRoot);
  store.migrate();
  store.close();
  checks.push({
    name: "SQLite",
    ok: existsSync(config.databasePath),
    detail: "schema v1 initialized with local 0600 database",
    required: true,
  });
} catch (error) {
  checks.push({
    name: "SQLite",
    ok: false,
    detail: redact(error instanceof Error ? error.message : "failed"),
    required: true,
  });
}

try {
  const snapshot = await validateConsumerRepository({
    path: config.consumerRepoPath,
    tetherRoot: config.repoRoot,
    expectedRepository: config.consumerRepo,
    expectedBranch: config.consumerBaseBranch,
    requireClean: config.mode === "live",
  });
  checks.push({
    name: "Consumer",
    ok: true,
    detail: `${snapshot.repository}@${snapshot.headSha.slice(0, 12)} · ${snapshot.clean ? "clean" : "dirty (fixture only)"}`,
    required: true,
  });
} catch (error) {
  checks.push({
    name: "Consumer",
    ok: false,
    detail: redact(error instanceof Error ? error.message : "invalid"),
    required: true,
  });
}

await run(
  "OpenAI fixture smoke",
  [
    process.execPath,
    "run",
    "--filter",
    "@tetherin/provider-pipeline",
    "test:fixture",
  ],
  true,
);

if (config.mode === "live") {
  await run("Codex login", ["codex", "login", "status"], true);
  if (config.hasGreptileKey) {
    try {
      const adapter = createGreptileEvidenceAdapter({
        endpoint: config.greptileMcpUrl,
        apiKeyEnv: "GREPTILE_API_KEY",
      });
      void adapter;
      checks.push({
        name: "Greptile",
        ok: true,
        detail:
          "credential present; repository visibility is checked during impact analysis",
        required: true,
      });
    } catch {
      checks.push({
        name: "Greptile",
        ok: false,
        detail: "connectivity check failed",
        required: true,
      });
    }
  } else
    checks.push({
      name: "Greptile",
      ok: false,
      detail:
        "GREPTILE_API_KEY unavailable; draft PR can be created but live-ready gate remains blocked",
      required: false,
    });
} else {
  checks.push({
    name: "Codex / Greptile",
    ok: true,
    detail: "not required in visibly labeled fixture mode",
    required: false,
  });
}

console.log("\nTetherIn preflight");
for (const check of checks)
  console.log(
    `${check.ok ? "PASS" : check.required ? "FAIL" : "NOTE"}  ${check.name.padEnd(22)} ${redact(check.detail)}`,
  );
const failed = checks.filter((check) => check.required && !check.ok);
console.log(
  failed.length
    ? `\nBlocked by ${failed.length} required check(s).`
    : `\nReady for bun run demo:${config.mode}.`,
);
if (failed.length) process.exit(1);
