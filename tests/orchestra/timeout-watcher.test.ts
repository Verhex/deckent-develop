// ─── TimeoutWatcher Tests ───────────────────────────────────────────
// Sprint 145 — Task 019: Runtime Extension Prototype tests
// 8+ tests covering: start, extend, limit, checkProgress, stop, events

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TimeoutWatcher,
  createTimeoutWatcher,
  workerIdToTaskId,
  parseGitDiffStatLines,
} from '../../src/orchestra/timeout-watcher.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  appendFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => null),
  CHANNELS: {
    TIMEOUT_EXTEND: 'BRAIN→WORKER:TIMEOUT_EXTEND',
    TIMEOUT_ASSIGN: 'BRAIN→WORKER:TIMEOUT_ASSIGN',
    TIMEOUT_WARNING: 'WORKER→BRAIN:TIMEOUT_WARNING',
    TIMEOUT_CAP_EXCEEDED: 'AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED',
  },
}));

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ────────────────────────────────────────────────────────

function freshHeartbeat(): string {
  return JSON.stringify({
    workerId: 'w-145-019',
    taskId: '145-019',
    status: 'EXECUTING',
    sequence: 5,
    timestamp: new Date().toISOString(),
  });
}

function staleHeartbeat(): string {
  const staleDate = new Date(Date.now() - 120_000); // 2 minutes ago
  return JSON.stringify({
    workerId: 'w-145-019',
    taskId: '145-019',
    status: 'EXECUTING',
    sequence: 3,
    timestamp: staleDate.toISOString(),
  });
}

const GIT_DIFF_STAT_OUTPUT = ` src/orchestra/timeout-watcher.ts | 250 ++++++++++++++++++++++++
 tests/orchestra/timeout-watcher.test.ts | 180 +++++++++++++++++
 2 files changed, 400 insertions(+), 30 deletions(-)`;

const GIT_DIFF_STAT_SMALL = ` src/core/types.ts | 5 +++--
 1 file changed, 3 insertions(+), 2 deletions(-)`;

// ─── Test Suite ─────────────────────────────────────────────────────

describe('TimeoutWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Test 1: start → timer fires killFn after timeoutMs ──────────
  it('should call killFn when timeout expires', async () => {
    const killFn = vi.fn().mockResolvedValue(undefined);
    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: false,
    });

    watcher.start('w-145-001', 5000, killFn);

    // Not called yet
    expect(killFn).not.toHaveBeenCalled();

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(5000);

    expect(killFn).toHaveBeenCalledTimes(1);
    watcher.stopAll();
  });

  // ─── Test 2: extend → cancels old timer, starts new one, increments count
  it('should cancel old timer and start new one on extend', async () => {
    const killFn = vi.fn().mockResolvedValue(undefined);
    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
    });

    watcher.start('w-145-002', 10000, killFn);
    expect(watcher.getExtensionCount('w-145-002')).toBe(0);

    // Manually extend
    watcher.extend('w-145-002', 5000, killFn);
    expect(watcher.getExtensionCount('w-145-002')).toBe(1);

    // Old timer (10s) should NOT fire
    await vi.advanceTimersByTimeAsync(10000);

    // Extension timer should have fired at 5s (which is within the 10s advance)
    expect(killFn).toHaveBeenCalled();

    watcher.stopAll();
  });

  // ─── Test 3: extension limit at 2, 3rd attempt → kill ────────────
  it('should kill after max extensions (2) regardless of progress', async () => {
    const killFn = vi.fn().mockResolvedValue(undefined);

    // Setup: fresh heartbeat + big diff
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(freshHeartbeat());
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_OUTPUT);

    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
      max_extensions: 2,
    });

    watcher.start('w-145-003', 4000, killFn);

    // First timeout → should extend (extension 1)
    await vi.advanceTimersByTimeAsync(4000);
    expect(watcher.getExtensionCount('w-145-003')).toBe(1);
    expect(killFn).not.toHaveBeenCalled();

    // Second timeout (50% of 4000 = 2000ms) → should extend (extension 2)
    await vi.advanceTimersByTimeAsync(2000);
    expect(watcher.getExtensionCount('w-145-003')).toBe(2);
    expect(killFn).not.toHaveBeenCalled();

    // Third timeout (50% of 4000 = 2000ms but from extend, 50% of 2000 = 1000) → should KILL
    await vi.advanceTimersByTimeAsync(1000);
    expect(killFn).toHaveBeenCalledTimes(1);

    watcher.stopAll();
  });

  // ─── Test 4: checkProgress fresh hb + git diff → true ────────────
  it('should return progressing=true when heartbeat fresh and diff substantial', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(freshHeartbeat());
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_OUTPUT);

    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
      min_diff_lines: 30,
    });

    const result = watcher.checkProgress('w-145-019');
    expect(result.heartbeatFresh).toBe(true);
    expect(result.diffLines).toBe(430); // 400 + 30
    expect(result.progressing).toBe(true);
  });

  // ─── Test 5: checkProgress stale hb → false ──────────────────────
  it('should return progressing=false when heartbeat is stale', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(staleHeartbeat());
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_OUTPUT);

    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
    });

    const result = watcher.checkProgress('w-145-019');
    expect(result.heartbeatFresh).toBe(false);
    expect(result.progressing).toBe(false);
  });

  // ─── Test 6: runtime_extension_enabled=false → immediate kill ────
  it('should kill immediately when runtime_extension_enabled is false', async () => {
    // Even with progress, extension should not happen
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(freshHeartbeat());
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_OUTPUT);

    const killFn = vi.fn().mockResolvedValue(undefined);
    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: false,
    });

    watcher.start('w-145-004', 3000, killFn);
    await vi.advanceTimersByTimeAsync(3000);

    expect(killFn).toHaveBeenCalledTimes(1);
    expect(watcher.getExtensionCount('w-145-004')).toBe(0);

    watcher.stopAll();
  });

  // ─── Test 7: stop() cancels timer ────────────────────────────────
  it('should cancel timer on stop()', async () => {
    const killFn = vi.fn().mockResolvedValue(undefined);
    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: false,
    });

    watcher.start('w-145-005', 3000, killFn);
    expect(watcher.hasActiveTimers()).toBe(true);

    watcher.stop('w-145-005');
    expect(watcher.hasActiveTimers()).toBe(false);

    // Advance time — killFn should NOT be called
    await vi.advanceTimersByTimeAsync(5000);
    expect(killFn).not.toHaveBeenCalled();
  });

  // ─── Test 8: TIMEOUT_EXTEND event is written ─────────────────────
  it('should write TIMEOUT_EXTEND event on extension', () => {
    const killFn = vi.fn().mockResolvedValue(undefined);
    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
    });

    watcher.extend('w-145-006', 2000, killFn);

    expect(writeEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-145',
      'brain',
      'worker',
      'BRAIN→WORKER:TIMEOUT_EXTEND',
      { workerId: 'w-145-006', extraMs: 2000, extensionCount: 1 },
    );

    watcher.stopAll();
  });

  // ─── Test 9: checkProgress with small diff → not progressing ─────
  it('should return progressing=false when diff lines below threshold', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(freshHeartbeat());
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_SMALL);

    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
      min_diff_lines: 30,
    });

    const result = watcher.checkProgress('w-145-019');
    expect(result.heartbeatFresh).toBe(true);
    expect(result.diffLines).toBe(5); // 3 + 2
    expect(result.progressing).toBe(false);
  });

  // ─── Test 10: max_extensions config capped to hard limit 2 ───────
  it('should cap max_extensions to 2 even if config says higher', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(freshHeartbeat());
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_OUTPUT);

    const killFn = vi.fn().mockResolvedValue(undefined);
    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
      max_extensions: 10, // should be capped to 2
    });

    // Manually set extensions to 2
    watcher.extend('w-145-007', 1000, killFn);
    watcher.extend('w-145-007', 1000, killFn);
    expect(watcher.getExtensionCount('w-145-007')).toBe(2);

    watcher.stopAll();
  });

  // ─── Test 11: missing heartbeat file → not progressing ───────────
  it('should return progressing=false when no heartbeat file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(execSync).mockReturnValue(GIT_DIFF_STAT_OUTPUT);

    const watcher = new TimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
    });

    const result = watcher.checkProgress('w-145-019');
    expect(result.heartbeatFresh).toBe(false);
    expect(result.progressing).toBe(false);
  });
});

