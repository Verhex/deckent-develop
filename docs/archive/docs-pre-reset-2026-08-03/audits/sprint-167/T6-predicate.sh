#!/usr/bin/env bash
# T6-predicate.sh — Falsifiable GO/NO_GO predicate for Sprint 167 Task 167-006
#
# Sprint 167 Section 3.6 v4 falsifiable predicate.
# Exit 0 = PASS, exit 1 = FAIL.

set -u

AUDIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT="${AUDIT_DIR}/T6-test-build-security.md"
WHITELIST="${AUDIT_DIR}/oss-whitelist.json"

pass=true

check() {
  local label="$1"
  local cond="$2"
  if [ "$cond" = "true" ]; then
    echo "  [PASS] $label"
  else
    echo "  [FAIL] $label"
    pass=false
  fi
}

echo "=== T6 Predicate Sprint 167 Task 167-006 ==="

# Check 1: report file exists
if [ -f "$REPORT" ]; then
  check "T6-test-build-security.md exists" "true"
else
  check "T6-test-build-security.md exists" "false"
fi

# Check 2: report file ≥500 lines
if [ -f "$REPORT" ]; then
  lines=$(wc -l < "$REPORT")
  if [ "$lines" -ge 500 ]; then
    check "T6-test-build-security.md ≥500 lines (actual: $lines)" "true"
  else
    check "T6-test-build-security.md ≥500 lines (actual: $lines)" "false"
  fi
fi

# Check 3: BLOCKER|ACCEPTED tag count ≥10
if [ -f "$REPORT" ]; then
  count=$(grep -cE 'BLOCKER|ACCEPTED' "$REPORT" || true)
  if [ "$count" -ge 10 ]; then
    check "BLOCKER|ACCEPTED tag count ≥10 (actual: $count)" "true"
  else
    check "BLOCKER|ACCEPTED tag count ≥10 (actual: $count)" "false"
  fi
fi

# Check 4: oss-whitelist.json exists
if [ -f "$WHITELIST" ]; then
  check "oss-whitelist.json exists" "true"
else
  check "oss-whitelist.json exists" "false"
fi

# Check 5: oss-whitelist.json has ≥2 whitelist entries (via node)
if [ -f "$WHITELIST" ]; then
  ws_count=$(node -e "const d=JSON.parse(require('fs').readFileSync('$WHITELIST','utf8')); console.log(d.whitelist?.length || 0);" 2>/dev/null || echo "0")
  if [ "$ws_count" -ge 2 ]; then
    check "oss-whitelist.json has ≥2 whitelist entries (actual: $ws_count)" "true"
  else
    check "oss-whitelist.json has ≥2 whitelist entries (actual: $ws_count)" "false"
  fi
fi

# Check 6: report has ≥6 numbered sections
if [ -f "$REPORT" ]; then
  sections=$(grep -cE '^## [0-9]\.' "$REPORT" || true)
  if [ "$sections" -ge 6 ]; then
    check "Report has ≥6 numbered top-level sections (actual: $sections)" "true"
  else
    check "Report has ≥6 numbered top-level sections (actual: $sections)" "false"
  fi
fi

# Check 7: oss-whitelist.json valid JSON
if [ -f "$WHITELIST" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('$WHITELIST','utf8'))" 2>/dev/null; then
    check "oss-whitelist.json is valid JSON" "true"
  else
    check "oss-whitelist.json is valid JSON" "false"
  fi
fi

# Check 8: report mentions tsc baseline 0 errors
if [ -f "$REPORT" ]; then
  if grep -qE 'tsc.*0 (errors|hata)' "$REPORT" 2>/dev/null; then
    check "Report mentions tsc 0-error baseline" "true"
  else
    check "Report mentions tsc 0-error baseline" "false"
  fi
fi

# Check 9: report has Sprint 168 handoff section
if [ -f "$REPORT" ]; then
  if grep -qiE 'Sprint 168' "$REPORT" 2>/dev/null; then
    check "Report mentions Sprint 168 handoff" "true"
  else
    check "Report mentions Sprint 168 handoff" "false"
  fi
fi

# Check 10: report covers 4 BLOCKER candidate patterns
if [ -f "$REPORT" ]; then
  patterns=0
  grep -qiE 'private key' "$REPORT" && patterns=$((patterns+1))
  grep -qiE 'internal IP' "$REPORT" && patterns=$((patterns+1))
  grep -qiE 'API key' "$REPORT" && patterns=$((patterns+1))
  grep -qiE '\.env\.production' "$REPORT" && patterns=$((patterns+1))
  if [ "$patterns" -ge 4 ]; then
    check "Report covers 4 BLOCKER candidate patterns (actual: $patterns)" "true"
  else
    check "Report covers 4 BLOCKER candidate patterns (actual: $patterns)" "false"
  fi
fi

echo "==="
if [ "$pass" = "true" ]; then
  echo "RESULT: PASS"
  exit 0
else
  echo "RESULT: FAIL"
  exit 1
fi
