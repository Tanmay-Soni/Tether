#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

for executable in git jq node rg shasum; do
  command -v "$executable" >/dev/null || {
    echo "missing verification executable: $executable" >&2
    exit 1
  }
done

required_files=(
  AGENTS.md
  README.md
  NOTICE.md
  .env.example
  bun.lock
  contracts/migration-manifest.schema.json
  contracts/blast-radius-report.schema.json
  contracts/validation-report.schema.json
  contracts/workflow-event.schema.json
  docs/architecture/overview.md
  docs/decisions/0005-local-only-hackathon-runtime.md
  docs/design/dashboard.md
  docs/workstreams/BASELINES.md
  docs/workstreams/person-a/AGENTS.md
  docs/workstreams/person-a/README.md
  docs/workstreams/person-b/AGENTS.md
  docs/workstreams/person-b/README.md
  docs/workstreams/person-c/AGENTS.md
  docs/workstreams/person-c/README.md
  docs/assets/teatherin-original.png
  docs/assets/tetherin-icon.png
  scripts/check-markdown-links.mjs
  scripts/validate-contracts.mjs
)

for required_file in "${required_files[@]}"; do
  test -f "$required_file" || {
    echo "missing required file: $required_file" >&2
    exit 1
  }
done

test ! -e pnpm-workspace.yaml || {
  echo "obsolete workspace file remains: pnpm-workspace.yaml" >&2
  exit 1
}

while IFS= read -r json_file; do
  jq empty "$json_file"
done < <(find contracts -type f -name '*.json' -print | sort)

node scripts/validate-contracts.mjs
node scripts/check-markdown-links.mjs

expected_artwork_sha="c2e977cdd1227b7456400ca7dfdbc9898ad1b2ea9066b41ae87affa1b72d67ed"
actual_artwork_sha="$(shasum -a 256 docs/assets/teatherin-original.png | awk '{print $1}')"
test "$actual_artwork_sha" = "$expected_artwork_sha" || {
  echo "original artwork checksum changed" >&2
  exit 1
}

expected_icon_sha="ad5943c134bf22532e6f24b703eba4d16ecb266dd3235406ffdc076169350ae5"
actual_icon_sha="$(shasum -a 256 docs/assets/tetherin-icon.png | awk '{print $1}')"
test "$actual_icon_sha" = "$expected_icon_sha" || {
  echo "derived chain icon checksum changed" >&2
  exit 1
}

if command -v sips >/dev/null; then
  test "$(sips -g pixelWidth docs/assets/teatherin-original.png | awk '/pixelWidth/ {print $2}')" = "1448"
  test "$(sips -g pixelHeight docs/assets/teatherin-original.png | awk '/pixelHeight/ {print $2}')" = "1086"
  test "$(sips -g pixelWidth docs/assets/tetherin-icon.png | awk '/pixelWidth/ {print $2}')" = "256"
  test "$(sips -g pixelHeight docs/assets/tetherin-icon.png | awk '/pixelHeight/ {print $2}')" = "256"
fi

test "$(jq -r '.packageManager' package.json)" = "bun@1.4.0"
test "$(jq -r '.workspaces | join(",")' package.json)" = "apps/*,packages/*"
test "$(jq -r '.scripts.setup // empty' package.json)" = ""
test "$(jq -r '.scripts.demo // empty' package.json)" = ""
test "$(jq -r '.properties.provider.enum | join(",")' contracts/migration-manifest.schema.json)" = "openai,stripe,twilio"

grep -q 'oasdiff/oasdiff/releases/tag/v1.29.1' docs/provenance.md
grep -q 'search_knowledge_base' docs/research/greptile-capabilities.md
grep -q '57a602ba9de7357fd0385f20e23460b8642b74a9' docs/workstreams/person-c/README.md
grep -q 'da15ba9778ce07c6178a4af4eb42f44fdd7a1fc3' docs/workstreams/person-c/README.md
grep -q 'PLANNING_BASE_SHA=13d5209ebb44fe9934d15c3508f9faa1091d60f2' docs/workstreams/BASELINES.md
test "$(jq -r '.overrides.ajv // empty' package.json)" = ""
test "$(jq -r '.engine.rawOutputSha256' contracts/examples/openai-geography.manifest.json)" = "07640494838ec2e0ebce6af7098cf6e46fd269999e051aa6fa2d694e837ee382"
grep -q 'DESIGN_VARIANCE=5' docs/design/dashboard.md
grep -q 'MOTION_INTENSITY=4' docs/design/dashboard.md
grep -q 'VISUAL_DENSITY=6' docs/design/dashboard.md
grep -q 'Person C is responsible for making the target commands' README.md

if rg -n -i \
  'pnpm|corepack|DATABASE_URL|GITHUB_APP_ID|GITHUB_WEBHOOK_SECRET|docker compose|postgresql|installation token|webhook receiver' \
  README.md AGENTS.md .env.example docs/architecture docs/decisions docs/demo \
  docs/design docs/git-strategy.md docs/integration-checklist.md docs/security \
  docs/workstreams/person-a/README.md docs/workstreams/person-a/AGENTS.md \
  docs/workstreams/person-b/README.md docs/workstreams/person-b/AGENTS.md \
  docs/workstreams/person-c/README.md docs/workstreams/person-c/AGENTS.md; then
  echo "obsolete runtime architecture reference found outside scoped research" >&2
  exit 1
fi

test -z "$(rg -n '—' docs/design/dashboard.md || true)" || {
  echo "dashboard visible-copy contract contains an em dash" >&2
  exit 1
}

git diff --check
git fsck --no-progress --no-dangling
echo "planning baseline verified"
