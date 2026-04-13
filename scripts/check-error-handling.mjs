#!/usr/bin/env node
/**
 * check-error-handling.mjs — ErrorRegistry Lint Rule Enforcement
 *
 * Scans src/orchestra/**\/*.ts for raw `throw new Error(` usage.
 * Each occurrence is a violation: use `throw new DeckentError(ErrorCode.DECKENT_EXXX, ...)`
 * or `ErrorRegistry.createError(...)` instead.
 *
 * Exit code 0  — no violations found
 * Exit code 1  — one or more violations found
 *
 * Usage:
 *   node scripts/check-error-handling.mjs
 *   npm run lint:errors
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── Config ─────────────────────────────────────────────────────────

const SCAN_DIRS = ['src/orchestra'];
const PATTERN = /throw new Error\(/g;

// These directories are excluded (test files are exempt)
const EXCLUDE_DIRS = new Set(['node_modules', 'dist']);

// ─── Scanner ─────────────────────────────────────────────────────────

/**
 * @typedef {{ file: string, line: number, content: string }} Violation
 */

/**
 * Scan a single .ts file for throw new Error( usage.
 * Returns array of violation objects.
 * @param {string} filePath
 * @returns {Array<{ file: string, line: number, content: string }>}
 */
export function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PATTERN.test(line)) {
      violations.push({
        file: filePath,
        line: i + 1,
        content: line.trim(),
      });
    }
    // Reset regex lastIndex (needed for global flag)
    PATTERN.lastIndex = 0;
  }

  return violations;
}

/**
 * Recursively collect all .ts files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
export function collectTsFiles(dir) {
  const files = [];

  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      const full = join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Run the lint check across all configured directories.
 * @param {string} root - project root (default: cwd parent of scripts/)
 * @returns {{ violations: Array<{ file: string, line: number, content: string }>, filesScanned: number }}
 */
export function runCheck(root = ROOT) {
  const allViolations = [];
  let filesScanned = 0;

  for (const scanDir of SCAN_DIRS) {
    const absDir = join(root, scanDir);
    const files = collectTsFiles(absDir);

    for (const file of files) {
      const violations = scanFile(file);
      allViolations.push(...violations);
      filesScanned++;
    }
  }

  return { violations: allViolations, filesScanned };
}

/**
 * Format violations for human-readable output.
 * @param {Array<{ file: string, line: number, content: string }>} violations
 * @param {string} root
 * @returns {string}
 */
export function formatViolations(violations, root = ROOT) {
  if (violations.length === 0) return '';

  const lines = [
    `ErrorRegistry lint: ${violations.length} violation(s) found in src/orchestra/`,
    '',
    'Violations:',
  ];

  for (const v of violations) {
    const rel = relative(root, v.file);
    lines.push(`  ${rel}:${v.line}`);
    lines.push(`    Found:    ${v.content}`);
    lines.push(`    Suggested fix: throw new DeckentError(ErrorCode.DECKENT_EXXX, message)`);
    lines.push('');
  }

  lines.push('How to fix:');
  lines.push('  1. Import DeckentError and ErrorCode from \'../core/errors.js\'');
  lines.push('  2. Add a new error code to ErrorRegistry in src/core/errors.ts if needed');
  lines.push('  3. Replace throw new Error(...) with throw new DeckentError(ErrorCode.DECKENT_EXXX, ...)');
  lines.push('  4. Run: npm run lint:errors to verify the fix');

  return lines.join('\n');
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

// Only run as main module (not when imported as library)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const { violations, filesScanned } = runCheck();

  if (violations.length === 0) {
    console.log(`ErrorRegistry lint: OK — ${filesScanned} file(s) scanned, 0 violations`);
    process.exit(0);
  } else {
    console.error(formatViolations(violations));
    console.error(`\nResult: ${violations.length} violation(s) across ${filesScanned} files — FAIL`);
    process.exit(1);
  }
}
