#!/usr/bin/env node
/**
 * verify-gitignore.mjs — Verify critical files are properly gitignored.
 *
 * Checks:
 * 1. .brain/memory.db, memory.db-shm, memory.db-wal are in .gitignore
 * 2. None of these files are tracked by git (git ls-files)
 *
 * Exit 0 = OK, Exit 1 = problem found.
 * Usage: node scripts/verify-gitignore.mjs [--root <path>]
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const root = rootIdx !== -1 && args[rootIdx + 1] ? resolve(args[rootIdx + 1]) : process.cwd();

const CRITICAL_PATTERNS = [
  '.brain/memory.db',
  '.brain/memory.db-shm',
  '.brain/memory.db-wal',
];

let hasError = false;

// Check 1: .gitignore entries exist
const gitignorePath = join(root, '.gitignore');
if (!existsSync(gitignorePath)) {
  console.error('[FAIL] .gitignore not found');
  process.exit(1);
}

const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
const gitignoreLines = gitignoreContent.split('\n').map(l => l.trim());

for (const pattern of CRITICAL_PATTERNS) {
  if (!gitignoreLines.includes(pattern)) {
    console.error(`[FAIL] "${pattern}" not found in .gitignore`);
    hasError = true;
  }
}

// Check 2: Files not tracked by git
try {
  const tracked = execSync('git ls-files ' + CRITICAL_PATTERNS.join(' '), {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  if (tracked.length > 0) {
    for (const file of tracked.split('\n')) {
      console.error(`[FAIL] "${file}" is tracked by git — run: git rm --cached ${file}`);
      hasError = true;
    }
  }
} catch {
  // git ls-files exits 0 even with no matches; catch unexpected errors
}

if (hasError) {
  process.exit(1);
} else {
  console.log('[OK] All critical files properly gitignored');
  process.exit(0);
}
