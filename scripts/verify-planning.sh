#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  AGENTS.md
  README.md
  NOTICE.md
  .env.example
  contracts/migration-manifest.schema.json
  contracts/blast-radius-report.schema.json
  contracts/validation-report.schema.json
  contracts/workflow-event.schema.json
  docs/workstreams/BASELINES.md
  docs/workstreams/person-a/AGENTS.md
  docs/workstreams/person-a/README.md
  docs/workstreams/person-b/AGENTS.md
  docs/workstreams/person-b/README.md
  docs/workstreams/person-c/AGENTS.md
  docs/workstreams/person-c/README.md
  docs/assets/teatherin-original.png
  docs/assets/tetherin-icon.png
)

for required_file in "${required_files[@]}"; do
  test -f "$required_file" || {
    echo "missing required file: $required_file" >&2
    exit 1
  }
done

while IFS= read -r json_file; do
  jq empty "$json_file"
done < <(find contracts -type f -name '*.json' -print | sort)

expected_artwork_sha="c2e977cdd1227b7456400ca7dfdbc9898ad1b2ea9066b41ae87affa1b72d67ed"
actual_artwork_sha="$(shasum -a 256 docs/assets/teatherin-original.png | awk '{print $1}')"
test "$actual_artwork_sha" = "$expected_artwork_sha" || {
  echo "original artwork checksum changed" >&2
  exit 1
}

test "$(jq -r '.properties.provider.enum | join(",")' contracts/migration-manifest.schema.json)" = "openai,stripe,twilio"

grep -q 'oasdiff/oasdiff/releases/tag/v1.29.1' docs/provenance.md
grep -q 'search_knowledge_base' docs/research/greptile-capabilities.md
grep -q 'TetherIn' README.md

git diff --check
echo "planning baseline verified"
