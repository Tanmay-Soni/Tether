import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const markdownFiles = walk(root).filter((path) => path.endsWith(".md"));
const failures = [];

for (const file of markdownFiles) {
  const text = readFileSync(file, "utf8");
  const targets = [
    ...matches(text, /!?\[[^\]]*\]\(([^)]+)\)/g),
    ...matches(text, /<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
  ];
  for (const rawTarget of targets) {
    const target = normalizeTarget(rawTarget);
    if (!target || isExternal(target)) continue;
    const withoutAnchor = target.split("#", 1)[0];
    if (!withoutAnchor) continue;
    const decoded = decodeURIComponent(withoutAnchor);
    const resolved = decoded.startsWith("/")
      ? join(root, decoded.slice(1))
      : resolve(dirname(file), decoded);
    if (!existsSync(resolved)) {
      failures.push(`${relative(root, file)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error("broken local Markdown links:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`local Markdown links verified (${markdownFiles.length} files)`);

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory)) {
    if (entry === ".git" || entry === "node_modules" || entry === ".tetherin") {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function normalizeTarget(value) {
  let target = value.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  const titleStart = target.search(/\s+["']/);
  if (titleStart >= 0) target = target.slice(0, titleStart);
  return target;
}

function isExternal(target) {
  return /^(?:https?:|mailto:|tel:|data:)/i.test(target);
}
