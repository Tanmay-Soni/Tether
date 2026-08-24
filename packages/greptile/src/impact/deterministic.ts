import { spawn } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { Candidate } from "../types.js";
import type { ManifestLike } from "../knowledge-base/queries.js";
import { buildLiteralQueries } from "../knowledge-base/queries.js";
import { GreptileAdapterError } from "../mcp/errors.js";
import { analyzeTypeScriptFile } from "./typescript-ast.js";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".java",
  ".cs",
  ".php",
]);
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export interface DeterministicResult {
  repositorySha: string;
  tools: ("rg" | "typescript-ast")[];
  status: "complete" | "partial" | "failed";
  completedAt: string;
  candidates: Candidate[];
  limitations: string[];
}

export async function confirmDeterministically(input: {
  checkoutPath: string;
  expectedSha: string;
  manifest: ManifestLike;
  now: () => Date;
  signal?: AbortSignal;
}): Promise<DeterministicResult> {
  const root = realpathSync(input.checkoutPath);
  const repositorySha = (
    await runGit(root, ["rev-parse", "HEAD"], input.signal)
  ).trim();
  if (repositorySha !== input.expectedSha) {
    throw new GreptileAdapterError(
      "permanent",
      "Consumer checkout SHA does not match the authorized base SHA.",
      {
        body: JSON.stringify({
          expected: input.expectedSha,
          actual: repositorySha,
        }),
      },
    );
  }

  const queries = buildLiteralQueries(input.manifest);
  const candidates: Candidate[] = [];
  const astFiles = new Set<string>();
  const limitations: string[] = [];

  for (const query of queries) {
    const rg = await runRg(root, query, input.signal);
    if (rg.truncated) {
      limitations.push(`deterministic rg output truncated for ${query}`);
    }
    for (const hit of rg.hits) {
      const fullPath = resolve(root, hit.path);
      assertInsideCheckout(root, fullPath);
      if (TS_EXTENSIONS.has(extname(hit.path))) {
        astFiles.add(fullPath);
      }
      candidates.push({
        path: hit.path,
        symbol: null,
        lineStart: hit.line,
        lineEnd: hit.line,
        usageKind: hit.path.match(/\b(test|spec|fixture|mock)s?\b/i)
          ? "test"
          : "other",
        whyAffected: `Literal source hit for manifest term "${query}".`,
        confidence: 0.7,
        confirmation: "possible",
        evidence: [
          {
            source: "deterministic-rg",
            reference: `${hit.path}:${hit.line}:${query}`,
          },
        ],
      });
    }
  }

  for (const file of astFiles) {
    try {
      candidates.push(...analyzeTypeScriptFile(file, root, input.manifest));
    } catch (error) {
      limitations.push(
        `typescript AST parse failed for ${file.replace(`${root}/`, "")}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    repositorySha,
    tools: ["rg", "typescript-ast"],
    status: limitations.length > 0 ? "partial" : "complete",
    completedAt: input.now().toISOString(),
    candidates,
    limitations,
  };
}

function assertInsideCheckout(root: string, fullPath: string): void {
  const real = realpathSync(fullPath);
  if (!real.startsWith(`${root}/`) && real !== root) {
    throw new GreptileAdapterError(
      "permanent",
      "Path escaped the consumer checkout.",
      { body: fullPath },
    );
  }
  if (lstatSync(fullPath).isSymbolicLink()) {
    throw new GreptileAdapterError(
      "permanent",
      "Symlink source paths are not analyzed.",
      { body: fullPath },
    );
  }
}

async function runGit(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return runCommand("git", ["-C", cwd, ...args], cwd, signal);
}

async function runRg(
  root: string,
  query: string,
  signal?: AbortSignal,
): Promise<{ hits: { path: string; line: number }[]; truncated: boolean }> {
  const args = [
    "--json",
    "--fixed-strings",
    "--line-number",
    "--no-heading",
    "--hidden",
    "--glob",
    "!.git/**",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/dist/**",
    "--glob",
    "!**/build/**",
    "--glob",
    "!**/coverage/**",
    "--glob",
    "!**/.env*",
    query,
    root,
  ];
  const output = await runCommand("rg", args, root, signal, true);
  const hits: { path: string; line: number }[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const event = JSON.parse(line) as {
      type?: string;
      data?: { path?: { text?: string }; line_number?: number };
    };
    if (
      event.type !== "match" ||
      !event.data?.path?.text ||
      !event.data.line_number
    ) {
      continue;
    }
    const path = event.data.path.text.replace(`${root}/`, "");
    if (!SOURCE_EXTENSIONS.has(extname(path))) {
      continue;
    }
    hits.push({ path, line: event.data.line_number });
  }
  return { hits, truncated: false };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  allowExitOne = false,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        child.kill("SIGTERM");
        reject(
          new GreptileAdapterError(
            "invalid-response",
            "Command output exceeded deterministic cap.",
            { body: command },
          ),
        );
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      reject(
        new GreptileAdapterError("transient", "Deterministic command failed.", {
          causeMessage: error.message,
        }),
      ),
    );
    child.on("close", (code) => {
      if (code === 0 || (allowExitOne && code === 1)) {
        resolvePromise(stdout);
      } else {
        reject(
          new GreptileAdapterError(
            "permanent",
            "Deterministic command exited non-zero.",
            {
              body: JSON.stringify({
                command,
                code,
                stderr: stderr.slice(0, 1000),
              }),
            },
          ),
        );
      }
    });
  });
}
