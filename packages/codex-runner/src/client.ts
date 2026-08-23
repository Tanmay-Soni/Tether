import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { redact } from "@tetherin/config";
import { DEFAULT_LIMITS } from "./policy.js";

export interface MigrationRequest {
  protocolVersion: 1;
  runId: string;
  checkoutRoot: string;
  prompt: string;
  promptDigest: string;
  model?: string;
  timeoutMs?: number;
}
export interface MigrationResult {
  protocolVersion: 1;
  status: "completed" | "failed" | "needs-input";
  threadId?: string;
  finalResponseDigest?: string;
  summary?: string;
  errorCode?: string;
}

export async function runCodexSidecar(
  request: MigrationRequest,
  sidecarPath = resolve(
    process.cwd(),
    "packages/codex-runner/dist/sidecar/main.js",
  ),
): Promise<MigrationResult> {
  return await new Promise<MigrationResult>((resolvePromise, rejectPromise) => {
    // The official SDK can reuse the operator's existing Codex CLI login. Preserve
    // only the account-location variables needed to find it; do not forward API
    // keys or unrelated application secrets into the migration checkout.
    const childEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: process.env.LANG ?? "C.UTF-8",
      ...(process.env.CODEX_HOME ? { CODEX_HOME: process.env.CODEX_HOME } : {}),
    };
    const child = spawn("node", [sidecarPath], {
      cwd: request.checkoutRoot,
      env: childEnv,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > DEFAULT_LIMITS.maxOutputBytes) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) child.kill("SIGKILL");
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
    const timer = setTimeout(
      () => child.kill("SIGKILL"),
      request.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
    );
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return rejectPromise(
          new Error(`CODEX_SIDECAR_FAILED:${redact(stderr).slice(0, 400)}`),
        );
      const line = stdout.trim().split(/\r?\n/u).at(-1);
      if (!line) return rejectPromise(new Error("CODEX_SIDECAR_EMPTY"));
      const parsed = JSON.parse(line) as MigrationResult;
      if (
        parsed.protocolVersion !== 1 ||
        !["completed", "failed", "needs-input"].includes(parsed.status)
      )
        return rejectPromise(new Error("CODEX_SIDECAR_PROTOCOL"));
      resolvePromise(parsed);
    });
  });
}
