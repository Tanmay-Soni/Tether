import { createHash } from "node:crypto";
import type {
  CheckResult,
  CodeValidationGate,
  CoverageResult,
  GateOptions,
  PullRequestRevision,
  ReviewEvidence,
} from "../types.js";
import { assertValidContract } from "../mcp/schemas.js";

const DEFAULT_NOW = (): Date => new Date();

export function createCodeValidationGate(
  options: GateOptions = {},
): CodeValidationGate {
  const now = options.now ?? DEFAULT_NOW;
  return {
    evaluate(input) {
      const reasons: string[] = [];
      if (input.executionMode !== "live") {
        reasons.push("fixture_or_non_live_execution");
      }
      if (input.pullRequest.draft !== true) {
        reasons.push("pull_request_not_draft");
      }
      for (const check of input.checks) {
        if (check.status !== "passed") {
          reasons.push(`check_not_passed:${check.name}`);
        }
      }
      evaluateCoverage(input.coverage, reasons);
      evaluateReview(
        input.pullRequest,
        input.greptile,
        reasons,
        options.minimumConfidenceScore,
      );

      const decision =
        reasons.length === 0
          ? "pass"
          : terminalFailure(reasons)
            ? "fail"
            : "pending";
      const report = {
        schemaVersion: "tetherin.validation-report/v1",
        reportId: `vr-${digest(`${input.manifestId}:${input.pullRequest.repository}:${input.pullRequest.headSha}:${now().toISOString()}`).slice(0, 24)}`,
        manifestId: input.manifestId,
        pullRequest: input.pullRequest,
        executionMode: input.executionMode,
        checks: input.checks,
        greptileReview: input.greptile,
        coverage: input.coverage,
        gate: {
          decision,
          reasons,
          humanApprovalRequired: true,
        },
        createdAt: now().toISOString(),
      };
      assertValidContract("validation", report);
      return report;
    },
  };
}

function evaluateCoverage(coverage: CoverageResult, reasons: string[]): void {
  if (coverage.status !== "passed") {
    reasons.push(`coverage_${coverage.status}`);
  }
  if (coverage.migratedCandidates !== coverage.confirmedCandidates) {
    reasons.push("coverage_confirmed_candidates_not_accounted");
  }
  if (coverage.unresolvedCandidates.length > 0) {
    reasons.push("coverage_unresolved_candidates");
  }
}

function evaluateReview(
  pr: PullRequestRevision,
  review: ReviewEvidence,
  reasons: string[],
  minimumConfidenceScore?: number,
): void {
  if (review.transport !== "mcp") {
    reasons.push("greptile_review_not_live_mcp");
  }
  if (review.status !== "COMPLETED") {
    reasons.push(`greptile_review_${review.status.toLowerCase()}`);
  }
  if (!review.codeReviewId) {
    reasons.push("greptile_review_missing_id");
  }
  if (review.reviewedHeadSha !== pr.headSha) {
    reasons.push("greptile_review_stale_or_missing_head");
  }
  if (review.hasNewCommitsSinceReview) {
    reasons.push("greptile_review_has_new_commits");
  }
  if (review.unaddressedComments.length > 0) {
    reasons.push("greptile_review_unaddressed_comments");
  }
  if (minimumConfidenceScore !== undefined) {
    if (
      review.confidenceScore === undefined ||
      review.confidenceScore === null
    ) {
      reasons.push("greptile_confidence_missing");
    } else if (review.confidenceScore < minimumConfidenceScore) {
      reasons.push("greptile_confidence_below_threshold");
    }
  }
}

function terminalFailure(reasons: string[]): boolean {
  return reasons.some(
    (reason) =>
      reason.startsWith("check_not_passed") ||
      reason === "coverage_failed" ||
      reason === "greptile_review_unaddressed_comments",
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
