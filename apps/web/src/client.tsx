import "@radix-ui/themes/styles.css";
import "./styles.css";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Dialog from "@radix-ui/react-dialog";
import { Theme, Button } from "@radix-ui/themes";
import {
  ArrowSquareOut,
  Check,
  CircleNotch,
  GearSix,
  GitBranch,
  LinkSimple,
  Play,
  Warning,
  X,
} from "@phosphor-icons/react";

type Run = Record<string, unknown> & {
  id: string;
  state: string;
  provider: string;
  pr_url?: string;
  events?: Array<Record<string, unknown>>;
  stages?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  actions?: string[];
};
type Status = {
  diagnostics: {
    mode: "live" | "fixture";
    repository: string;
    ready: boolean;
    checks: Array<{ name: string; status: string; detail: string }>;
  };
  runs: Run[];
};

const stageNames: Record<string, string> = {
  "api-change": "API Change",
  "blast-radius": "Blast Radius",
  "codex-migration": "Codex Migration",
  "validation-pr": "Validation & PR",
};
const actionLabels: Record<string, string> = {
  RUN_MIGRATION: "Run migration",
  RETRY_CHECKS: "Retry checks",
  RUN_FOLLOWUP: "Run correction",
  RESUME_REVIEW: "Resume review",
  CREATE_OR_OPEN_PR: "Open pull request",
};
const activityCopy: Record<string, string> = {
  READY: "Ready for one-click generation",
  DETECTING_CHANGE: "oasdiff is comparing the official Stripe specifications",
  CHANGE_DETECTED: "The contract evidence is normalized and retained",
  CALCULATING_IMPACT: "AI is tracing direct calls, wrappers, jobs, and tests",
  IMPACT_CONFIRMED: "Impact confirmed; Codex is starting automatically",
  MIGRATING: "Codex is editing the isolated consumer worktree",
  TESTING: "TetherIn is running the demo repository's configured checks",
  CREATING_PR: "TetherIn is committing, pushing, and opening the draft PR",
  GREPTILE_REVIEW: "Greptile is reviewing the unchanged pull-request head",
  VALIDATING: "TetherIn is evaluating exact-head review and test evidence",
  PR_READY: "Draft PR is ready for human review",
  GREPTILE_PENDING: "Greptile review is still pending",
  GREPTILE_BLOCKED: "Greptile needs repository access or operator input",
  FAILED: "The run stopped safely; inspect the latest event",
};

