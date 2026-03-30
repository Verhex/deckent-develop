import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import {
  parseVitestOutput,
  runFullVitest,
  runPreSprintValidation,
  readCiBaseline,
  writeCiBaseline,
  DEFAULT_CI_GUARDIAN_CONFIG,
  type CiGuardianConfig,
} from '../../src/core/plugin-hooks.js';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = path.join('/tmp', `ci-pre-sprint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function spawnResult(overrides: Partial<ReturnType<typeof cp.spawnSync>> = {}) {
  return {
    status: 0,
    stdout: '',
    stderr: '',
    pid: 1,
    output: [],
    signal: null,
    ...overrides,
  } as ReturnType<typeof cp.spawnSync>;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Pre-Sprint CI Validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tmpDir = makeTmpDir();
    // Create tsconfig.json so detectFullStack detects TypeScript and runTscCheck actually calls spawnSync
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}', 'utf-8');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  // ─── parseVitestOutput ─────────────────────────────────────────────

  describe('parseVitestOutput', () => {
    it('parses all-passed output', () => {
      const result = parseVitestOutput('Tests  11315 passed (11315)');
      expect(result.testCount).toBe(11315);
      expect(result.testPassed).toBe(11315);
      expect(result.testFailed).toBe(0);
    });

    it('parses output with failures', () => {
      const result = parseVitestOutput('Tests  3 failed | 11312 passed (11315)');
      expect(result.testCount).toBe(11315);
      expect(result.testPassed).toBe(11312);
      expect(result.testFailed).toBe(3);
    });

    it('returns zeros for empty/unparseable output', () => {
      const result = parseVitestOutput('');
      expect(result.testCount).toBe(0);
      expect(result.testPassed).toBe(0);
      expect(result.testFailed).toBe(0);
    });

    it('handles multiline output with summary at end', () => {
      const output = [
        ' ✓ tests/core/utils.test.ts (15)',
        ' ✓ tests/core/config.test.ts (23)',
        '',
        ' Test Files  2 passed (2)',
        '      Tests  38 passed (38)',
        '   Duration  1.23s',
      ].join('\n');
      const result = parseVitestOutput(output);
      expect(result.testCount).toBe(38);
      expect(result.testPassed).toBe(38);
      expect(result.testFailed).toBe(0);
    });
  });

  // ─── runFullVitest ─────────────────────────────────────────────────

  describe('runFullVitest', () => {
    it('returns passed=true with parsed counts on success', () => {
      vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({
        status: 0,
        stdout: 'Tests  11315 passed (11315)',
      }));

      const result = runFullVitest(tmpDir);
      expect(result.passed).toBe(true);
      expect(result.testCount).toBe(11315);
      expect(result.testPassed).toBe(11315);
      expect(result.testFailed).toBe(0);
    });

    it('returns passed=false with failure counts on fail', () => {
      vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({
        status: 1,
        stdout: 'Tests  5 failed | 11310 passed (11315)',
      }));

      const result = runFullVitest(tmpDir);
      expect(result.passed).toBe(false);
      expect(result.testCount).toBe(11315);
      expect(result.testFailed).toBe(5);
    });
  });

  // ─── runPreSprintValidation ────────────────────────────────────────

  describe('runPreSprintValidation', () => {
    it('skips validation when ci_guardian is disabled', () => {
      const result = runPreSprintValidation(tmpDir, 'sprint-062', { enabled: false });
      expect(result.passed).toBe(true);
      expect(result.baselineSaved).toBe(false);
      expect(cp.spawnSync).not.toHaveBeenCalled();
    });

    it('skips validation when pre_sprint_check is false', () => {
      const result = runPreSprintValidation(tmpDir, 'sprint-062', { pre_sprint_check: false });
      expect(result.passed).toBe(true);
      expect(result.baselineSaved).toBe(false);
      expect(cp.spawnSync).not.toHaveBeenCalled();
    });

    it('blocks sprint when tsc fails and block_on_tsc_fail=true', () => {
      vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({
        status: 1,
        stdout: 'error TS2345: Argument of type...',
      }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062', {
        block_on_tsc_fail: true,
        track_test_count: false,
      });
      expect(result.passed).toBe(false);
      expect(result.tscPassed).toBe(false);
      expect(result.blockedReason).toContain('tsc --noEmit failed');
      expect(result.baselineSaved).toBe(false);
    });

    it('warns but does not block when tsc fails and block_on_tsc_fail=false', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({
        status: 1,
        stdout: 'error TS2345',
      }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062', {
        block_on_tsc_fail: false,
        track_test_count: false,
      });
      expect(result.passed).toBe(true);
      expect(result.tscPassed).toBe(false);
      expect(result.blockedReason).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });

    it('blocks sprint when tests fail and block_on_test_fail=true', () => {
      // First call: tsc passes, Second call: vitest fails
      vi.mocked(cp.spawnSync)
        .mockReturnValueOnce(spawnResult({ status: 0, stdout: '' }))
        .mockReturnValueOnce(spawnResult({
          status: 1,
          stdout: 'Tests  3 failed | 100 passed (103)',
        }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062', {
        block_on_test_fail: true,
        track_test_count: true,
      });
      expect(result.passed).toBe(false);
      expect(result.tscPassed).toBe(true);
      expect(result.testsPassed).toBe(false);
      expect(result.testFailed).toBe(3);
      expect(result.blockedReason).toContain('vitest failed');
      expect(result.baselineSaved).toBe(false);
    });

    it('does not block when tests fail and block_on_test_fail=false', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      // First call: tsc passes, Second call: vitest fails
      vi.mocked(cp.spawnSync)
        .mockReturnValueOnce(spawnResult({ status: 0, stdout: '' }))
        .mockReturnValueOnce(spawnResult({
          status: 1,
          stdout: 'Tests  2 failed | 100 passed (102)',
        }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062', {
        block_on_test_fail: false,
        track_test_count: true,
      });
      expect(result.passed).toBe(true);
      expect(result.testsPassed).toBe(false);
      expect(result.testFailed).toBe(2);
      expect(result.baselineSaved).toBe(true);
      stderrSpy.mockRestore();
    });

    it('saves baseline on successful validation', () => {
      // tsc passes, vitest passes
      vi.mocked(cp.spawnSync)
        .mockReturnValueOnce(spawnResult({ status: 0, stdout: '' }))
        .mockReturnValueOnce(spawnResult({ status: 0, stdout: 'Tests  11315 passed (11315)' }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062');
      expect(result.passed).toBe(true);
      expect(result.baselineSaved).toBe(true);

      const baseline = readCiBaseline(tmpDir);
      expect(baseline).not.toBeNull();
      expect(baseline!.sprintId).toBe('sprint-062');
      expect(baseline!.baseline.tscPassed).toBe(true);
      expect(baseline!.baseline.testCount).toBe(11315);
      expect(baseline!.baseline.testPassed).toBe(11315);
      expect(baseline!.baseline.testFailed).toBe(0);
    });

    it('reads config from .deckent/config.json when no override', () => {
      // Write config with ci_guardian disabled
      const deckentDir = path.join(tmpDir, '.deckent');
      fs.mkdirSync(deckentDir, { recursive: true });
      fs.writeFileSync(
        path.join(deckentDir, 'config.json'),
        JSON.stringify({ ci_guardian: { enabled: false } }),
      );

      const result = runPreSprintValidation(tmpDir, 'sprint-062');
      expect(result.passed).toBe(true);
      expect(result.baselineSaved).toBe(false);
      expect(cp.spawnSync).not.toHaveBeenCalled();
    });

    it('configOverride takes precedence over file config', () => {
      // Config file says enabled=true, override says enabled=false
      const deckentDir = path.join(tmpDir, '.deckent');
      fs.mkdirSync(deckentDir, { recursive: true });
      fs.writeFileSync(
        path.join(deckentDir, 'config.json'),
        JSON.stringify({ ci_guardian: { enabled: true } }),
      );

      const result = runPreSprintValidation(tmpDir, 'sprint-062', { enabled: false });
      expect(result.passed).toBe(true);
      expect(cp.spawnSync).not.toHaveBeenCalled();
    });

    it('skips vitest when track_test_count=false', () => {
      vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({ status: 0, stdout: '' }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062', {
        track_test_count: false,
      });
      expect(result.passed).toBe(true);
      // Only tsc should be called, not vitest
      expect(cp.spawnSync).toHaveBeenCalledTimes(1);
    });

    it('includes tscPassed=false but passed=true when tsc fails, block_on_tsc_fail=false, no tests', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({
        status: 1,
        stdout: 'type errors',
      }));

      const result = runPreSprintValidation(tmpDir, 'sprint-062', {
        block_on_tsc_fail: false,
        track_test_count: false,
      });
      expect(result.passed).toBe(true);
      expect(result.tscPassed).toBe(false);
      expect(result.baselineSaved).toBe(true);
      stderrSpy.mockRestore();
    });

    it('DEFAULT_CI_GUARDIAN_CONFIG has pre_sprint_check=true', () => {
      expect(DEFAULT_CI_GUARDIAN_CONFIG.pre_sprint_check).toBe(true);
      expect(DEFAULT_CI_GUARDIAN_CONFIG.enabled).toBe(true);
      expect(DEFAULT_CI_GUARDIAN_CONFIG.block_on_tsc_fail).toBe(true);
      expect(DEFAULT_CI_GUARDIAN_CONFIG.block_on_test_fail).toBe(false);
    });
  });
});
