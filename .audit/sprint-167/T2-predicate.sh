#!/usr/bin/env bash
# T2 — Doc Inventory + Reference Validation + ground-truth Audit predicate
# Sprint 167 Read-Only Self-Audit — falsifiable GO/NO_GO gate
#
# Predicates:
#   1. .audit/sprint-167/T2-doc-inventory.md exists and has >=500 lines
#   2. Report mentions "ground-truth" >=9 times
#   3. Report mentions "drift" >=1 time
#   4. .deckent/ground-truth-overrides.json exists and is valid JSON (read-only verify)
#
# Exit code: 0 = PASS, 1 = FAIL

set -u

REPORT=".audit/sprint-167/T2-doc-inventory.md"
OVERRIDES=".deckent/ground-truth-overrides.json"

fail() {
  echo "FAIL: $1"
  exit 1
}

# 1. Report file exists
if [ ! -f "$REPORT" ]; then
  fail "Report not found at $REPORT"
fi

# 2. Line count >= 500
LINE_COUNT=$(wc -l < "$REPORT")
if [ "$LINE_COUNT" -lt 500 ]; then
  fail "Line count $LINE_COUNT < 500 required"
fi

# 3. ground-truth occurrences >= 9
GT_COUNT=$(grep -c "ground-truth" "$REPORT" || true)
if [ "$GT_COUNT" -lt 9 ]; then
  fail "'ground-truth' occurrences $GT_COUNT < 9 required"
fi

# 4. drift occurrences >= 1
DRIFT_COUNT=$(grep -c "drift" "$REPORT" || true)
if [ "$DRIFT_COUNT" -lt 1 ]; then
  fail "'drift' occurrences $DRIFT_COUNT < 1 required"
fi

# 5. ground-truth-overrides whitelist exists and is valid JSON
if [ ! -f "$OVERRIDES" ]; then
  fail "Whitelist $OVERRIDES not found"
fi
if ! node -e "JSON.parse(require('fs').readFileSync('$OVERRIDES','utf8'))" 2>/dev/null; then
  fail "$OVERRIDES is not valid JSON"
fi

echo "PASS: lines=$LINE_COUNT, ground-truth=$GT_COUNT, drift=$DRIFT_COUNT, whitelist=ok"
exit 0
