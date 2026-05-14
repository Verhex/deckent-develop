#!/bin/bash
# Sprint 168 Brain Repair Phase — Worktree Setup
# Plan: docs/superpowers/plans/2026-05-14-sprint-168-plan.md (Section "Worktree Setup Script")
# Creates 9 isolated worktrees (8 anchor + ADR-047 meta) from main branch.
set -e

CLUSTERS=("C0a-1" "C0a-2" "C0a-3" "C0a-4" "C0b" "C0c" "C0d" "C0e" "ADR-047")
BASE_DIR=$(dirname $(pwd))

for cluster in "${CLUSTERS[@]}"; do
  WORKTREE_DIR="${BASE_DIR}/deckent-sprint-168-${cluster}"
  BRANCH_NAME="sprint-168-${cluster}"
  if [ ! -d "$WORKTREE_DIR" ]; then
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" main
    echo "✓ Worktree created: $WORKTREE_DIR (branch $BRANCH_NAME)"
  else
    echo "○ Worktree exists: $WORKTREE_DIR"
  fi
done

echo ""
echo "=== Worktree list ==="
git worktree list