function short(value: unknown, size = 12): string {
  const text = String(value ?? "—");
  return text.length > size ? `${text.slice(0, size)}…` : text;
}
function StatusIcon({ state }: { state: string }) {
  if (/FAILED|BLOCKED|NEEDS|TESTS/u.test(state))
    return <Warning weight="fill" />;
  if (/READY$|CONFIRMED|DETECTED/u.test(state)) return <Check weight="bold" />;
  if (/ING|PENDING|REVIEW/u.test(state))
    return <CircleNotch className="spin" />;
  return <span className="status-mark" aria-hidden="true" />;
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useMemo(
    () => status?.runs.find((run) => run.id === selected) ?? status?.runs[0],
    [status, selected],
  );
  async function refresh() {
    const next = (await fetch("/api/status").then((response) =>
      response.json(),
    )) as Status;
    setStatus(next);
    if (!selected && next.runs[0]) setSelected(next.runs[0].id);
    if (selected) {
      const run = (await fetch(
        `/api/runs/${encodeURIComponent(selected)}`,
      ).then((response) => response.json())) as Run;
      next.runs = [run, ...next.runs.filter((item) => item.id !== run.id)];
      setStatus({ ...next });
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [selected]);
  async function createRun() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "idempotency-key": `ui:${crypto.randomUUID()}` },
      });
      const value = (await response.json()) as Run & { error?: string };
      if (!response.ok) throw new Error(value.error);
      setSelected(value.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start run");
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string) {
    if (!current) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/runs/${encodeURIComponent(current.id)}/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: name }),
        },
      );
      if (!response.ok)
        throw new Error(((await response.json()) as { error: string }).error);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  if (!status)
    return (
      <main className="loading" aria-busy="true">
        <div className="skeleton wide" />
        <div className="skeleton" />
        <div className="skeleton" />
      </main>
    );
  return (
    <Theme
      appearance="light"
      accentColor="orange"
      grayColor="slate"
      radius="large"
    >
      <a className="skip" href="#run-detail">
        Skip to run detail
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="chain">
            <img src="/tetherin-icon.png" alt="" />
          </span>
          <strong>TetherIn</strong>
        </div>
        <span className="mode">{status.diagnostics.mode.toUpperCase()}</span>
        <span className="repo">
          <GitBranch />
          {status.diagnostics.repository}
        </span>
        <span
          className={`preflight ${status.diagnostics.ready ? "ok" : "warn"}`}
        >
          <StatusIcon state={status.diagnostics.ready ? "READY" : "BLOCKED"} />
          Preflight {status.diagnostics.ready ? "ready" : "needs attention"}
        </span>
        <Diagnostics data={status.diagnostics} />
      </header>
      <div className="shell">
        <nav className="history" aria-label="Run history">
          <div className="history-head">
            <span>Recent runs</span>
            <Button
              onClick={createRun}
              disabled={busy || !status.diagnostics.ready}
              size="1"
            >
              <Play weight="fill" />
              Generate demo PR
            </Button>
          </div>
          {status.runs.length ? (
            <ul>
              {status.runs.map((run) => (
                <li key={run.id}>
                  <button
                    className={run.id === current?.id ? "selected" : ""}
                    onClick={() => setSelected(run.id)}
                  >
                    <span className="run-state">
                      <StatusIcon state={run.state} />
                      {run.state.replaceAll("_", " ")}
                    </span>
                    <span>
                      {run.provider} ·{" "}
                      {new Date(String(run.updated_at)).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {run.pr_url && (
                      <ArrowSquareOut aria-label="Pull request available" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <LinkSimple />
              <strong>No migration runs yet</strong>
              <span>
                Start with the retained fixture or live Stripe comparison.
              </span>
            </div>
          )}
        </nav>
        <main id="run-detail" className="control" tabIndex={-1}>
          {error && (
            <div className="error" role="alert">
              <Warning />
              {error}
            </div>
          )}
          {current ? (
            <RunDetail run={current} busy={busy} onAction={action} />
          ) : (
            <EmptyControl />
          )}
        </main>
      </div>
      <div className="sr-only" aria-live="polite">
        {current ? `Run ${current.id} is ${current.state}` : "No run selected"}
      </div>
    </Theme>
  );
}

function Diagnostics({ data }: { data: Status["diagnostics"] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="icon-button" aria-label="Open diagnostics">
          <GearSix />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Local diagnostics</Dialog.Title>
          <Dialog.Description>
            Preflight evidence for this laptop-only control room.
          </Dialog.Description>
          <div className="diagnostics">
            {data.checks.map((check) => (
              <div key={check.name}>
                <StatusIcon
                  state={check.status === "ready" ? "READY" : "BLOCKED"}
                />
                <strong>{check.name}</strong>
                <span>{check.detail}</span>
              </div>
            ))}
          </div>
          <Dialog.Close asChild>
            <button className="close" aria-label="Close diagnostics">
              <X />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RunDetail({
  run,
  busy,
  onAction,
}: {
  run: Run;
  busy: boolean;
  onAction: (name: string) => void;
}) {
  const events = run.events ?? [];
  const artifacts = run.artifacts ?? [];
  const stages = run.stages ?? [];
  const running = [
    "DETECTING_CHANGE",
    "CHANGE_DETECTED",
    "CALCULATING_IMPACT",
    "IMPACT_CONFIRMED",
    "MIGRATING",
    "TESTING",
    "CREATING_PR",
    "GREPTILE_REVIEW",
    "VALIDATING",
  ].includes(run.state);
  return (
    <>
      <div className="run-title">
        <div>
          <span className="eyebrow">{run.provider} migration</span>
          <h1>{run.state.replaceAll("_", " ")}</h1>
          <p className="mono">
            {run.id} · base {short(run.consumer_base_sha)}
          </p>
        </div>
        {run.pr_url && (
          <a
            className="pr-link"
            href={run.pr_url}
            target="_blank"
            rel="noreferrer"
          >
            Draft PR <ArrowSquareOut />
          </a>
        )}
      </div>
      <div
        className={`live-activity ${running ? "running" : "settled"}`}
        role="status"
      >
        <span className="activity-icon">
          {running ? (
            <CircleNotch className="spin" />
          ) : (
            <StatusIcon state={run.state} />
          )}
        </span>
        <div>
          <span className="eyebrow">LIVE ACTIVITY</span>
          <strong>
            {activityCopy[run.state] ?? run.state.replaceAll("_", " ")}
          </strong>
        </div>
        <code>{new Date(String(run.updated_at)).toLocaleTimeString()}</code>
      </div>
      <section className="stage-rail" aria-label="Workflow stages">
        {stages.map((stage) => (
          <div key={String(stage.stage)} className={`stage ${stage.status}`}>
            <span>{stageNames[String(stage.stage)]}</span>
            <strong>{String(stage.status).replaceAll("-", " ")}</strong>
          </div>
        ))}
      </section>
      <div className="evidence-grid">
        <EvidencePanel
          title="API change"
          overline="CONTRACT EVIDENCE"
          lines={[
            `Provider · ${run.provider}`,
            `Manifest · ${short(run.manifest_id, 24)}`,
            "oasdiff · v1.29.1, checksum enforced",
            "Stripe v1617 → v1618",
            "GET upcoming endpoints removed",
          ]}
        />
        <EvidencePanel
          title="Blast radius"
          overline="SOURCE · WRAPPERS · TESTS"
          lines={[
            "Deterministic rg + TypeScript AST",
            "Provider guidance alias supplement",
            "Greptile status recorded separately",
            "No finding is inferred from fixture evidence",
          ]}
        />
        <EvidencePanel
          title="Codex migration"
          overline="BOUNDED CHECKOUT"
          lines={[
            `Branch · ${short(run.branch_name, 34)}`,
            `Consumer head · ${short(run.current_head_sha)}`,
            "Allowed paths and commands enforced",
            "Official Codex SDK sidecar",
          ]}
        />
        <EvidencePanel
          title="Validation & PR"
          overline="EXACT-HEAD GATE"
          lines={[
            `Draft PR · ${run.pr_number ?? "pending"}`,
            "Configured repository checks",
            "Greptile freshness required",
            "Human merge required",
          ]}
        />
      </div>
      <section className="events">
        <div className="section-head">
          <div>
            <span className="eyebrow">APPEND-ONLY LEDGER</span>
            <h2>Event stream</h2>
          </div>
          <span>{events.length} events</span>
        </div>
        {events.length ? (
          <ol>
            {[...events].reverse().map((event) => (
              <li key={String(event.event_id)}>
                <time>
                  {new Date(String(event.occurred_at)).toLocaleTimeString()}
                </time>
                <span className="event-icon">
                  <StatusIcon
                    state={String(
                      (event.payload as Record<string, unknown>)?.state ??
                        event.type,
                    )}
                  />
                </span>
                <div>
                  <strong>{String(event.type).replaceAll(".", " · ")}</strong>
                  <p>
                    {String(
                      (event.payload as Record<string, unknown>)?.reason ??
                        (event.payload as Record<string, unknown>)
                          ?.manifestId ??
                        "Evidence recorded",
                    )}
                  </p>
                </div>
                <code>{short(event.payload_digest)}</code>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty small">
            The runner has not emitted an event yet.
          </div>
        )}
      </section>
      <section className="artifact-strip">
        <span>Evidence artifacts</span>
        {artifacts.length ? (
          artifacts.map((artifact) => (
            <code key={String(artifact.id)}>
              {String(artifact.kind)} · {short(artifact.sha256)}
            </code>
          ))
        ) : (
          <span>Awaiting first content-addressed artifact</span>
        )}
      </section>
      <footer className="actionbar">
        <div>
          <strong>Human remains in control</strong>
          <span>TetherIn creates drafts and never merges.</span>
        </div>
        <div>
          {(run.actions ?? []).map((name) => (
            <Button key={name} disabled={busy} onClick={() => onAction(name)}>
              {busy ? <CircleNotch className="spin" /> : <Play weight="fill" />}
              {actionLabels[name] ?? name}
            </Button>
          ))}
          {!(run.actions ?? []).length && (
            <Button disabled>
              {running ? "Workflow running" : "No action available"}
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}

function EvidencePanel({
  title,
  overline,
  lines,
}: {
  title: string;
  overline: string;
  lines: string[];
}) {
  return (
    <section className="evidence">
      <span className="eyebrow">{overline}</span>
      <h2>{title}</h2>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
function EmptyControl() {
  return (
    <div className="empty-control">
      <div className="instrument">
        <LinkSimple />
      </div>
      <span className="eyebrow">LOCAL CONTROL ROOM</span>
      <h1>Ready to trace a migration</h1>
      <p>
        Start a run to compare the official contract, confirm consumer impact,
        and prepare a human-reviewed draft pull request.
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
