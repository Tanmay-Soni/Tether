import type {
  GreptileOptions,
  GreptileTransport,
  ReviewEvidence,
  ReviewHandle,
} from "../types.js";
import { classifyGreptileError, GreptileAdapterError } from "../mcp/errors.js";
import {
  normalizeCodeReviewStatus,
  normalizeMergeRequest,
  normalizeTriggerResponse,
  normalizeUnaddressedComments,
} from "./normalize.js";

export async function triggerGreptileReview(input: {
  repository: string;
  defaultBranch: string;
  prNumber: number;
  branch: string;
  expectedHeadSha: string;
  executionMode: "live" | "fixture";
  transport: GreptileTransport;
  now: () => Date;
}): Promise<ReviewHandle> {
  if (!input.defaultBranch) {
    throw new GreptileAdapterError(
      "permanent",
      "defaultBranch is required to trigger Greptile review.",
    );
  }
  const response = normalizeTriggerResponse(
    await input.transport.callTool("trigger_code_review", {
      name: input.repository,
      remote: "github",
      defaultBranch: input.defaultBranch,
      prNumber: input.prNumber,
      branch: input.branch,
    }),
  );
  return {
    transport: input.executionMode === "fixture" ? "fixture" : "mcp",
    repository: input.repository,
    defaultBranch: input.defaultBranch,
    prNumber: input.prNumber,
    branch: input.branch,
    expectedHeadSha: input.expectedHeadSha,
    codeReviewId: response.codeReviewId,
    triggeredStatus: response.status,
    triggeredAt: input.now().toISOString(),
  };
}

export async function awaitGreptileReview(input: {
  handle: ReviewHandle;
  transport: GreptileTransport;
  readCurrentHead: () => Promise<string>;
  now: () => Date;
  options: Pick<GreptileOptions, "maxPollMs" | "pollIntervalMs">;
  signal?: AbortSignal;
}): Promise<ReviewEvidence> {
  const started = Date.now();
  const maxPollMs = input.options.maxPollMs ?? 480_000;
  const pollIntervalMs = input.options.pollIntervalMs ?? 10_000;
  let latestStatus: ReturnType<typeof normalizeCodeReviewStatus> | null = null;

  while (Date.now() - started <= maxPollMs) {
    throwIfAborted(input.signal);
    try {
      latestStatus = normalizeCodeReviewStatus(
        await input.transport.callTool(
          "get_code_review",
          { codeReviewId: input.handle.codeReviewId },
          input.signal,
        ),
      );
    } catch (error) {
      const classified = classifyGreptileError(error, "get_code_review");
      if (!classified.retryable) {
        throw classified;
      }
    }

    if (latestStatus?.status === "COMPLETED") {
      return collectCompletedEvidence(input, latestStatus.confidenceScore);
    }
    if (
      latestStatus?.status === "FAILED" ||
      latestStatus?.status === "SKIPPED"
    ) {
      return {
        transport: input.handle.transport,
        status: latestStatus.status,
        codeReviewId: input.handle.codeReviewId,
        reviewedHeadSha: null,
        confidenceScore: latestStatus.confidenceScore,
        hasNewCommitsSinceReview: true,
        unaddressedComments: [],
        retrievedAt: input.now().toISOString(),
      };
    }
    await sleep(jitter(pollIntervalMs), input.signal);
  }

  return {
    transport: input.handle.transport,
    status: latestStatus?.status ?? "PENDING",
    codeReviewId: input.handle.codeReviewId,
    reviewedHeadSha: null,
    confidenceScore: latestStatus?.confidenceScore ?? null,
    hasNewCommitsSinceReview: true,
    unaddressedComments: [],
    retrievedAt: input.now().toISOString(),
  };
}

async function collectCompletedEvidence(
  input: {
    handle: ReviewHandle;
    transport: GreptileTransport;
    readCurrentHead: () => Promise<string>;
    now: () => Date;
    signal?: AbortSignal;
  },
  codeReviewConfidence: number | null,
): Promise<ReviewEvidence> {
  const headBefore = await input.readCurrentHead();
  const mergeRequest = normalizeMergeRequest(
    await input.transport.callTool(
      "get_merge_request",
      {
        name: input.handle.repository,
        remote: "github",
        defaultBranch: input.handle.defaultBranch,
        prNumber: input.handle.prNumber,
      },
      input.signal,
    ),
  );
  const comments = normalizeUnaddressedComments(
    await input.transport.callTool(
      "list_merge_request_comments",
      {
        name: input.handle.repository,
        remote: "github",
        defaultBranch: input.handle.defaultBranch,
        prNumber: input.handle.prNumber,
        greptileGenerated: true,
        addressed: false,
      },
      input.signal,
    ),
  );
  const headAfter = await input.readCurrentHead();
  const fresh =
    headBefore === input.handle.expectedHeadSha &&
    headAfter === input.handle.expectedHeadSha &&
    mergeRequest.hasNewCommitsSinceReview === false;
  return {
    transport: input.handle.transport,
    status: "COMPLETED",
    codeReviewId: input.handle.codeReviewId,
    reviewedHeadSha: fresh ? input.handle.expectedHeadSha : null,
    confidenceScore: mergeRequest.confidenceScore ?? codeReviewConfidence,
    hasNewCommitsSinceReview: !fresh || mergeRequest.hasNewCommitsSinceReview,
    unaddressedComments: comments,
    retrievedAt: input.now().toISOString(),
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new GreptileAdapterError("aborted", "Polling was aborted.");
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new GreptileAdapterError("aborted", "Polling was aborted."));
      },
      { once: true },
    );
  });
}

function jitter(ms: number): number {
  return Math.max(1, Math.floor(ms * (0.8 + Math.random() * 0.4)));
}
