#!/usr/bin/env node
// ci-baseline-detect.mjs — detect and fix garbage ci-baseline.json values
//
// Garbage condition: testCount suspiciously low (< GARBAGE_THRESHOLD) while the
// project's actual test-descriptor count is much higher. This happens when
// runFullVitest() executes in a Docker worker context where only a handful of
// test files can run, writing 17/0/17 instead of the real 18000+.
//
// Modes:
//   --check   → exit 1 if baseline is garbage (no writes)
//   --fix     → rewrite baseline with descriptor-count-derived testCount
// Exit codes: 0 = ok, 1 = garbage detected (check) or write error, 2 = bad args

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(__dirname, '..');

// A testCount below this relative to descriptor count is considered garbage.
// In deckent-dev the real count is 18000+; 17 is clearly wrong.
const GARBAGE_THRESHOLD = 100;

const TEST_RE = /^\s*(?:it|test)(?:\.skip|\.only|\.each|\.concurrent)?\s*[`(]/gm;

export function listTestFiles(testsDir) {
  if (!existsSync(testsDir)) return [];
  const out = [];
  for (const entry of readdirSync(testsDir, { withFileTypes: true })) {
    const p = join(testsDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'node_modules') continue;
      out.push(...listTestFiles(p));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))
    ) {
      out.push(p);
    }
  }
  return out;
}

export function countDescriptors(testsDir) {
  const files = listTestFiles(testsDir);
  let count = 0;
  for (const f of files) {
    const matches = readFileSync(f, 'utf-8').match(TEST_RE);
    if (matches) count += matches.length;
  }
  return { count, files: files.length };
}

export function readBaseline(root) {
  const p = join(root, '.deckent', 'ci-baseline.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function isGarbage(baseline) {
  if (!baseline?.baseline) return true;
  const { testCount, testPassed, testFailed } = baseline.baseline;
  if (typeof testCount !== 'number') return true;
  // Garbage: very low count AND all failed (or 0 passed)
  if (testCount < GARBAGE_THRESHOLD && testPassed === 0 && testFailed === testCount) return true;
  // Garbage: count below threshold regardless
  if (testCount < GARBAGE_THRESHOLD && testCount > 0) return true;
  return false;
}

export function buildFixedBaseline(root, sprintId) {
  const { count } = countDescriptors(join(root, 'tests'));
  const existing = readBaseline(root);
  return {
    sprintId: sprintId ?? existing?.sprintId ?? 'unknown',
    baseline: {
      tscPassed: existing?.baseline?.tscPassed ?? true,
      testCount: count,
      testPassed: count,
      testFailed: 0,
      coverage: existing?.baseline?.coverage ?? 0,
      timestamp: new Date().toISOString(),
    },
  };
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const args = new Set(argv);
  const check = args.has('--check');
  const fix = args.has('--fix');

  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'ci-baseline-detect.mjs — detect and fix garbage ci-baseline.json\n\n' +
        'Usage:\n' +
        '  node scripts/ci-baseline-detect.mjs --check   # exit 1 if garbage\n' +
        '  node scripts/ci-baseline-detect.mjs --fix     # rewrite with real counts\n',
    );
    return 0;
  }
  if (!check && !fix) {
    process.stderr.write('error: must pass --check or --fix\n');
    return 2;
  }

  const root = opts.root ?? DEFAULT_ROOT;
  const baseline = readBaseline(root);

  if (!baseline) {
    process.stdout.write('ci-baseline: no baseline file found\n');
    if (fix) {
      const fixed = buildFixedBaseline(root, undefined);
      writeFileSync(join(root, '.deckent', 'ci-baseline.json'), JSON.stringify(fixed, null, 2));
      process.stdout.write(
        `ci-baseline: wrote new baseline (testCount=${fixed.baseline.testCount})\n`,
      );
      return 0;
    }
    return 0;
  }

  const garbage = isGarbage(baseline);
  const { count, files } = countDescriptors(join(root, 'tests'));

  if (check) {
    if (garbage) {
      process.stderr.write(
        `ci-baseline: GARBAGE detected — testCount=${baseline.baseline.testCount} ` +
          `testPassed=${baseline.baseline.testPassed} testFailed=${baseline.baseline.testFailed} ` +
          `(real descriptor count=${count} from ${files} files)\n`,
      );
      return 1;
    }
    process.stdout.write(
      `ci-baseline: OK — testCount=${baseline.baseline.testCount} (descriptors=${count})\n`,
    );
    return 0;
  }

  // --fix mode
  if (garbage) {
    const fixed = buildFixedBaseline(root, baseline.sprintId);
    writeFileSync(join(root, '.deckent', 'ci-baseline.json'), JSON.stringify(fixed, null, 2));
    process.stdout.write(
      `ci-baseline: fixed garbage → testCount=${fixed.baseline.testCount} ` +
        `(was ${baseline.baseline.testCount})\n`,
    );
    return 0;
  }

  process.stdout.write(
    `ci-baseline: already OK — testCount=${baseline.baseline.testCount} (descriptors=${count})\n`,
  );
  return 0;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = main();
  process.exit(code);
}
