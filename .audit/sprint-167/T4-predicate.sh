#!/usr/bin/env bash
# T4 GO/NO_GO Predicate Script
# Sprint 167 — Read-Only Self-Audit / Task 167-004
#
# Exits 0 (PASS) only when every predicate evaluates true.
# Exits non-zero (FAIL) with explicit failed-check message on first failure.

set -u
set -o pipefail

REPORT=".audit/sprint-167/T4-memory-integrity.md"
DB=".brain/memory.db"

# helper: emit failure + exit
fail() {
  echo "[T4-PREDICATE] FAIL: $1" >&2
  exit 1
}

# Pre-flight: prerequisites must exist.
[ -f "$REPORT" ] || fail "report file missing: $REPORT"
[ -f "$DB" ]     || fail "memory.db missing: $DB"

# Check 1: line count >= 300
LINES=$(wc -l < "$REPORT")
[ "$LINES" -ge 300 ] || fail "line count $LINES < 300 in $REPORT"

# Check 2: 'Bug Z3' mentioned at least once
BUGZ3=$(grep -c "Bug Z3" "$REPORT" || true)
[ "$BUGZ3" -ge 1 ] || fail "'Bug Z3' mentioned $BUGZ3 times in $REPORT (need >=1)"

# Check 3: 'FTS5' mentioned at least 3 times
FTS5=$(grep -c "FTS5" "$REPORT" || true)
[ "$FTS5" -ge 3 ] || fail "'FTS5' mentioned $FTS5 times in $REPORT (need >=3)"

# Check 4: at least 6 top-level sections
SECTIONS=$(grep -c "^## " "$REPORT" || true)
[ "$SECTIONS" -ge 6 ] || fail "section count $SECTIONS < 6 in $REPORT"

# Check 5: DB readable + entry row parity (entries vs entries_fts).
# Inline node so we don't depend on sqlite3 binary in the audit container.
node -e "
  try {
    const Database = require('better-sqlite3');
    const db = new Database('$DB', { readonly: true, fileMustExist: true });
    const e   = db.prepare('SELECT COUNT(*) AS c FROM entries').get().c;
    const fts = db.prepare('SELECT COUNT(*) AS c FROM entries_fts').get().c;
    if (e !== fts) { console.error('entries:' + e + ' fts:' + fts); process.exit(1); }
    const ic = db.prepare('PRAGMA integrity_check').get();
    if (ic.integrity_check !== 'ok') { console.error('integrity_check:' + ic.integrity_check); process.exit(1); }
    db.close();
    process.exit(0);
  } catch (err) { console.error(err.message); process.exit(1); }
" || fail "DB row parity / integrity_check failed (see node stderr above)"

# Check 6: backups are git-ignored (Section 4.2 evidence).
# Iterate over any matching .bak-* files; skip if none exist.
shopt -s nullglob
for bak in .brain/memory.db.bak-*; do
  if git check-ignore -q "$bak" 2>/dev/null; then
    :
  else
    fail "backup file not git-ignored: $bak (must match .gitignore .brain/memory.db.bak-* line)"
  fi
done
shopt -u nullglob

echo "[T4-PREDICATE] PASS"
echo "  lines=$LINES sections=$SECTIONS fts5=$FTS5 bug_z3=$BUGZ3"
exit 0
