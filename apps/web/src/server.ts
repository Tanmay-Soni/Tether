import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { loadConfig, redact } from "@tetherin/config";
import { validateConsumerRepository } from "@tetherin/git-local";
import { LocalStateStore } from "@tetherin/local-state";
import { allowedActions, type WorkflowState } from "@tetherin/orchestrator";

const config = loadConfig();
const store = new LocalStateStore(config.databasePath, config.repoRoot);
store.migrate();
const publicRoot = resolve(import.meta.dir, "../dist/public");
const sourceRoot = resolve(import.meta.dir);

const index = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>TetherIn — API migration control room</title><link rel="stylesheet" href="/client.css"></head><body><div id="root"></div><script type="module" src="/client.js"></script></body></html>`;

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function runView(runId: string): Record<string, unknown> | null {
  const run = store.getRun(runId);
  if (!run) return null;
  return {
    ...run,
    actions: allowedActions(
      run.state as WorkflowState,
      Number(run.followup_count ?? 0),
    ),
    stages: store.projections(runId).map((entry) => ({
      ...entry,
      summary: JSON.parse(String(entry.summary_json)),
    })),
    events: store.events(runId).map((entry) => ({
      ...entry,
      payload: JSON.parse(String(entry.payload_json)),
    })),
    artifacts: store.artifacts(runId),
  };
}

async function diagnostics(): Promise<Record<string, unknown>> {
  const checks: Array<{
    name: string;
    status: "ready" | "blocked";
    detail: string;
  }> = [];
  const command = async (name: string, args: string[]) => {
    try {
      const process = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
        env: { PATH: Bun.env.PATH ?? "" },
      });
      const code = await process.exited;
      checks.push({
        name,
        status: code === 0 ? "ready" : "blocked",
        detail: code === 0 ? "available" : `exit ${code}`,
      });
    } catch {
      checks.push({ name, status: "blocked", detail: "not found" });
    }
  };
  await Promise.all([
    command("Git", ["git", "--version"]),
    command("ripgrep", ["rg", "--version"]),
    command("jq", ["jq", "--version"]),
    command("GitHub CLI", ["gh", "auth", "status"]),
    command("Codex CLI", ["codex", "--version"]),
  ]);
  try {
    const repo = await validateConsumerRepository({
      path: config.consumerRepoPath,
      tetherRoot: config.repoRoot,
      expectedRepository: config.consumerRepo,
      expectedBranch: config.consumerBaseBranch,
    });
    checks.push({
      name: "Consumer repository",
      status: "ready",
      detail: `${repo.repository}@${repo.headSha.slice(0, 12)} · clean`,
    });
  } catch (error) {
    checks.push({
      name: "Consumer repository",
      status: "blocked",
      detail: redact(error instanceof Error ? error.message : "invalid"),
    });
  }
  checks.push({
    name: "oasdiff",
    status: "ready",
    detail: "pinned v1.29.1 · checksum enforced",
  });
  checks.push({
    name: "Greptile",
    status: config.hasGreptileKey ? "ready" : "blocked",
    detail: config.hasGreptileKey
      ? "credential configured"
      : "credential unavailable; live gate blocked",
  });
  return {
    mode: config.mode,
    repository: config.consumerRepo,
    checks,
    ready: checks
      .filter((check) => check.name !== "Greptile")
      .every((check) => check.status === "ready"),
  };
}

async function handleApi(request: Request, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/status")
    return json({ diagnostics: await diagnostics(), runs: store.listRuns() });
  if (request.method === "POST" && url.pathname === "/api/runs") {
    const snapshot = await validateConsumerRepository({
      path: config.consumerRepoPath,
      tetherRoot: config.repoRoot,
      expectedRepository: config.consumerRepo,
      expectedBranch: config.consumerBaseBranch,
    });
    const requested =
      request.headers.get("idempotency-key") ??
      `ui:${snapshot.headSha}:${new Date().toISOString().slice(0, 16)}`;
    const run = store.createRun({
      idempotencyKey: requested,
      mode: config.mode,
      evidenceOrigin: config.mode,
      provider: config.mode === "live" ? "stripe" : "openai",
      consumerRepo: config.consumerRepo,
      consumerBaseSha: snapshot.headSha,
    });
    if (run.state === "READY")
      store.insertIntent({
        runId: String(run.id),
        intentKey: `${requested}:start`,
        type: "START_RUN",
        expectedState: "READY",
      });
    return json(runView(String(run.id)), 202);
  }
  const match = /^\/api\/runs\/([^/]+)(?:\/actions)?$/u.exec(url.pathname);
  if (match && request.method === "GET") {
    const value = runView(decodeURIComponent(match[1]!));
    return value ? json(value) : json({ error: "RUN_NOT_FOUND" }, 404);
  }
  if (match && request.method === "POST" && url.pathname.endsWith("/actions")) {
    const runId = decodeURIComponent(match[1]!);
    const run = store.getRun(runId);
    if (!run) return json({ error: "RUN_NOT_FOUND" }, 404);
    const body = (await request.json()) as { action?: string };
    const action = body.action ?? "";
    if (
      !allowedActions(
        run.state as WorkflowState,
        Number(run.followup_count ?? 0),
      ).includes(action as never)
    )
      return json({ error: "ACTION_NOT_ALLOWED" }, 409);
    store.insertIntent({
      runId,
      intentKey: `${runId}:${action}:${run.current_head_sha ?? run.state}`,
      type: action,
      expectedState: run.state as WorkflowState,
      ...(run.current_head_sha
        ? { expectedHeadSha: String(run.current_head_sha) }
        : {}),
    });
    return json(runView(runId), 202);
  }
  return json({ error: "NOT_FOUND" }, 404);
}

const server = Bun.serve({
  hostname: new URL(config.baseUrl).hostname.replace(/^\[|\]$/gu, ""),
  port: Number(new URL(config.baseUrl).port || 3000),
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/"))
        return await handleApi(request, url);
      if (url.pathname === "/tetherin-icon.png")
        return new Response(
          Bun.file(resolve(config.repoRoot, "docs/assets/tetherin-icon.png")),
          {
            headers: {
              "content-type": "image/png",
              "cache-control": "public, max-age=3600",
            },
          },
        );
      if (url.pathname === "/client.js" || url.pathname === "/client.css") {
        const path = join(
          existsSync(publicRoot) ? publicRoot : sourceRoot,
          url.pathname.slice(1),
        );
        if (!existsSync(path))
          return new Response("Run bun run build first", { status: 503 });
        return new Response(Bun.file(path), {
          headers: {
            "content-type":
              extname(path) === ".css"
                ? "text/css; charset=utf-8"
                : "text/javascript; charset=utf-8",
          },
        });
      }
      return new Response(index, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
        },
      });
    } catch (error) {
      return json(
        { error: redact(error instanceof Error ? error.message : "UNKNOWN") },
        500,
      );
    }
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    store.close();
    server.stop();
  });
console.log(`TetherIn dashboard ready at ${config.baseUrl}`);
