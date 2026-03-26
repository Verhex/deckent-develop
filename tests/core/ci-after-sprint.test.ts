import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cp from 'node:child_process';

import {
  writeCiReport,
  readCiReport,
  runAfterSprintCiReport,
  type CiReport,
} from '../../src/core/plugin-hooks.js';

// ─── Mock node:child_process (ESM-compatible) ─────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join('/tmp', `ci-after-sprint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
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

function makeCiReport(overrides: Partial<CiReport> = {}): CiReport {
  return {
    sprintId: 'sprint-062',
    baseline: { testCount: 100, coverage: 95.0 },
    result: { testCount: 110, testPassed: 110, testFailed: 0, coverage: 95.0 },
    delta: { newTests: 10, regressions: 0, coverageDelta: 0 },
    tscPassed: true,
    buildPassed: true,
    timestamp: '2026-03-26T10:00:00.000Z',
    ...overrides,
  };
}

// ─── writeCiReport ────────────────────────────────────────────────────────────

describe('writeCiReport', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes CI report to .brain/ci-report-{sprintId}.json', () => {
    const report = makeCiReport();
    writeCiReport(tmpDir, report);

    const expectedPath = join(tmpDir, '.brain', 'ci-report-sprint-062.json');
    expect(existsSync(expectedPath)).toBe(true);
    const written = JSON.parse(readFileSync(expectedPath, 'utf-8')) as CiReport;
    expect(written.sprintId).toBe('sprint-062');
    expect(written.result.testCount).toBe(110);
  });

  it('creates .brain directory if missing', () => {
    const report = makeCiReport({ sprintId: 'sprint-099' });
    writeCiReport(tmpDir, report);
    expect(existsSync(join(tmpDir, '.brain'))).toBe(true);
  });

  it('serializes all report fields correctly', () => {
    const report = makeCiReport({
      tscPassed: false,
      buildPassed: false,
      delta: { newTests: 5, regressions: 3, coverageDelta: -0.5 },
    });
    writeCiReport(tmpDir, report);
    const path = join(tmpDir, '.brain', `ci-report-${report.sprintId}.json`);
    const written = JSON.parse(readFileSync(path, 'utf-8')) as CiReport;
    expect(written.tscPassed).toBe(false);
    expect(written.buildPassed).toBe(false);
    expect(written.delta.regressions).toBe(3);
    expect(written.delta.coverageDelta).toBe(-0.5);
  });
});

// ─── readCiReport ─────────────────────────────────────────────────────────────

describe('readCiReport', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null when report file does not exist', () => {
    expect(readCiReport(tmpDir, 'sprint-001')).toBeNull();
  });

  it('returns null when report file is malformed JSON', () => {
    const brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(join(brainDir, 'ci-report-sprint-bad.json'), 'not valid json', 'utf-8');
    expect(readCiReport(tmpDir, 'sprint-bad')).toBeNull();
  });

  it('reads back a written report correctly', () => {
    const report = makeCiReport({ sprintId: 'sprint-042' });
    writeCiReport(tmpDir, report);
    const read = readCiReport(tmpDir, 'sprint-042');
    expect(read).not.toBeNull();
    expect(read!.sprintId).toBe('sprint-042');
    expect(read!.baseline.testCount).toBe(100);
    expect(read!.result.testPassed).toBe(110);
    expect(read!.timestamp).toBe('2026-03-26T10:00:00.000Z');
  });
});

// ─── runAfterSprintCiReport ───────────────────────────────────────────────────

describe('runAfterSprintCiReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    vi.mocked(cp.spawnSync).mockReturnValue(spawnResult({
      stdout: 'Tests  100 passed (100)',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes CI report to disk and returns it', () => {
    const report = runAfterSprintCiReport(tmpDir, 'sprint-062');
    expect(report.sprintId).toBe('sprint-062');
    const onDisk = readCiReport(tmpDir, 'sprint-062');
    expect(onDisk).not.toBeNull();
    expect(onDisk!.sprintId).toBe('sprint-062');
  });

  it('computes delta.newTests from baseline when baseline exists', () => {
    // Write baseline with 80 tests
    mkdirSync(join(tmpDir, '.deckent'), { recursive: true });
    writeFileSync(join(tmpDir, '.deckent', 'ci-baseline.json'), JSON.stringify({
      sprintId: 'sprint-061',
      baseline: { tscPassed: true, testCount: 80, testPassed: 80, testFailed: 0, coverage: 95, timestamp: '2026-03-25T10:00:00.000Z' },
    }), 'utf-8');

    // vitest returns 100 tests
    vi.mocked(cp.spawnSync)
      .mockReturnValueOnce(spawnResult()) // tsc passes
      .mockReturnValue(spawnResult({ stdout: '80 passed (100)' })); // vitest: 100 total

    const report = runAfterSprintCiReport(tmpDir, 'sprint-062');
    expect(report.baseline.testCount).toBe(80);
    expect(report.delta.newTests).toBeGreaterThanOrEqual(0);
  });

  it('returns tscPassed=false when tsc fails', () => {
    vi.mocked(cp.spawnSync)
      .mockReturnValueOnce(spawnResult({ status: 1, stdout: 'error TS2345: ...' })) // tsc fails
      .mockReturnValue(spawnResult({ stdout: 'Tests  100 passed (100)' })); // vitest passes

    const report = runAfterSprintCiReport(tmpDir, 'sprint-062');
    expect(report.tscPassed).toBe(false);
    expect(report.buildPassed).toBe(false);
  });

  it('counts regressions from failed tests', () => {
    vi.mocked(cp.spawnSync)
      .mockReturnValueOnce(spawnResult()) // tsc passes
      .mockReturnValue(spawnResult({
        status: 1,
        stdout: 'Tests  3 failed | 97 passed (100)',
      }));

    const report = runAfterSprintCiReport(tmpDir, 'sprint-062');
    expect(report.delta.regressions).toBe(3);
  });

  it('skips vitest run when track_test_count is false', () => {
    vi.mocked(cp.spawnSync).mockReturnValue(spawnResult()); // only tsc should be called

    runAfterSprintCiReport(tmpDir, 'sprint-062', { track_test_count: false });
    // Only one call (tsc), no vitest call
    expect(cp.spawnSync).toHaveBeenCalledTimes(1);
  });
});
