# TetherIn local control-room design contract

This file is a build specification, not visual inspiration. Person C must
implement and verify every required surface and state with running components.
Do not substitute generated screenshots, static mock data, or a marketing page.

## Design read and dials

**Design read:** a local developer control room for hackathon judges and
engineers, expressed as a calm, precise, premium physical instrument translated
to software.

```text
DESIGN_VARIANCE=5
MOTION_INTENSITY=4
VISUAL_DENSITY=6
```

- Variance 5 permits an ownable instrument-panel composition and asymmetric
  evidence workspace without becoming theatrical.
- Motion 4 reserves animation for state transition, progress, disclosure, and
  action feedback. There is no perpetual decorative movement.
- Density 6 keeps provenance, code, tests, review, and event evidence visible to
  engineers while preserving clear grouping and scan paths.

The required design-taste skill explicitly excludes dashboards. We used its
brief inference, one-system rule, anti-slop vocabulary, material restraint,
accessibility checks, responsive planning, and preflight discipline. We did not
apply landing-page hero, conversion, social-proof, or image-generation rules to
this product UI. Radix Themes and Primitives are the dashboard-appropriate
accessible foundation.

## Experience principles

1. **Evidence before decoration.** Every visual element helps locate a state,
   provenance fact, affected usage, diff, check, review, or safe action.
2. **Physical, not skeuomorphic.** Paired tonal shadows imply a machined control
   surface. Borders, spacing, and typography still carry hierarchy. Most content
   remains flat.
3. **One controlled signal.** The supplied orange family marks the brand,
   keyboard focus, current workflow position, primary safe action, and selected
   high-signal evidence. It is not a generic status color.
4. **Truth is structural.** Icons, text, borders, and subtle textures communicate
   errors and origin. Color is never the only signal.
5. **A run is inspectable.** The current stage, exact evidence, last transition,
   allowed action, and human-merge requirement are always reachable without
   changing screens repeatedly.

## Foundation and theme lock

Use one component system:

```text
React 19 + Next.js App Router
@radix-ui/themes + Radix Primitives
native CSS variables and CSS Modules
@phosphor-icons/react only
Geist + Geist Mono
```

Do not add another component kit or icon set. Use Radix Dialog, AlertDialog,
Tooltip, Tabs or TabNav, ScrollArea, Separator, Skeleton, VisuallyHidden, and
layout primitives where their semantics fit. Use native table, code, and
landmark elements when they are more accessible than a custom primitive.

The app has one locked pearl/smoke light theme. This is intentional: judges view
one meticulously tuned local instrument surface, evidence screenshots remain
consistent, and a rushed dark palette would weaken contrast and tactile shadow
logic. Do not show a dark-mode switch or claim dark support. Ignore operating
system color preference for this hackathon build while still honoring reduced
motion and increased contrast preferences.

Use `docs/assets/tetherin-icon.webp` or its PNG fallback with intrinsic size and
alt text. Render **TetherIn** as live text. Never use the source artwork's
misspelled wordmark.

## Design tokens

Define the tokens once in `apps/web/styles/tokens.css`. Radix token overrides and
custom components consume the same values.

### Color

```css
:root {
  color-scheme: light;

  --color-canvas: #e5e9ec;
  --color-surface: #eef1f3;
  --color-surface-raised: #f3f5f6;
  --color-surface-sunken: #dce1e5;
  --color-surface-selected: #f0dfd7;
  --color-border-soft: #c5ccd2;
  --color-border-strong: #8f9aa4;
  --color-border-critical: #4b535a;

  --color-text-primary: #252b30;
  --color-text-secondary: #4b565f;
  --color-text-muted: #5e6871;
  --color-text-disabled: #747e86;

  --color-orange-brand: #f25522;
  --color-orange-action: #a93400;
  --color-orange-soft: #f0d8cd;
  --color-on-orange: #f3f5f6;

  --color-focus-inner: #f25522;
  --color-focus-outer: #252b30;
}
```

There is no pure white or black. Orange variants are one hue family, not
multiple accents. Semantic failure uses graphite text, `WarningOctagon`, a
strong border, and a fine diagonal hatch at 8 percent opacity. Success uses
`CheckCircle` plus label and border, not green. Pending uses `ClockCountdown` plus
label and an inset track, not yellow. Never create a rainbow state palette.

Measured WCAG contrast anchors:

