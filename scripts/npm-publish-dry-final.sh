#!/bin/bash
# npm-publish-dry-final.sh — Sprint 150 Beta GA final publish rehearsal
# Validates npm pack + publish dry-run for deckent 1.0.0-beta.1
# Includes T-150-031 built-in agent/skill bundle verification
set -euo pipefail

TARGET_VERSION="1.0.0-beta.1"
MAX_SIZE_BYTES=2000000  # 2MB

echo "╔══════════════════════════════════════════════════╗"
echo "║   deckent npm publish dry-run FINAL — Beta GA   ║"
echo "║   Target: v${TARGET_VERSION}                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Version bump (no git tag, no git commit) ─────────────────────────
echo "▶ Step 1: Version → ${TARGET_VERSION}"
npm version "${TARGET_VERSION}" --no-git-tag-version --allow-same-version 2>&1
echo ""

# ── Step 2: npm pack --dry-run ────────────────────────────────────────────────
echo "▶ Step 2: npm pack --dry-run"
npm pack --dry-run 2>&1 | tee /tmp/pack-final.log
echo ""

# ── Step 3: Tarball size check ───────────────────────────────────────────────
echo "▶ Step 3: Tarball size check (limit: 2MB)"
PACK_JSON=$(npm pack --json 2>/dev/null)
SIZE=$(node -e "const d = ${PACK_JSON}; console.log(Array.isArray(d) ? d[0].size : d.size || 0)")

if [ "${SIZE}" -gt "${MAX_SIZE_BYTES}" ]; then
  echo "❌ Tarball too large: ${SIZE} bytes (limit: ${MAX_SIZE_BYTES})"
  exit 1
fi
echo "✅ Tarball size: ${SIZE} bytes (under ${MAX_SIZE_BYTES})"

# Clean up generated tgz
find . -maxdepth 1 -name "deckent-*.tgz" -delete 2>/dev/null || true
echo ""

# ── Step 4: Secret scan ───────────────────────────────────────────────────────
echo "▶ Step 4: Secret pattern scan"
FAILED_SECRET=0

# Check for secret files being included
if grep -iE "ANTHROPIC_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY" /tmp/pack-final.log 2>/dev/null; then
  echo "❌ Potential API key pattern found in pack output"
  FAILED_SECRET=1
fi

# Check .deck secret file is excluded (exact path ending in /.deck or the literal .deck file)
if grep -E "npm notice [0-9]+(B|kB) \.deck$" /tmp/pack-final.log 2>/dev/null; then
  echo "❌ .deck secret file found in tarball!"
  FAILED_SECRET=1
fi

# Check credentials files
if grep -iE "credentials\.json|\.env$" /tmp/pack-final.log 2>/dev/null; then
  echo "❌ Credentials file found in tarball!"
  FAILED_SECRET=1
fi

if [ "${FAILED_SECRET}" -eq 1 ]; then
  exit 1
fi
echo "✅ No secret patterns detected"
echo ""

# ── Step 5: package.json metadata check ──────────────────────────────────────
echo "▶ Step 5: package.json metadata completeness"
FAILED_META=0

required_fields=("description" "homepage" "bugs" "repository" "keywords" "license")
for field in "${required_fields[@]}"; do
  result=$(node -e "
    const p = JSON.parse(require('fs').readFileSync('./package.json', 'utf-8'));
    const val = p['${field}'];
    if (!val || (Array.isArray(val) && val.length === 0)) process.exit(1);
    console.log('present');
  " 2>/dev/null || echo "missing")

  if [ "${result}" = "missing" ]; then
    echo "❌ Missing or empty field: ${field}"
    FAILED_META=1
  else
    echo "✅ ${field}: present"
  fi
done

if [ "${FAILED_META}" -eq 1 ]; then
  exit 1
fi
echo ""

# ── Step 6: Version verification ─────────────────────────────────────────────
echo "▶ Step 6: Version verification"
CURRENT_VERSION=$(node -e "
  const p = JSON.parse(require('fs').readFileSync('./package.json', 'utf-8'));
  console.log(p.version);
")

if [ "${CURRENT_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "✅ package.json version: ${CURRENT_VERSION}"
else
  echo "❌ Version mismatch: expected ${TARGET_VERSION}, got ${CURRENT_VERSION}"
  exit 1
fi
echo ""

# ── Step 7: Required files inclusion check ───────────────────────────────────
echo "▶ Step 7: Required files inclusion"
FAILED_FILES=0

REQUIRED_PATTERNS=("dist/" "README.md" "LICENSE" "package.json")
for req in "${REQUIRED_PATTERNS[@]}"; do
  if grep -q "${req}" /tmp/pack-final.log 2>/dev/null; then
    echo "✅ ${req} included"
  else
    echo "❌ MISSING: ${req} not found in package"
    FAILED_FILES=1
  fi
done

if [ "${FAILED_FILES}" -eq 1 ]; then
  exit 1
fi
echo ""

# ── Step 8: Built-in agent/skill bundle check (T-150-031) ────────────────────
echo "▶ Step 8: Built-in bundle verification (T-150-031)"
BUILTIN_AGENTS=$(grep -c "dist/core/builtins/agents/.*\.json" /tmp/pack-final.log 2>/dev/null || echo 0)
BUILTIN_SKILLS=$(grep -c "dist/core/builtins/skills/.*\.json" /tmp/pack-final.log 2>/dev/null || echo 0)

echo "  Built-in agents found: ${BUILTIN_AGENTS} (required: ≥15)"
echo "  Built-in skills found: ${BUILTIN_SKILLS} (required: ≥21)"

if [ "${BUILTIN_AGENTS}" -lt 15 ]; then
  echo "❌ Built-in agents bundle incomplete: ${BUILTIN_AGENTS} < 15 (T-150-031 not complete?)"
  echo "   Run: node scripts/bundle-builtins.mjs then npm run build"
  exit 1
fi
if [ "${BUILTIN_SKILLS}" -lt 21 ]; then
  echo "❌ Built-in skills bundle incomplete: ${BUILTIN_SKILLS} < 21 (T-150-031 not complete?)"
  echo "   Run: node scripts/bundle-builtins.mjs then npm run build"
  exit 1
fi
echo "✅ Built-in bundle: ${BUILTIN_AGENTS} agents, ${BUILTIN_SKILLS} skills"
echo ""

# ── Step 9: Sensitive directory exclusion ────────────────────────────────────
echo "▶ Step 9: Sensitive directory exclusion check"
SENSITIVE_DIRS=(".brain/" ".tasks/" ".deckent/" ".locks/")
FAILED_SENSITIVE=0

for dir in "${SENSITIVE_DIRS[@]}"; do
  if grep -q "${dir}" /tmp/pack-final.log 2>/dev/null; then
    echo "❌ SENSITIVE: ${dir} found in package!"
    FAILED_SENSITIVE=1
  else
    echo "✅ ${dir} correctly excluded"
  fi
done

if [ "${FAILED_SENSITIVE}" -eq 1 ]; then
  exit 1
fi
echo ""

# ── All checks passed ─────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════"
echo "✅ npm publish dry-run FINAL PASS — deckent v${TARGET_VERSION}"
echo "══════════════════════════════════════════════════════"
echo ""
echo "Next steps (Sprint 150 Beta GA):"
echo "  1. npm publish --tag beta  (after Alperen approval)"
echo "  2. git tag v${TARGET_VERSION} && git push --tags"
echo "  3. VerhexIO/deckent public flip"