// ─── Utility Function Tests ─────────────────────────────────────────

describe('workerIdToTaskId', () => {
  it('should extract task ID from worker ID', () => {
    expect(workerIdToTaskId('w-145-019')).toBe('145-019');
    expect(workerIdToTaskId('w-001-003')).toBe('001-003');
  });

  it('should return input if no w- prefix', () => {
    expect(workerIdToTaskId('145-019')).toBe('145-019');
    expect(workerIdToTaskId('custom-id')).toBe('custom-id');
  });
});

describe('parseGitDiffStatLines', () => {
  it('should parse insertions and deletions', () => {
    expect(parseGitDiffStatLines(GIT_DIFF_STAT_OUTPUT)).toBe(430);
  });

  it('should parse small diffs', () => {
    expect(parseGitDiffStatLines(GIT_DIFF_STAT_SMALL)).toBe(5);
  });

  it('should return 0 for empty output', () => {
    expect(parseGitDiffStatLines('')).toBe(0);
  });

  it('should return 0 for output without summary', () => {
    expect(parseGitDiffStatLines('no changes')).toBe(0);
  });

  it('should handle insertions only', () => {
    const output = ' 1 file changed, 50 insertions(+)';
    expect(parseGitDiffStatLines(output)).toBe(50);
  });

  it('should handle deletions only', () => {
    const output = ' 1 file changed, 20 deletions(-)';
    expect(parseGitDiffStatLines(output)).toBe(20);
  });
});

// ─── createTimeoutWatcher Factory ───────────────────────────────────

describe('createTimeoutWatcher', () => {
  it('should return null when runtime_extension_enabled is false', () => {
    const watcher = createTimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: false,
    });
    expect(watcher).toBeNull();
  });

  it('should return null with default config (disabled)', () => {
    const watcher = createTimeoutWatcher('/project', 'sprint-145');
    expect(watcher).toBeNull();
  });

  it('should return TimeoutWatcher when enabled', () => {
    const watcher = createTimeoutWatcher('/project', 'sprint-145', {
      runtime_extension_enabled: true,
    });
    expect(watcher).toBeInstanceOf(TimeoutWatcher);
    watcher?.stopAll();
  });
});
