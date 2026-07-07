#!/usr/bin/env node
// lint-test-hermeticity.mjs — scan tests/ for direct reads of gitignored state.
//
// Non-hermetic tests read .deckent/config.json or .brain/memory.db from the LIVE
// project, causing CI failures on fresh checkouts where those files don't exist.
//
// Exit: 0 = clean, 1 = violations found, 2 = scan error
// Usage: node scripts/lint-test-hermeticity.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

// Files with explicit skip-if-absent guards or meta-test exemptions.
// Add here when the test has a proper it.skipIf / ctx.skip() / it.skip guard,
// OR when the file is a meta-test that uses the patterns as fixture data (not real access).
export const ALLOWLIST = [
  'tests/scripts/adr-validator.test.ts',              // it.skip blocks around .brain access
  'tests/core/nervous-enabled-integration.test.ts',   // it.skipIf(!hasProjectConfig) guard
  'tests/orchestra/spawn-backend-docker.test.ts',     // ctx.skip() after null config check
  'tests/scripts/lint-test-hermeticity.test.ts',      // meta-test: patterns appear as fixture data
  'tests/docs/api-md-no-stale-refs.test.ts',          // reads .brain/exports/*.md — git-TRACKED files, present on fresh checkout
  'tests/cli/helpers/i18n-coverage.test.ts',          // reads .deckent/i18n/ — git-TRACKED files, present on fresh checkout
  'tests/core/debt-002.test.ts',                      // reads .brain/exports/debt.md — git-TRACKED, present on fresh checkout
  'tests/core/features-manifest.test.ts',             // reads .deckent/settings/features-manifest.json — git-TRACKED, present on fresh checkout
];

// Per-line patterns that indicate non-hermetic access to live gitignored state.
// Each pattern represents a "live root" access that will fail on a fresh CI checkout.
export const HERMETIC_PATTERNS = [
  { re: /process\.cwd\(\)[^;\n]*\.deckent/, label: 'process.cwd() + .deckent (live root)' },
  { re: /process\.cwd\(\)[^;\n]*\.brain/, label: 'process.cwd() + .brain (live root)' },
  { re: /readFileSync\s*\([^)]*['"]\.deckent\/config\.json['"]/, label: '.deckent/config.json direct readFileSync' },
  { re: /readFileSync\s*\([^)]*['"]\.brain\/memory\.db['"]/, label: '.brain/memory.db direct readFileSync' },
];

// If any of these appear on the SAME violation line, it is treated as hermetic.
// (e.g. the path is inside a tmpdir-derived variable on the same expression.)
export const HERMETIC_LINE_EXEMPTIONS = [
  /tmpdir\s*\(\)/,
  /mkdtempSync\s*\(/,
  /\btmpDir\b|\btempDir\b|\bsandboxDir\b|\bsandbox\b/,
  /withSandboxHome/,
];

/**
 * Check a single test file's content for non-hermetic access patterns.
 * Returns an array of violation objects with file, line, match, label.
 * @param {string} content
 * @param {string} filePath - path used in report output (usually relative)
 * @returns {Array<{file: string, line: number, match: string, label: string}>}
 */
export function checkFile(content, filePath) {
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    for (const { re, label } of HERMETIC_PATTERNS) {
      if (!re.test(rawLine)) continue;
      // If the same line carries a hermetic context marker, it is safe
      if (HERMETIC_LINE_EXEMPTIONS.some((ex) => ex.test(rawLine))) continue;
      violations.push({ file: filePath, line: i + 1, match: rawLine.trim(), label });
    }
  }

  return violations;
}

/**
 * Recursively collect .test.ts and .test.tsx files under a directory.
 * @param {string} dir
 * @param {string[]} [results]
 * @returns {string[]} absolute paths
 */
function collectFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Scan all test files under `testsDir`, skipping files in the allowlist.
 * @param {string} testsDir - directory to scan
 * @param {string[]} [allowlist] - relative paths (from rootDir) to skip
 * @param {string} [rootDir] - project root for computing relative paths
 * @returns {{ violations: Array, checked: number, skipped: number }}
 */
export function scanTestDir(testsDir, allowlist = ALLOWLIST, rootDir = REPO_ROOT) {
  const allFiles = collectFiles(testsDir);
  const violations = [];
  let skipped = 0;
  let checked = 0;

  for (const absPath of allFiles) {
    const relPath = relative(rootDir, absPath);
    if (allowlist.includes(relPath)) {
      skipped++;
      continue;
    }
    const content = readFileSync(absPath, 'utf-8');
    const fileViolations = checkFile(content, relPath);
    violations.push(...fileViolations);
    checked++;
  }

  return { violations, checked, skipped };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const testsDir = join(REPO_ROOT, 'tests');
  let result;
  try {
    result = scanTestDir(testsDir);
  } catch (err) {
    process.stderr.write(`[hermetic-lint] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  if (result.violations.length === 0) {
    process.stdout.write(
      `[hermetic-lint] ✓ ${result.checked} files checked, ${result.skipped} allowlisted — 0 violations\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[hermetic-lint] FAIL: ${result.violations.length} violation(s) found:\n`);
  for (const v of result.violations) {
    process.stderr.write(`  ${v.file}:${v.line}: [${v.label}]\n    ${v.match}\n`);
  }
  process.exit(1);
}
