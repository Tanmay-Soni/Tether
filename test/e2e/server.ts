const base = process.cwd();
const now = new Date().toISOString();
const event = {
  event_id: "evt-1",
  occurred_at: now,
  type: "contract.diffed",
  payload_digest: "a".repeat(64),
  payload: { reason: "Exactly two Stripe invoice upcoming endpoints removed" },
};
const run = {
  id: "run-stripe-demo",
  state: "IMPACT_CONFIRMED",
  provider: "stripe",
  updated_at: now,
  created_at: now,
  consumer_base_sha: "b".repeat(40),
  manifest_id: "stripe:868d25cc96bf26391944954729259edd",
  branch_name: null,
  current_head_sha: null,
  pr_number: null,
  actions: ["RUN_MIGRATION"],
  events: [event],
  artifacts: [
    { id: "artifact-1", kind: "migration-manifest", sha256: "c".repeat(64) },
  ],
  stages: [
    { stage: "api-change", status: "complete" },
    { stage: "blast-radius", status: "complete" },
    { stage: "codex-migration", status: "active" },
    { stage: "validation-pr", status: "not-started" },
  ],
};
const status = {
  diagnostics: {
    mode: "fixture",
    repository: "Tanmay-Soni/tetherin-stripe-demo",
    ready: true,
    checks: [
      { name: "Git", status: "ready", detail: "available" },
      {
        name: "Greptile",
        status: "blocked",
        detail: "credential unavailable; live gate blocked",
      },
    ],
  },
  runs: [run],
};
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TetherIn</title><link rel="stylesheet" href="/client.css"></head><body><div id="root"></div><script type="module" src="/client.js"></script></body></html>`;
Bun.serve({
  hostname: "127.0.0.1",
  port: 3417,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/status") return Response.json(status);
    if (url.pathname === "/api/runs/run-stripe-demo") return Response.json(run);
    if (url.pathname.startsWith("/api/"))
      return Response.json(run, { status: 202 });
    if (url.pathname === "/client.js" || url.pathname === "/client.css")
      return new Response(
        Bun.file(`${base}/apps/web/dist/public${url.pathname}`),
        {
          headers: {
            "content-type": url.pathname.endsWith(".css")
              ? "text/css"
              : "text/javascript",
          },
        },
      );
    if (url.pathname === "/tetherin-icon.png")
      return new Response(Bun.file(`${base}/docs/assets/tetherin-icon.png`), {
        headers: { "content-type": "image/png" },
      });
    return new Response(html, { headers: { "content-type": "text/html" } });
  },
});
console.log("E2E dashboard fixture ready");
