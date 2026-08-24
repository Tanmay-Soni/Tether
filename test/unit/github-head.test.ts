import { describe, expect, it } from "vitest";
import { resolvePullRequestHead } from "../../packages/github-cli/src/index.js";

describe("pull request head resolution", () => {
  it("uses the upstream owner for an upstream branch", () => {
    expect(
      resolvePullRequestHead("Tanmay-Soni/tetherin-stripe-demo", "demo"),
    ).toEqual({ owner: "Tanmay-Soni", branch: "demo" });
  });

  it("separates a fork owner from a branch before filtering", () => {
    expect(
      resolvePullRequestHead(
        "Tanmay-Soni/tetherin-stripe-demo",
        "psagar29:tetherin/stripe/demo",
      ),
    ).toEqual({ owner: "psagar29", branch: "tetherin/stripe/demo" });
  });
});
