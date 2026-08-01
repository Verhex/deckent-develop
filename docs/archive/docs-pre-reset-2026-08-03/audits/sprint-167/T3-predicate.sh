#!/usr/bin/env bash
# T3 — ADR Compliance + Status Audit — GO/NO_GO Predicate (Sprint 167)
#
# Falsifiable verification of T3-adr-compliance.md report completeness.
# Exit 0 = PASS (predicate met), Exit 1 = FAIL (predicate not met).
#
# Usage: bash .audit/sprint-167/T3-predicate.sh

set -u

REPORT=".audit/sprint-167/T3-adr-compliance.md"
EXIT_CODE=0

echo "T3 PREDICATE — Sprint 167 ADR Compliance Audit"
echo "=================================================="
echo ""

# Check 1: Report file exists
if [[ ! -f "$REPORT" ]]; then
  echo "FAIL: Report file not found: $REPORT"
  exit 1
fi

# Check 2: Line count >= 500
LINES=$(wc -l < "$REPORT")
echo "[check 1/4] Report line count: $LINES (required ≥500)"
if [[ "$LINES" -lt 500 ]]; then
  echo "  ↳ FAIL: Report too short"
  EXIT_CODE=1
else
  echo "  ↳ PASS"
fi

# Check 3: ≥50 ADR sections (### ADR-...)
ADR_SECTIONS=$(grep -c "^### ADR-" "$REPORT")
echo "[check 2/4] ADR sections (### ADR-): $ADR_SECTIONS (required ≥50)"
if [[ "$ADR_SECTIONS" -lt 50 ]]; then
  echo "  ↳ FAIL: Not enough ADR sections"
  EXIT_CODE=1
else
  echo "  ↳ PASS"
fi

# Check 4: ≥8 compliance: entries (runtime compliance scan)
COMPLIANCE_ENTRIES=$(grep -c "compliance:" "$REPORT")
echo "[check 3/4] compliance: entries: $COMPLIANCE_ENTRIES (required ≥8)"
if [[ "$COMPLIANCE_ENTRIES" -lt 8 ]]; then
  echo "  ↳ FAIL: Not enough compliance scan entries"
  EXIT_CODE=1
else
  echo "  ↳ PASS"
fi

# Check 5: 7 mandatory section headings present
echo "[check 4/4] Mandatory sections present:"
REQUIRED_SECTIONS=(
  "ADR Enumeration"
  "Runtime Compliance Scan"
  "Cross-Reference 4 Rules Dir"
  "Proposed Closure Önerisi"
  "Step 2 Decommission"
  "ADR-047 Manuel Survival"
  "Findings Severity Table"
)
SECTION_FAIL=0
for section in "${REQUIRED_SECTIONS[@]}"; do
  if grep -qF "$section" "$REPORT"; then
    echo "  ↳ PASS: '$section'"
  else
    echo "  ↳ FAIL: missing '$section'"
    SECTION_FAIL=1
  fi
done
if [[ "$SECTION_FAIL" -eq 1 ]]; then
  EXIT_CODE=1
fi

echo ""
echo "=================================================="
if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "T3 PREDICATE: PASS"
  echo "Task 167-003 GO criteria met. Sprint 168 input data ready."
else
  echo "T3 PREDICATE: FAIL"
  echo "Task 167-003 GO criteria NOT met — review report for gaps."
fi
exit "$EXIT_CODE"
