import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { LocalStateStore } from "@tetherin/local-state";

describe("SQLite state", () => {
  test("persists idempotent runs, append-only transitions, and duplicate-safe intents", () => {
    const store = new LocalStateStore(
      join(mkdtempSync(join(tmpdir(), "tether-state-")), "state.db"),
      process.cwd(),
    );
    store.migrate();
    const input = {
      idempotencyKey: "same",
      mode: "fixture" as const,
      evidenceOrigin: "fixture" as const,
      provider: "openai" as const,
      consumerRepo: "owner/repo",
      consumerBaseSha: "a".repeat(40),
    };
    const first = store.createRun(input);
    expect(store.createRun(input).id).toBe(first.id);
    store.insertIntent({
      runId: String(first.id),
      intentKey: "start",
      type: "START_RUN",
      expectedState: "READY",
    });
    expect(() =>
      store.insertIntent({
        runId: String(first.id),
        intentKey: "start",
        type: "START_RUN",
        expectedState: "READY",
      }),
    ).toThrow();
    store.appendTransition(String(first.id), "DETECTING_CHANGE", {
      type: "change.discovered",
      actor: "system",
      payload: { reason: "test" },
    });
    expect(store.events(String(first.id))).toHaveLength(1);
    expect(store.getRun(String(first.id))?.state).toBe("DETECTING_CHANGE");
    store.close();
  });
});
