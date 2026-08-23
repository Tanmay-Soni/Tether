import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "@tetherin/orchestrator";

export interface ArtifactReceipt {
  readonly relativePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export function writeContentAddressed(
  root: string,
  runId: string,
  kind: string,
  body: string | Uint8Array,
): ArtifactReceipt {
  const bytes =
    typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
  const digest = sha256(bytes);
  const relativePath = join(runId, kind, digest.slice(0, 2), digest);
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  writeFileSync(temporary, bytes, { mode: 0o600 });
  renameSync(temporary, absolute);
  chmodSync(absolute, 0o600);
  return { relativePath, sha256: digest, bytes: bytes.byteLength };
}
