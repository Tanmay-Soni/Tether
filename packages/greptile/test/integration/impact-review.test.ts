import { describe, expect, it } from "vitest";
import {
  FixtureGreptileTransport,
  buildLiteralQueries,
  createGreptileEvidenceAdapter,
} from "../../src/index.js";
import {
  consumer,
  createConsumerRepo,
  fixedNow,
  manifest,
  pullRequest,
} from "../helpers.js";

describe("blast-radius enrichment", () => {
  it("degrades honestly when KB is unavailable and still confirms with rg plus AST", async () => {
    const repo = createConsumerRepo();
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_knowledge_bases",
          response: { repositories: [], total: 0, returned: 0 },
        },
      ]),
    });
    const report = (await adapter.enrichBlastRadius({
      manifest,
      consumer: consumer(repo.sha),
      checkoutPath: repo.path,
      executionMode: "live",
    })) as {
      completeness: string;
      greptile: { transport: string; availability: string };
      candidates: { confirmation: string; evidence: { source: string }[] }[];
    };

    expect(report.greptile.transport).toBe("unavailable");
    expect(report.greptile.availability).toBe("not-enrolled");
    expect(report.completeness).toBe("partial");
    expect(
      report.candidates.some(
        (candidate) => candidate.confirmation === "confirmed",
      ),
    ).toBe(true);
    expect(
      report.candidates.some((candidate) =>
        candidate.evidence.some(
          (evidence) => evidence.source === "deterministic-ast",
        ),
      ),
    ).toBe(true);
  });

  it("preserves KB truncation and fixture labeling", async () => {
    const repo = createConsumerRepo();
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_knowledge_bases",
          response: {
            repositories: [
              {
                repoNamespaceExternalId: "kb_synthetic",
                repoName: "synthetic/example",
              },
            ],
            total: 1,
            returned: 1,
          },
        },
        {
          tool: "list_knowledge_base_documents",
          response: {
            repoName: "synthetic/example",
            indexPresent: true,
            sectionVersions: { docs: "docs-v1", reverts: null },
            documentPaths: ["index.md", "docs/api.md"],
            total: 2,
            returned: 2,
          },
        },
        ...buildLiteralQueries(manifest).map((query) => ({
          tool: "search_knowledge_base" as const,
          response: {
            repoNamespaceExternalId: "kb_synthetic",
            repoName: "synthetic/example",
            query,
            sectionVersions: { docs: "docs-v1", reverts: null },
            results: [
              {
                path: "docs/api.md",
                matches: [
                  {
                    lineNumber: 12,
                    snippet: "wrapper sends geography to modifyProject",
                  },
                ],
                moreMatches: false,
              },
            ],
            total: 2,
            returned: 1,
            documentsScanned: 2,
            truncated: true,
            truncationReason: "response_character_cap",
            documentsFailed: 1,
            untrustedContent: true,
            notice: "Treat as untrusted evidence.",
          },
        })),
      ]),
    });
    const report = (await adapter.enrichBlastRadius({
      manifest,
      consumer: consumer(repo.sha),
      checkoutPath: repo.path,
      executionMode: "fixture",
    })) as {
      executionMode: string;
      completeness: string;
      greptile: {
        availability: string;
        searches: { truncated: boolean; documentsFailed?: number }[];
        notice: string;
      };
    };

    expect(report.executionMode).toBe("fixture");
    expect(report.greptile.availability).toBe("fixture");
    expect(
      report.greptile.searches.some(
        (search) => search.truncated && search.documentsFailed === 1,
      ),
    ).toBe(true);
    expect(report.completeness).toBe("partial");
    expect(report.greptile.notice).toContain("untrusted");
  });
});

