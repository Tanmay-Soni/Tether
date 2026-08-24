import {
  asArray,
  asNumber,
  asString,
  assertKnownReviewStatus,
  isRecord,
} from "../mcp/schemas.js";
import type { ReviewComment, ReviewEvidence, ReviewHandle } from "../types.js";

export function normalizeTriggerResponse(value: unknown): {
  codeReviewId: string | null;
  status: "PENDING";
  message?: string;
} {
  const record = isRecord(value) ? value : {};
  const nested = isRecord(record.codeReview) ? record.codeReview : {};
  const codeReviewId =
    asString(record.codeReviewId ?? record.id) ??
    asString(nested.codeReviewId ?? nested.id) ??
    null;
  if (!codeReviewId && record.success !== true) {
    throw new Error("Invalid trigger_code_review response.");
  }
  const response: {
    codeReviewId: string | null;
    status: "PENDING";
    message?: string;
  } = {
    codeReviewId,
    status: "PENDING",
  };
  const message = asString(record.message);
  if (message) {
    response.message = message;
  }
  return response;
}

export function normalizeTriggeredReview(
  value: unknown,
  expectedHeadSha: string,
  options: {
    activeOnly?: boolean;
    reusableOnly?: boolean;
    createdAfter?: string;
  } = {},
): { id: string; status: ReviewEvidence["status"] } | null {
  const record = isRecord(value) ? value : {};
  const candidates = asArray(record.codeReviews)
    .filter(isRecord)
    .filter((review) => asString(review.commitSha) === expectedHeadSha)
    .map((review) => ({
      id: asString(review.id ?? review.codeReviewId) ?? "",
      status: asString(review.status) ?? "",
      createdAt: asString(review.createdAt) ?? "",
    }))
    .filter(
      (review) =>
        review.id.length > 0 &&
        [
          "PENDING",
          "REVIEWING_FILES",
          "GENERATING_SUMMARY",
          "COMPLETED",
          "FAILED",
          "SKIPPED",
        ].includes(review.status),
    )
    .filter(
      (review) =>
        !options.activeOnly ||
        ["PENDING", "REVIEWING_FILES", "GENERATING_SUMMARY"].includes(
          review.status,
        ),
    )
    .filter(
      (review) =>
        !options.reusableOnly ||
        [
          "PENDING",
          "REVIEWING_FILES",
          "GENERATING_SUMMARY",
          "COMPLETED",
        ].includes(review.status),
    )
    .filter((review) => {
      if (!options.createdAfter) return true;
      const cutoff = Date.parse(options.createdAfter) - 2_000;
      const created = Date.parse(review.createdAt);
      return Number.isFinite(created) && created >= cutoff;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latest = candidates[0];
  return latest
    ? {
        id: latest.id,
        status: latest.status as ReviewEvidence["status"],
      }
    : null;
}

export function normalizeCodeReviewStatus(value: unknown): {
  id: string;
  status:
    | "PENDING"
    | "REVIEWING_FILES"
    | "GENERATING_SUMMARY"
    | "COMPLETED"
    | "FAILED"
    | "SKIPPED";
  confidenceScore: number | null;
} {
  const record =
    isRecord(value) && isRecord(value.codeReview)
      ? value.codeReview
      : isRecord(value)
        ? value
        : {};
  const status = record.status;
  assertKnownReviewStatus(status);
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  return {
    id: asString(record.id) ?? asString(record.codeReviewId) ?? "",
    status: status as
      | "PENDING"
      | "REVIEWING_FILES"
      | "GENERATING_SUMMARY"
      | "COMPLETED"
      | "FAILED"
      | "SKIPPED",
    confidenceScore:
      asNumber(
        record.confidenceScore ??
          metadata.confidenceScore ??
          metadata.confidence,
      ) ?? null,
  };
}

export function normalizeMergeRequest(value: unknown): {
  hasNewCommitsSinceReview: boolean;
  confidenceScore: number | null;
} {
  const mergeRequest =
    isRecord(value) && isRecord(value.mergeRequest) ? value.mergeRequest : {};
  const analysis = isRecord(mergeRequest.reviewAnalysis)
    ? mergeRequest.reviewAnalysis
    : {};
  return {
    hasNewCommitsSinceReview: analysis.hasNewCommitsSinceReview === true,
    confidenceScore: asNumber(analysis.confidenceScore) ?? null,
  };
}

export function normalizeUnaddressedComments(value: unknown): ReviewComment[] {
  const record = isRecord(value) ? value : {};
  return asArray(record.comments)
    .filter(isRecord)
    .filter(
      (comment) =>
        comment.isGreptileComment === true && comment.addressed === false,
    )
    .map((comment) => ({
      id: asString(comment.id ?? comment.commentId) ?? "unknown-comment",
      body: (
        asString(comment.body) ?? "No comment body returned by Greptile."
      ).slice(0, 4000),
      filePath: asString(comment.filePath) ?? null,
      lineStart: asNumber(comment.lineStart) ?? null,
      lineEnd: asNumber(comment.lineEnd) ?? null,
      addressed: false as const,
    }));
}

export function unavailableReviewEvidence(
  codeReviewId: string | null,
  retrievedAt: string,
): ReviewEvidence {
  return {
    transport: "unavailable",
    status: "UNAVAILABLE",
    codeReviewId,
    reviewedHeadSha: null,
    confidenceScore: null,
    hasNewCommitsSinceReview: true,
    unaddressedComments: [],
    retrievedAt,
  };
}

export function pendingEvidence(
  handle: ReviewHandle,
  retrievedAt: string,
): ReviewEvidence {
  return {
    transport: handle.transport,
    status: "PENDING",
    codeReviewId: handle.codeReviewId,
    reviewedHeadSha: null,
    confidenceScore: null,
    hasNewCommitsSinceReview: true,
    unaddressedComments: [],
    retrievedAt,
  };
}
