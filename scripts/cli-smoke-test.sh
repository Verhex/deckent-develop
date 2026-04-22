#!/usr/bin/env bash
# CLI Smoke Test — verifies every top-level deckent command exits 0 on --help.
# Usage: bash scripts/cli-smoke-test.sh
# Output: JSON report to stdout, exit non-zero if any command fails.

set -euo pipefail

DECKENT="node dist/cli/index.js"
PASS=0
FAIL=0
RESULTS="[]"

# Test root --help
if $DECKENT --help > /dev/null 2>&1; then
  PASS=$((PASS + 1))
  RESULTS=$(echo "$RESULTS" | jq --arg cmd "root --help" '. + [{"command": $cmd, "status": "PASS"}]')
else
  FAIL=$((FAIL + 1))
  RESULTS=$(echo "$RESULTS" | jq --arg cmd "root --help" '. + [{"command": $cmd, "status": "FAIL"}]')
fi

# Get all top-level command names from --help output
COMMANDS=$($DECKENT --help 2>/dev/null | grep -oP '^\s{2,4}(\w[\w-]+)' | awk '{print $1}' | sort -u)

if [ -z "$COMMANDS" ]; then
  # Fallback: extract from source
  COMMANDS=$(grep -oP 'registerName\(program\)' src/cli/index.ts 2>/dev/null | sed 's/(program)//' || true)
  if [ -z "$COMMANDS" ]; then
    echo '{"error": "Could not extract command list", "pass": 0, "fail": 1}' >&2
    exit 1
  fi
fi

for CMD in $COMMANDS; do
  # Skip non-command tokens (e.g. "Options:", "Commands:", "Usage:")
  case "$CMD" in
    Options|Commands|Usage|deckent|AI|agent|orchestration|system|your|development|team|orchestrated) continue ;;
  esac

  if $DECKENT "$CMD" --help > /dev/null 2>&1; then
    PASS=$((PASS + 1))
    RESULTS=$(echo "$RESULTS" | jq --arg cmd "$CMD --help" '. + [{"command": $cmd, "status": "PASS"}]')
  else
    FAIL=$((FAIL + 1))
    RESULTS=$(echo "$RESULTS" | jq --arg cmd "$CMD --help" '. + [{"command": $cmd, "status": "FAIL"}]')
  fi
done

# Output JSON report
jq -n \
  --argjson pass "$PASS" \
  --argjson fail "$FAIL" \
  --argjson results "$RESULTS" \
  '{pass: $pass, fail: $fail, total: ($pass + $fail), results: $results}'

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
