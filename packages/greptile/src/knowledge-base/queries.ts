import { createHash } from "node:crypto";
import { isSecretLike } from "../redaction.js";

export interface ManifestChangeLike {
  fingerprint: string;
  method: string;
  path: string;
  operationId: string | null;
  subject: {
    kind: string;
    name?: string;
    jsonPointer?: string;
  };
  text: string;
}

export interface ManifestLike {
  manifestId: string;
  changes: ManifestChangeLike[];
}

const MAX_QUERIES = 40;

export function buildLiteralQueries(manifest: ManifestLike): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const change of manifest.changes) {
    const candidates = [
      change.operationId ?? "",
      `${change.method.toUpperCase()} ${change.path}`,
      change.path,
      distinctiveEndpointSegment(change.path),
      change.subject.name ?? "",
      ...sdkMethodCandidates(change.operationId ?? ""),
    ];
    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      const key = trimmed.toLowerCase();
      if (
        trimmed.length < 2 ||
        trimmed.length > 200 ||
        seen.has(key) ||
        isSecretLike(trimmed)
      ) {
        continue;
      }
      seen.add(key);
      queries.push(trimmed);
      if (queries.length >= MAX_QUERIES) {
        return queries;
      }
    }
  }
  return queries;
}

export function distinctiveEndpointSegment(path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .filter((part) => !part.startsWith("{") && !part.endsWith("}"));
  return parts.at(-1) ?? path;
}

export function sdkMethodCandidates(operationId: string): string[] {
  if (!operationId) {
    return [];
  }
  const spaced = operationId
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  const words = spaced.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const camel = words
    .map((word, index) => (index === 0 ? lowerFirst(word) : upperFirst(word)))
    .join("");
  const pascal = words.map(upperFirst).join("");
  const snake = words.map((word) => word.toLowerCase()).join("_");
  const kebab = words.map((word) => word.toLowerCase()).join("-");
  return [camel, pascal, snake, kebab];
}

export function changeFingerprint(change: ManifestChangeLike): string {
  return createHash("sha256")
    .update(
      `${change.fingerprint}:${change.method}:${change.path}:${change.operationId ?? ""}:${change.subject.kind}:${change.subject.name ?? ""}`,
    )
    .digest("hex")
    .slice(0, 16);
}

function upperFirst(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function lowerFirst(value: string): string {
  return `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}
