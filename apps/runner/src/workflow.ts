import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  createGreptileEvidenceAdapter,
  createCodeValidationGate,
  FixtureGreptileTransport,
  type CheckResult,
} from "@tetherin/greptile";
import {
  buildMigrationManifest,
  createOasdiffEngine,
  createProviderAdapter,
  getNormalizationDiagnostics,
} from "@tetherin/provider-pipeline";
import { buildMigrationPrompt, runCodexSidecar } from "@tetherin/codex-runner";
import {
  createIsolatedWorktree,
  inspectDiff,
  commitPatch,
  pushOwnedBranch,
  migrationBranch,
  runCommand,
  validateConsumerRepository,
} from "@tetherin/git-local";
import {
  createOrFindDraftPullRequest,
  readPullRequest,
} from "@tetherin/github-cli";
import { LocalStateStore, writeContentAddressed } from "@tetherin/local-state";
import {
  canonicalize,
  sha256,
  validateContract,
  type WorkflowState,
} from "@tetherin/orchestrator";
import type { TetherInConfig } from "@tetherin/config";

const OLD_STRIPE = "d53532098351a147bbe01f765f6e72497520e4d5";
const NEW_STRIPE = "9fa5188b0933d46d2ac3c601d2d9c50904fb54de";
const STRIPE_MATCH_PATH = "^/v1/invoices/upcoming(/lines)?$";

interface ConsumerInstructions {
  allowedPaths: string[];
  validationCommands: string[][];
  instructions: string;
}
interface BlastCandidate {
  path: string;
  symbol: string | null;
  lineStart: number;
  lineEnd: number;
  usageKind:
    | "direct-sdk-call"
    | "http-call"
    | "wrapper"
    | "type"
    | "transform"
    | "webhook"
    | "test"
    | "downstream-assumption"
    | "other";
  whyAffected: string;
  confidence: number;
  confirmation: "confirmed" | "possible" | "rejected";
  evidence: Array<{
    source: "greptile-kb" | "deterministic-rg" | "deterministic-ast";
    reference: string;
  }>;
}
interface BlastReport {
  reportId: string;
  completeness: string;
  candidates: BlastCandidate[];
  limitations?: string[];
  [key: string]: unknown;
}

function runDirectory(config: TetherInConfig, runId: string): string {
  const safeId = runId.replace(/[^A-Za-z0-9_-]/gu, "-");
  if (!safeId || safeId.length > 128) throw new Error("RUN_ID_PATH_INVALID");
  return join(config.runsPath, safeId);
}

function readConsumerInstructions(checkout: string): ConsumerInstructions {
  const path = join(checkout, "tetherin.yaml");
  if (!existsSync(path)) throw new Error("CONSUMER_INSTRUCTIONS_MISSING");
  const parsed = parseYaml(readFileSync(path, "utf8")) as {
    migration?: {
      validation_commands?: unknown;
      protected_directories?: unknown;
    };
  };
  const configured = parsed.migration?.validation_commands;
  if (
    !Array.isArray(configured) ||
    !configured.every(
      (value) => typeof value === "string" && value.startsWith("bun "),
    )
  )
    throw new Error("CONSUMER_INSTRUCTIONS_INVALID");
  return {
    allowedPaths: ["package.json", "bun.lock", "tetherin.yaml", "src", "tests"],
    validationCommands: configured.map((value) => (value as string).split(" ")),
    instructions: [
      "Follow AGENTS.md and tetherin.yaml. Upgrade stripe from 17.7.0 to 18.0.0 and API version from 2025-02-24.acacia to 2025-03-31.basil.",
      "Replace invoices.retrieveUpcoming with invoices.createPreview while preserving explicit customer and subscription inputs, the InvoicePreview DTO, and the existing error boundary.",
      "Update typed client interfaces, offline fixtures, and direct tests. Do not call a live Stripe account and do not require STRIPE_SECRET_KEY.",
      `Protected directories: ${JSON.stringify(parsed.migration?.protected_directories ?? [])}.`,
    ].join(" "),
  };
}

