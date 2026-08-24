import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@tetherin/config";

const config = loadConfig();
const localRoot = resolve(config.repoRoot, ".tetherin");
for (const path of [
  config.databasePath,
  config.artifactsPath,
  config.runsPath,
]) {
  if (path !== localRoot && !path.startsWith(`${localRoot}/`))
    throw new Error("RESET_PATH_OUTSIDE_TETHERIN");
}
if (existsSync(localRoot)) rmSync(localRoot, { recursive: true, force: true });
console.log(
  `Removed local TetherIn run state at ${localRoot}. Consumer repositories and remote branches were not changed.`,
);
