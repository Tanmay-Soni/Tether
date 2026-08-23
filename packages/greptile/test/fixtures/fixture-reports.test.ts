import { describe, expect, it } from "vitest";
import {
  FixtureGreptileTransport,
  createCodeValidationGate,
  createGreptileEvidenceAdapter,
} from "../../src/index.js";
import {
  consumer,
  createConsumerRepo,
  fixedNow,
  manifest,
  passingCheck,
  pullRequest,
} from "../helpers.js";

describe("offline fixture report production", () => {
  it("produces schema-valid blast-radius and validation reports without network", async () => {
    const repo = createConsumerRepo();
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      pollIntervalMs: 1,
      maxPollMs: 50,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_knowledge_bases",
          response: { repositories: [], total: 0, returned: 0 },
        },
        {
          tool: "trigger_code_review",
          response: { codeReviewId: "cr_fixture", status: "PENDING" },
        },
        {
          tool: "get_code_review",
          response: {
            codeReview: {
              id: "cr_fixture",
              status: "COMPLETED",
              metadata: { confidenceScore: 5 },
            },
          },
        },
        {
          tool: "get_merge_request",
          response: {
            mergeRequest: {
              reviewAnalysis: {
                hasNewCommitsSinceReview: false,
                confidenceScore: 5,
              },
            },
          },
        },
        {
          tool: "list_merge_request_comments",
          response: { comments: [], total: 0 },
        },
      ]),
    });

    const blastRadius = (await adapter.enrichBlastRadius({
      manifest,
      consumer: consumer(repo.sha),
      checkoutPath: repo.path,
      executionMode: "fixture",
    })) as { schemaVersion: string; candidates: unknown[] };

    const handle = await adapter.triggerReview({
      repository: pullRequest.repository,
      defaultBranch: "main",
      prNumber: pullRequest.number,
      branch: "tetherin/demo",
      expectedHeadSha: pullRequest.headSha,
      executionMode: "fixture",
    });
    const review = await adapter.awaitReview({
      handle,
      readCurrentHead: async () => pullRequest.headSha,
    });
    const validation = createCodeValidationGate({ now: fixedNow }).evaluate({
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
      greptile: review,
    }) as {
      schemaVersion: string;
      gate: { decision: string; reasons: string[] };
    };

    expect(blastRadius.schemaVersion).toBe("tetherin.blast-radius-report/v1");
    expect(blastRadius.candidates.length).toBeGreaterThan(0);
    expect(validation.schemaVersion).toBe("tetherin.validation-report/v1");
    expect(validation.gate.decision).not.toBe("pass");
    expect(validation.gate.reasons).toContain("fixture_or_non_live_execution");
  });
});