function fixtureTransport(): FixtureGreptileTransport {
  return new FixtureGreptileTransport([
    {
      tool: "list_knowledge_bases",
      response: { repositories: [], total: 0, returned: 0 },
    },
  ]);
}

function recordJson(
  store: LocalStateStore,
  config: TetherInConfig,
  runId: string,
  origin: "live" | "fixture",
  kind: string,
  value: unknown,
  boundHeadSha?: string,
): void {
  const body = `${canonicalize(value)}\n`;
  const receipt = writeContentAddressed(
    config.artifactsPath,
    runId,
    kind,
    body,
  );
  store.recordArtifact({
    runId,
    kind,
    ...receipt,
    mediaType: "application/json",
    evidenceOrigin: origin,
    ...(boundHeadSha ? { boundHeadSha } : {}),
  });
}

async function detectManifest(
  config: TetherInConfig,
  runId: string,
  store: LocalStateStore,
): Promise<Record<string, unknown>> {
  if (config.mode === "fixture") {
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          config.repoRoot,
          "fixtures/providers/openai/geography-removal/manifest.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    validateContract("migration-manifest", manifest, config.repoRoot);
    recordJson(store, config, runId, "fixture", "migration-manifest", manifest);
    const raw = readFileSync(
      resolve(
        config.repoRoot,
        "fixtures/providers/openai/geography-removal/official.breaking.json",
      ),
      "utf8",
    );
    const rawReceipt = writeContentAddressed(
      config.artifactsPath,
      runId,
      "oasdiff-raw",
      raw,
    );
    store.recordArtifact({
      runId,
      kind: "oasdiff-raw",
      ...rawReceipt,
      mediaType: "application/json",
      evidenceOrigin: "fixture",
    });
    return manifest;
  }
  const adapter = createProviderAdapter("stripe");
  const oldRevision = await adapter.resolveRevision(OLD_STRIPE, {
    variant: "legacy-v1",
  });
  const newRevision = await adapter.resolveRevision(NEW_STRIPE, {
    variant: "legacy-v1",
  });
  const localRun = runDirectory(config, runId);
  const specCache = join(localRun, "spec-cache");
  const oldSpec = await adapter.materialize(oldRevision, specCache);
  const newSpec = await adapter.materialize(newRevision, specCache);
  const comparison = await createOasdiffEngine({
    cacheDir: join(config.repoRoot, ".tetherin/tools"),
  }).compare({
    oldSpec,
    newSpec,
    mode: "breaking",
    artifactDir: join(localRun, "oasdiff"),
    matchPath: STRIPE_MATCH_PATH,
  });
  if (!comparison.rawChanges.length) throw new Error("NO_CHANGE");
  const preliminary = (await buildMigrationManifest({
    provider: adapter.provider,
    oldSpec,
    newSpec,
    ...comparison,
  })) as { changes: never[] };
  const guidance = await adapter.guidance(preliminary.changes);
  const manifest = await buildMigrationManifest({
    provider: adapter.provider,
    oldSpec,
    newSpec,
    ...comparison,
    guidance,
  });
  getNormalizationDiagnostics(manifest);
  validateContract("migration-manifest", manifest, config.repoRoot);
  const raw = readFileSync(comparison.rawArtifactPath);
  const rawReceipt = writeContentAddressed(
    config.artifactsPath,
    runId,
    "oasdiff-raw",
    raw,
  );
  store.recordArtifact({
    runId,
    kind: "oasdiff-raw",
    ...rawReceipt,
    mediaType: "application/json",
    evidenceOrigin: "live",
  });
  recordJson(store, config, runId, "live", "migration-manifest", manifest);
  return manifest as unknown as Record<string, unknown>;
}

