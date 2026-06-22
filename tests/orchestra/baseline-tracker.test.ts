import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  writeBaseline,
  readBaseline,
  compareBaseline,
  parseVitestOutput,
  containsHonestyTrigger,
  checkWorkerHonesty,
  captureVitestBaseline,
  baselinePath,
  HONESTY_TRIGGER_PATTERNS,
} from '../../src/orchestra/baseline-tracker.js';
import type { TestBaseline } from '../../src/orchestra/baseline-tracker.js';
import { mkdirSync, existsSync, rmSync } from 'node:fs';

// ─── Test Helpers ───────────────────────────────────────────────────

const TEST_ROOT = join(process.cwd(), '.test-baseline-tracker');

function makeBaseline(overrides: Partial<TestBaseline> = {}): TestBaseline {
  return {
    files: 500,
    pass: 12000,
    fail: 0,
    skipped: 16,
    timestamp: '2026-04-11T13:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ─── Test Suite ─────────────────────────────────────────────────────

describe('baseline-tracker', () => {
  // Test 1: writeBaseline happy path
  describe('writeBaseline', () => {
    it('writes baseline JSON to .deckent/sprint-NNN-baseline.json', () => {
      const baseline = makeBaseline({ pass: 12372, fail: 0, files: 500 });
      writeBaseline(TEST_ROOT, 'sprint-134', baseline);

      const filePath = baselinePath(TEST_ROOT, 'sprint-134');
      expect(existsSync(filePath)).toBe(true);

      const read = readBaseline(TEST_ROOT, 'sprint-134');
      expect(read).not.toBeNull();
      expect(read!.pass).toBe(12372);
      expect(read!.fail).toBe(0);
      expect(read!.files).toBe(500);
    });

    it('creates .deckent directory if it does not exist', () => {
      const freshRoot = join(TEST_ROOT, 'fresh');
      const baseline = makeBaseline();
      writeBaseline(freshRoot, 'sprint-001', baseline);

      expect(existsSync(join(freshRoot, '.deckent'))).toBe(true);
      expect(readBaseline(freshRoot, 'sprint-001')).toEqual(baseline);
    });
  });

  // readBaseline edge cases
  describe('readBaseline', () => {
    it('returns null for non-existent baseline', () => {
      expect(readBaseline(TEST_ROOT, 'sprint-999')).toBeNull();
    });
  });

  // Test 4: compareBaseline — delta > 0 (HONESTY_VIOLATION case)
  describe('compareBaseline', () => {
    it('detects new failures (delta > 0) → claimValid = false', () => {
      const baseline = makeBaseline({ fail: 2 });
      const current = makeBaseline({ fail: 5 });

      const result = compareBaseline(baseline, current);
      expect(result.newFailures).toBe(3);
      expect(result.claimValid).toBe(false);
    });

    // Test 3: delta == 0 → claim valid
    it('validates claim when no new failures (delta == 0)', () => {
      const baseline = makeBaseline({ fail: 3 });
      const current = makeBaseline({ fail: 3 });

      const result = compareBaseline(baseline, current);
      expect(result.newFailures).toBe(0);
      expect(result.claimValid).toBe(true);
    });

    it('validates claim when failures decreased (delta < 0)', () => {
      const baseline = makeBaseline({ fail: 5 });
      const current = makeBaseline({ fail: 2 });

      const result = compareBaseline(baseline, current);
      expect(result.newFailures).toBe(-3);
      expect(result.claimValid).toBe(true);
    });
  });

  // parseVitestOutput
  describe('parseVitestOutput', () => {
    it('parses standard vitest summary output', () => {
      const output = `
 ✓ tests/core/types.test.ts (5)
 ✓ tests/core/config.test.ts (12)

 Test Files  120 passed (122)
 Tests  12372 passed | 3 failed | 16 skipped (12391)
 Duration  91.6s
`;
      const result = parseVitestOutput(output);
      expect(result).not.toBeNull();
      expect(result!.pass).toBe(12372);
      expect(result!.fail).toBe(3);
      expect(result!.skipped).toBe(16);
      expect(result!.files).toBe(122);
    });

    it('returns null for unparseable output', () => {
      const result = parseVitestOutput('nothing useful here');
      expect(result).toBeNull();
    });
  });

  // ─── containsHonestyTrigger ───────────────────────────────────────

  describe('containsHonestyTrigger', () => {
    // Test 2: regex triggering
    it('triggers on "pre-existing failures unrelated to this task"', () => {
      expect(containsHonestyTrigger('pre-existing failures unrelated to this task')).toBe(true);
    });

    // Test 6: regex case insensitivity
    it('triggers case-insensitively', () => {
      expect(containsHonestyTrigger('PRE-EXISTING FAILURE in the repo')).toBe(true);
      expect(containsHonestyTrigger('Already Failing before my changes')).toBe(true);
      expect(containsHonestyTrigger('NOT CAUSED BY THIS TASK')).toBe(true);
    });

    it('triggers on "already failing" variant', () => {
      expect(containsHonestyTrigger('These tests were already failing before this sprint')).toBe(true);
    });

    // Test 5: false positive — "pre-existing" in different context
    it('does NOT trigger on unrelated usage of "pre-existing"', () => {
      // "pre-existing" without failure/error/issue/bug suffix → no trigger
      expect(containsHonestyTrigger('Check for pre-existing config values')).toBe(false);
    });

    it('returns false for empty notes', () => {
      expect(containsHonestyTrigger('')).toBe(false);
    });

    it('returns false for normal worker notes', () => {
      expect(containsHonestyTrigger('Implemented the feature, all tests pass')).toBe(false);
    });
  });

  // ─── checkWorkerHonesty (integrated check) ───────────────────────

  describe('checkWorkerHonesty', () => {
    it('returns triggered=false when notes have no trigger phrases', async () => {
      const result = await checkWorkerHonesty(
        TEST_ROOT, 'sprint-134', '134-005',
        'All good, implemented feature successfully',
      );
      expect(result.triggered).toBe(false);
      expect(result.violation).toBe(false);
    });

    it('returns violation=true when trigger detected and delta > 0', async () => {
      // Write a baseline first
      writeBaseline(TEST_ROOT, 'sprint-134', makeBaseline({ fail: 2 }));

      // Mock current capture: 5 failures (3 new)
      const captureFn = () => makeBaseline({ fail: 5 });

      const result = await checkWorkerHonesty(
        TEST_ROOT, 'sprint-134', '134-005',
        'pre-existing failures unrelated to this task',
        captureFn,
      );
      expect(result.triggered).toBe(true);
      expect(result.violation).toBe(true);
      expect(result.comparison!.newFailures).toBe(3);
      expect(result.reason).toContain('HONESTY_VIOLATION');
    });

    it('returns violation=false when trigger detected but delta == 0', async () => {
      writeBaseline(TEST_ROOT, 'sprint-134', makeBaseline({ fail: 3 }));

      const captureFn = () => makeBaseline({ fail: 3 });

      const result = await checkWorkerHonesty(
        TEST_ROOT, 'sprint-134', '134-005',
        'These were already failing before my changes',
        captureFn,
      );
      expect(result.triggered).toBe(true);
      expect(result.violation).toBe(false);
      expect(result.comparison!.newFailures).toBe(0);
    });

    it('returns violation=false when no baseline exists (graceful degradation)', async () => {
      // Do NOT write a baseline
      const result = await checkWorkerHonesty(
        TEST_ROOT, 'sprint-134', '134-005',
        'pre-existing failure in test suite',
      );
      expect(result.triggered).toBe(true);
      expect(result.violation).toBe(false);
      expect(result.reason).toContain('no baseline');
    });

    it('returns violation=false when current capture fails', async () => {
      writeBaseline(TEST_ROOT, 'sprint-134', makeBaseline({ fail: 0 }));

      const captureFn = () => null; // capture fails

      const result = await checkWorkerHonesty(
        TEST_ROOT, 'sprint-134', '134-005',
        'already failing before this sprint',
        captureFn,
      );
      expect(result.triggered).toBe(true);
      expect(result.violation).toBe(false);
      expect(result.reason).toContain('unable to capture');
    });
  });

  // ─── captureVitestBaseline (R8 — async spawn, ADR-087) ───────────────

  describe('captureVitestBaseline (async)', () => {
    const fakeOutput =
      ' Test Files  5 passed (5)\n' +
      ' Tests  100 passed | 2 failed | 1 skipped (103)\n';

    it('returns a Promise (non-blocking — was spawnSync, froze the event loop)', () => {
      const runner = async () => ({ stdout: '', stderr: '' });
      expect(captureVitestBaseline('/proj', 1000, runner)).toBeInstanceOf(Promise);
    });

    it('parses the injected async runner output into a baseline', async () => {
      const runner = async () => ({ stdout: fakeOutput, stderr: '' });
      const result = await captureVitestBaseline('/proj', 1000, runner);
      expect(result).not.toBeNull();
      expect(result!.pass).toBe(100);
      expect(result!.fail).toBe(2);
      expect(result!.skipped).toBe(1);
      expect(result!.files).toBe(5);
    });

    it('reads vitest output from stderr too (vitest writes the summary there)', async () => {
      const runner = async () => ({ stdout: '', stderr: fakeOutput });
      const result = await captureVitestBaseline('/proj', 1000, runner);
      expect(result!.pass).toBe(100);
    });

    it('degrades to null when the runner yields no parseable output', async () => {
      const runner = async () => ({ stdout: 'nothing useful', stderr: '' });
      expect(await captureVitestBaseline('/proj', 1000, runner)).toBeNull();
    });
  });
});
