# TetherIn wire contracts

These JSON Schemas are the only cross-workstream payload contracts. They are
versioned by their `schemaVersion` constant and reject unknown fields. External
data must be parsed and validated before it reaches the orchestrator.

| Schema | Producer | Primary consumers |
| --- | --- | --- |
| `migration-manifest.schema.json` | Person A provider pipeline | B blast-radius adapter, C orchestrator/Codex prompt |
| `blast-radius-report.schema.json` | Person B evidence pipeline | C orchestrator/dashboard/Codex prompt |
| `validation-report.schema.json` | Person B validation adapter + C test runner | C state machine/dashboard |
| `workflow-event.schema.json` | Person C orchestrator | Database, audit log, dashboard |

`oasdiff` JSON is retained separately and is never treated as the normalized
manifest. The committed raw fixture demonstrates the real v1.29.1 array shape:
`id`, `text`, numeric `level` (`3=ERR`, `2=WARN`, `1=INFO`), operation metadata,
source locations, and `fingerprint`. Person A must generate the upstream schema
with `oasdiff schema` and validate raw output before normalizing it.

## Compatibility rule

- Additive optional fields require a new schema version unless all consumers
  explicitly ignore unknown fields; current schemas reject them, so bump.
- Removing/renaming/changing a field always requires a new version.
- Person A or B records proposed changes in handoff notes; Person C owns the
  coordinated schema change after both branches are integrated.
- Store the schema version next to every persisted payload. Never infer it from
  application version.

## Examples and truth labels

`examples/openai-geography.manifest.json` is a normalized example derived from a
real oasdiff run over official OpenAI spec commits. It is not a live migration
job. Greptile demo fixtures created by Person B must use `executionMode:
"fixture"` and may not claim completeness.