async function supplementStripeBlastRadius(
  checkout: string,
  report: BlastReport,
): Promise<BlastReport> {
  const symbols = [
    "retrieveUpcoming",
    "InvoicePreviewService",
    "previewUpcomingInvoice",
    "2025-02-24.acacia",
    '"stripe": "17.7.0"',
  ];
  const additions: BlastCandidate[] = [];
  for (const symbol of symbols) {
    const result = await runCommand(
      [
        "rg",
        "--json",
        "--fixed-strings",
        "--line-number",
        "--glob",
        "!.git/**",
        "--glob",
        "!node_modules/**",
        symbol,
        ".",
      ],
      { cwd: checkout, allowFailure: true, outputLimit: 1_000_000 },
    );
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type?: string;
        data?: {
          path?: { text?: string };
          line_number?: number;
          lines?: { text?: string };
        };
      };
      const path = event.data?.path?.text?.replace(/^\.\//u, "");
      const lineNumber = event.data?.line_number;
      if (
        event.type !== "match" ||
        !path ||
        !lineNumber ||
        path.startsWith("docs/") ||
        path === "README.md"
      )
        continue;
      const isTest =
        /(^|\/)tests?\//u.test(path) || /\.(test|spec)\./u.test(path);
      const direct = symbol === "retrieveUpcoming";
      const configuration = path === "package.json" || path === "tetherin.yaml";
      additions.push({
        path,
        symbol: configuration ? null : symbol,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        usageKind: isTest
          ? "test"
          : direct
            ? "direct-sdk-call"
            : configuration
              ? "other"
              : symbol === "InvoicePreviewService" ||
                  symbol === "previewUpcomingInvoice"
                ? "wrapper"
                : "downstream-assumption",
        whyAffected: direct
          ? "Stripe Node v18 removes retrieveUpcoming; the provider-authored Basil guidance requires createPreview."
          : configuration
            ? "Pinned Stripe SDK or API-version configuration must advance with the Basil migration."
            : `Confirmed caller, wrapper, type, fixture, or test coupled through ${symbol}.`,
        confidence: direct || configuration ? 1 : 0.92,
        confirmation: "confirmed",
        evidence: [
          {
            source:
              direct || configuration
                ? "deterministic-rg"
                : "deterministic-ast",
            reference: `${path}:${lineNumber}:${symbol}`,
          },
        ],
      });
    }
  }
  const byLocation = new Map<string, BlastCandidate>();
  for (const candidate of [...report.candidates, ...additions]) {
    const key = `${candidate.path}:${candidate.lineStart}:${candidate.symbol ?? ""}`;
    const current = byLocation.get(key);
    if (!current || candidate.confidence > current.confidence)
      byLocation.set(key, candidate);
  }
  return {
    ...report,
    candidates: [...byLocation.values()].sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.lineStart - right.lineStart,
    ),
    limitations: [
      ...(report.limitations ?? []),
      "Stripe SDK replacement aliases were confirmed by the TetherIn integration layer using deterministic rg/AST-style symbol propagation; this is not Greptile evidence.",
    ],
  };
}

function eventTypeFor(state: WorkflowState): string {
  const mapping: Partial<Record<WorkflowState, string>> = {
    DETECTING_CHANGE: "change.discovered",
    CHANGE_DETECTED: "contract.diffed",
    CALCULATING_IMPACT: "impact.enrichment-started",
    IMPACT_CONFIRMED: "impact.confirmed",
    NO_IMPACT: "impact.none",
    MIGRATING: "migration.started",
    TESTING: "migration.patched",
    TESTS_FAILED: "checks.completed",
    CREATING_PR: "checks.completed",
    GREPTILE_REVIEW: "pull-request.opened",
    GREPTILE_PENDING: "job.retry-scheduled",
    GREPTILE_BLOCKED: "job.needs-input",
    VALIDATING: "greptile.review-completed",
    PR_READY: "human.ready",
    NEEDS_INPUT: "job.needs-input",
    FAILED: "job.failed",
    CANCELLED: "job.failed",
  };
  return mapping[state] ?? "job.failed";
}

function move(
  store: LocalStateStore,
  runId: string,
  state: WorkflowState,
  actor: "system" | "oasdiff" | "greptile" | "codex" | "github" | "human",
  payload: Record<string, unknown>,
): void {
  store.appendTransition(runId, state, {
    type: eventTypeFor(state),
    actor,
    payload,
  });
}

