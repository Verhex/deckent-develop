#!/bin/bash
# npm-publish-dry.sh — Sprint 149 publish rehearsal
# Validates npm pack + publish dry-run for deckent 0.4.0-beta.4
set -euo pipefail

TARGET_VERSION="0.4.0-beta.4"
MAX_SIZE_BYTES=2000000  # 2MB

echo "╔══════════════════════════════════════════════════╗"
echo "║     deckent npm publish dry-run rehearsal        ║"
echo "║     Target: v${TARGET_VERSION}                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Version bump (no git tag, no git commit) ─────────────────────────
echo "▶ Step 1: Version → ${TARGET_VERSION}"
npm version "${TARGET_VERSION}" --no-git-tag-version --allow-same-version 2>&1
echo ""

# ── Step 2: npm pack --dry-run ────────────────────────────────────────────────
echo "▶ Step 2: npm pack --dry-run"
npm pack --dry-run 2>&1 | tee /tmp/npm-pack-dry.log
echo ""

# ── Step 3: npm publish --dry-run ────────────────────────────────────────────
echo "▶ Step 3: npm publish --dry-run"
npm publish --dry-run 2>&1 | tee /tmp/npm-publish-dry.log || true
echo ""

# ── Step 4: Tarball size check (via npm pack --json + node) ──────────────────
echo "▶ Step 4: Tarball size check (limit: 2MB compressed)"
PACK_JSON=$(npm pack --json 2>/dev/null)
SIZE=$(node -e "const d = ${PACK_JSON}; console.log(Array.isArray(d) ? d[0].size : d.size || 0)")

if [ "${SIZE}" -gt "${MAX_SIZE_BYTES}" ]; then
  echo "❌ Tarball too large: ${SIZE} bytes (limit: ${MAX_SIZE_BYTES})"
  exit 1
fi
echo "✅ Tarball size: ${SIZE} bytes (under ${MAX_SIZE_BYTES})"
echo ""

# Clean up generated tgz
find . -maxdepth 1 -name "deckent-*.tgz" -delete 2>/dev/null || true

# ── Step 5: Secret pattern check ─────────────────────────────────────────────
echo "▶ Step 5: Secret pattern check"
SECRET_PATTERNS="ANTHROPIC_API_KEY\|OPENAI_API_KEY\|GOOGLE_API_KEY\|\.env\|password\|secret"

if grep -i "${SECRET_PATTERNS}" /tmp/npm-pack-dry.log 2>/dev/null; then
  echo "❌ Potential secret patterns found in pack output"
  exit 1
fi
echo "✅ No secret patterns found"
echo ""

# ── Step 6: Sensitive directory exclusion check ───────────────────────────────
echo "▶ Step 6: Sensitive directory exclusion check"
FAILED=0
SENSITIVE_DIRS=(".brain/" ".tasks/" ".deckent/" ".locks/" "tests/" "src/")

for dir in "${SENSITIVE_DIRS[@]}"; do
  if grep -q "${dir}" /tmp/npm-pack-dry.log 2>/dev/null; then
    echo "❌ SENSITIVE: ${dir} found in package!"
    FAILED=1
  else
    echo "✅ ${dir} correctly excluded"
  fi
done

if [ "${FAILED}" -eq 1 ]; then
  exit 1
fi
echo ""

# ── Step 7: Required files check ─────────────────────────────────────────────
echo "▶ Step 7: Required files check"
REQUIRED=("dist/" "README.md" "LICENSE" "package.json")
FAILED=0

for req in "${REQUIRED[@]}"; do
  if grep -q "${req}" /tmp/npm-pack-dry.log 2>/dev/null; then
    echo "✅ ${req} included"
  else
    echo "❌ MISSING: ${req} not found in package"
    FAILED=1
  fi
done

if [ "${FAILED}" -eq 1 ]; then
  exit 1
fi
echo ""

# ── Step 8: Version verification ─────────────────────────────────────────────
echo "▶ Step 8: Version verification"
CURRENT_VERSION=$(node -e "const p = require('./package.json'); console.log(p.version)")
if [ "${CURRENT_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "✅ package.json version: ${CURRENT_VERSION}"
else
  echo "❌ Version mismatch: expected ${TARGET_VERSION}, got ${CURRENT_VERSION}"
  exit 1
fi
echo ""

echo "══════════════════════════════════════════════════"
echo "✅ npm publish dry-run PASS — deckent v${TARGET_VERSION}"
echo "══════════════════════════════════════════════════"
