export const WORKFLOW_STATES = [
  "READY",
  "DETECTING_CHANGE",
  "CHANGE_DETECTED",
  "CALCULATING_IMPACT",
  "IMPACT_CONFIRMED",
  "MIGRATING",
  "TESTING",
  "CREATING_PR",
  "GREPTILE_REVIEW",
  "VALIDATING",
  "PR_READY",
  "NO_CHANGE",
  "NO_IMPACT",
  "TESTS_FAILED",
  "GREPTILE_PENDING",
  "GREPTILE_BLOCKED",
  "NEEDS_INPUT",
  "FAILED",
  "CANCELLED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];
export type StageId =
  "api-change" | "blast-radius" | "codex-migration" | "validation-pr";
export type EvidenceOrigin = "live" | "fixture" | "retained-real";

export const TRANSITIONS: Readonly<
  Record<WorkflowState, readonly WorkflowState[]>
> = {
  READY: ["DETECTING_CHANGE", "FAILED", "CANCELLED"],
  DETECTING_CHANGE: ["CHANGE_DETECTED", "NO_CHANGE", "FAILED", "CANCELLED"],
  CHANGE_DETECTED: ["CALCULATING_IMPACT", "FAILED", "CANCELLED"],
  CALCULATING_IMPACT: [
    "IMPACT_CONFIRMED",
    "NO_IMPACT",
    "NEEDS_INPUT",
    "FAILED",
    "CANCELLED",
  ],
  IMPACT_CONFIRMED: ["MIGRATING", "FAILED", "CANCELLED"],
  MIGRATING: ["TESTING", "NEEDS_INPUT", "FAILED", "CANCELLED"],
  TESTING: [
    "CREATING_PR",
    "TESTS_FAILED",
    "NEEDS_INPUT",
    "FAILED",
    "CANCELLED",
  ],
  TESTS_FAILED: ["TESTING", "MIGRATING", "NEEDS_INPUT", "CANCELLED"],
  CREATING_PR: ["GREPTILE_REVIEW", "NEEDS_INPUT", "FAILED", "CANCELLED"],
  GREPTILE_REVIEW: [
    "GREPTILE_PENDING",
    "GREPTILE_BLOCKED",
    "VALIDATING",
    "FAILED",
    "CANCELLED",
  ],
  GREPTILE_PENDING: ["GREPTILE_REVIEW", "NEEDS_INPUT", "CANCELLED"],
  GREPTILE_BLOCKED: ["MIGRATING", "NEEDS_INPUT", "CANCELLED"],
  VALIDATING: [
    "PR_READY",
    "GREPTILE_PENDING",
    "GREPTILE_BLOCKED",
    "NEEDS_INPUT",
    "FAILED",
    "CANCELLED",
  ],
  PR_READY: [],
  NO_CHANGE: [],
  NO_IMPACT: [],
  NEEDS_INPUT: [],
  FAILED: [],
  CANCELLED: [],
};

export class TransitionError extends Error {
  constructor(
    readonly from: WorkflowState,
    readonly to: WorkflowState,
  ) {
    super(`Transition ${from} -> ${to} is not allowed`);
    this.name = "TransitionError";
  }
}

export function transition(
  from: WorkflowState,
  to: WorkflowState,
): WorkflowState {
  if (!TRANSITIONS[from].includes(to)) throw new TransitionError(from, to);
  return to;
}

export function activeStage(state: WorkflowState): StageId {
  if (["READY", "DETECTING_CHANGE", "NO_CHANGE"].includes(state))
    return "api-change";
  if (["CHANGE_DETECTED", "CALCULATING_IMPACT", "NO_IMPACT"].includes(state))
    return "blast-radius";
  if (
    ["IMPACT_CONFIRMED", "MIGRATING", "TESTING", "TESTS_FAILED"].includes(state)
  )
    return "codex-migration";
  return "validation-pr";
}

export type RunAction =
  | "START_RUN"
  | "RETRY_IMPACT"
  | "RUN_MIGRATION"
  | "RETRY_CHECKS"
  | "RUN_FOLLOWUP"
  | "RESUME_REVIEW"
  | "CREATE_OR_OPEN_PR";

export function allowedActions(
  state: WorkflowState,
  followupCount = 0,
): RunAction[] {
  switch (state) {
    case "READY":
      return ["START_RUN"];
    case "IMPACT_CONFIRMED":
      return ["RUN_MIGRATION"];
    case "TESTS_FAILED":
      return ["RETRY_CHECKS"];
    case "GREPTILE_PENDING":
      return ["RESUME_REVIEW"];
    case "GREPTILE_BLOCKED":
      return followupCount < 1 ? ["RUN_FOLLOWUP"] : [];
    case "PR_READY":
      return [];
    default:
      return [];
  }
}

export function assertLiveReady(input: {
  state: WorkflowState;
  origin: EvidenceOrigin;
  gateDecision: string;
  exactHead: boolean;
  humanApprovalRequired: boolean;
}): void {
  if (
    input.state !== "PR_READY" ||
    input.origin !== "live" ||
    input.gateDecision !== "pass" ||
    !input.exactHead ||
    !input.humanApprovalRequired
  ) {
    throw new TransitionError(input.state, "PR_READY");
  }
}
