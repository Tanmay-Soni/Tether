import { resolve, relative } from "node:path";

export const DEFAULT_LIMITS = {
  timeoutMs: 12 * 60_000,
  maxFilesInspected: 40,
  maxFilesChanged: 12,
  maxChangedLines: 500,
  maxCommands: 8,
  maxOutputBytes: 2 * 1024 * 1024,
} as const;

export function assertCheckoutBoundary(root: string, target: string): void {
  const rel = relative(resolve(root), resolve(target));
  if (
    rel.startsWith("..") ||
    rel.startsWith("/") ||
    rel.split("/").includes("..")
  )
    throw new Error("CHECKOUT_ESCAPE");
}

export function validateAllowedCommands(
  commands: readonly (readonly string[])[],
): void {
  if (commands.length > DEFAULT_LIMITS.maxCommands)
    throw new Error("COMMAND_LIMIT");
  const executables = new Set(["bun", "npm", "pnpm", "yarn", "node", "npx"]);
  for (const command of commands) {
    if (!command[0] || !executables.has(command[0]))
      throw new Error("COMMAND_NOT_ALLOWED");
    if (command.some((part) => /[;&|`$<>]/u.test(part)))
      throw new Error("COMMAND_METACHARACTER");
    if (
      command.some((part) =>
        /(?:install|add|update|upgrade|publish|deploy)/iu.test(part),
      )
    )
      throw new Error("NETWORK_OR_MUTATION_COMMAND");
  }
}
