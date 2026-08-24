import { randomUUID } from "node:crypto";
import { loadConfig, redact } from "@tetherin/config";
import { LocalStateStore } from "@tetherin/local-state";
import { processIntent } from "./workflow.js";

const config = loadConfig();
const store = new LocalStateStore(config.databasePath, config.repoRoot);
store.migrate();
const owner = `runner:${randomUUID()}`;
let stopping = false;

async function loop(): Promise<void> {
  while (!stopping) {
    const intent = store.claimIntent(owner);
    if (!intent) {
      await Bun.sleep(350);
      continue;
    }
    try {
      await processIntent(config, store, intent);
      store.completeIntent(String(intent.id), owner);
    } catch (error) {
      const run = store.getRun(String(intent.run_id));
      if (run && !["FAILED", "NEEDS_INPUT"].includes(String(run.state))) {
        try {
          store.appendTransition(String(intent.run_id), "FAILED", {
            type: "job.failed",
            actor: "system",
            payload: {
              reason: redact(
                error instanceof Error
                  ? error.message
                  : "Unknown runner failure",
              ),
            },
          });
        } catch {
          /* terminal or transition-safe failure */
        }
      }
      store.completeIntent(String(intent.id), owner);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });
console.log(`TetherIn runner ready (${config.mode})`);
await loop();
store.close();
