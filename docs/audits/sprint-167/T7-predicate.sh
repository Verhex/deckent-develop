#!/usr/bin/env bash
# T7 — Cross-Cutting Synthesis Predicate (Sprint 167 Task 167-007)
# GO/NO_GO falsifiable gate per DIRECTIVES.md Section 3.6 v4 spec.
#
# Usage: bash .audit/sprint-167/T7-predicate.sh
# Exit codes: 0 = PASS, 1 = FAIL

set -u

ROOT="${WORKSPACE_ROOT:-/workspace}"
AUDIT_DIR="$ROOT/.audit/sprint-167"
FAIL_COUNT=0
FAIL_REASONS=()

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAIL_REASONS+=("$1")
  echo "  ❌ FAIL: $1"
}

pass() {
  echo "  ✅ PASS: $1"
}

section() {
  echo ""
  echo "=== $1 ==="
}

# ====== Check 1: T7-cross-cutting-synthesis.md ≥ 200 satır ======
section "Check 1: T7-cross-cutting-synthesis.md satır sayısı"
SYNTHESIS_FILE="$AUDIT_DIR/T7-cross-cutting-synthesis.md"
if [ ! -f "$SYNTHESIS_FILE" ]; then
  fail "T7-cross-cutting-synthesis.md mevcut değil"
else
  LINES=$(wc -l < "$SYNTHESIS_FILE")
  if [ "$LINES" -ge 200 ]; then
    pass "T7-cross-cutting-synthesis.md $LINES satır (≥200)"
  else
    fail "T7-cross-cutting-synthesis.md $LINES satır (<200)"
  fi
fi

# ====== Check 2: consolidated-inventory.md ≥ 100 satır ======
section "Check 2: consolidated-inventory.md satır sayısı"
INVENTORY_FILE="$AUDIT_DIR/consolidated-inventory.md"
if [ ! -f "$INVENTORY_FILE" ]; then
  fail "consolidated-inventory.md mevcut değil"
else
  LINES=$(wc -l < "$INVENTORY_FILE")
  if [ "$LINES" -ge 100 ]; then
    pass "consolidated-inventory.md $LINES satır (≥100)"
  else
    fail "consolidated-inventory.md $LINES satır (<100)"
  fi
fi

# ====== Check 3 (spec): sprint-168-roadmap.md ≥ 100 satır ======
section "Check 3 (spec): sprint-168-roadmap.md satır sayısı"
ROADMAP_FILE="$AUDIT_DIR/sprint-168-roadmap.md"
if [ ! -f "$ROADMAP_FILE" ]; then
  fail "sprint-168-roadmap.md mevcut değil"
else
  LINES=$(wc -l < "$ROADMAP_FILE")
  if [ "$LINES" -ge 100 ]; then
    pass "sprint-168-roadmap.md $LINES satır (≥100)"
  else
    fail "sprint-168-roadmap.md $LINES satır (<100)"
  fi
fi

# ====== Check 4 (spec): sprint-168-roadmap.md "severity:" en az 1 ======
section "Check 4 (spec): sprint-168-roadmap.md severity field"
if [ -f "$ROADMAP_FILE" ]; then
  SEV_COUNT=$(grep -c "severity:" "$ROADMAP_FILE" || echo 0)
  if [ "$SEV_COUNT" -ge 1 ]; then
    pass "sprint-168-roadmap.md $SEV_COUNT 'severity:' occurrence (≥1)"
  else
    fail "sprint-168-roadmap.md $SEV_COUNT 'severity:' occurrence (<1)"
  fi
fi

# ====== Check 5 (spec): Sprint 168 task sayısı ≤ 12 ======
section "Check 5 (spec): Sprint 168 task count ≤ 12"
if [ -f "$ROADMAP_FILE" ]; then
  # Roadmap'te task'lar "### C1", "### C2", ..., "### H1", ..., "### M1" formatında
  TASK_COUNT=$(grep -cE "^### (C[0-9]+|H[0-9]+|M[0-9]+) — " "$ROADMAP_FILE" || echo 0)
  if [ "$TASK_COUNT" -le 12 ] && [ "$TASK_COUNT" -ge 1 ]; then
    pass "Sprint 168 task count = $TASK_COUNT (≤12 ✓)"
  else
    fail "Sprint 168 task count = $TASK_COUNT (≤12 ihlali veya 0)"
  fi
