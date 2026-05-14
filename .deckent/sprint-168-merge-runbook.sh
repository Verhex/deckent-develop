#!/bin/bash
# Sprint 168 Wave 4 — Merge cluster commits to main (cascade order)
# Reference: Plan Section "Wave 4" Step 1 (lines 1436-1448)
#
# DOES NOT run automatically — Alperen runs this manually after all subagents DONE.

set -e

REPO_ROOT="/home/alperen/deckent-dev"
cd "$REPO_ROOT"

# Cascade order (Plan Section "Dispatch Sequence — Merge to main"):
# C0e (endpoint) → C0b → C0c → C0a-1 → C0a-2 → C0a-3 → C0a-4 → C0d → ADR-047
MERGE_ORDER=("C0e" "C0b" "C0c" "C0a-1" "C0a-2" "C0a-3" "C0a-4" "C0d" "ADR-047")

echo "=== Sprint 168 Wave 4 merge — cascade order ==="
git status

for cluster in "${MERGE_ORDER[@]}"; do
  WORKTREE="../deckent-sprint-168-${cluster}"
  RESULT_JSON=".deckent/sprint-168-${cluster}-result.json"

  if [ ! -d "$WORKTREE" ]; then
    echo "✗ Worktree missing: $WORKTREE — SKIP $cluster"
    continue
  fi
  if [ ! -f "$RESULT_JSON" ]; then
    echo "✗ No result JSON for $cluster — SKIP (subagent did not finish)"
    continue
  fi

  STATUS=$(jq -r '.status' "$RESULT_JSON" 2>/dev/null || echo "UNKNOWN")
  if [ "$STATUS" = "NO_GO" ]; then
    echo "✗ $cluster status=NO_GO — SKIP (manual review needed)"
    continue
  fi

  echo ""
  echo "→ Merging $cluster (status=$STATUS) ..."

  # Cherry-pick commits in cluster branch since main
  HASHES=$(git -C "$WORKTREE" log --oneline main..HEAD 2>/dev/null | awk '{print $1}' | tac)
  if [ -z "$HASHES" ]; then
    echo "  ○ No new commits in $cluster — skip"
    continue
  fi
  for hash in $HASHES; do
    echo "  • cherry-pick $hash"
    if ! git cherry-pick "$hash"; then
      echo "  ✗ Cherry-pick conflict — manual resolve needed for $cluster ($hash)"
      git cherry-pick --abort
      exit 1
    fi
  done
done

echo ""
echo "=== Merge complete — verify ==="
git log --oneline -20
echo ""
echo "Run next:"
echo "  npm run build && npx tsc --noEmit"
echo "  npx vitest run --reporter=basic 2>&1 | tail -10"