| Pair | Ratio |
| --- | ---: |
| primary text on surface | 12.62:1 |
| secondary text on surface | 6.62:1 |
| muted text on surface | 5.01:1 |
| orange action text on surface | 5.82:1 |
| on-orange text on orange action | 6.04:1 |
| muted text on canvas | 4.66:1 |

Recheck computed styles in browser. Do not infer compliance from this table if
opacity, font weight, overlays, or a different background changes the pair.

### Typography

```css
--font-sans: "Geist", system-ui, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;

--text-11: 0.6875rem/1rem;
--text-12: 0.75rem/1.1rem;
--text-13: 0.8125rem/1.2rem;
--text-14: 0.875rem/1.3rem;
--text-16: 1rem/1.45rem;
--text-20: 1.25rem/1.65rem;
--text-28: 1.75rem/2rem;
```

- Use `--text-28` only for the run title, never a marketing headline.
- Body and control text default to 14px; dense metadata may use 12px.
- IDs, SHAs, times, paths, commands, code, and numeric counts use Geist Mono
  with `font-variant-numeric: tabular-nums slashed-zero`.
- Labels use sentence case. Do not use tracked all-caps except the short fixed
  origin stamps `LIVE`, `FIXTURE`, and `RETAINED REAL`.
- Visible UI copy contains no emoji and no em dash character.

### Spacing and sizing

Use a 4px base rhythm:

```text
space-1 4px    space-2 8px    space-3 12px   space-4 16px
space-5 20px   space-6 24px   space-8 32px   space-10 40px
space-12 48px  space-16 64px
```

- Top bar: 56px.
- Desktop run rail: 236px.
- Workflow rail: 56px tall desktop, auto-height mobile.
- Activity column: 304px at wide desktop.
- Primary controls: 40px minimum height; icon-only controls: 40px square.
- Pointer targets: at least 24 by 24px with 8px separation; primary actions are
  at least 40px tall.
- Main content max width: 1760px. Evidence columns may grow; prose lines stop at
  72 characters. Code uses horizontal scrolling inside its surface, never the
  document viewport.

### Radius

```text
radius-1 4px   small inline tags, code chips, focusable icon frames
radius-2 8px   buttons, fields, rows, compact surfaces
radius-3 12px  evidence panels, dialogs, stage workspace
radius-4 16px  app-level raised instrument chassis only
```

No `9999px` radius. Origin stamps and statuses are compact rectangles, not
pills. Nested children use the next smaller radius than their parent.

### Borders, shadows, and elevation

```css
--border-hairline: 1px solid var(--color-border-soft);
--border-emphasis: 1px solid var(--color-border-strong);

--shadow-raised-1:
  -3px -3px 7px rgb(248 250 251 / 0.78),
   3px  3px 8px rgb(91 104 115 / 0.16),
   inset 0 1px 0 rgb(248 250 251 / 0.55);

--shadow-raised-2:
  -6px -6px 14px rgb(248 250 251 / 0.74),
   7px  7px 18px rgb(83 96 107 / 0.18),
   inset 0 1px 0 rgb(248 250 251 / 0.58);

--shadow-inset:
  inset 2px 2px 5px rgb(91 104 115 / 0.18),
  inset -2px -2px 5px rgb(248 250 251 / 0.68);
```

Elevation meanings are fixed:

| Level | Treatment | Use |
| --- | --- | --- |
| 0 | flat surface plus hairline | lists, evidence rows, tables, event stream |
| 1 | `raised-1` | top bar controls, primary action, active compact control |
| 2 | `raised-2` | one stage workspace chassis or open dialog only |
| inset | `shadow-inset` | current workflow track, pressed button, code gutter |

Do not raise every panel. A page may have one level-2 chassis and at most six
simultaneous level-1 controls in the viewport. Hover raises by at most 1px;
active returns to `translateY(1px)` and inset shadow.

### Z-index

```text
z-base 0       z-sticky 10       z-rail 20
z-popover 40   z-dialog 60       z-toast 80
```

Portalled Radix layers retain their library stacking behavior. Do not add
arbitrary four-digit values.

### Motion

```css
--duration-instant: 80ms;
--duration-fast: 120ms;
--duration-standard: 180ms;
--duration-stage: 240ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
```

- Animate only `transform` and `opacity` for layout-adjacent feedback.
- Workflow state change: old content opacity 1 to 0 in 80ms, current marker
  translates 6px and fades in over 180ms, new content fades in over 180ms.
