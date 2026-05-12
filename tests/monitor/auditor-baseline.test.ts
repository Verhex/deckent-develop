import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  readEvents: vi.fn().mockReturnValue([]),
  CHANNELS: {
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
    LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    DEPENDENCY_VIOLATION: 'AUDITOR→BRAIN:DEPENDENCY_VIOLATION',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
  },
}));

const mockAuditorMemStore = {
  getByType: vi.fn().mockReturnValue([]),
  getById: vi.fn().mockReturnValue(null),
  close: vi.fn(),
  totalCount: vi.fn().mockReturnValue(0),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockAuditorMemStore),
}));

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  parseVitestBaselineOutput,
  gatherCiBaseline,
  writeCiBaselineRecord,
  type CiBaselineGatherResult,
} from '../../src/monitor/auditor.js';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

// Helper for building a spawnSync-shaped result.
// Note: `opts.status ?? 0` would coerce a deliberate `null` into `0`, masking
// spawn-failure scenarios — use explicit undefined-check instead.
function spawnResult(opts: {
  status?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}): ReturnType<typeof spawnSync> {
  return {
    pid: 12345,
    status: opts.status === undefined ? 0 : opts.status,
    signal: opts.signal === undefined ? null : opts.signal,
    output: ['', opts.stdout ?? '', opts.stderr ?? ''],
    stdout: opts.stdout ?? '',
    stderr: opts.stderr ?? '',
    error: opts.error,
  } as unknown as ReturnType<typeof spawnSync>;
}

beforeEach(() => {
  // `mockReset` (vs `clearAllMocks`) also drains the mockReturnValueOnce
  // queue, preventing leakage across tests where some attempts are skipped.
  vi.resetAllMocks();
  mockedExistsSync.mockReturnValue(true);
});

describe('parseVitestBaselineOutput', () => {
  it('parses the JSON reporter shape (numPassedTests + numFailedTests + numTotalTests)', () => {
    const stdout = JSON.stringify({
      numTotalTests: 100,
      numPassedTests: 95,
      numFailedTests: 5,
    });

    const out = parseVitestBaselineOutput(stdout, '');

    expect(out.parseOk).toBe(true);
    expect(out.testCount).toBe(100);
    expect(out.testPassed).toBe(95);
    expect(out.testFailed).toBe(5);
  });

  it('falls back to the human Tests-line ("3 failed | 11312 passed (11315)")', () => {
    const stderr = '\n Test Files  3 failed (3)\n      Tests  3 failed | 11312 passed (11315)\n';

    const out = parseVitestBaselineOutput('', stderr);

    expect(out.parseOk).toBe(true);
    expect(out.testCount).toBe(11315);
    expect(out.testPassed).toBe(11312);
    expect(out.testFailed).toBe(3);
  });

  it('returns parseOk=false on completely garbled output', () => {
    const out = parseVitestBaselineOutput('npm WARN deprecated something', 'random noise');

    expect(out.parseOk).toBe(false);
    expect(out.testCount).toBe(0);
    expect(out.testPassed).toBe(0);
    expect(out.testFailed).toBe(0);
  });

  it('rejects JSON with internally inconsistent totals', () => {
    // numTotalTests less than passed+failed → cannot trust JSON path
    const stdout = JSON.stringify({
      numTotalTests: 1,
      numPassedTests: 10,
      numFailedTests: 0,
    });

    const out = parseVitestBaselineOutput(stdout, '');

    expect(out.parseOk).toBe(false);
  });
});

describe('gatherCiBaseline — spawn failure', () => {
  it('returns SPAWN_FAIL with zero counts when subprocess never produces an exit code (after retry)', () => {
    mockedSpawnSync.mockReturnValue(
      spawnResult({ status: null, signal: null, stdout: '', stderr: '' }),
    );

    const result = gatherCiBaseline('/project');

    expect(result.status).toBe('SPAWN_FAIL');
    expect(result.testCount).toBe(0);
    expect(result.testPassed).toBe(0);
    expect(result.testFailed).toBe(0);
    expect(result.attempts).toBe(2); // initial + 1 retry
    expect(result.failureReason).toMatch(/no exit code/i);
  });

  it('returns SPAWN_FAIL with attempts=1 when retry is disabled', () => {
    mockedSpawnSync.mockReturnValue(
      spawnResult({ status: null, signal: null, stdout: '', stderr: '' }),
    );

    const result = gatherCiBaseline('/project', { retryOnSpawnFail: false });

    expect(result.status).toBe('SPAWN_FAIL');
    expect(result.attempts).toBe(1);
  });

  it('returns SPAWN_FAIL when spawnSync surfaces an ENOENT-like error twice', () => {
    mockedSpawnSync.mockReturnValue(
      spawnResult({ status: null, error: new Error('spawn npx ENOENT') }),
    );

    const result = gatherCiBaseline('/project');

    expect(result.status).toBe('SPAWN_FAIL');
    expect(result.failureReason).toMatch(/spawn npx ENOENT/);
    expect(result.attempts).toBe(2);
  });

  it('recovers on retry when the first attempt fails but the second succeeds', () => {
    const goodStdout = JSON.stringify({
      numTotalTests: 10,
      numPassedTests: 10,
      numFailedTests: 0,
    });

    mockedSpawnSync
      .mockReturnValueOnce(spawnResult({ status: null }))
      .mockReturnValueOnce(spawnResult({ status: 0, stdout: goodStdout }));

    const result = gatherCiBaseline('/project');

    expect(result.status).toBe('OK');
    expect(result.testCount).toBe(10);
    expect(result.testPassed).toBe(10);
    expect(result.attempts).toBe(2);
  });
});

