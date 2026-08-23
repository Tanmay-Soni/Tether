import { GreptileAdapterError } from "./errors.js";
import { assertConfirmedTool } from "./transport.js";
import type { ConfirmedGreptileTool, GreptileTransport } from "../types.js";

export interface FixtureStep {
  tool: ConfirmedGreptileTool;
  input?: unknown;
  response?: unknown;
  errorKind?:
    | "rate-limited"
    | "transient"
    | "invalid-response"
    | "fixture-mismatch"
    | "not-enrolled";
  latencyMs?: number;
}

export class FixtureGreptileTransport implements GreptileTransport {
  private cursor = 0;

  constructor(private readonly steps: FixtureStep[]) {}

  async callTool<T>(
    name: ConfirmedGreptileTool,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    assertConfirmedTool(name);
    if (signal?.aborted) {
      throw new GreptileAdapterError("aborted", "Fixture call was aborted.");
    }
    const step = this.steps[this.cursor];
    if (!step || step.tool !== name) {
      throw new GreptileAdapterError(
        "fixture-mismatch",
        "Fixture tool sequence mismatch.",
        {
          tool: name,
          body: JSON.stringify({ expected: step?.tool ?? null, input }),
        },
      );
    }
    this.cursor += 1;
    if (step.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, step.latencyMs));
    }
    if (step.errorKind) {
      throw new GreptileAdapterError(
        step.errorKind,
        "Fixture configured failure.",
        { tool: name },
      );
    }
    return step.response as T;
  }

  async close(): Promise<void> {}
}