- Button press: translate 1px over 80ms, then restore over 120ms.
- Drawer/dialog: opacity plus 8px transform over 180ms.
- Event insertion: one 4px translate and opacity transition over 180ms.
- Skeletons match final geometry and remain static. No shimmer loop.
- There are no looping spinners. For operations over 400ms, use a progress icon
  with screen-reader text and a finite transition when status changes.
- Under `prefers-reduced-motion: reduce`, set all durations to 1ms, remove
  transforms, disable smooth scrolling, and keep state changes immediate.

## Information architecture and routes

```text
/
└── redirect to /runs
/runs
├── empty history or latest-run selection
└── read-only retained-real entry when configured
/runs/[runId]
├── ?stage=api-change
├── ?stage=blast-radius
├── ?stage=codex-migration
└── ?stage=validation-pr
/diagnostics
└── setup readiness, versions, connectivity, safe redacted copy
```

The URL identifies selected run and stage so refresh and browser navigation are
stable. Workflow progression does not rely on changing the URL. Diagnostics is
not a setup wizard or account page.

### Desktop layout, 1280px and wider

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ [chain] TetherIn  [LIVE]  owner/repo  Preflight ready   [Diagnostics]   │ 56
├───────────────┬──────────────────────────────────────────────────────────┤
│ Run history   │ Run title, source range, current head         Actions   │
│ 236px         ├──────────────────────────────────────────────────────────┤
│               │ API Change ─ Blast Radius ─ Codex Migration ─ Val + PR │ 56
│ Today         ├──────────────────────────────────────┬───────────────────┤
│ selected run  │                                      │ Activity          │
│ prior run     │ Active stage evidence workspace      │ 304px             │
│               │ minmax(0, 1fr)                       │ event chronology  │
│ Retained run  │                                      │                   │
│               │                                      │                   │
├───────────────┴──────────────────────────────────────┴───────────────────┤
│ Context-sensitive run action bar, sticky inside app shell               │ 64
└──────────────────────────────────────────────────────────────────────────┘
```

The page viewport does not scroll. Top bar and action bar remain fixed; run
history, evidence workspace, and activity stream each own a labeled ScrollArea.
Avoid nested scroll regions inside evidence except code/diff horizontal scroll.

### Compact desktop and tablet, 768px to 1279px

- Run rail collapses to a 72px icon plus short-ID rail at 1024px and to a Radix
  drawer below 900px.
- Activity becomes a 320px right drawer opened by **Activity** with unread event
  count expressed as text, not a decorative dot.
- Main stage workspace occupies the remaining width; two-column evidence groups
  collapse when either column would be narrower than 320px.
- Workflow rail remains horizontal and keyboard-scrollable. Labels remain the
  four stage names and never become generic numbered steps.
- At 768px exact, no document horizontal scroll is allowed.

### Mobile, below 768px

- Top bar becomes two rows, 52px plus a 40px context strip. First row contains
  menu, chain/TetherIn, mode stamp, and diagnostics. Second contains truncated
  `owner/repo` and preflight text with accessible full values.
- Run history is a left drawer. Opening it traps focus; Escape closes and returns
  focus to the trigger.
- Workflow rail is a horizontally scrollable tab list with 16px edge padding,
  snap alignment, visible focus, and no hidden stage names.
- Evidence is one column with 16px page gutters. Tables become labeled definition
  lists or row stacks. SHA/source pairs wrap at characters; code scrolls.
- Activity is a full-height bottom sheet triggered from the run header.
- Action bar is sticky at the bottom, one primary full-width action plus a
  **More actions** menu. It never overlays focused content; include safe-area
  padding and 96px content-bottom reserve.
- Diff defaults to changed-file list plus one selected hunk. Unified and split
  modes are not both required on mobile.

## Core data model for the UI

```ts
type EvidenceOrigin = "live" | "fixture" | "retained-real";

type WorkflowState =
  | "READY"
  | "DETECTING_CHANGE"
  | "CHANGE_DETECTED"
  | "CALCULATING_IMPACT"
  | "IMPACT_CONFIRMED"
  | "MIGRATING"
  | "TESTING"
  | "CREATING_PR"
  | "GREPTILE_REVIEW"
  | "VALIDATING"
  | "PR_READY"
  | "TESTS_FAILED"
  | "GREPTILE_PENDING"
  | "GREPTILE_BLOCKED"
  | "NEEDS_INPUT"
  | "FAILED";

type StageId =
  | "api-change"
  | "blast-radius"
  | "codex-migration"
  | "validation-pr";

