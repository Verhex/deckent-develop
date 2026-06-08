#!/usr/bin/env bash
# T1 — Code Inventory GO/NO_GO predicate (Sprint 167 Read-Only Self-Audit)
# Exit 0 + "PASS" → GO. Exit 1 + reason → NO_GO.

set -u
REPORT=".audit/sprint-167/T1-code-inventory.md"

# Resolve repo root: parent of .audit/ is repo root.
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

# Check 2: line count >= 500
LINES=$(wc -l < "$REPORT")
if [ "$LINES" -lt 500 ]; then
  fail "line count $LINES < 500"
fi

# Check 3: section count >= 6 (## headings)
SECTIONS=$(grep -c "^## " "$REPORT")
if [ "$SECTIONS" -lt 6 ]; then
  fail "section count $SECTIONS < 6"
fi

# Check 4: predicate script itself exists (this file)
if [ ! -f ".audit/sprint-167/T1-predicate.sh" ]; then
  fail "predicate script missing"
fi

# Check 5: required core sections by title spot-check
for needle in "CLI Command Inventory" "MCP Tool Inventory" "src/ Module Inventory" "Sprint 138-166 Feature Adoption" "Vitest Skip Categorization" "Bug N Regression"; do
  if ! grep -qF "$needle" "$REPORT"; then
    fail "missing required section: $needle"
  fi
done

# Check 6: findings table presence
if ! grep -q "T1-MCP-001" "$REPORT" || ! grep -q "T1-TEST-001" "$REPORT"; then
  fail "key findings (T1-MCP-001 / T1-TEST-001) missing"
fi

# Check 7: scope compliance self-statement
if ! grep -qi "HİÇBİR SOURCE/DOC DOSYASI" "$REPORT"; then
  fail "scope compliance self-statement missing"
fi

echo "PASS: T1 audit report meets all gates"
echo "  lines: $LINES"
echo "  sections: $SECTIONS"
exit 0
