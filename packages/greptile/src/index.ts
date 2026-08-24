import { McpGreptileTransport } from "./mcp/transport.js";
import { enrichBlastRadius as enrichBlastRadiusInternal } from "./impact/analyzer.js";
import { awaitGreptileReview, triggerGreptileReview } from "./review/client.js";
import { RetryingGreptileTransport, defaultRetryOptions } from "./mcp/retry.js";
import type { GreptileEvidenceAdapter, GreptileOptions } from "./types.js";

export type {
  AuthorizedConsumerRevision,
  CheckResult,
  CodeValidationGate,
  ConfirmedGreptileTool,
  CoverageResult,
  GateOptions,
  GreptileEvidenceAdapter,
  GreptileOptions,
  GreptileTransport,
  PullRequestRevision,
  ReviewComment,
  ReviewEvidence,
  ReviewHandle,
} from "./types.js";
export { GreptileAdapterError } from "./mcp/errors.js";
export {
  FixtureGreptileTransport,
  type FixtureStep,
} from "./mcp/fixture-transport.js";
export { createCodeValidationGate } from "./validation/gate.js";
export {
  buildLiteralQueries,
  sdkMethodCandidates,
} from "./knowledge-base/queries.js";

const DEFAULT_NOW = (): Date => new Date();

export function createGreptileEvidenceAdapter(
  options: GreptileOptions = {},
): GreptileEvidenceAdapter {
  const now = options.now ?? DEFAULT_NOW;
  const baseTransport = options.transport ?? new McpGreptileTransport(options);
  const transport = new RetryingGreptileTransport(
    baseTransport,
    defaultRetryOptions(options.retry),
  );
  return {
    enrichBlastRadius(input) {
      return enrichBlastRadiusInternal({
        ...input,
        transport,
        options: { now },
      });
    },
    triggerReview(input) {
      return triggerGreptileReview({
        ...input,
        transport,
        now,
      });
    },
    awaitReview(input) {
      return awaitGreptileReview({
        ...input,
        transport,
        now,
        options,
      });
    },
  };
}
