import { describe, expect, it } from "vitest";
import {
  FixtureGreptileTransport,
  GreptileAdapterError,
  buildLiteralQueries,
  createCodeValidationGate,
} from "../../src/index.js";
import { isSecretLike, redactText } from "../../src/redaction.js";
import { fixedNow, manifest, passingCheck, pullRequest } from "../helpers.js";

describe("query and redaction policy", () => {
  it("builds bounded literal queries without secret-looking values", () => {
    const baseChange = manifest.changes[0]!;
    const queries = buildLiteralQueries({
      manifestId: "demo.manifest",
      changes: [
        baseChange,
        {
          ...baseChange,
          operationId: "sk-abcdefghijklmnopqrstuvwxyz123456",
          subject: { kind: "request-property", name: "token=supersecret" },
        },
      ],
    });
    expect(queries).toContain("modifyProject");
    expect(queries).toContain("geography");
    expect(queries.length).toBeLessThanOrEqual(40);
    expect(queries.some(isSecretLike)).toBe(false);
  });

  it("redacts credentials from safe error metadata", () => {
    const error = new GreptileAdapterError("authentication", "bad", {
      body: "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz123456 token=secret",
    });
    expect(redactText(error.metadata.body)).not.toContain("secret");
    expect(error.metadata.body).toContain("[REDACTED]");
  });
});

describe("fixture transport", () => {
  it("requires the exact documented tool sequence", async () => {
    const transport = new FixtureGreptileTransport([
      {
        tool: "get_code_review",
        response: { codeReview: { id: "1", status: "COMPLETED" } },
      },
    ]);
    await expect(
      transport.callTool("list_knowledge_bases", {}),
    ).rejects.toMatchObject({ kind: "fixture-mismatch" });
  });

  it("retries retryable tool failures within a bounded attempt count", async () => {
    const transport = new FixtureGreptileTransport([
      { tool: "get_code_review", errorKind: "rate-limited" },
      {
        tool: "get_code_review",
        response: { codeReview: { id: "cr_retry", status: "COMPLETED" } },
      },
      {
        tool: "get_merge_request",
        response: {
          mergeRequest: {
            reviewAnalysis: { hasNewCommitsSinceReview: false },
          },
        },
      },
      { tool: "list_merge_request_comments", response: { comments: [] } },
    ]);
    const { createGreptileEvidenceAdapter } =
      await import("../../src/index.js");
    const adapter = createGreptileEvidenceAdapter({
      transport,
      retry: { attempts: 2, minDelayMs: 1, maxDelayMs: 1 },
      pollIntervalMs: 1,
      maxPollMs: 10,
      now: fixedNow,
    });
    const evidence = await adapter.awaitReview({
      handle: {
        transport: "fixture",
        repository: "synthetic/example",
        defaultBranch: "main",
        prNumber: 1,
        branch: "demo",
        expectedHeadSha: "a".repeat(40),
        codeReviewId: "cr_retry",
        triggeredStatus: "PENDING",
        triggeredAt: fixedNow().toISOString(),
      },
      readCurrentHead: async () => "a".repeat(40),
    });
    expect(evidence.status).toBe("COMPLETED");
  });
});

describe("validation gate", () => {
  const cleanReview = {
    transport: "mcp" as const,
    status: "COMPLETED" as const,
    codeReviewId: "cr_clean",
    reviewedHeadSha: pullRequest.headSha,
    confidenceScore: 5,
    hasNewCommitsSinceReview: false,
    unaddressedComments: [],
    retrievedAt: "2026-08-23T12:00:00.000Z",
  };

  it("passes only clean live same-head evidence", () => {
    const gate = createCodeValidationGate({ now: fixedNow });
    const report = gate.evaluate({
      manifestId: manifest.manifestId,
      pullRequest,
      executionMode: "live",
      checks: [passingCheck],
      coverage: {
        status: "passed",
        confirmedCandidates: 1,
        migratedCandidates: 1,
        unresolvedCandidates: [],
      },
      greptile: cleanReview,
    }) as { gate: { decision: string; reasons: string[] } };
    expect(report.gate.decision).toBe("pass");
    expect(report.gate.reasons).toEqual([]);
  });

  it("never passes fixture or stale Greptile evidence", () => {
    const gate = createCodeValidationGate({ now: fixedNow });
    const fixtureReport = gate.evaluate({
      manifestId: manifest.manifestId,
      pullRequest,
      executionMode: "fixture",
      checks: [passingCheck],
      coverage: {
        status: "passed",
        confirmedCandidates: 1,
        migratedCandidates: 1,
        unresolvedCandidates: [],
      },
      greptile: { ...cleanReview, transport: "fixture" },
    }) as { gate: { decision: string; reasons: string[] } };
    expect(fixtureReport.gate.decision).not.toBe("pass");
    expect(fixtureReport.gate.reasons).toContain(
      "fixture_or_non_live_execution",
    );

    const staleReport = gate.evaluate({
      manifestId: manifest.manifestId,
      pullRequest,
      executionMode: "live",
      checks: [passingCheck],
      coverage: {
        status: "passed",
        confirmedCandidates: 1,
        migratedCandidates: 1,
        unresolvedCandidates: [],
      },
      greptile: {
        ...cleanReview,
        reviewedHeadSha: null,
        hasNewCommitsSinceReview: true,
      },
    }) as { gate: { decision: string; reasons: string[] } };
    expect(staleReport.gate.reasons).toContain(
      "greptile_review_stale_or_missing_head",
    );
  });
});