describe('gatherCiBaseline — parse outcomes', () => {
  it('returns OK when the JSON reporter output is parseable', () => {
    const stdout = JSON.stringify({
      numTotalTests: 200,
      numPassedTests: 198,
      numFailedTests: 2,
    });
    mockedSpawnSync.mockReturnValue(spawnResult({ status: 1, stdout }));

    const result = gatherCiBaseline('/project');

    expect(result.status).toBe('OK');
    expect(result.testCount).toBe(200);
    expect(result.testPassed).toBe(198);
    expect(result.testFailed).toBe(2);
    expect(result.exitCode).toBe(1); // tests failed but invocation worked
    expect(result.attempts).toBe(1);
  });

  it('returns PARSE_FAIL when subprocess exited but output is unparseable', () => {
    mockedSpawnSync.mockReturnValue(
      spawnResult({
        status: 1,
        stdout: 'random partial output, no Tests line, no JSON object',
        stderr: 'something else',
      }),
    );

    const result = gatherCiBaseline('/project');

    expect(result.status).toBe('PARSE_FAIL');
    expect(result.testCount).toBe(0);
    expect(result.testPassed).toBe(0);
    expect(result.testFailed).toBe(0);
    expect(result.exitCode).toBe(1);
    expect(result.failureReason).toMatch(/not parseable/);
  });

  it('truncates large stderr to last 2KB into stderrTail', () => {
    const bigStderr = 'A'.repeat(5000) + 'TAIL';
    mockedSpawnSync.mockReturnValue(
      spawnResult({ status: 1, stdout: '', stderr: bigStderr }),
    );

    const result = gatherCiBaseline('/project');

    expect(result.status).toBe('PARSE_FAIL');
    expect(result.stderrTail.length).toBeLessThanOrEqual(2048);
    expect(result.stderrTail.endsWith('TAIL')).toBe(true);
  });
});

describe('writeCiBaselineRecord', () => {
  it('persists a record with vitest_invocation_status=OK and full counts', () => {
    const gather: CiBaselineGatherResult = {
      status: 'OK',
      testCount: 100,
      testPassed: 99,
      testFailed: 1,
      exitCode: 1,
      attempts: 1,
      stderrTail: '',
      failureReason: '',
    };

    const record = writeCiBaselineRecord('/project', 'sprint-156', gather, true);

    expect(record.vitest_invocation_status).toBe('OK');
    expect(record.sprintId).toBe('sprint-156');
    expect(record.baseline.tscPassed).toBe(true);
    expect(record.baseline.testCount).toBe(100);
    expect(record.baseline.testPassed).toBe(99);
    expect(record.baseline.testFailed).toBe(1);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const writeArgs = mockedWriteFileSync.mock.calls[0]!;
    const writtenPath = writeArgs[0] as string;
    const writtenBody = writeArgs[1] as string;
    expect(writtenPath).toContain('ci-baseline.json');
    const parsed = JSON.parse(writtenBody);
    expect(parsed.vitest_invocation_status).toBe('OK');
    expect(parsed.baseline.testCount).toBe(100);
  });

  it('zeros the counts when vitest_invocation_status=SPAWN_FAIL', () => {
    const gather: CiBaselineGatherResult = {
      status: 'SPAWN_FAIL',
      testCount: 0,
      testPassed: 0,
      testFailed: 0,
      exitCode: null,
      attempts: 2,
      stderrTail: '',
      failureReason: 'no exit code from subprocess',
    };

    const record = writeCiBaselineRecord('/project', 'sprint-156', gather, true);

    expect(record.vitest_invocation_status).toBe('SPAWN_FAIL');
    expect(record.baseline.testCount).toBe(0);
    expect(record.baseline.testPassed).toBe(0);
    expect(record.baseline.testFailed).toBe(0);
    // tscPassed is still preserved — independent signal.
    expect(record.baseline.tscPassed).toBe(true);
  });

  it('zeros the counts when vitest_invocation_status=PARSE_FAIL', () => {
    const gather: CiBaselineGatherResult = {
      status: 'PARSE_FAIL',
      testCount: 0,
      testPassed: 0,
      testFailed: 0,
      exitCode: 1,
      attempts: 1,
      stderrTail: '',
      failureReason: 'not parseable',
    };

    const record = writeCiBaselineRecord('/project', 'sprint-156', gather, false);

    expect(record.vitest_invocation_status).toBe('PARSE_FAIL');
    expect(record.baseline.testCount).toBe(0);
    expect(record.baseline.tscPassed).toBe(false);
  });

  it('creates the .deckent directory when it does not exist yet', () => {
    mockedExistsSync.mockReturnValue(false);

    const gather: CiBaselineGatherResult = {
      status: 'OK',
      testCount: 1,
      testPassed: 1,
      testFailed: 0,
      exitCode: 0,
      attempts: 1,
      stderrTail: '',
      failureReason: '',
    };

    writeCiBaselineRecord('/project', 'sprint-156', gather, true);

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.deckent'),
      { recursive: true },
    );
  });
});

describe('gatherCiBaseline — custom spawn injection (no real subprocess)', () => {
  it('uses the injected spawnFn instead of node:child_process spawnSync', () => {
    const injectedSpawn = vi.fn().mockReturnValue(
      spawnResult({
        status: 0,
        stdout: JSON.stringify({ numTotalTests: 3, numPassedTests: 3, numFailedTests: 0 }),
      }),
    ) as unknown as typeof spawnSync;

    const result = gatherCiBaseline('/project', { spawnFn: injectedSpawn });

    expect(result.status).toBe('OK');
    expect(result.testCount).toBe(3);
    // The module-level spawnSync mock should NOT have been called.
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });
});