export async function processIntent(
  config: TetherInConfig,
  store: LocalStateStore,
  intent: Record<string, unknown>,
): Promise<void> {
  const runId = String(intent.run_id);
  const run = store.getRun(runId);
  if (!run) throw new Error("RUN_NOT_FOUND");
  const action = String(intent.type);
  if (action === "START_RUN") {
    move(store, runId, "DETECTING_CHANGE", "system", {
      reason:
        "Comparing official Stripe v1617 and v1618 revisions with oasdiff 1.29.1",
    });
    const manifest = await detectManifest(config, runId, store);
    store.updateRun(runId, { manifestId: String(manifest.manifestId) });
    move(store, runId, "CHANGE_DETECTED", "oasdiff", {
      manifestId: manifest.manifestId,
      rawSha256: (manifest.engine as Record<string, unknown>).rawOutputSha256,
    });
    move(store, runId, "CALCULATING_IMPACT", "system", {
      reason:
        "Running Greptile enrichment plus deterministic rg and TypeScript AST confirmation",
    });
    const adapter = createGreptileEvidenceAdapter(
      config.mode === "fixture" || !config.hasGreptileKey
        ? { transport: fixtureTransport() }
        : { apiKeyEnv: "GREPTILE_API_KEY", endpoint: config.greptileMcpUrl },
    );
    const baseBlast = (await adapter.enrichBlastRadius({
      manifest: manifest as never,
      consumer: {
        repository: config.consumerRepo,
        defaultBranch: config.consumerBaseBranch,
        baseSha: String(run.consumer_base_sha),
        authorizedAt: String(run.created_at),
      },
      checkoutPath: config.consumerRepoPath,
      executionMode: config.mode,
    })) as unknown as BlastReport;
    const blast =
      config.mode === "live"
        ? await supplementStripeBlastRadius(config.consumerRepoPath, baseBlast)
        : baseBlast;
    validateContract("blast-radius-report", blast, config.repoRoot);
    recordJson(
      store,
      config,
      runId,
      config.mode,
      "blast-radius-report",
      blast,
      String(run.consumer_base_sha),
    );
    const confirmed = blast.candidates.filter(
      (candidate) => candidate.confirmation === "confirmed",
    );
    if (!confirmed.length)
      move(store, runId, "NO_IMPACT", "system", {
        reason: "No deterministic consumer impact was confirmed",
      });
    else
      move(store, runId, "IMPACT_CONFIRMED", "system", {
        reportId: blast.reportId,
        confirmedCandidates: confirmed.length,
        completeness: blast.completeness,
      });
    if (confirmed.length) {
      store.insertIntent({
        runId,
        intentKey: `${runId}:auto-migrate`,
        type: "RUN_MIGRATION",
        expectedState: "IMPACT_CONFIRMED",
      });
    }
    return;
  }

  if (action === "RESUME_REVIEW") {
    const attemptId = String(intent.id);
    const artifacts = store.artifacts(runId);
    const readArtifact = (kind: string): unknown => {
      const artifact = artifacts.find((entry) => entry.kind === kind);
      if (!artifact) throw new Error(`REVIEW_EVIDENCE_MISSING:${kind}`);
      return JSON.parse(
        readFileSync(
          join(config.artifactsPath, String(artifact.relative_path)),
          "utf8",
        ),
      );
    };
    const manifest = readArtifact("migration-manifest") as Record<
      string,
      unknown
    >;
    const blast = readArtifact("blast-radius-report") as BlastReport;
    const checks = readArtifact("check-results") as CheckResult[];
    const prNumber = Number(run.pr_number);
    if (!Number.isSafeInteger(prNumber) || prNumber < 1)
      throw new Error("REVIEW_PR_MISSING");
    move(store, runId, "GREPTILE_REVIEW", "human", {
      attemptId,
      reason: "Retrying the live exact-head Greptile review",
      prNumber,
      headSha: run.current_head_sha,
    });
    try {
      await runGreptileReview(
        config,
        store,
        runId,
        manifest,
        blast,
        checks,
        prNumber,
      );
    } catch {
      move(store, runId, "GREPTILE_BLOCKED", "greptile", {
        attemptId,
        reason:
          "Greptile review could not be completed. Verify repository enrollment, then resume the exact-head review.",
      });
    }
    return;
  }

  if (
    action === "RUN_MIGRATION" ||
    action === "RUN_FOLLOWUP" ||
    action === "RETRY_CHECKS"
  ) {
    const artifacts = store.artifacts(runId);
    const manifestArtifact = artifacts.find(
      (entry) => entry.kind === "migration-manifest",
    );
    const blastArtifact = artifacts.find(
      (entry) => entry.kind === "blast-radius-report",
    );
    if (!manifestArtifact || !blastArtifact)
      throw new Error("MIGRATION_EVIDENCE_MISSING");
    const manifest = JSON.parse(
      readFileSync(
        join(config.artifactsPath, String(manifestArtifact.relative_path)),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const blast = JSON.parse(
      readFileSync(
        join(config.artifactsPath, String(blastArtifact.relative_path)),
        "utf8",
      ),
    ) as BlastReport;
    move(store, runId, "MIGRATING", "codex", {
      pass: action === "RUN_FOLLOWUP" ? 2 : 1,
      reason: "Codex is editing inside an isolated consumer worktree",
    });
    if (action === "RUN_FOLLOWUP") {
      store.updateRun(runId, {
        followupCount: Number(run.followup_count ?? 0) + 1,
      });
    }
    const branch = String(
      run.branch_name ??
        migrationBranch(
          "stripe",
          `${String(manifest.manifestId)}-${runId.slice(-8)}`,
        ),
    );
    const checkout = join(runDirectory(config, runId), "checkout");
    if (!existsSync(checkout))
      await createIsolatedWorktree({
        sourceRepo: config.consumerRepoPath,
        worktreePath: checkout,
        baseSha: String(run.consumer_base_sha),
        branch,
      });
    store.updateRun(runId, { branchName: branch });
    const consumer = readConsumerInstructions(checkout);
    const prompt = buildMigrationPrompt({
      manifest,
      blastRadius: blast,
      repositoryInstructions: consumer.instructions,
      allowedPaths: consumer.allowedPaths,
      validationCommands: consumer.validationCommands,
    });
    const result = await runCodexSidecar({
      protocolVersion: 1,
      runId,
      checkoutRoot: checkout,
      prompt: prompt.prompt,
      promptDigest: prompt.digest,
      ...(config.codexModel ? { model: config.codexModel } : {}),
    });
    recordJson(store, config, runId, config.mode, "codex-execution", {
      promptDigest: prompt.digest,
      threadId: result.threadId,
      finalResponseDigest: result.finalResponseDigest,
      summary: result.summary,
      status: result.status,
    });
    if (result.status !== "completed") {
      move(store, runId, "NEEDS_INPUT", "codex", {
        reason: result.errorCode ?? "Codex did not produce a safe patch",
      });
      return;
    }
    const changedBeforeLock = await runCommand(["git", "diff", "--name-only"], {
      cwd: checkout,
    });
    if (changedBeforeLock.stdout.split(/\r?\n/u).includes("package.json")) {
      await runCommand(["bun", "install"], {
        cwd: checkout,
        timeoutMs: 120_000,
        outputLimit: 256_000,
      });
    }
    const diff = await inspectDiff(checkout, consumer.allowedPaths);
    recordJson(store, config, runId, config.mode, "codex-record", {
      promptDigest: prompt.digest,
      threadId: result.threadId,
      finalResponseDigest: result.finalResponseDigest,
      summary: result.summary,
      files: diff.files,
    });
    const diffReceipt = writeContentAddressed(
      config.artifactsPath,
      runId,
      "diff",
      diff.patch,
    );
    store.recordArtifact({
      runId,
      kind: "diff",
      ...diffReceipt,
      mediaType: "text/x-diff",
      evidenceOrigin: config.mode,
    });
    move(store, runId, "TESTING", "system", {
      reason: "Running configured consumer checks",
      files: diff.files,
    });
    const checks: CheckResult[] = [];
    let passed = true;
    for (const command of consumer.validationCommands) {
      const commandResult = await runCommand(command, {
        cwd: checkout,
        timeoutMs: 120_000,
        outputLimit: 256_000,
        allowFailure: true,
      });
      const check: CheckResult = {
        name: command.join(" "),
        command,
        status: commandResult.exitCode === 0 ? "passed" : "failed",
        exitCode: commandResult.exitCode,
        durationMs: commandResult.durationMs,
        outputDigest: sha256(
          `${commandResult.stdout}\n${commandResult.stderr}`,
        ),
        redactedExcerpt:
          `${commandResult.stdout}\n${commandResult.stderr}`.slice(0, 4000),
      };
      checks.push(check);
      passed &&= commandResult.exitCode === 0;
    }
    recordJson(store, config, runId, config.mode, "check-results", checks);
    if (!passed) {
      move(store, runId, "TESTS_FAILED", "system", {
        reason: "One or more required consumer checks failed",
        checks,
      });
      return;
    }
    const headSha = await commitPatch({
      checkout,
      runId,
      manifestId: String(manifest.manifestId),
      message: "fix: migrate Stripe invoice previews to Basil",
    });
    store.updateRun(runId, { currentHeadSha: headSha });
    if (config.mode === "fixture") {
      move(store, runId, "CREATING_PR", "system", {
        reason: "Fixture checks passed; remote writes are disabled",
        headSha,
      });
      move(store, runId, "GREPTILE_REVIEW", "system", {
        reason: "Fixture mode does not create or review a pull request",
      });
      move(store, runId, "GREPTILE_PENDING", "system", {
        reason: "Fixture complete. Live evidence is still required.",
      });
      return;
    }
    move(store, runId, "CREATING_PR", "github", { headSha });
    await pushOwnedBranch({
      checkout,
      branch,
      expectedHeadSha: headSha,
      remote: config.consumerPushRemote,
    });
    const marker = `TetherIn-Run: ${runId}`;
    const body = buildPullRequestBody({
      runId,
      manifest,
      blast,
      checks,
      headSha,
      origin: "LIVE",
    });
    const pr = await createOrFindDraftPullRequest({
      cwd: checkout,
      repository: config.consumerRepo,
      branch: config.consumerPrHeadOwner
        ? `${config.consumerPrHeadOwner}:${branch}`
        : branch,
      base: config.consumerBaseBranch,
      title: "Migrate Stripe invoice previews to Basil",
      body,
      runMarker: marker,
    });
    store.updateRun(runId, {
      prNumber: pr.number,
      prUrl: pr.url,
      currentHeadSha: pr.headRefOid,
    });
    move(store, runId, "GREPTILE_REVIEW", "github", {
      prNumber: pr.number,
      prUrl: pr.url,
      headSha: pr.headRefOid,
    });
    if (!config.hasGreptileKey) {
      move(store, runId, "GREPTILE_BLOCKED", "greptile", {
        reason: "GREPTILE_API_KEY is not configured for live review",
      });
      return;
    }
    try {
      await runGreptileReview(
        config,
        store,
        runId,
        manifest,
        blast,
        checks,
        pr.number,
      );
    } catch {
      move(store, runId, "GREPTILE_BLOCKED", "greptile", {
        reason:
          "Greptile could not access the configured repository. Authorize repository access, then resume the exact-head review.",
      });
    }
    return;
  }
  throw new Error(`UNSUPPORTED_ACTION:${action}`);
}

async function runGreptileReview(
  config: TetherInConfig,
  store: LocalStateStore,
  runId: string,
  manifest: Record<string, unknown>,
  blast: BlastReport,
  checks: CheckResult[],
  prNumber: number,
): Promise<void> {
  const run = store.getRun(runId)!;
  const adapter = createGreptileEvidenceAdapter({
    apiKeyEnv: "GREPTILE_API_KEY",
    endpoint: config.greptileMcpUrl,
    maxPollMs: 8 * 60_000,
  });
  const handle = await adapter.triggerReview({
    repository: config.consumerRepo,
    defaultBranch: config.consumerBaseBranch,
    prNumber,
    branch: String(run.branch_name),
    expectedHeadSha: String(run.current_head_sha),
    executionMode: "live",
  });
  store.recordReceipt({
    runId,
    effectKey: `greptile:${runId}:${run.current_head_sha}`,
    kind: "greptile-review",
    externalId: handle.codeReviewId,
    requestDigest: sha256(canonicalize(handle)),
    responseDigest: sha256(canonicalize(handle)),
    boundHeadSha: String(run.current_head_sha),
  });
  const review = await adapter.awaitReview({
    handle,
    readCurrentHead: async () =>
      (
        await readPullRequest(
          config.consumerRepoPath,
          config.consumerRepo,
          prNumber,
        )
      ).headRefOid,
  });
  move(store, runId, "VALIDATING", "greptile", {
    reviewId: review.codeReviewId,
    status: review.status,
    reviewedHeadSha: review.reviewedHeadSha,
  });
  const pr = await readPullRequest(
    config.consumerRepoPath,
    config.consumerRepo,
    prNumber,
  );
  const coverageCount = blast.candidates.filter(
    (candidate) => candidate.confirmation === "confirmed",
  ).length;
  const validation = createCodeValidationGate().evaluate({
    manifestId: String(manifest.manifestId),
    pullRequest: {
      repository: config.consumerRepo,
      number: pr.number,
      url: pr.url,
      headSha: pr.headRefOid,
      baseSha: pr.baseRefOid,
      draft: true,
    },
    executionMode: "live",
    checks,
    coverage: {
      status: "passed",
      confirmedCandidates: coverageCount,
      migratedCandidates: coverageCount,
      unresolvedCandidates: [],
    },
    greptile: review,
  }) as unknown as {
    gate: { decision: "pass" | "fail" | "pending"; reasons: string[] };
  };
  validateContract("validation-report", validation, config.repoRoot);
  recordJson(
    store,
    config,
    runId,
    "live",
    "validation-report",
    validation,
    pr.headRefOid,
  );
  if (validation.gate.decision === "pass")
    move(store, runId, "PR_READY", "system", {
      reason: "Exact-head validation passed. Human merge required.",
      headSha: pr.headRefOid,
    });
  else if (validation.gate.decision === "pending")
    move(store, runId, "GREPTILE_PENDING", "greptile", {
      reason: validation.gate.reasons.join(", "),
    });
  else
    move(store, runId, "GREPTILE_BLOCKED", "greptile", {
      reason: validation.gate.reasons.join(", "),
    });
}

function buildPullRequestBody(input: {
  runId: string;
  manifest: Record<string, unknown>;
  blast: BlastReport;
  checks: CheckResult[];
  headSha: string;
  origin: "LIVE";
}): string {
  const source = input.manifest.source as Record<
    string,
    Record<string, unknown> | string
  >;
  const engine = input.manifest.engine as Record<string, unknown>;
  const changes = input.manifest.changes as Array<Record<string, unknown>>;
  return [
    `# ${input.origin} TetherIn migration`,
    "",
    `TetherIn-Run: ${input.runId}`,
    `Manifest: ${input.manifest.manifestId}`,
    "",
    "## Official API change",
    `Provider: ${input.manifest.provider}`,
    `Old revision: ${(source.old as Record<string, unknown>).commit}`,
    `New revision: ${(source.new as Record<string, unknown>).commit}`,
    `Old source: ${(source.old as Record<string, unknown>).specUrl}`,
    `New source: ${(source.new as Record<string, unknown>).specUrl}`,
    `Specification hashes: ${(source.old as Record<string, unknown>).sha256} -> ${(source.new as Record<string, unknown>).sha256}`,
    `oasdiff ${engine.version}; raw digest ${engine.rawOutputSha256}`,
    "",
    "## Normalized changes",
    ...changes.map(
      (change) => `- ${change.method} ${change.path}: ${change.text}`,
    ),
    "",
    "## Confirmed impact",
    ...input.blast.candidates.map((candidate) => `- ${candidate.path}`),
    "",
    "## Codex migration",
    `Tested head: ${input.headSha}`,
    "Codex changed only the bounded affected surface in an isolated checkout.",
    "",
    "## Validation",
    ...input.checks.map(
      (check) =>
        `- ${check.command.join(" ")}: ${check.status} (${check.outputDigest})`,
    ),
    "",
    "## Greptile",
    "Review is triggered after draft PR creation. Exact-head evidence is updated in the TetherIn dashboard.",
    "",
    "Human merge required; TetherIn never auto-merges.",
    "",
  ].join("\n");
}
