import { loadConfig } from "@tetherin/config";

const config = loadConfig();
if (process.argv.includes("--require-live") && config.mode !== "live")
  throw new Error("DEMO_LIVE_REQUIRES_TETHERIN_MODE_LIVE");

const build = Bun.spawn([process.execPath, "run", "build"], {
  cwd: config.repoRoot,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
if ((await build.exited) !== 0) process.exit(1);

const children = [
  Bun.spawn(
    [process.execPath, "run", "--filter", "@tetherin/runner", "start"],
    {
      cwd: config.repoRoot,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    },
  ),
  Bun.spawn([process.execPath, "run", "--filter", "@tetherin/web", "start"], {
    cwd: config.repoRoot,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  }),
];
console.log(
  `\nTetherIn ${config.mode.toUpperCase()} control room: ${config.baseUrl}`,
);
console.log(
  "Press Ctrl-C to stop. SQLite state and content-addressed artifacts are retained.",
);
let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
