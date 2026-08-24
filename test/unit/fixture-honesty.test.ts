import { describe, expect, it } from "vitest";
import { createCodeValidationGate } from "@tetherin/greptile";

const sha = "a".repeat(40);
describe("validation honesty", () => {
  it("never permits fixture evidence through the live-ready gate", () => {
    const report = createCodeValidationGate({
      now: () => new Date("2026-01-01T00:00:00Z"),
    }).evaluate({
      manifestId: "stripe:manifest-test",
      pullRequest: {
        repository: "owner/repo",
        number: 1,
        url: "https://github.com/owner/repo/pull/1",
        headSha: sha,
        baseSha: "b".repeat(40),
        draft: true,
      },
      executionMode: "fixture",
      checks: [
        {
          name: "bun test",
          command: ["bun", "test"],
          status: "passed",
          exitCode: 0,
          durationMs: 1,
          outputDigest: "c".repeat(64),
        },
      ],
      coverage: {
        status: "passed",
        confirmedCandidates: 1,
        migratedCandidates: 1,
        unresolvedCandidates: [],
      },
      greptile: {
        transport: "fixture",
        status: "COMPLETED",
        codeReviewId: "fixture",
        reviewedHeadSha: sha,
        hasNewCommitsSinceReview: false,
        unaddressedComments: [],
        retrievedAt: "2026-01-01T00:00:00Z",
      },
    }) as { gate: { decision: string; reasons: string[] } };
    expect(report.gate.decision).not.toBe("pass");
    expect(report.gate.reasons).toContain("fixture_or_non_live_execution");
    expect(report.gate.reasons).toContain("greptile_review_not_live_mcp");
  });
});