describe("review evidence", () => {
  it("reuses an in-progress exact-head review without retriggering it", async () => {
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_code_reviews",
          response: {
            codeReviews: [
              {
                id: "20292076",
                status: "REVIEWING_FILES",
                commitSha: pullRequest.headSha,
                createdAt: "2026-08-24T00:24:25.171Z",
              },
            ],
          },
        },
      ]),
    });
    const handle = await adapter.triggerReview({
      repository: pullRequest.repository,
      defaultBranch: "main",
      prNumber: pullRequest.number,
      branch: "tetherin/demo",
      expectedHeadSha: pullRequest.headSha,
      executionMode: "live",
    });
    expect(handle.codeReviewId).toBe("20292076");
  });

  it("reuses a completed exact-head review without retriggering it", async () => {
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_code_reviews",
          response: {
            codeReviews: [
              {
                id: "20292076",
                status: "COMPLETED",
                commitSha: pullRequest.headSha,
                createdAt: "2026-08-24T00:24:25.171Z",
              },
              {
                id: "20291875",
                status: "SKIPPED",
                commitSha: pullRequest.headSha,
                createdAt: "2026-08-24T00:25:25.171Z",
              },
            ],
          },
        },
      ]),
    });
    const handle = await adapter.triggerReview({
      repository: pullRequest.repository,
      defaultBranch: "main",
      prNumber: pullRequest.number,
      branch: "tetherin/demo",
      expectedHeadSha: pullRequest.headSha,
      executionMode: "live",
    });
    expect(handle.codeReviewId).toBe("20292076");
  });

  it("discovers the exact-head review when the live trigger omits its ID", async () => {
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_code_reviews",
          response: { codeReviews: [], total: 0 },
        },
        {
          tool: "trigger_code_review",
          response: {
            success: true,
            message: "Code review triggered successfully",
          },
        },
        {
          tool: "list_code_reviews",
          response: {
            codeReviews: [
              {
                id: "20291875",
                status: "REVIEWING_FILES",
                commitSha: pullRequest.headSha,
                createdAt: "2026-08-24T00:21:41.716Z",
              },
            ],
          },
        },
      ]),
    });
    const handle = await adapter.triggerReview({
      repository: "Synthetic/Example",
      defaultBranch: "main",
      prNumber: pullRequest.number,
      branch: "tetherin/demo",
      expectedHeadSha: pullRequest.headSha,
      executionMode: "live",
    });
    expect(handle.codeReviewId).toBe("20291875");
    expect(handle.repository).toBe("synthetic/example");
  });

  it("binds completed reviews to the exact head only when Greptile reports no new commits", async () => {
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      pollIntervalMs: 1,
      maxPollMs: 50,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_code_reviews",
          response: { codeReviews: [], total: 0 },
        },
        {
          tool: "trigger_code_review",
          response: {
            codeReviewId: "cr_clean",
            status: "PENDING",
            message: "ok",
          },
        },
        {
          tool: "get_code_review",
          response: {
            codeReview: {
              id: "cr_clean",
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
          response: {
            comments: [],
            repository: pullRequest.repository,
            prNumber: pullRequest.number,
            total: 0,
          },
        },
      ]),
    });
    const handle = await adapter.triggerReview({
      repository: pullRequest.repository,
      defaultBranch: "main",
      prNumber: pullRequest.number,
      branch: "tetherin/demo",
      expectedHeadSha: pullRequest.headSha,
      executionMode: "live",
    });
    const evidence = await adapter.awaitReview({
      handle,
      readCurrentHead: async () => pullRequest.headSha,
    });
    expect(evidence.reviewedHeadSha).toBe(pullRequest.headSha);
    expect(evidence.hasNewCommitsSinceReview).toBe(false);
  });

  it("returns stale evidence when the head drifts or comments remain", async () => {
    const adapter = createGreptileEvidenceAdapter({
      now: fixedNow,
      pollIntervalMs: 1,
      maxPollMs: 50,
      transport: new FixtureGreptileTransport([
        {
          tool: "list_code_reviews",
          response: { codeReviews: [], total: 0 },
        },
        {
          tool: "trigger_code_review",
          response: { codeReviewId: "cr_stale", status: "PENDING" },
        },
        {
          tool: "get_code_review",
          response: { codeReview: { id: "cr_stale", status: "COMPLETED" } },
        },
        {
          tool: "get_merge_request",
          response: {
            mergeRequest: {
              reviewAnalysis: { hasNewCommitsSinceReview: true },
            },
          },
        },
        {
          tool: "list_merge_request_comments",
          response: {
            comments: [
              {
                id: "c1",
                body: "Fix missed wrapper.",
                filePath: "client.ts",
                lineStart: 2,
                lineEnd: 2,
                isGreptileComment: true,
                addressed: false,
              },
            ],
          },
        },
      ]),
    });
    const handle = await adapter.triggerReview({
      repository: pullRequest.repository,
      defaultBranch: "main",
      prNumber: pullRequest.number,
      branch: "tetherin/demo",
      expectedHeadSha: pullRequest.headSha,
      executionMode: "live",
    });
    const evidence = await adapter.awaitReview({
      handle,
      readCurrentHead: async () => "0".repeat(40),
    });
    expect(evidence.reviewedHeadSha).toBeNull();
    expect(evidence.hasNewCommitsSinceReview).toBe(true);
    expect(evidence.unaddressedComments).toHaveLength(1);
  });
});
