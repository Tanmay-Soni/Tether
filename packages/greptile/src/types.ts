export type ConfirmedGreptileTool =
  | "list_knowledge_bases"
  | "list_knowledge_base_documents"
  | "get_knowledge_base_document"
  | "search_knowledge_base"
  | "trigger_code_review"
  | "list_code_reviews"
  | "get_code_review"
  | "get_merge_request"
  | "list_merge_request_comments";

export interface GreptileTransport {
  callTool<T>(
    name: ConfirmedGreptileTool,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<T>;
  close(): Promise<void>;
}

export interface AuthorizedConsumerRevision {
  repository: string;
  defaultBranch: string;
  baseSha: string;
  authorizedAt: string;
}

export interface PullRequestRevision {
  repository: string;
  number: number;
  url: string;
  headSha: string;
  baseSha: string;
  draft: true;
}

export interface CheckResult {
  name: string;
  command: string[];
  status: "passed" | "failed" | "timed-out" | "skipped";
  exitCode: number | null;
  durationMs: number;
  outputDigest: string;
  redactedExcerpt?: string;
}

export interface CoverageResult {
  status: "passed" | "failed" | "partial";
  confirmedCandidates: number;
  migratedCandidates: number;
  unresolvedCandidates: string[];
}

export interface ReviewHandle {
  transport: "mcp" | "fixture";
  repository: string;
  defaultBranch: string;
  prNumber: number;
  branch: string;
  expectedHeadSha: string;
  codeReviewId: string;
  triggeredStatus: "PENDING";
  triggeredAt: string;
}

export interface ReviewComment {
  id: string;
  body: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  addressed: false;
}

export interface ReviewEvidence {
  transport: "mcp" | "fixture" | "unavailable";
  status:
    | "PENDING"
    | "REVIEWING_FILES"
    | "GENERATING_SUMMARY"
    | "COMPLETED"
    | "FAILED"
    | "SKIPPED"
    | "UNAVAILABLE";
  codeReviewId: string | null;
  reviewedHeadSha: string | null;
  confidenceScore?: number | null;
  hasNewCommitsSinceReview: boolean;
  unaddressedComments: ReviewComment[];
  retrievedAt: string;
}

export interface GreptileEvidenceAdapter {
  enrichBlastRadius(input: {
    manifest: unknown;
    consumer: AuthorizedConsumerRevision;
    checkoutPath: string;
    executionMode: "live" | "fixture";
    signal?: AbortSignal;
  }): Promise<unknown>;

  triggerReview(input: {
    repository: string;
    defaultBranch: string;
    prNumber: number;
    branch: string;
    expectedHeadSha: string;
    executionMode: "live" | "fixture";
  }): Promise<ReviewHandle>;

  awaitReview(input: {
    handle: ReviewHandle;
    readCurrentHead: () => Promise<string>;
    signal?: AbortSignal;
  }): Promise<ReviewEvidence>;
}

export interface CodeValidationGate {
  evaluate(input: {
    manifestId: string;
    pullRequest: PullRequestRevision;
    executionMode: "live" | "fixture";
    checks: CheckResult[];
    coverage: CoverageResult;
    greptile: ReviewEvidence;
  }): unknown;
}

export interface RetryOptions {
  attempts?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface GreptileOptions {
  transport?: GreptileTransport;
  apiKeyEnv?: string;
  endpoint?: string;
  now?: () => Date;
  timeoutMs?: number;
  maxResponseBytes?: number;
  pollIntervalMs?: number;
  maxPollMs?: number;
  retry?: RetryOptions;
}

export interface GateOptions {
  now?: () => Date;
  minimumConfidenceScore?: number;
}

export type UsageKind =
  | "direct-sdk-call"
  | "http-call"
  | "wrapper"
  | "type"
  | "transform"
  | "webhook"
  | "test"
  | "downstream-assumption"
  | "other";

export interface Candidate {
  path: string;
  symbol: string | null;
  lineStart: number;
  lineEnd: number;
  usageKind: UsageKind;
  whyAffected: string;
  confidence: number;
  confirmation: "confirmed" | "possible" | "rejected";
  evidence: EvidenceRef[];
}

export interface EvidenceRef {
  source: "greptile-kb" | "deterministic-rg" | "deterministic-ast";
  reference: string;
  kbVersion?: string;
  untrusted?: boolean;
}
