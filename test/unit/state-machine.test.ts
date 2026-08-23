import { describe, expect, it } from "vitest";
import {
  activeStage,
  allowedActions,
  assertLiveReady,
  transition,
} from "@tetherin/orchestrator";

describe("workflow state machine", () => {
  it("follows the successful golden path and exposes semantic actions", () => {
    let state = transition("READY", "DETECTING_CHANGE");
    state = transition(state, "CHANGE_DETECTED");
    state = transition(state, "CALCULATING_IMPACT");
    state = transition(state, "IMPACT_CONFIRMED");
    expect(activeStage(state)).toBe("codex-migration");
    expect(allowedActions(state)).toEqual(["RUN_MIGRATION"]);
  });

  it("rejects skipped transitions and non-live readiness", () => {
    expect(() => transition("READY", "PR_READY")).toThrow();
    expect(() =>
      assertLiveReady({
        state: "PR_READY",
        origin: "fixture",
        gateDecision: "pass",
        exactHead: true,
        humanApprovalRequired: true,
      }),
    ).toThrow();
  });
});
