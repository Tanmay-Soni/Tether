import { createHash } from "node:crypto";
import type {
  AuthorizedConsumerRevision,
  Candidate,
  GreptileOptions,
  GreptileTransport,
} from "../types.js";
import { assertValidContract } from "../mcp/schemas.js";
import {
  buildLiteralQueries,
  type ManifestLike,
} from "../knowledge-base/queries.js";
import { createKnowledgeBaseClient } from "../knowledge-base/client.js";
import { confirmDeterministically } from "./deterministic.js";
import { dedupeCandidates } from "./confidence.js";

export async function enrichBlastRadius(input: {
  manifest: unknown;
  consumer: AuthorizedConsumerRevision;
  checkoutPath: string;
  executionMode: "live" | "fixture";
  transport: GreptileTransport;
  options: Required<Pick<GreptileOptions, "now">>;
  signal?: AbortSignal;
}): Promise<unknown> {
  assertValidContract<ManifestLike>("manifest", input.manifest);
  const manifest = input.manifest;
  const limitations: string[] = [];

  const kbClient = createKnowledgeBaseClient(input.transport);
  const kb = await kbClient.findRepository(
    input.consumer.repository,
    input.signal,
  );
  let kbVersions = {
    docs: null as string | null,
    reverts: null as string | null,
  };
  const searches: {
    query: string;
    tool: "search_knowledge_base";
    returned: number;
    truncated: boolean;
    truncationReason?:
      | "document_scan_cap"
      | "scanned_character_cap"
      | "response_character_cap"
      | "time_budget";
    documentsFailed?: number;
  }[] = [];
  const kbCandidates: Candidate[] = [];
  let notice =
    "Knowledge base unavailable; deterministic source confirmation is the evidence of record.";

  if (input.executionMode === "fixture") {
    notice =
      "Fixture Greptile evidence: synthetic official-shape data, not a live Greptile result.";
  }

  if (kb.limitation) {
    limitations.push(kb.limitation);
  }

  if (kb.availability === "available" && kb.repoNamespaceExternalId) {
    const docs = await kbClient.listDocuments(
      kb.repoNamespaceExternalId,
      input.signal,
    );
    kbVersions = docs.sectionVersions;
    if (docs.documentPaths.length === 0 || !docs.indexPresent) {
      limitations.push(
        "Greptile knowledge base is visible but has no published docs/index.",
      );
    }
    for (const query of buildLiteralQueries(manifest)) {
      const search = await kbClient.search(
        kb.repoNamespaceExternalId,
        query,
        input.signal,
      );
      notice = search.notice ?? notice;
      kbVersions = {
        docs: search.sectionVersions.docs ?? kbVersions.docs,
        reverts: search.sectionVersions.reverts ?? kbVersions.reverts,
      };
      const searchSummary: {
        query: string;
        tool: "search_knowledge_base";
        returned: number;
        truncated: boolean;
        truncationReason?:
          | "document_scan_cap"
          | "scanned_character_cap"
          | "response_character_cap"
          | "time_budget";
        documentsFailed?: number;
      } = {
        query,
        tool: "search_knowledge_base",
        returned: search.returned,
        truncated: search.truncated,
      };
      const truncationReason = normalizeTruncationReason(
        search.truncationReason,
      );
      if (truncationReason) searchSummary.truncationReason = truncationReason;
      if (search.documentsFailed > 0)
        searchSummary.documentsFailed = search.documentsFailed;
      searches.push(searchSummary);
      if (
        search.truncated ||
        search.documentsFailed > 0 ||
        search.sectionsFailed > 0
      ) {
        limitations.push(`Greptile KB search for "${query}" was incomplete.`);
      }
      for (const reference of search.references) {
        const evidence: Candidate["evidence"][number] = {
          source: "greptile-kb",
          reference: `${reference.path}:${reference.line}:${reference.snippetDigest}`,
          untrusted: true,
        };
        if (reference.kbVersion) {
          evidence.kbVersion = reference.kbVersion;
        }
        kbCandidates.push({
          path: reference.path,
          symbol: null,
          lineStart: reference.line,
          lineEnd: reference.line,
          usageKind: "other",
          whyAffected: `Greptile KB reference for literal query "${query}".`,
          confidence: 0.45,
          confirmation: "possible",
          evidence: [evidence],
        });
      }
    }
  }

  const deterministicInput = {
    checkoutPath: input.checkoutPath,
    expectedSha: input.consumer.baseSha,
    manifest,
    now: input.options.now,
  };
  const deterministic = await confirmDeterministically(
    input.signal
      ? { ...deterministicInput, signal: input.signal }
      : deterministicInput,
  );
  limitations.push(...deterministic.limitations);

  const candidates = dedupeCandidates([
    ...kbCandidates,
    ...deterministic.candidates,
  ]);
  const completeness = computeCompleteness({
    greptileAvailable: kb.availability === "available",
    deterministicStatus: deterministic.status,
    limitations,
  });

  const report = {
    schemaVersion: "tetherin.blast-radius-report/v1",
    reportId: `br-${digest(`${manifest.manifestId}:${input.consumer.repository}:${input.consumer.baseSha}`).slice(0, 24)}`,
    manifestId: manifest.manifestId,
    consumer: input.consumer,
    executionMode: input.executionMode,
    greptile: {
      transport:
        input.executionMode === "fixture"
          ? "fixture"
          : kb.availability === "available"
            ? "mcp"
            : "unavailable",
      availability:
        input.executionMode === "fixture" ? "fixture" : kb.availability,
      repoNamespaceExternalId: kb.repoNamespaceExternalId,
      knowledgeBaseVersions: kbVersions,
      searches,
      untrustedContent: true,
      notice,
    },
    deterministicConfirmation: {
      repositorySha: deterministic.repositorySha,
      tools: deterministic.tools,
      status: deterministic.status,
      completedAt: deterministic.completedAt,
    },
    candidates,
    completeness,
    limitations,
    createdAt: input.options.now().toISOString(),
  };
  assertValidContract("blastRadius", report);
  return report;
}

function computeCompleteness(input: {
  greptileAvailable: boolean;
  deterministicStatus: "complete" | "partial" | "failed";
  limitations: string[];
}): "complete" | "partial" | "unavailable" {
  if (input.deterministicStatus === "failed") {
    return input.greptileAvailable ? "partial" : "unavailable";
  }
  if (
    !input.greptileAvailable ||
    input.deterministicStatus === "partial" ||
    input.limitations.length > 0
  ) {
    return "partial";
  }
  return "complete";
}

function normalizeTruncationReason(
  value: string | undefined,
):
  | "document_scan_cap"
  | "scanned_character_cap"
  | "response_character_cap"
  | "time_budget"
  | undefined {
  if (
    value === "document_scan_cap" ||
    value === "scanned_character_cap" ||
    value === "response_character_cap" ||
    value === "time_budget"
  ) {
    return value;
  }
  return undefined;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
