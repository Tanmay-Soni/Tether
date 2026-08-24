import { runCommand } from "./subprocess.js";

export interface DiffInspection {
  readonly patch: string;
  readonly files: string[];
  readonly additions: number;
  readonly deletions: number;
}

export async function inspectDiff(
  checkout: string,
  allowedPaths: readonly string[],
  limits = { files: 12, lines: 500 },
): Promise<DiffInspection> {
  const [diff, stat, status] = await Promise.all([
    runCommand(["git", "diff", "--binary", "--no-ext-diff", "--no-color"], {
      cwd: checkout,
      outputLimit: 2 * 1024 * 1024,
    }),
    runCommand(["git", "diff", "--numstat"], { cwd: checkout }),
    runCommand(["git", "status", "--porcelain=v1"], { cwd: checkout }),
  ]);
  const files = status.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
  if (!files.length) throw new Error("EMPTY_PATCH");
  if (files.length > limits.files) throw new Error("DIFF_FILE_LIMIT");
  for (const file of files) {
    if (
      file.startsWith("/") ||
      file.split("/").includes("..") ||
      file.startsWith(".env") ||
      file.includes("/.env")
    )
      throw new Error("DIFF_PATH_ESCAPE");
    if (
      !allowedPaths.some(
        (allowed) => file === allowed || file.startsWith(`${allowed}/`),
      )
    )
      throw new Error(`DIFF_PATH_NOT_ALLOWED:${file}`);
    if (/\.gitmodules$/u.test(file)) throw new Error("DIFF_SUBMODULE");
    if (
      /^(?:package-lock\.json|bun\.lock|pnpm-lock\.yaml|yarn\.lock)$/u.test(
        file,
      ) &&
      !files.includes("package.json")
    ) {
      throw new Error("LOCKFILE_WITHOUT_MANIFEST");
    }
  }
  let additions = 0;
  let deletions = 0;
  for (const line of stat.stdout.split(/\r?\n/u).filter(Boolean)) {
    const [add, del] = line.split("\t");
    if (add === "-" || del === "-") throw new Error("DIFF_BINARY");
    additions += Number(add);
    deletions += Number(del);
  }
  if (additions + deletions > limits.lines) throw new Error("DIFF_LINE_LIMIT");
  if (
    /\b(?:\.skip|\.only)\s*\(|eslint-disable|@ts-ignore|test\.skip\b/u.test(
      diff.stdout,
    )
  )
    throw new Error("TEST_OR_POLICY_WEAKENING");
  return { patch: diff.stdout, files, additions, deletions };
}