interface RunView {
  id: string;
  mode: "live" | "fixture";
  evidenceOrigin: EvidenceOrigin;
  state: WorkflowState;
  activeStage: StageId;
  lastStableStage: StageId;
  provider: "openai" | "stripe" | "twilio";
  manifestId: string | null;
  consumerRepo: string;
  consumerBaseSha: string;
  currentHeadSha: string | null;
  branchName: string | null;
  pullRequest: PullRequestSummary | null;
  stages: Record<StageId, StageProjection>;
  allowedActions: RunAction[];
  latestSequence: number;
  createdAt: string;
  updatedAt: string;
}

interface StageProjection {
  status: "not-started" | "ready" | "active" | "complete" | "degraded" | "blocked" | "failed" | "stale";
  summary: string;
  evidenceDigest: string | null;
  boundHeadSha: string | null;
  limitations: string[];
}
```

The server computes `activeStage`, projections, and allowed actions from SQLite.
The browser never derives authorization from button visibility.

## State-to-stage mapping

| Workflow state | Active stage | Workflow rail treatment | Primary action |
| --- | --- | --- | --- |
| `READY` | API Change | ready, orange focus only when selected | Run migration |
| `DETECTING_CHANGE` | API Change | active, inset track | None; show bounded activity |
| `CHANGE_DETECTED` | Blast Radius | API Change complete | Calculate impact, normally automatic |
| `CALCULATING_IMPACT` | Blast Radius | active, inset track | None |
| `IMPACT_CONFIRMED` | Codex Migration | prior stages complete | Run migration |
| `MIGRATING` | Codex Migration | active | None |
| `TESTING` | Codex Migration | active with **Running checks** | None |
| `TESTS_FAILED` | Codex Migration | blocked pattern and icon | Retry checks or Needs input |
| `CREATING_PR` | Validation & PR | active with exact head | None |
| `GREPTILE_REVIEW` | Validation & PR | active with review ID | None |
| `GREPTILE_PENDING` | Validation & PR | pending icon and label | Resume review |
| `GREPTILE_BLOCKED` | Validation & PR | blocked pattern and finding count text | Run one follow-up |
| `VALIDATING` | Validation & PR | active with gate reasons updating | None |
| `PR_READY` | Validation & PR | complete, check icon and orange PR action | Open draft PR |
| `NEEDS_INPUT` | `lastStableStage` | strong border, HandPalm icon, reason | Only the explicitly safe resolution |
| `FAILED` | `lastStableStage` | strong border, WarningOctagon, error code | Retry only if server allows |

Fixture completion never maps to live `PR_READY`. Use a `complete` stage status
with the fixed statement **Fixture complete. Live evidence is still required.**

## Component inventory and contracts

### Shell and navigation

```ts
interface AppShellProps {
  run: RunView | null;
  preflight: PreflightView;
  history: RunListItem[];
  children: React.ReactNode;
}

interface TopBarProps {
  evidenceOrigin: EvidenceOrigin;
  consumerRepo: string;
  preflight: "ready" | "degraded" | "failed" | "fixture";
  onOpenDiagnostics(): void;
}

interface RunHistoryRailProps {
  runs: RunListItem[];
  selectedRunId: string | null;
  retainedRunId: string | null;
  loading: boolean;
}
```

- `AppShell` provides `<a href="#run-main">Skip to run detail</a>`, top bar,
  navigation landmark, main landmark, and action bar slot.
- `ModeStamp` is a compact bordered rectangle. `LIVE` uses orange left border;
  `FIXTURE` uses diagonal texture and `Flask`; `RETAINED REAL` uses `ArchiveBox`
  and capture date. It is never an unlabeled color chip.
- History rows show provider icon treatment using Phosphor's generic `BracketsCurly`
  plus text, short manifest ID, state text, and relative time with exact time in
  `<time>`. No provider brand SVG is needed.
- Empty history says **No runs yet. Complete preflight, then start the prepared
  provider change.** It does not invent examples.

### Run header, workflow rail, and actions

```ts
interface RunHeaderProps {
  title: string;
  provider: RunView["provider"];
  sourceRange: { oldSha: string; newSha: string } | null;
  consumerRepo: string;
  currentHeadSha: string | null;
  onOpenActivity(): void;
}

interface WorkflowRailProps {
  selectedStage: StageId;
  activeStage: StageId;
  projections: RunView["stages"];
  onSelect(stage: StageId): void;
}

