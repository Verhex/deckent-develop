#!/bin/bash
# Compatibility entrypoint. All checks are read-only and never build or clean
# the repository. README/LICENSE remain explicit packed-artifact contracts from
# the retired verifier; the canonical validator owns every other publish gate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

node "$PROJECT_ROOT/scripts/validate-publish.mjs" "$PROJECT_ROOT"

PACK_OUTPUT="$(
  cd "$PROJECT_ROOT"
  npm pack --dry-run --json --ignore-scripts
)"

printf '%s' "$PACK_OUTPUT" | node --input-type=module -e '
let input = "";
for await (const chunk of process.stdin) input += chunk;
let entries;
try {
  entries = JSON.parse(input);
} catch {
  process.stderr.write("E_PUBLISH_PACK_JSON_INVALID\n");
  process.exit(1);
}
if (!Array.isArray(entries) || entries.length === 0 || !Array.isArray(entries[0]?.files)) {
  process.stderr.write("E_PUBLISH_PACK_JSON_INVALID\n");
  process.exit(1);
}
const packed = new Set(
  entries[0].files
    .map((entry) => entry?.path)
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.replace(/^\.\//, "")),
);
const missing = ["README.md", "LICENSE"].filter((entry) => !packed.has(entry));
if (missing.length > 0) {
  process.stderr.write(`E_PUBLISH_REQUIRED_FILE_MISSING:${missing.join(",")}\n`);
  process.exit(1);
}
'
