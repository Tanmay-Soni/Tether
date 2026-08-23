import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import {
  activeStage,
  canonicalize,
  sha256,
  transition,
  validateContract,
  type EvidenceOrigin,
  type WorkflowState,
} from "@tetherin/orchestrator";

export const DATABASE_SCHEMA_VERSION = 1;

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(
  id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, mode TEXT NOT NULL, evidence_origin TEXT NOT NULL,
  provider TEXT NOT NULL, state TEXT NOT NULL, manifest_id TEXT, consumer_repo TEXT NOT NULL, consumer_base_sha TEXT NOT NULL,
  branch_name TEXT, pr_number INTEGER, pr_url TEXT, current_head_sha TEXT, followup_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, terminal_reason TEXT
);
CREATE TABLE IF NOT EXISTS workflow_events(
  event_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES runs(id), idempotency_key TEXT NOT NULL,
  sequence INTEGER NOT NULL, type TEXT NOT NULL, occurred_at TEXT NOT NULL, actor TEXT NOT NULL,
  causation_event_id TEXT, correlation_id TEXT, payload_digest TEXT NOT NULL, payload_json TEXT NOT NULL,
  UNIQUE(job_id, sequence), UNIQUE(job_id, payload_digest, type)
);
CREATE TRIGGER IF NOT EXISTS workflow_events_no_update BEFORE UPDATE ON workflow_events BEGIN SELECT RAISE(ABORT, 'workflow events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS workflow_events_no_delete BEFORE DELETE ON workflow_events BEGIN SELECT RAISE(ABORT, 'workflow events are append-only'); END;
CREATE TABLE IF NOT EXISTS action_intents(
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), intent_key TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
  expected_state TEXT NOT NULL, expected_head_sha TEXT, status TEXT NOT NULL, lease_owner TEXT, lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_error_code TEXT
);
CREATE TABLE IF NOT EXISTS external_receipts(
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), effect_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
  external_id TEXT NOT NULL, request_digest TEXT NOT NULL, response_digest TEXT NOT NULL, bound_head_sha TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts(
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), kind TEXT NOT NULL, relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, media_type TEXT NOT NULL, evidence_origin TEXT NOT NULL,
  bound_head_sha TEXT, created_at TEXT NOT NULL, UNIQUE(run_id, kind, sha256)
);
CREATE TABLE IF NOT EXISTS stage_projections(
  run_id TEXT NOT NULL REFERENCES runs(id), stage TEXT NOT NULL, status TEXT NOT NULL, summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY(run_id, stage)
);
CREATE INDEX IF NOT EXISTS workflow_events_job_sequence ON workflow_events(job_id, sequence);
CREATE INDEX IF NOT EXISTS action_intents_runnable ON action_intents(status, lease_expires_at);
`;

export interface CreateRunInput {
  id?: string;
  idempotencyKey: string;
  mode: "live" | "fixture";
  evidenceOrigin: EvidenceOrigin;
  provider: "openai" | "stripe" | "twilio";
  consumerRepo: string;
  consumerBaseSha: string;
}

export interface WorkflowEventInput {
  type: string;
  actor: "system" | "oasdiff" | "greptile" | "codex" | "github" | "human";
  payload: Record<string, unknown>;
  causationEventId?: string | null;
  correlationId?: string | null;
}

export class LocalStateStore {
  readonly db: Database;

  constructor(
    readonly databasePath: string,
    readonly repoRoot = process.cwd(),
  ) {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    this.db = new Database(databasePath, { create: true, strict: true });
    chmodSync(databasePath, 0o600);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }

  migrate(): void {
    this.db.transaction(() => {
      this.db.exec(MIGRATION_1);
      this.db
        .query(
          "INSERT OR IGNORE INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)",
        )
        .run(
          DATABASE_SCHEMA_VERSION,
          sha256(MIGRATION_1),
          new Date().toISOString(),
        );
    })();
  }

  close(): void {
    this.db.close();
  }

  createRun(input: CreateRunInput): Record<string, unknown> {
    const idempotencyKey = /^[0-9a-f]{64}$/u.test(input.idempotencyKey)
      ? input.idempotencyKey
      : sha256(input.idempotencyKey);
    const existing = this.db
      .query("SELECT * FROM runs WHERE idempotency_key = ?")
      .get(idempotencyKey) as Record<string, unknown> | null;
    if (existing) return existing;
    const now = new Date().toISOString();
    const id = input.id ?? `run:${randomUUID().replaceAll("-", "")}`;
    this.db
      .query(
        `INSERT INTO runs(id,idempotency_key,mode,evidence_origin,provider,state,consumer_repo,consumer_base_sha,created_at,updated_at)
      VALUES(?,?,?,?,?,'READY',?,?,?,?)`,
      )
      .run(
        id,
        idempotencyKey,
        input.mode,
        input.evidenceOrigin,
        input.provider,
        input.consumerRepo,
        input.consumerBaseSha,
        now,
        now,
      );
    for (const stage of [
      "api-change",
      "blast-radius",
      "codex-migration",
      "validation-pr",
    ]) {
      this.db
        .query(
          "INSERT INTO stage_projections(run_id,stage,status,summary_json,updated_at) VALUES(?,?,?, '{}', ?)",
        )
        .run(id, stage, stage === "api-change" ? "ready" : "not-started", now);
    }
    return this.getRun(id)!;
  }

  getRun(runId: string): Record<string, unknown> | null {
    return this.db
      .query("SELECT * FROM runs WHERE id = ?")
      .get(runId) as Record<string, unknown> | null;
  }

  listRuns(limit = 50): Record<string, unknown>[] {
    return this.db
      .query("SELECT * FROM runs ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
  }

  events(runId: string, after = 0, limit = 200): Record<string, unknown>[] {
    return this.db
      .query(
        "SELECT * FROM workflow_events WHERE job_id = ? AND sequence > ? ORDER BY sequence LIMIT ?",
      )
      .all(runId, after, limit) as Record<string, unknown>[];
  }

  appendTransition(
    runId: string,
    nextState: WorkflowState,
    input: WorkflowEventInput,
  ): Record<string, unknown> {
    return this.db.transaction(() => {
      const run = this.getRun(runId);
      if (!run) throw new Error("RUN_NOT_FOUND");
      transition(run.state as WorkflowState, nextState);
      const sequence = Number(
        (
          this.db
            .query(
              "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM workflow_events WHERE job_id=?",
            )
            .get(runId) as { sequence: number }
        ).sequence,
      );
      const occurredAt = new Date().toISOString();
      const payloadDigest = sha256(canonicalize(input.payload));
      const event = {
        schemaVersion: "tetherin.workflow-event/v1",
        eventId: `evt:${randomUUID().replaceAll("-", "")}`,
        jobId: runId,
        idempotencyKey: String(run.idempotency_key),
        sequence,
        type: input.type,
        occurredAt,
        actor: input.actor,
        causationEventId: input.causationEventId ?? null,
        correlationId: input.correlationId ?? null,
        payloadDigest,
        payload: input.payload,
      };
      validateContract("workflow-event", event, this.repoRoot);
      this.db
        .query(
          `INSERT INTO workflow_events(event_id,job_id,idempotency_key,sequence,type,occurred_at,actor,causation_event_id,correlation_id,payload_digest,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          event.eventId,
          runId,
          event.idempotencyKey,
          sequence,
          input.type,
          occurredAt,
          input.actor,
          event.causationEventId,
          event.correlationId,
          payloadDigest,
          canonicalize(input.payload),
        );
      this.db
        .query(
          "UPDATE runs SET state=?, updated_at=?, terminal_reason=? WHERE id=?",
        )
        .run(
          nextState,
          occurredAt,
          [
            "FAILED",
            "NEEDS_INPUT",
            "NO_CHANGE",
            "NO_IMPACT",
            "CANCELLED",
          ].includes(nextState)
            ? String(input.payload.reason ?? nextState)
            : null,
          runId,
        );
      const stages = [
        "api-change",
        "blast-radius",
        "codex-migration",
        "validation-pr",
      ] as const;
      const currentIndex = stages.indexOf(activeStage(nextState));
      const blocked = [
        "FAILED",
        "NEEDS_INPUT",
        "TESTS_FAILED",
        "GREPTILE_BLOCKED",
      ].includes(nextState);
      for (const [index, stage] of stages.entries()) {
        const status =
          index < currentIndex
            ? "complete"
            : index > currentIndex
              ? "not-started"
              : blocked
                ? "blocked"
                : "active";
        this.db
          .query(
            "UPDATE stage_projections SET status=?, summary_json=?, updated_at=? WHERE run_id=? AND stage=?",
          )
          .run(
            status,
            canonicalize({
              state: nextState,
              reason: input.payload.reason ?? null,
              sequence,
            }),
            occurredAt,
            runId,
            stage,
          );
      }
      return event;
    })();
  }

  projections(runId: string): Record<string, unknown>[] {
    return this.db
      .query("SELECT * FROM stage_projections WHERE run_id=? ORDER BY stage")
      .all(runId) as Record<string, unknown>[];
  }

  artifacts(runId: string): Record<string, unknown>[] {
    return this.db
      .query("SELECT * FROM artifacts WHERE run_id=? ORDER BY created_at")
      .all(runId) as Record<string, unknown>[];
  }

  recordArtifact(input: {
    runId: string;
    kind: string;
    relativePath: string;
    sha256: string;
    bytes: number;
    mediaType: string;
    evidenceOrigin: EvidenceOrigin;
    boundHeadSha?: string;
  }): void {
    this.db
      .query(
        `INSERT OR IGNORE INTO artifacts(id,run_id,kind,relative_path,sha256,bytes,media_type,evidence_origin,bound_head_sha,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        `artifact:${randomUUID().replaceAll("-", "")}`,
        input.runId,
        input.kind,
        input.relativePath,
        input.sha256,
        input.bytes,
        input.mediaType,
        input.evidenceOrigin,
        input.boundHeadSha ?? null,
        new Date().toISOString(),
      );
  }

  updateRun(
    runId: string,
    patch: {
      manifestId?: string;
      branchName?: string;
      prNumber?: number;
      prUrl?: string;
      currentHeadSha?: string;
      followupCount?: number;
    },
  ): void {
    const entries = Object.entries(patch).filter(
      ([, value]) => value !== undefined,
    );
    if (!entries.length) return;
    const columns: Record<string, string> = {
      manifestId: "manifest_id",
      branchName: "branch_name",
      prNumber: "pr_number",
      prUrl: "pr_url",
      currentHeadSha: "current_head_sha",
      followupCount: "followup_count",
    };
    const assignments = entries.map(([key]) => `${columns[key]}=?`).join(",");
    this.db
      .query(`UPDATE runs SET ${assignments}, updated_at=? WHERE id=?`)
      .run(
        ...entries.map(([, value]) => value as string | number),
        new Date().toISOString(),
        runId,
      );
  }

  insertIntent(input: {
    runId: string;
    intentKey: string;
    type: string;
    expectedState: WorkflowState;
    expectedHeadSha?: string;
  }): string {
    const run = this.getRun(input.runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    if (run.state !== input.expectedState) throw new Error("STALE_STATE");
    if (input.expectedHeadSha && run.current_head_sha !== input.expectedHeadSha)
      throw new Error("STALE_HEAD");
    const id = `intent:${randomUUID().replaceAll("-", "")}`;
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO action_intents(id,run_id,intent_key,type,expected_state,expected_head_sha,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'pending',?,?)`,
      )
      .run(
        id,
        input.runId,
        input.intentKey,
        input.type,
        input.expectedState,
        input.expectedHeadSha ?? null,
        now,
        now,
      );
    return id;
  }

  claimIntent(owner: string, leaseMs = 30_000): Record<string, unknown> | null {
    return this.db.transaction(() => {
      const now = new Date();
      const intent = this.db
        .query(
          `SELECT * FROM action_intents WHERE status='pending' OR (status='leased' AND lease_expires_at < ?) ORDER BY created_at LIMIT 1`,
        )
        .get(now.toISOString()) as Record<string, unknown> | null;
      if (!intent) return null;
      const expires = new Date(now.getTime() + leaseMs).toISOString();
      this.db
        .query(
          "UPDATE action_intents SET status='leased', lease_owner=?, lease_expires_at=?, attempts=attempts+1, updated_at=? WHERE id=?",
        )
        .run(owner, expires, now.toISOString(), String(intent.id));
      return this.db
        .query("SELECT * FROM action_intents WHERE id=?")
        .get(intent.id as string) as Record<string, unknown>;
    })();
  }

  completeIntent(intentId: string, owner: string): void {
    const result = this.db
      .query(
        "UPDATE action_intents SET status='complete', lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE id=? AND lease_owner=?",
      )
      .run(new Date().toISOString(), intentId, owner);
    if (result.changes !== 1) throw new Error("LEASE_NOT_OWNED");
  }

  recordReceipt(input: {
    runId: string;
    effectKey: string;
    kind: string;
    externalId: string;
    requestDigest: string;
    responseDigest: string;
    boundHeadSha?: string;
  }): Record<string, unknown> {
    const existing = this.db
      .query("SELECT * FROM external_receipts WHERE effect_key=?")
      .get(input.effectKey) as Record<string, unknown> | null;
    if (existing) return existing;
    const id = `receipt:${randomUUID().replaceAll("-", "")}`;
    this.db
      .query(
        `INSERT INTO external_receipts(id,run_id,effect_key,kind,external_id,request_digest,response_digest,bound_head_sha,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.runId,
        input.effectKey,
        input.kind,
        input.externalId,
        input.requestDigest,
        input.responseDigest,
        input.boundHeadSha ?? null,
        new Date().toISOString(),
      );
    return this.db
      .query("SELECT * FROM external_receipts WHERE id=?")
      .get(id) as Record<string, unknown>;
  }
}