fi

# ====== Check 6: Sprint 168 critical task ≤ 4 ======
section "Check 6 (spec): Sprint 168 critical task ≤ 4"
if [ -f "$ROADMAP_FILE" ]; then
  CRITICAL_COUNT=$(grep -cE "^### C[0-9]+ — " "$ROADMAP_FILE" || echo 0)
  if [ "$CRITICAL_COUNT" -le 4 ] && [ "$CRITICAL_COUNT" -ge 1 ]; then
    pass "Sprint 168 critical count = $CRITICAL_COUNT (≤4 ✓)"
  else
    fail "Sprint 168 critical count = $CRITICAL_COUNT (≤4 ihlali veya 0)"
  fi
fi

# ====== Check 7 (spec): Cross-cutting pattern ≥ 3 ======
section "Check 7 (spec): Cross-cutting pattern ≥ 3 OR 'no cross-cut detected'"
if [ -f "$SYNTHESIS_FILE" ]; then
  PATTERN_COUNT=$(grep -cE "^### Pattern P[0-9]+ — " "$SYNTHESIS_FILE" || echo 0)
  if [ "$PATTERN_COUNT" -ge 3 ]; then
    pass "Cross-cutting patterns = $PATTERN_COUNT (≥3 ✓)"
  else
    # Fallback: "no cross-cut detected" explicit phrasing
    if grep -qi "no cross-cut detected" "$SYNTHESIS_FILE"; then
      pass "Patterns < 3 but 'no cross-cut detected' explicitly stated"
    else
      fail "Cross-cutting patterns = $PATTERN_COUNT (<3 and 'no cross-cut detected' yok)"
    fi
  fi
fi

# ====== Check 8: 4-field zorunlu (severity / suggested_fix / sprint_slot / effort_estimate) ======
section "Check 8 (spec): 4-field zorunlu her finding'de"
if [ -f "$ROADMAP_FILE" ]; then
  SEV=$(grep -cE "(\*\*|^- )severity:" "$ROADMAP_FILE" || echo 0)
  FIX=$(grep -cE "(\*\*|^- )suggested_fix:" "$ROADMAP_FILE" || echo 0)
  SLOT=$(grep -cE "(\*\*|^- )sprint_slot:" "$ROADMAP_FILE" || echo 0)
  EFFORT=$(grep -cE "(\*\*|^- )effort_estimate:" "$ROADMAP_FILE" || echo 0)
  if [ "$SEV" -ge 12 ] && [ "$FIX" -ge 12 ] && [ "$SLOT" -ge 12 ] && [ "$EFFORT" -ge 12 ]; then
    pass "4-field zorunluluk: severity=$SEV fix=$FIX slot=$SLOT effort=$EFFORT (her biri ≥12)"
  else
    fail "4-field zorunluluk eksik: severity=$SEV fix=$FIX slot=$SLOT effort=$EFFORT (her biri ≥12 olmalı)"
  fi
fi

# ====== Check 9: T7-predicate.sh executable mode ======
section "Check 9: T7-predicate.sh self-check"
SELF="$AUDIT_DIR/T7-predicate.sh"
if [ -f "$SELF" ]; then
  pass "T7-predicate.sh mevcut"
else
  fail "T7-predicate.sh mevcut değil (self-reference)"
fi

# ====== Final Verdict ======
echo ""
echo "================================================================"
echo "T7 Predicate Final Verdict"
echo "================================================================"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "✅ PASS — All T7 predicate checks passed."
  echo "Sprint 168 roadmap ready for DIRECTIVES.md seeding."
  exit 0
else
  echo "❌ FAIL — $FAIL_COUNT check(s) failed:"
  for reason in "${FAIL_REASONS[@]}"; do
    echo "   • $reason"
  done
  exit 1
fi
