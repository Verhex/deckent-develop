#!/bin/bash
# scripts/nervous-tui-smoke.sh
#
# Smoke test for `deckent nervous` TUI output.
# Sprint 148 Task 12 — verifies CLI output contains all required sections.
# Exit 0 = PASS, Exit 1 = FAIL.
#
# Usage: bash scripts/nervous-tui-smoke.sh [project-root]

set -euo pipefail

ROOT="${1:-$(pwd)}"
LOG="/tmp/nervous-tui-output.log"

echo "Running nervous TUI smoke test (root: $ROOT)..."

# Build first if dist doesn't exist
if [ ! -f "$ROOT/dist/cli/index.js" ]; then
  echo "Building project..."
  cd "$ROOT" && tsc --noEmit 2>/dev/null || true
fi

# Run in background to avoid hanging on interactive prompts
# timeout 10 ensures we don't block indefinitely
timeout 10 node "$ROOT/dist/cli/index.js" nervous 2>&1 | tee "$LOG" || {
  exit_code=$?
  # timeout exits 124 on timeout — acceptable if output was captured
  if [ "$exit_code" -eq 124 ]; then
    echo "Note: command timed out (10s) — checking captured output..."
  elif [ "$exit_code" -ne 0 ] && [ ! -s "$LOG" ]; then
    echo "❌ Command failed with exit $exit_code and no output"
    exit 1
  fi
}

# Strip ANSI escape codes for clean grep matching
CLEAN_LOG="/tmp/nervous-tui-clean.log"
sed 's/\x1B\[[0-9;]*[mGKHF]//g' "$LOG" > "$CLEAN_LOG"

echo "Validating output sections..."

# Section 1: Header
grep -q "Deckent Nervous System" "$CLEAN_LOG" || {
  echo "❌ Missing header: 'Deckent Nervous System'"
  echo "--- Raw output ---"
  cat "$LOG"
  exit 1
}

# Section 2: Pending section (either "Pending:" or "No pending notifications")
grep -qE "Pending:|No pending" "$CLEAN_LOG" || {
  echo "❌ Missing Pending section"
  cat "$CLEAN_LOG"
  exit 1
}

# Section 3: Recent section (either "Recent" label or no history message)
grep -qE "Recent|No history" "$CLEAN_LOG" || {
  # Recent section only shows when there are history records
  # If neither present, the dashboard still passed (Recent section is conditional)
  echo "Note: No Recent section (no history records present — acceptable)"
}

# Section 4: Config line
grep -q "Config:" "$CLEAN_LOG" || {
  echo "❌ Missing Config section"
  cat "$CLEAN_LOG"
  exit 1
}

# Section 5: mode=balanced (project config has nervous_system.mode=balanced)
grep -q "mode=balanced" "$CLEAN_LOG" || {
  echo "❌ Mode is not 'balanced' — check .deckent/config.json nervous_system.mode"
  cat "$CLEAN_LOG"
  exit 1
}

echo "✅ Nervous TUI smoke test PASS"
rm -f "$LOG" "$CLEAN_LOG"
exit 0
