import { spawn } from "node:child_process";
import { redact } from "@tetherin/config";

export interface CommandResult {
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly truncated: boolean;
}

export class CommandError extends Error {
  constructor(
    readonly code: string,
    readonly result: CommandResult,
  ) {
    super(`${code}: ${result.command[0]} exited ${result.exitCode}`);
    this.name = "CommandError";
  }
}

const SAFE_ENV_KEYS = [
  "HOME",
  "PATH",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "USER",
  "LOGNAME",
  "SHELL",
  "GIT_CONFIG_NOSYSTEM",
] as const;

export function scrubbedEnv(
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS)
    if (process.env[key]) env[key] = process.env[key];
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CONFIG_NOSYSTEM = "1";
  return { ...env, ...extra };
}

export async function runCommand(
  command: readonly string[],
  options: {
    cwd: string;
    timeoutMs?: number;
    outputLimit?: number;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
  },
): Promise<CommandResult> {
  if (!command.length || !command[0]) throw new Error("EMPTY_COMMAND");
  const started = Date.now();
  const limit = options.outputLimit ?? 2 * 1024 * 1024;
  return await new Promise<CommandResult>((resolvePromise, rejectPromise) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: options.env ?? scrubbedEnv(),
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const append = (current: string, chunk: Buffer): string => {
      if (Buffer.byteLength(current) >= limit) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > limit) {
        truncated = true;
        return Buffer.from(next).subarray(0, limit).toString("utf8");
      }
      return next;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    const timeout = setTimeout(() => {
      if (child.pid && process.platform !== "win32")
        process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    }, options.timeoutMs ?? 60_000);
    child.on("error", rejectPromise);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      const result: CommandResult = {
        command: [...command],
        exitCode: exitCode ?? (signal ? 124 : 1),
        stdout: redact(stdout),
        stderr: redact(stderr),
        durationMs: Date.now() - started,
        truncated,
      };
      if (result.exitCode !== 0 && !options.allowFailure)
        rejectPromise(new CommandError("COMMAND_FAILED", result));
      else resolvePromise(result);
    });
  });
}
