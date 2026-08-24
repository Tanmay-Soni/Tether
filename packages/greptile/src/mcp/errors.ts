import { redactText } from "../redaction.js";

export type GreptileErrorKind =
  | "authentication"
  | "authorization"
  | "not-enrolled"
  | "invalid-response"
  | "rate-limited"
  | "timeout"
  | "aborted"
  | "transient"
  | "permanent"
  | "fixture-mismatch";

export interface SafeErrorMetadata {
  tool?: string;
  status?: number;
  retryAfterMs?: number;
  body?: string;
  causeMessage?: string;
}

export class GreptileAdapterError extends Error {
  readonly kind: GreptileErrorKind;
  readonly retryable: boolean;
  readonly metadata: SafeErrorMetadata;

  constructor(
    kind: GreptileErrorKind,
    message: string,
    metadata: SafeErrorMetadata = {},
  ) {
    super(message);
    this.name = "GreptileAdapterError";
    this.kind = kind;
    this.retryable = [
      "rate-limited",
      "timeout",
      "aborted",
      "transient",
    ].includes(kind);
    const safe: SafeErrorMetadata = {};
    if (metadata.tool !== undefined) safe.tool = metadata.tool;
    if (metadata.status !== undefined) safe.status = metadata.status;
    if (metadata.retryAfterMs !== undefined)
      safe.retryAfterMs = metadata.retryAfterMs;
    if (metadata.body !== undefined)
      safe.body = redactText(metadata.body).slice(0, 4000);
    if (metadata.causeMessage !== undefined)
      safe.causeMessage = redactText(metadata.causeMessage);
    this.metadata = safe;
  }
}

export function classifyGreptileError(
  error: unknown,
  tool?: string,
): GreptileAdapterError {
  if (error instanceof GreptileAdapterError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const metadata: SafeErrorMetadata = { causeMessage: message };
  if (tool !== undefined) metadata.tool = tool;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new GreptileAdapterError(
      "aborted",
      "Greptile request was aborted.",
      metadata,
    );
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return new GreptileAdapterError(
      "timeout",
      "Greptile request timed out.",
      metadata,
    );
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("401")
  ) {
    return new GreptileAdapterError(
      "authentication",
      "Greptile authentication failed.",
      metadata,
    );
  }
  if (
    lower.includes("forbidden") ||
    lower.includes("permission") ||
    lower.includes("repository not found")
  ) {
    return new GreptileAdapterError(
      "authorization",
      "Greptile repository is not visible to this organization.",
      metadata,
    );
  }
  if (lower.includes("knowledge base is not enabled")) {
    return new GreptileAdapterError(
      "not-enrolled",
      "Greptile knowledge base is not enabled.",
      metadata,
    );
  }
  if (lower.includes("rate") || lower.includes("429")) {
    return new GreptileAdapterError(
      "rate-limited",
      "Greptile rate limit reached.",
      metadata,
    );
  }
  if (
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  ) {
    return new GreptileAdapterError(
      "transient",
      "Greptile returned a transient failure.",
      metadata,
    );
  }
  return new GreptileAdapterError(
    "permanent",
    "Greptile request failed.",
    metadata,
  );
}
