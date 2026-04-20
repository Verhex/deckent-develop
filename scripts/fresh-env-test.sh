#!/bin/bash
# Fresh Install Matrix — Node 18/20/22 × Clean Env
# Runs deckent install + build + test in isolated Docker containers
# Usage: bash scripts/fresh-env-test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🧪 Fresh Install Matrix — Node 18/20/22"
echo "════════════════════════════════════════"

PASS=0
FAIL=0

for node_version in 18 20 22; do
  echo ""
  echo "▶ Testing Node ${node_version}..."
  echo "────────────────────────────────"

  if docker run --rm \
    -v "${PROJECT_DIR}:/src:ro" \
    "node:${node_version}-slim" \
    bash -c "
      set -e
      apt-get update -qq && apt-get install -y -qq git python3 make g++ > /dev/null 2>&1
      cp -r /src /tmp/deckent-test
      cd /tmp/deckent-test
      npm ci --loglevel=error 2>&1
      npm run build 2>&1
      node dist/cli/entry.js --version
      npx vitest run tests/e2e/install-matrix/fresh-install.test.ts --reporter=verbose 2>&1
    "; then
    echo "✅ Node ${node_version}: PASS"
    PASS=$((PASS + 1))
  else
    echo "❌ Node ${node_version}: FAIL"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "════════════════════════════════════════"
echo "Results: ${PASS} passed, ${FAIL} failed"
echo "════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo "❌ Fresh install matrix FAILED"
  exit 1
fi

echo "✅ Fresh install matrix PASS on Node 18/20/22"
exit 0
