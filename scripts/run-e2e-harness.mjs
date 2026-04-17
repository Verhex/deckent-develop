#!/usr/bin/env node
// ─── E2E Chain Safety Harness Runner ─────────────────────────────────────
// Runs the chain safety E2E tests as a standalone script.
// Usage: node scripts/run-e2e-harness.mjs
//        npm run e2e:chain  (if configured in package.json)
//
// Exit codes:
//   0 — all tests passed
//   1 — test failures detected

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const testFiles = [
  'tests/e2e/chain-safety.e2e.test.ts',
  'tests/e2e/sprint-lifecycle.test.ts',
];

console.log('=== E2E Chain Safety Harness ===');
console.log(`Project root: ${projectRoot}`);
console.log(`Test files: ${testFiles.join(', ')}`);
console.log('');

try {
  const cmd = `npx vitest run ${testFiles.join(' ')} --reporter=verbose`;
  console.log(`Running: ${cmd}`);
  console.log('');

  execSync(cmd, {
    cwd: projectRoot,
    stdio: 'inherit',
    timeout: 120_000, // 2 min max
  });

  console.log('');
  console.log('=== CHAIN SAFETY GATE: ALL TESTS PASSED ===');
  process.exit(0);
} catch (error) {
  console.error('');
  console.error('=== CHAIN SAFETY GATE: TESTS FAILED ===');
  console.error('Chain safety gate would ABORT the next sprint trigger.');
  process.exit(1);
}
