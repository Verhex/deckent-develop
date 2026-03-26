import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import {
  findTargetedTestFiles,
  runTscCheck,
  runTargetedTests,
  readCiBaseline,
  writeCiBaseline,
  resolveCiGuardianConfig,
  runCiRegressionCheck,
  DEFAULT_CI_GUARDIAN_CONFIG,
  type CiGuardianConfig,
  type CiBaseline,
  type CiRegressionCheckResult,
} from '../../src/core/plugin-hooks.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = path.join('/tmp', `ci-regression-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '062-001',
    workerId: 'w-062-001',
    filesChanged: ['src/core/utils.ts'],
    linesAdded: 20,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

function defaultConfig(): CiGuardianConfig {
  return {
    enabled: true,
    pre_sprint_check: true,
    block_on_tsc_fail: true,
    block_on_test_fail: false,
    track_coverage: true,
    track_test_count: true,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('CI Regression Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  // ─── findTargetedTestFiles ─────────────────────────────────────────

  describe('findTargetedTestFiles', () => {
    it('maps src/ file to corresponding tests/ file', () => {
      // Create test directory with matching test file
      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const files = findTargetedTestFiles(['src/core/utils.ts'], tmpDir);
      expect(files).toEqual(['tests/core/utils.test.ts']);
    });

    it('finds wildcard-matching test files (prefix match)', () => {
      const testDir = path.join(tmpDir, 'tests', 'cli', 'commands');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'config.test.ts'), '// test');
      fs.writeFileSync(path.join(testDir, 'config-advanced.test.ts'), '// test');

      const files = findTargetedTestFiles(['src/cli/commands/config.ts'], tmpDir);
      expect(files).toHaveLength(2);
      expect(files).toContain('tests/cli/commands/config.test.ts');
      expect(files).toContain('tests/cli/commands/config-advanced.test.ts');
    });

    it('returns empty array for files without test directory', () => {
      const files = findTargetedTestFiles(['src/nonexistent/foo.ts'], tmpDir);
      expect(files).toEqual([]);
    });

    it('skips non-src files', () => {
      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const files = findTargetedTestFiles(['docs/README.md', 'package.json'], tmpDir);
      expect(files).toEqual([]);
    });

    it('skips test files in filesChanged', () => {
      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const files = findTargetedTestFiles(['src/core/utils.test.ts'], tmpDir);
      expect(files).toEqual([]);
    });

    it('deduplicates test files across multiple source files', () => {
      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      // Both source files map to the same test
      const files = findTargetedTestFiles(
        ['src/core/utils.ts', 'src/core/utils.ts'],
        tmpDir,
      );
      expect(files).toHaveLength(1);
    });
  });

  // ─── runTscCheck ────────────────────────────────────────────────────

  describe('runTscCheck', () => {
    it('returns passed=true when tsc succeeds', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runTscCheck(tmpDir);
      expect(result.passed).toBe(true);
    });

    it('returns passed=false when tsc fails', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 1,
        stdout: 'src/foo.ts(10,5): error TS2345: Argument of type...',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runTscCheck(tmpDir);
      expect(result.passed).toBe(false);
      expect(result.output).toContain('TS2345');
    });
  });

  // ─── runTargetedTests ──────────────────────────────────────────────

  describe('runTargetedTests', () => {
    it('returns passed=true with test count when vitest succeeds', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 0,
        stdout: 'Tests  42 passed',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runTargetedTests(tmpDir, ['tests/core/utils.test.ts']);
      expect(result.passed).toBe(true);
      expect(result.testCount).toBe(42);
    });

    it('returns passed=false when vitest fails', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 1,
        stdout: 'Tests  10 passed | 2 failed',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runTargetedTests(tmpDir, ['tests/core/utils.test.ts']);
      expect(result.passed).toBe(false);
    });

    it('skips execution when no test files provided', () => {
      const result = runTargetedTests(tmpDir, []);
      expect(result.passed).toBe(true);
      expect(result.testCount).toBe(0);
      expect(result.output).toContain('No targeted test files');
      expect(cp.spawnSync).not.toHaveBeenCalled();
    });
  });

  // ─── CiBaseline read/write ─────────────────────────────────────────

  describe('CiBaseline read/write', () => {
    it('writes and reads baseline correctly', () => {
      const baseline: CiBaseline = {
        sprintId: 'sprint-062',
        baseline: {
          tscPassed: true,
          testCount: 11315,
          testPassed: 11315,
          testFailed: 0,
          coverage: 96.0,
          timestamp: new Date().toISOString(),
        },
      };

      writeCiBaseline(tmpDir, baseline);
      const read = readCiBaseline(tmpDir);
      expect(read).toEqual(baseline);
    });

    it('returns null when no baseline file exists', () => {
      const result = readCiBaseline(tmpDir);
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON baseline', () => {
      const dir = path.join(tmpDir, '.deckent');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'ci-baseline.json'), 'not json');

      const result = readCiBaseline(tmpDir);
      expect(result).toBeNull();
    });
  });

  // ─── resolveCiGuardianConfig ───────────────────────────────────────

  describe('resolveCiGuardianConfig', () => {
    it('returns defaults when no config exists', () => {
      const config = resolveCiGuardianConfig(tmpDir);
      expect(config).toEqual(DEFAULT_CI_GUARDIAN_CONFIG);
    });

    it('returns defaults when config has no ci_guardian section', () => {
      const dir = path.join(tmpDir, '.deckent');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mode: 'pro_plan' }));

      const config = resolveCiGuardianConfig(tmpDir);
      expect(config).toEqual(DEFAULT_CI_GUARDIAN_CONFIG);
    });

    it('merges partial ci_guardian config with defaults', () => {
      const dir = path.join(tmpDir, '.deckent');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
        ci_guardian: { enabled: false, block_on_test_fail: true },
      }));

      const config = resolveCiGuardianConfig(tmpDir);
      expect(config.enabled).toBe(false);
      expect(config.block_on_test_fail).toBe(true);
      expect(config.block_on_tsc_fail).toBe(true); // default
      expect(config.track_coverage).toBe(true); // default
    });
  });

  // ─── runCiRegressionCheck ──────────────────────────────────────────

  describe('runCiRegressionCheck', () => {
    it('detects regression when tsc fails', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 1,
        stdout: 'error TS2345',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runCiRegressionCheck(tmpDir, makeResult(), defaultConfig());
      expect(result.regressionDetected).toBe(true);
      expect(result.tscPassed).toBe(false);
      expect(result.alerts.some(a => a.includes('tsc --noEmit failed'))).toBe(true);
    });

    it('detects regression when targeted tests fail', () => {
      // First call: tsc passes
      // Second call: vitest fails
      vi.mocked(cp.spawnSync)
        .mockReturnValueOnce({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
        .mockReturnValueOnce({ status: 1, stdout: 'Tests  5 passed | 1 failed', stderr: '', pid: 1, output: [], signal: null });

      // Create test directory so targeted files are found
      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const result = runCiRegressionCheck(tmpDir, makeResult(), defaultConfig());
      expect(result.regressionDetected).toBe(true);
      expect(result.targetedTestsPassed).toBe(false);
      expect(result.alerts.some(a => a.includes('Targeted tests failed'))).toBe(true);
    });

    it('reports no regression when tsc and tests pass', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 0,
        stdout: 'Tests  10 passed',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runCiRegressionCheck(tmpDir, makeResult(), defaultConfig());
      expect(result.regressionDetected).toBe(false);
      expect(result.tscPassed).toBe(true);
      expect(result.alerts).toHaveLength(0);
    });

    it('skips tsc check when block_on_tsc_fail is false', () => {
      const config = defaultConfig();
      config.block_on_tsc_fail = false;

      const result = runCiRegressionCheck(tmpDir, makeResult(), config);
      expect(result.tscPassed).toBe(true);
      expect(result.tscOutput).toContain('skipped');
    });

    it('detects test count decrease from baseline', () => {
      // Write a baseline with higher test count
      writeCiBaseline(tmpDir, {
        sprintId: 'sprint-061',
        baseline: {
          tscPassed: true,
          testCount: 100,
          testPassed: 100,
          testFailed: 0,
          coverage: 96,
          timestamp: new Date().toISOString(),
        },
      });

      // tsc passes, vitest passes but with lower count
      vi.mocked(cp.spawnSync)
        .mockReturnValueOnce({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
        .mockReturnValueOnce({ status: 0, stdout: 'Tests  80 passed', stderr: '', pid: 1, output: [], signal: null });

      // Create test directory so targeted files are found
      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const result = runCiRegressionCheck(tmpDir, makeResult(), defaultConfig());
      expect(result.testCountDelta).toBe(-20);
      expect(result.alerts.some(a => a.includes('Test count decreased'))).toBe(true);
    });

    it('handles no filesChanged gracefully', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const result = runCiRegressionCheck(
        tmpDir,
        makeResult({ filesChanged: [] }),
        defaultConfig(),
      );
      expect(result.regressionDetected).toBe(false);
      expect(result.targetedTestFiles).toHaveLength(0);
    });

    it('returns targeted test files list in result', () => {
      vi.mocked(cp.spawnSync).mockReturnValue({
        status: 0,
        stdout: 'Tests  5 passed',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      });

      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const result = runCiRegressionCheck(tmpDir, makeResult(), defaultConfig());
      expect(result.targetedTestFiles).toContain('tests/core/utils.test.ts');
    });

    it('skips test count comparison when tracking disabled', () => {
      writeCiBaseline(tmpDir, {
        sprintId: 'sprint-061',
        baseline: {
          tscPassed: true,
          testCount: 1000,
          testPassed: 1000,
          testFailed: 0,
          coverage: 96,
          timestamp: new Date().toISOString(),
        },
      });

      vi.mocked(cp.spawnSync)
        .mockReturnValueOnce({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
        .mockReturnValueOnce({ status: 0, stdout: 'Tests  5 passed', stderr: '', pid: 1, output: [], signal: null });

      const testDir = path.join(tmpDir, 'tests', 'core');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.ts'), '// test');

      const config = defaultConfig();
      config.track_test_count = false;

      const result = runCiRegressionCheck(tmpDir, makeResult(), config);
      // testCountDelta should remain 0 since tracking is disabled
      expect(result.testCountDelta).toBe(0);
      expect(result.alerts).toHaveLength(0);
    });
  });
});