interface RunActionBarProps {
  state: WorkflowState;
  actions: RunAction[];
  submittingIntentKey: string | null;
  prUrl: string | null;
  retainedRunId: string | null;
}
```

- Stage labels are exactly **API Change**, **Blast Radius**, **Codex Migration**,
  and **Validation & PR**. Never display `Step 1`.
- Completed stages remain inspectable. A selected historical stage has orange
  underline; the actual current stage also has text **Current** for assistive
  technology.
- `RunActionBar` renders only server-allowed actions, submits a unique intent,
  disables duplicate intent immediately, and handles `409` by refreshing. It
  never assumes disabled UI is a safety boundary.
- Destructive local reset is absent from the run action bar. It lives in
  diagnostics behind an AlertDialog with exact run-ID confirmation.

### API Change

```ts
interface ProvenanceLedgerProps {
  provider: string;
  repositoryUrl: string;
  oldSource: SourceRevision;
  newSource: SourceRevision;
  oasdiff: { version: string; releaseUrl: string; rawSha256: string; command: string[] };
  manifest: { id: string; sha256: string; schemaVersion: string };
}

interface NormalizedChangeListProps {
  changes: Array<{
    fingerprint: string;
    severity: "error" | "warning" | "info";
    breaking: boolean;
    method: string;
    path: string;
    operationId: string;
    subjectKind: string;
    subjectName: string;
    text: string;
    oldSourceUrl: string;
    schemaExcerptOld: unknown;
    schemaExcerptNew: unknown | null;
  }>;
}
```

Use a two-band layout: compact immutable provenance ledger, then normalized
change list. Source URLs open in a new tab with visible external-link icon and
safe `rel`. SHA copy controls announce **Copied source SHA** without exposing a
toast-only state.

Do not collapse the raw digest into a tooltip. Use 12 monospace characters in
the main row and an accessible disclosure for the full value.

### Blast Radius

```ts
interface ImpactEvidenceListProps {
  groups: Array<{
    kind: "source" | "wrapper" | "tests" | "downstream";
    items: ImpactEvidenceItem[];
  }>;
  completeness: "complete" | "partial" | "unavailable";
  limitations: string[];
  greptileAvailability: string;
  deterministicStatus: string;
}

interface ImpactEvidenceItem {
  path: string;
  lineStart: number;
  lineEnd: number;
  symbol: string | null;
  whyAffected: string;
  confidence: number;
  confirmation: "confirmed" | "possible" | "rejected";
  evidence: Array<{ source: string; reference: string; untrusted?: boolean }>;
}
```

- Render four semantic groups even when empty, with a factual empty message.
- A row leads with path and symbol, then why, confirmation, confidence as text
  and tabular number, and source provenance. Do not use a decorative confidence
  progress bar.
- `confirmed`, `possible`, and `rejected` use icon plus text. Greptile-only
  evidence explicitly says **Possible. Not confirmed in source.**
- Partial/truncated results begin with a strong bordered limitation callout and
  list exact reason. Never write **All usages found** unless the report's
  deterministic status and completeness policy permit it.
- Untrusted KB snippets render as quoted code/data with `ShieldWarning`; links or
  instructions inside them are inert text.

### Codex Migration

```ts
interface CodexActivityProps {
  status: "not-started" | "running" | "complete" | "failed" | "needs-input";
  threadDigest: string | null;
  pass: 1 | 2 | null;
  boundedLimits: Record<string, number>;
  summary: string | null;
  commands: CommandReceipt[];
}

interface ChangedFilesProps {
  files: Array<{ path: string; additions: number; deletions: number; category: string }>;
  selectedPath: string | null;
  onSelect(path: string): void;
}

interface DiffViewerProps {
  path: string;
  hunks: DiffHunk[];
  boundHeadSha: string;
  redacted: boolean;
}
```

Use a 240px changed-file navigator plus focused unified diff at desktop. Diff
lines use semantic table rows with line-number headers, copy-safe text, and
graphite/orange-tint additions or removals distinguished by `+`/`-`, labels, and
border pattern. Do not rely on red/green. Long diffs virtualize after 1,000
rendered lines and retain keyboard selection.

The activity panel shows real bounded actions, not hidden chain-of-thought or
raw model transcript. Display safe summaries, command receipts, changed-file
counts derived from Git, pass number, and limit utilization only when measured.

### Validation & PR

```ts
interface ValidationPanelProps {
  pr: PullRequestSummary | null;
  testedHeadSha: string | null;
  currentHeadSha: string | null;
  checks: CommandReceipt[];
  review: ReviewEvidenceView | null;
  gate: { decision: "pass" | "fail" | "pending"; reasons: string[]; humanApprovalRequired: true } | null;
}

