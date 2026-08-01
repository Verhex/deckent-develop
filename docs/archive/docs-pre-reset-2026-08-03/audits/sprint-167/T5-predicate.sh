#!/usr/bin/env bash
# T5 — Brain/Worker/Auditor Wire Audit GO/NO_GO predicate (Sprint 167 Read-Only Self-Audit)
# Exit 0 + "PASS" → GO. Exit 1 + reason → NO_GO.

set -u
REPORT=".audit/sprint-167/T5-brain-wire-audit.md"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "NO_GO: $1"
  exit 1
}

# Check 1: report file exists
if [ ! -f "$REPORT" ]; then
  fail "report file missing: $REPORT"
fi

# Check 2: line count >= 600
LINES=$(wc -l < "$REPORT")
if [ "$LINES" -lt 600 ]; then
  fail "line count $LINES < 600"
fi

# Check 3: Bug [EGVZ] references >= 5
BUG_HITS=$(grep -cE "Bug [EGVZ]" "$REPORT")
if [ "$BUG_HITS" -lt 5 ]; then
  fail "Bug [EGVZ] count $BUG_HITS < 5"
fi

# Check 4: manual/manuel survival references >= 10 (case-insensitive)
MS_HITS=$(grep -ciE "manual survival|manuel survival" "$REPORT")
if [ "$MS_HITS" -lt 10 ]; then
  fail "manual/manuel survival count $MS_HITS < 10"
fi

# Check 5: ADR-046 referenced (Step Ordering Contract)
if ! grep -q "ADR-046" "$REPORT"; then
  fail "ADR-046 reference missing"
fi

# Check 6: ADR-047 input section present (Sprint 168 ADR seed)
if ! grep -q "ADR-047" "$REPORT"; then
  fail "ADR-047 input section missing"
fi

# Check 7: forensic mode block present
if ! grep -qi "forensic" "$REPORT"; then
  fail "forensic mode declaration missing"
fi

# Check 8: 3 alt task references (5.1 / 5.2 / 5.3)
for KEY in "Step 1-5" "5 Bug" "Manuel Survival Incident Inventory"; do
  if ! grep -qF "$KEY" "$REPORT"; then
    fail "missing alt task evidence: $KEY"
  fi
done

echo "PASS: T5 audit predicate satisfied"
echo "  lines=$LINES (>=600)"
echo "  Bug[EGVZ]=$BUG_HITS (>=5)"
echo "  manualSurvival=$MS_HITS (>=10)"
exit 0
