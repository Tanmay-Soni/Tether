# Stripe golden-path rehearsal — 2026-08-23

This is redacted live evidence, not a fixture and not a claim of a completed
Greptile gate.

| Evidence               | Result                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Consumer baseline      | `bbf51ba75345668682a8d137240e6503369b5dfa` (`demo-acacia-baseline`)                                                  |
| Official old/new specs | Stripe `v1617` / `v1618`, commits `d535320...` / `9fa5188...`                                                        |
| Spec SHA-256           | `7f258e58...` / `08e7ff54...`                                                                                        |
| oasdiff                | pinned v1.29.1; two removal findings; match filter excludes create-preview                                           |
| Manifest               | `stripe:868d25cc96bf26391944954729259edd`                                                                            |
| Blast radius           | direct call, typed boundary, configuration, wrappers, route, job, fixtures, and tests confirmed deterministically    |
| Codex                  | official SDK, isolated workspace-write checkout, network disabled during edit                                        |
| Consumer head          | `a21406dbc650ec6e83f112213009dfed19a952c1`                                                                           |
| Checks                 | format, lint, typecheck, 12/12 offline tests passed                                                                  |
| Draft PR               | https://github.com/Tanmay-Soni/tetherin-stripe-demo/pull/1                                                           |
| Greptile               | MCP credential accepted; consumer repository was not visible to the Greptile installation, so review was not created |
| Merge                  | human-only; PR remains draft                                                                                         |

The GitHub session lacked direct upstream push permission. A fork-head branch
was used to create the real draft PR against the upstream baseline. This is an
explicit rehearsal deviation, not a different consumer repository or a changed
baseline.
