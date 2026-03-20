#!/bin/bash
# changelog.sh - Generate CHANGELOG section from conventional commits
# Parses git log and generates a CHANGELOG section in markdown format
# Usage: ./changelog.sh [<since-tag>] [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

DRY_RUN=false
SINCE_TAG=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      SINCE_TAG="$1"
      shift
      ;;
  esac
done

# Get the current version from package.json
VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PROJECT_ROOT/package.json" | head -1 | cut -d'"' -f4)
RELEASE_DATE=$(date +%Y-%m-%d)

# If no tag specified, use the latest tag or start from the beginning
if [ -z "$SINCE_TAG" ]; then
  LATEST_TAG=$(git -C "$PROJECT_ROOT" describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -n "$LATEST_TAG" ]; then
    SINCE_TAG="$LATEST_TAG"
  fi
fi

# Generate the changelog section
CHANGELOG_SECTION="## [$VERSION] - $RELEASE_DATE

"

# Get commit log based on range
if [ -z "$SINCE_TAG" ]; then
  COMMITS=$(git -C "$PROJECT_ROOT" log --pretty=format:"%H|%s|%b" --reverse)
else
  COMMITS=$(git -C "$PROJECT_ROOT" log "$SINCE_TAG"..HEAD --pretty=format:"%H|%s|%b" --reverse)
fi

# Parse commits by type
declare -A FEATURES
declare -A FIXES
declare -A CHORES
declare -A BREAKING

while IFS='|' read -r HASH SUBJECT BODY; do
  if [ -z "$SUBJECT" ]; then
    continue
  fi

  # Extract type from conventional commit format (type(scope): message)
  if [[ $SUBJECT =~ ^(feat|fix|chore|docs|style|refactor|perf|test|ci)(\(.+\))?:\ (.+)$ ]]; then
    TYPE="${BASH_REMATCH[1]}"
    SCOPE="${BASH_REMATCH[2]}"
    MESSAGE="${BASH_REMATCH[3]}"

    # Sanitize hash for references
    SHORT_HASH="${HASH:0:7}"
    COMMIT_REF=" ([$SHORT_HASH](https://github.com/anthropics/deckent/commit/$HASH))"

    # Check for breaking changes
    if [[ $BODY =~ BREAKING\ CHANGE ]]; then
      BREAKING["${TYPE}:${MESSAGE}"]="${COMMIT_REF}"
    fi

    case "$TYPE" in
      feat)
        FEATURES["${MESSAGE}"]="${COMMIT_REF}"
        ;;
      fix)
        FIXES["${MESSAGE}"]="${COMMIT_REF}"
        ;;
      chore|docs|style|refactor|perf|test|ci)
        CHORES["${MESSAGE}"]="${COMMIT_REF}"
        ;;
    esac
  fi
done <<< "$COMMITS"

# Build changelog section with categories
if [ ${#BREAKING[@]} -gt 0 ]; then
  CHANGELOG_SECTION+="### ⚠️ Breaking Changes

"
  for msg in "${!BREAKING[@]}"; do
    CHANGELOG_SECTION+="- $msg${BREAKING[$msg]}"$'\n'
  done
  CHANGELOG_SECTION+=$'\n'
fi

if [ ${#FEATURES[@]} -gt 0 ]; then
  CHANGELOG_SECTION+="### 🎉 Features

"
  for msg in "${!FEATURES[@]}"; do
    CHANGELOG_SECTION+="- $msg${FEATURES[$msg]}"$'\n'
  done
  CHANGELOG_SECTION+=$'\n'
fi

if [ ${#FIXES[@]} -gt 0 ]; then
  CHANGELOG_SECTION+="### 🐛 Bug Fixes

"
  for msg in "${!FIXES[@]}"; do
    CHANGELOG_SECTION+="- $msg${FIXES[$msg]}"$'\n'
  done
  CHANGELOG_SECTION+=$'\n'
fi

if [ ${#CHORES[@]} -gt 0 ]; then
  CHANGELOG_SECTION+="### 📦 Chores

"
  for msg in "${!CHORES[@]}"; do
    CHANGELOG_SECTION+="- $msg${CHORES[$msg]}"$'\n'
  done
  CHANGELOG_SECTION+=$'\n'
fi

# Output or write to CHANGELOG.md
if [ "$DRY_RUN" = true ]; then
  echo "📝 Changelog section for $VERSION:"
  echo ""
  echo "$CHANGELOG_SECTION"
else
  CHANGELOG_FILE="$PROJECT_ROOT/CHANGELOG.md"

  if [ ! -f "$CHANGELOG_FILE" ]; then
    # Create new CHANGELOG.md with header
    {
      echo "# Changelog"
      echo ""
      echo "All notable changes to this project will be documented in this file."
      echo ""
      echo "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),"
      echo "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)."
      echo ""
      echo "$CHANGELOG_SECTION"
    } > "$CHANGELOG_FILE"
  else
    # Insert after the header (first 5 lines typically)
    {
      head -n 5 "$CHANGELOG_FILE"
      echo "$CHANGELOG_SECTION"
      tail -n +6 "$CHANGELOG_FILE"
    } > "$CHANGELOG_FILE.tmp"
    mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
  fi

  echo "✅ CHANGELOG.md updated with version $VERSION"
fi
