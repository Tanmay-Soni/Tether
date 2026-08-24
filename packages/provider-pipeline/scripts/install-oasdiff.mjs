#!/usr/bin/env node

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const builtInstaller = resolve(packageDirectory, "dist/src/oasdiff/install.js");
try {
  await access(builtInstaller);
} catch {
  throw new Error(
    "Build @tetherin/provider-pipeline before running install-oasdiff.mjs",
  );
}

const { installOasdiff } = await import(pathToFileURL(builtInstaller).href);
const cacheArgument = process.argv[2];
const cacheDir = resolve(
  cacheArgument ??
    process.env["TETHERIN_CACHE_DIR"] ??
    ".cache/tetherin-provider-pipeline",
);
const binaryPath = await installOasdiff({ cacheDir });
process.stdout.write(`${binaryPath}\n`);