interface GateSummaryProps {
  decision: "pass" | "fail" | "pending";
  reasons: string[];
  exactHead: string;
  evidenceOrigin: EvidenceOrigin;
  humanApprovalRequired: true;
  prUrl: string | null;
}
```

The layout order is exact head, local checks, deterministic coverage, Greptile
review, composite gate, then PR action. Every block states the SHA it applies to.
If tested, reviewed, and current SHAs differ, place them adjacent and mark old
evidence **Stale. Re-run required.**

Greptile displays documented upstream status, review ID, retrieved time,
unchanged-head inference, `hasNewCommitsSinceReview`, and each unaddressed
comment. Do not label the inference as an upstream reviewed-SHA guarantee.

`PR_READY` presents the primary orange **Open draft PR** action. The text directly
below is **Human merge required. TetherIn never auto-merges.** No merge control
exists.

### Activity and diagnostics

```ts
interface EventStreamProps {
  events: WorkflowEventView[];
  newestSequence: number;
  connection: "live" | "reconnecting" | "offline";
}

interface DiagnosticsViewProps {
  checkedAt: string;
  entries: Array<{
    id: string;
    label: string;
    status: "pass" | "degraded" | "fixture" | "fail";
    safeDetail: string;
    versionOrDigest?: string;
  }>;
  copySafeText: string;
}
```

Events show exact local time, actor icon and text, transition, safe description,
sequence, and expandable payload digest. Preserve chronological order and group
by date with a sticky label. Reconnection text never claims the workflow
stopped; SQLite remains source of truth.

Diagnostics includes Bun, Node sidecar, Git, `rg`, `jq`, `gh` auth status without
token, oasdiff version/hash, SQLite path shortened to repo-relative form,
consumer repo/remote/clean state, Codex connectivity, Greptile mode/KB/review
readiness, and last check time. **Copy redacted diagnostics** must pass secret
canary tests.

## Full stage state matrix

| Stage | Not started / empty | Active / loading | Complete | Degraded / pending | Failed / blocked / stale |
| --- | --- | --- | --- | --- | --- |
| API Change | **No contract change loaded.** Show source selector summary and only allowed run action. | Static skeletons match provenance rows and two change rows; text says **Comparing official revisions with oasdiff 1.29.1.** | Exact source, raw digest, manifest, and normalized changes. | Source cache retained but network unavailable: show retained/fixture origin and no live-ready implication. | Hash/version/schema mismatch gets strong border, `WarningOctagon`, error code, source facts retained, and no continue action. |
| Blast Radius | **Impact analysis starts after a validated manifest.** Four group headings remain visible with zero counts from data. | Skeleton path rows sized like final evidence; announce **Calculating impact in the configured repository.** | Grouped evidence, completeness, provenance, and limitations. | KB unavailable/truncated or deterministic partial: show exact reason and `GREPTILE_PENDING` where appropriate. | Base SHA mismatch, path escape, analyzer failure, or unresolved required evidence: block migration and show safe retry/needs-input reason. |
| Codex Migration | **No patch yet. Confirm impact before running Codex.** | Bounded activity, pass 1 or 2, limits, selected file skeleton, and polite state announcement. | Safe summary, changed files, focused diff, commands, exact patch head. | `TESTING` is active; `TESTS_FAILED` retains diff and exact failing commands. | Policy violation or business decision uses `NEEDS_INPUT`; timeout/crash uses typed failure and only server-allowed retry. Old diff after head drift says stale. |
| Validation & PR | **A draft PR is created only after required checks pass.** | Exact-head skeleton, check rows, review ID/status, and gate reasons update from events. | Live gate pass shows `PR_READY`, draft PR link, exact head, and human requirement. Fixture complete uses explicit non-live statement. | `GREPTILE_PENDING` shows current documented status and retained-real navigation. No timer promises. | Unaddressed findings use `GREPTILE_BLOCKED`; stale head, failed/skipped review, or check drift shows exact invalidated evidence and bounded next action. |

Global states:

- Loading initial run: preserve shell geometry, rail rows, stage rail, main title,
  and activity column with static skeleton blocks. Do not show a blank page.
- No selected run: keep top bar/rail/diagnostics; main says **Select a run or
  start the prepared change after preflight passes.**
- Lost local connection: use persistent top callout **Dashboard disconnected
  from the local runner. Workflow evidence remains in SQLite. Reconnecting.**
- `NEEDS_INPUT`: focus the reason heading after transition, list the exact human
  decision needed, and disable all unrelated actions.
- `FAILED`: retain prior evidence and error code. Never replace the whole page
  with an error illustration.

## Live, fixture, and retained-real treatment

| Origin | Persistent treatment | Allowed outcome |
| --- | --- | --- |
| live | `LIVE` stamp, orange left rule, current repo/head, no texture | `PR_READY` only if exact Person B gate passes |
| fixture | `FIXTURE` stamp with `Flask`, 8px diagonal graphite texture on workspace edge, every evidence heading prefixed for screen readers with **Fixture evidence** | fixture-complete only; remote write and live PR actions disabled |
| retained-real | `RETAINED REAL` with `ArchiveBox`, captured date, locked read-only action bar, original PR/SHAs/timestamps | display historical real result; never satisfy current live run |

Origin persists through URL response, SQLite, screenshots, copied diagnostics,
PR body, and every exported artifact. A fallback switch changes selected run,
not the active run's origin.

## Realistic copy from the committed OpenAI fixture

Use these strings only when the underlying fixture fields match. Do not use them
for Stripe, Twilio, or a live run with different evidence.

```text
Title
OpenAI project geography removal

