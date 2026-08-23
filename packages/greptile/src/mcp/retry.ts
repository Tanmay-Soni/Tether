import type {
  ConfirmedGreptileTool,
  GreptileOptions,
  GreptileTransport,
} from "../types.js";
import { GreptileAdapterError, classifyGreptileError } from "./errors.js";

export class RetryingGreptileTransport implements GreptileTransport {
  constructor(
    private readonly inner: GreptileTransport,
    private readonly retry: Required<NonNullable<GreptileOptions["retry"]>>,
  ) {}

  async callTool<T>(
    name: ConfirmedGreptileTool,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: GreptileAdapterError | null = null;
    for (let attempt = 1; attempt <= this.retry.attempts; attempt += 1) {
      try {
        return await this.inner.callTool<T>(name, input, signal);
      } catch (error) {
        const classified = classifyGreptileError(error, name);
        lastError = classified;
        if (!classified.retryable || attempt === this.retry.attempts) {
          throw classified;
        }
        await sleep(delayFor(attempt, this.retry, classified), signal);
      }
    }
    throw (
      lastError ??
      new GreptileAdapterError("transient", "Retry loop exhausted.")
    );
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

export function defaultRetryOptions(
  retry: GreptileOptions["retry"],
): Required<NonNullable<GreptileOptions["retry"]>> {
  return {
    attempts: retry?.attempts ?? 3,
    minDelayMs: retry?.minDelayMs ?? 250,
    maxDelayMs: retry?.maxDelayMs ?? 2_000,
  };
}

function delayFor(
  attempt: number,
  retry: Required<NonNullable<GreptileOptions["retry"]>>,
  error: GreptileAdapterError,
): number {
  if (error.metadata.retryAfterMs !== undefined) {
    return Math.min(error.metadata.retryAfterMs, retry.maxDelayMs);
  }
  const exponential = retry.minDelayMs * 2 ** (attempt - 1);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.min(Math.floor(exponential * jitter), retry.maxDelayMs);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new GreptileAdapterError("aborted", "Retry sleep was aborted."));
      },
      { once: true },
    );
  });
}
