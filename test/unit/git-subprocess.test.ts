import { describe, expect, it } from "vitest";
import { scrubbedEnv } from "@tetherin/git-local";

describe("git subprocess environment", () => {
  it("preserves the existing home path for Git credential helpers", () => {
    const env = scrubbedEnv();

    expect(env.HOME).toBe(process.env.HOME);
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GREPTILE_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});