Source range
13c6a94f → f85dbe2

Change 1
Request property removed
POST /organization/projects
create-project
removed the request property `geography`

Change 2
Request property removed
POST /organization/projects/{project_id}
modify-project
removed the request property `geography`

Diff evidence
oasdiff 1.29.1
Raw output 07640494838e…
2 breaking warnings

Fixture gate
Fixture complete. Live evidence is still required.
```

Old/new commits, spec hashes, release commit, source line locations, schema
excerpts, and full raw digest come directly from
`contracts/examples/openai-geography.manifest.json`. Consumer paths, candidate
counts, Codex results, checks, Greptile findings, PR URLs, durations, and
confidence values must come from the selected run. Never invent them for copy.

## Accessibility contract

- Meet WCAG 2.2 AA. Automated checks are necessary but manual keyboard and
  screen-reader passes are required.
- First focusable item is a visible-on-focus skip link to `#run-main`.
- Landmark order: banner, navigation, main, complementary activity, contentinfo
  only if meaningful. One `<h1>` per route; stage surfaces use ordered headings.
- Desktop focus order follows top bar, run rail, run header, workflow rail,
  stage evidence, activity trigger/stream, action bar. Drawers trap and restore
  focus through Radix.
- Every icon-only control has an accessible name and tooltip on hover and focus.
  Decorative Phosphor icons use `aria-hidden`.
- Focus uses 2px orange inner plus 1px graphite outer ring with 2px offset. It is
  visible on every surface and never removed for pointer users.
- A polite `aria-live="polite"` region announces workflow transitions once:
  **State changed to Testing. Required checks are running for head abc1234.**
  Use assertive only for destructive guard refusal or lost local connection.
- Stage rail uses tabs only if panels follow the ARIA tabs keyboard pattern;
  otherwise use links with `aria-current="page"`. Do not mix semantics.
- Status always includes visible text and screen-reader text. Texture, icon, and
  border reinforce it; color never stands alone.
- Tables have captions, row/column headers, and a responsive semantic fallback.
  Code/diff surfaces expose file name, hunk label, line numbers, and change type.
- Truncated visible text retains the full value in accessible text and a
  copy control. Tooltips never contain essential-only information.
- Honor `prefers-reduced-motion`. Test at 200 percent zoom and 320 CSS pixels
  without loss of content or horizontal page scroll.
- Do not steal common browser shortcuts. Workflow shortcuts, if added, require a
  discoverable help dialog and avoid single printable keys.

## Performance contract

- First local navigation renders shell and last persisted projection without
  waiting for external calls. External work runs only in the runner.
- Target LCP under 2.5s, INP under 200ms, CLS under 0.1 on the judges' laptop.
- Reserve icon, mode stamp, skeleton, code gutter, and dynamic status dimensions
  to avoid shifts.
- Import Phosphor icons individually. Do not load a full icon barrel into every
  client bundle.
- Prefer server components for static layout/data reads. Client components are
  narrow islands for actions, drawers, tabs, diff selection, and event updates.
- Virtualize event lists after 300 items and diff lines after 1,000 rendered
  lines. Preserve search and accessible item count.
- Poll only while a run is nonterminal, back off when the tab is hidden, and
  resume from `latestSequence`. A local SSE reconnect must request missed events.
- Use no charting, animation, WebGL, remote image, or general code-editor library
  unless a measured requirement proves it necessary.
