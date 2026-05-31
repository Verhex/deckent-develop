#!/usr/bin/env node
/**
 * Zero-Hardcode Audit — Sprint 208 (READ-ONLY lint guard)
 *
 * Scans src/ for hardcoded model-version string literals
 * (e.g. claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5-20251001).
 *
 * Legitimate sources (allowlist) are exempt:
 *   - src/core/model-registry.ts  — bundled snapshot, single source of truth
 *   - src/core/model-catalog.ts   — catalog merge module
 *
 * Test files (*.test.ts, tests/**) are always exempt.
 * Comment lines (// ...) and JSDoc lines (* ...) are skipped.
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — violations found (list printed to stdout) OR scan error
 *
 * Usage:
 *   node scripts/zero-hardcode-audit.mjs [--root <path>] [--json]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// ─── Pattern ──────────────────────────────────────────────────────────────

/** Matches hardcoded Claude model version strings in code. */
const MODEL_VERSION_PATTERN = /claude-(opus|sonnet|haiku)-\d+(-[\w]+)+/g;

// ─── Allowlist ────────────────────────────────────────────────────────────

/** Files exempt from scanning (relative to project root, forward slashes). */
const ALLOWLIST_RELATIVE = new Set([
  'src/core/model-registry.ts',
  'src/core/model-catalog.ts',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Returns true if the file path is on the allowlist. */
export function isAllowlisted(filePath, projectRoot) {
  const rel = relative(resolve(projectRoot), resolve(filePath)).replace(/\\/g, '/');
  return ALLOWLIST_RELATIVE.has(rel);
}

/** Returns true if the line is a comment (should be skipped). */
export function isCommentLine(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*');
}

/** Returns true if the file should be skipped (test file or script). */
export function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('/tests/') ||
    normalized.includes('.test.ts') ||
    normalized.includes('.test.tsx') ||
    normalized.includes('.spec.ts') ||
    normalized.includes('/scripts/')
  );
}

/**
 * Scans a single file for hardcoded model-version violations.
 * Returns an array of violation objects.
 */
export function scanFile(filePath) {
  const violations = [];
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return violations;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    const matches = [...line.matchAll(MODEL_VERSION_PATTERN)];
    for (const match of matches) {
      violations.push({
        file: filePath,
        line: i + 1,
        match: match[0],
        lineContent: line.trimEnd(),
      });
    }
  }
  return violations;
}

/** Recursively collects all .ts files under a directory. */
function collectTsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Scans src/ under projectRoot for hardcoded model-version violations.
 * Returns { violations, exitCode }.
 */
export function scanForViolations(projectRoot) {
  const srcDir = join(resolve(projectRoot), 'src');
  const files = collectTsFiles(srcDir);

  const allViolations = [];
  for (const file of files) {
    if (isAllowlisted(file, projectRoot)) continue;
    if (isTestFile(file)) continue;
    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  return {
    violations: allViolations,
    exitCode: allViolations.length > 0 ? 1 : 0,
  };
}

// ─── CLI entry ────────────────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('zero-hardcode-audit.mjs') ||
  process.argv[1].endsWith('zero-hardcode-audit.js')
);

if (isMain) {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const rootIdx = args.indexOf('--root');
  const projectRoot = rootIdx !== -1 && args[rootIdx + 1]
    ? resolve(args[rootIdx + 1])
    : process.cwd();

  let result;
  try {
    result = scanForViolations(projectRoot);
  } catch (err) {
    console.error('zero-hardcode-audit: scan error —', err.message);
    process.exit(1);
  }

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.violations.length === 0) {
    console.log('zero-hardcode-audit: OK — no hardcoded model version strings found');
  } else {
    console.log(`zero-hardcode-audit: FAIL — ${result.violations.length} violation(s):\n`);
    for (const v of result.violations) {
      console.log(`  ${v.file}:${v.line}  [${v.match}]`);
      console.log(`    ${v.lineContent}`);
    }
  }

  process.exit(result.exitCode);
}
