import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { Codex } from "@openai/codex-sdk";

interface RequestFrame {
  protocolVersion: 1;
  runId: string;
  checkoutRoot: string;
  prompt: string;
  promptDigest: string;
  model?: string;
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try {
    const request = JSON.parse(line) as RequestFrame;
    if (
      request.protocolVersion !== 1 ||
      !request.runId ||
      !request.checkoutRoot ||
      !request.prompt ||
      !/^[0-9a-f]{64}$/u.test(request.promptDigest)
    )
      throw new Error("INVALID_FRAME");
    const checkoutRoot = realpathSync(request.checkoutRoot);
    const codex = new Codex({
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        ...(process.env.CODEX_HOME
          ? { CODEX_HOME: process.env.CODEX_HOME }
          : {}),
      },
    });
    const thread = codex.startThread({
      workingDirectory: checkoutRoot,
      ...(request.model ? { model: request.model } : {}),
    });
    const result = await thread.run(request.prompt);
    const summary = result.finalResponse.slice(0, 4000);
    process.stdout.write(
      `${JSON.stringify({ protocolVersion: 1, status: "completed", threadId: thread.id, finalResponseDigest: createHash("sha256").update(result.finalResponse).digest("hex"), summary })}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ protocolVersion: 1, status: "failed", errorCode: error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN" })}\n`,
    );
    process.exitCode = 1;
  }
}