- Self-host Geist through the framework font loader and preload only used weights.

## Visual and behavior QA matrix

Use Playwright with deterministic fixture projections for layout tests. Fixture
screens must visibly say fixture. Use real retained-run data only after an actual
run is captured. Never use visual fixtures as product evidence.

Capture full viewport screenshots at:

| Viewport | Required scenarios |
| --- | --- |
| 1440×900 | live API Change, live Blast Radius partial, Codex diff, Greptile pending, live PR ready, diagnostics |
| 1280×800 | history rail, activity column, tests failed, needs input |
| 1024×768 | collapsed run rail, activity drawer closed/open, long source path |
| 768×1024 | exact breakpoint, all four stage names, stacked evidence, focus ring |
| 390×844 | top-bar two rows, history drawer, stage scroller, diff hunk, sticky action bar |
| 320×800 at 200% zoom | no page overflow, no clipped action, readable gate reasons |

Also capture component-state snapshots for empty history, initial skeleton,
runner disconnected, fixture complete, retained-real read-only, `TESTS_FAILED`,
`GREPTILE_BLOCKED`, and stale-head invalidation. There is no dark screenshot
matrix because dark mode is not offered.

For each screenshot, manually check:

- no pure white/black, purple, glow, blur/glass, generic equal-card grid,
  decorative dot, gradient status fill, emoji, Lucide icon, or fake metric;
- only orange family receives accent treatment;
- one level-2 chassis, restrained elevation, consistent radius nesting, and
  1px tonal borders remain legible;
- no status depends on color; focus is visible; text contrast remains AA;
- no document horizontal scroll; sticky areas do not obscure focused content;
- real IDs/times use tabular mono, links and copy targets are reachable;
- visible copy has no em dash character and no generic `Step 1` wording.

## Implementation acceptance checklist

### Foundation

- [ ] One Radix Themes/Primitives system; no second component kit.
- [ ] Phosphor is the only UI icon library; no hand-authored icon paths.
- [ ] Chain icon plus live TetherIn text; misspelled source wordmark unused.
- [ ] Locked pearl/smoke light theme, token file, no dark control.
- [ ] Color, type, spacing, radius, shadow, z-index, and motion tokens match.

### Information and truth

- [ ] Top bar, run history, run header, workflow rail, four stages, activity,
      action bar, and diagnostics are present.
- [ ] Every surface reads persisted run projections and artifacts, not constants.
- [ ] Exact source/engine/manifest provenance and full copyable values render.
- [ ] Impact groups include path, symbol, why, confidence, confirmation, source,
      completeness, and limitations.
- [ ] Codex shows bounded safe activity, changed files, focused diff, and no raw
      reasoning or transcript.
- [ ] Validation binds checks, Greptile, gate, and PR to exact head and shows
      human merge required.
- [ ] Live, fixture, and retained-real cannot be confused in API or UI.

### State and actions

- [ ] Every workflow state maps through the table above.
- [ ] Empty, skeleton, active, complete, partial, pending, blocked, failed,
      needs-input, stale, disconnected, fixture, and retained states are tested.
- [ ] Action buttons reflect server allowlist, prevent duplicate intent, recover
      from 409, and never expose reset or merge casually.
- [ ] Refresh/restart restores selected run, stage URL, projections, and events.

### Accessibility and responsiveness

- [ ] Skip link, landmarks, headings, focus order, drawer restore, labels,
      tooltips, live announcements, table semantics, and status text pass.
- [ ] Automated axe scan has zero serious/critical issues; manual keyboard pass
      has no trap or unreachable action.
- [ ] VoiceOver pass announces mode, repo, current stage/state, evidence labels,
      action result, and human requirement coherently.
- [ ] Reduced motion, increased contrast, 200 percent zoom, all QA widths, and
      320 CSS pixel reflow pass.

### Materiality, motion, and quality

- [ ] Shadows follow elevation meanings; most evidence is flat.
- [ ] All motion has state/feedback purpose, transform/opacity only, and no loop.
- [ ] Text and CTA contrasts are measured in computed browser output.
- [ ] Core Web Vitals targets pass on a local release build.
- [ ] Screenshot matrix reviewed at 100 percent zoom for overflow, clipping,
      hierarchy, spacing, token drift, and banned visual patterns.
- [ ] Visible copy reviewed for accuracy, grammar, no fake data, no emoji, and no
      em dash.

Person C is not visually done until every applicable box is checked with a link
to the test, screenshot, or manual QA note in its handoff.
