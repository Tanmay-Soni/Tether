const commands = [
  ["run", "--filter", "@tetherin/provider-pipeline", "lint"],
  ["run", "--filter", "@tetherin/greptile", "lint"],
] as const;
for (const args of commands) {
  const child = Bun.spawn([process.execPath, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) process.exit(1);
}
const secretPattern = ["(?:gh", "p_|github", "_pat_|sk-[A-Za-z0-9])"].join("");
const scan = Bun.spawn(
  [
    "rg",
    "--hidden",
    "--glob",
    "!.git/**",
    "--glob",
    "!bun.lock",
    "--glob",
    "!**/test/**",
    secretPattern,
    ".",
  ],
  { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
);
const output = await new Response(scan.stdout).text();
const code = await scan.exited;
if (code === 0) {
  console.error(`Potential committed secret patterns:\n${output}`);
  process.exit(1);
}
if (code !== 1) process.exit(code);
