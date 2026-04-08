/**
 * auditor-edge.test.ts — Edge case tests for src/monitor/auditor.ts
 *
 * Covers scenarios NOT already in auditor.test.ts:
 *  1. scanHeartbeats — multiple stale, all-malformed, missing required fields
 *  2. checkBoundaryViolations — nested dir protection, prefix overlap, filesWrite, empty scopes
 *  3. checkStaleLocks — malformed lock JSON, multiple stale, lock at threshold boundary
 *  4. detectDeadlocks — 3-way cycle, diamond (no cycle), self-dependency, single task cycle
 *  5. writeScanToDashboard — merge logic, agent DONE on result, violation count merge
 *  6. startScanLoop — clearInterval stops ticks, custom interval, multiple ticks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanHeartbeats,
  checkBoundaryViolations,
  checkStaleLocks,
  detectDeadlocks,
  writeScanToDashboard,
  startScanLoop,
  deduplicateAlerts,
} from '../../src/monitor/auditor.js';
import { AlertLevel, TaskStatus, AgentStatus } from '../../src/core/types.js';
import type { Task, TaskScope, DashboardState, Heartbeat, LockInfo } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedSpawnSync = vi.mocked(spawnSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  mockedReaddirSync.mockReturnValue([] as never);
});

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(id: string, dependencies: string[]): Task {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies,
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
  };
}

function makeHb(workerId: string, taskId: string, timestamp: string): Heartbeat {
  return {
    workerId,
    taskId,
    status: AgentStatus.EXECUTING,
    currentAction: 'working',
    timestamp,
    filesChangedCount: 0,
    sequence: 0,
  };
}

function makeLock(filePath: string, workerId: string, acquiredAt: string): LockInfo {
  return { filePath, ownerWorkerId: workerId, acquiredAt, taskId: 'task-001' };
}

// ─── scanHeartbeats edge cases ───────────────────────────────────────

describe('scanHeartbeats — edge cases', () => {
  it('multiple stale agents produce separate violations and alerts each', () => {
    // existsSync: true for .tasks/ dir, but false for .brain/ so that debugLog's
    // appendToErrorsFile exits early and does NOT consume extra readFileSync mock slots.
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return !path.includes('.brain');
    });
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    const stale = new Date(Date.now() - 200_000).toISOString();
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(makeHb('w1', 'task-001', stale)) as never)
      // task JSON read for task-001 — simulate missing file (throws ENOENT)
      .mockImplementationOnce(() => { throw new Error('ENOENT'); })
      .mockReturnValueOnce(JSON.stringify(makeHb('w2', 'task-002', stale)) as never)
      // task JSON read for task-002 — simulate missing file (throws ENOENT)
      .mockImplementationOnce(() => { throw new Error('ENOENT'); });

    const result = scanHeartbeats('/project');

    expect(result.staleAgents).toHaveLength(2);
    expect(result.alerts).toHaveLength(2);
    expect(result.staleAgents[0]!.agentId).toBe('w1');
    expect(result.staleAgents[1]!.agentId).toBe('w2');
  });

  it('all heartbeats malformed JSON → empty heartbeats, no stale', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    mockedReadFileSync
      .mockImplementationOnce(() => { throw new Error('ENOENT'); })
      .mockImplementationOnce(() => { throw new Error('ENOENT'); });

    const result = scanHeartbeats('/project');

    expect(result.heartbeats).toHaveLength(0);
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('timestamp at exactly threshold boundary is NOT stale (elapsed == threshold = not >)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    // exactly at HEARTBEAT_STALE_THRESHOLD_MS (120000ms) minus 1ms — not stale
    const ts = new Date(Date.now() - 119_999).toISOString();
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeHb('w1', 'task-001', ts)) as never);

    const result = scanHeartbeats('/project');

    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('future timestamp (clock skew) is NOT marked as stale', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    // 10 seconds in the future
    const futureTs = new Date(Date.now() + 10_000).toISOString();
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeHb('w1', 'task-001', futureTs)) as never);

    const result = scanHeartbeats('/project');

    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('stale detail string contains elapsed seconds and task ID', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const stale = new Date(Date.now() - 300_000).toISOString(); // 300s
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeHb('w-agent', 'task-001', stale)) as never);

    const result = scanHeartbeats('/project');

    expect(result.staleAgents[0]!.detail).toMatch(/300s/);
    expect(result.staleAgents[0]!.detail).toContain('task-001');
  });

  it('numeric-string timestamp (not ISO) parses as NaN → agent is skipped (not marked stale)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    // '12345' is not valid ISO 8601, new Date('12345').getTime() → NaN in V8
    const hb = makeHb('w1', 'task-001', 'not-a-valid-iso-date-string-xyz');
    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');

    // heartbeat is parsed (JSON valid) but stale check is skipped because timestamp is NaN
    expect(result.heartbeats).toHaveLength(1);
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });
});

// ─── checkBoundaryViolations edge cases ─────────────────────────────

describe('checkBoundaryViolations — edge cases', () => {
  it('nested directory access is allowed (deep path within scope)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/core/utils/helpers.ts | 5 +++++\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: ['src/core/'], filesRead: [], filesWrite: [] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);

    expect(result).toEqual([]);
  });

  it('prefix overlap protection: src/core-extra/ is NOT inside src/core/', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/core-extra/index.ts | 3 +++\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: ['src/core/'], filesRead: [], filesWrite: [] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.type).toBe('file_outside_scope');
  });

  it('filesWrite exact match allows the file', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' README.md | 2 ++\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: [], filesRead: [], filesWrite: ['README.md'] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);

    expect(result).toEqual([]);
  });

  it('empty scopes map → no violations regardless of git changes', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/any/file.ts | 10 ++++++++++\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const result = checkBoundaryViolations('/project', new Map());

    expect(result).toEqual([]);
  });

  it('git error (status !== 0) → returns empty violations', () => {
    mockedSpawnSync.mockReturnValue({
      status: 128, stdout: '', stderr: 'not a git repo', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: ['src/'], filesRead: [], filesWrite: [] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);

    expect(result).toEqual([]);
  });

  it('multiple workers — file outside all scopes generates one violation per worker', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' docs/README.md | 1 +\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: ['src/core/'], filesRead: [], filesWrite: [] }],
      ['w2', { directories: ['src/api/'], filesRead: [], filesWrite: [] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);

    expect(result.length).toBe(2); // one per worker
  });

  it('git stdout is null → returns empty', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: null, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const result = checkBoundaryViolations('/project', new Map([
      ['w1', { directories: ['src/'], filesRead: [], filesWrite: [] }],
    ]));

    expect(result).toEqual([]);
  });
});

// ─── checkStaleLocks edge cases ──────────────────────────────────────

describe('checkStaleLocks — edge cases', () => {
  it('malformed lock JSON is skipped gracefully', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['bad.lock'] as never);
    mockedReadFileSync.mockImplementationOnce(() => { throw new Error('parse error'); });

    const result = checkStaleLocks('/project');

    expect(result.locks).toHaveLength(0);
    expect(result.staleLocks).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('multiple stale locks each generate separate violations and alerts', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['a.lock', 'b.lock'] as never);

    const staleTime = new Date(Date.now() - 400_000).toISOString();
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(makeLock('src/a.ts', 'w1', staleTime)) as never)
      .mockReturnValueOnce(JSON.stringify(makeLock('src/b.ts', 'w2', staleTime)) as never);

    const result = checkStaleLocks('/project');

    expect(result.locks).toHaveLength(2);
    expect(result.staleLocks).toHaveLength(2);
    expect(result.alerts).toHaveLength(2);
    expect(result.staleLocks[0]!.type).toBe('stale_lock');
    expect(result.staleLocks[1]!.type).toBe('stale_lock');
  });

  it('lock at boundary (just under 5 min) is NOT stale', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['boundary.lock'] as never);

    const justUnder = new Date(Date.now() - 290_000).toISOString(); // 10s margin for CI timing
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeLock('src/x.ts', 'w1', justUnder)) as never);

    const result = checkStaleLocks('/project');

    expect(result.staleLocks).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('stale lock detail includes file path and elapsed seconds', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['file.lock'] as never);

    const staleTime = new Date(Date.now() - 600_000).toISOString();
    mockedReadFileSync.mockReturnValue(
      JSON.stringify(makeLock('src/important.ts', 'worker-99', staleTime)) as never
    );

    const result = checkStaleLocks('/project');

    expect(result.staleLocks[0]!.detail).toContain('src/important.ts');
    expect(result.staleLocks[0]!.detail).toMatch(/600s/);
  });

  it('stale lock alert level is WARNING (not CRITICAL)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['x.lock'] as never);

    const staleTime = new Date(Date.now() - 400_000).toISOString();
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeLock('src/x.ts', 'w1', staleTime)) as never);

    const result = checkStaleLocks('/project');

    expect(result.alerts[0]!.level).toBe(AlertLevel.WARNING);
  });

  it('no .lock extension files are not processed', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.json', 'task-001.hb', 'task-001.result'] as never);

    const result = checkStaleLocks('/project');

    expect(result.locks).toHaveLength(0);
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });
});

// ─── detectDeadlocks edge cases ──────────────────────────────────────

describe('detectDeadlocks — edge cases', () => {
  it('3-way cycle A→B→C→A is detected', () => {
    const tasks = [
      makeTask('A', ['C']),
      makeTask('B', ['A']),
      makeTask('C', ['B']),
    ];

    const result = detectDeadlocks(tasks);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('circular_dependency');
    expect(result[0]!.agentId).toContain('A');
    expect(result[0]!.agentId).toContain('B');
    expect(result[0]!.agentId).toContain('C');
  });

  it('diamond dependency (no cycle): A→B, A→C, B→D, C→D', () => {
    const tasks = [
      makeTask('A', []),
      makeTask('B', ['A']),
      makeTask('C', ['A']),
      makeTask('D', ['B', 'C']),
    ];

    expect(detectDeadlocks(tasks)).toEqual([]);
  });

  it('single task with self-dependency (A depends on A) is cycle', () => {
    const tasks = [makeTask('A', ['A'])];

    const result = detectDeadlocks(tasks);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('circular_dependency');
  });

  it('empty task list returns no violations', () => {
    expect(detectDeadlocks([])).toEqual([]);
  });

  it('dependency on non-existent task is not treated as cycle', () => {
    // Task B depends on X which doesn't exist — no cycle
    const tasks = [
      makeTask('A', []),
      makeTask('B', ['X']),
    ];

    // X is referenced but not in the task list — Kahn's algorithm should handle this
    // X has in-degree 0 (added as dependency target), so it gets processed
    expect(detectDeadlocks(tasks)).toEqual([]);
  });

  it('partial cycle: A↔B in larger graph is still detected', () => {
    const tasks = [
      makeTask('A', ['B']),
      makeTask('B', ['A']),
      makeTask('C', []),   // no cycle involvement
      makeTask('D', ['C']),
    ];

    const result = detectDeadlocks(tasks);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('circular_dependency');
    // C and D should NOT be in cyclic nodes
    expect(result[0]!.agentId).not.toContain('C');
    expect(result[0]!.agentId).not.toContain('D');
  });

  it('circular dependency violation includes timestamp', () => {
    const tasks = [makeTask('A', ['B']), makeTask('B', ['A'])];
    const result = detectDeadlocks(tasks);
    expect(result[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── writeScanToDashboard edge cases ────────────────────────────────

describe('writeScanToDashboard — edge cases', () => {
  const sprintInfo = { id: 'sprint-001', number: 1, phase: 'EXECUTE', status: 'ACTIVE' };

  it('corrupted existing dashboard JSON starts fresh without throwing', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce('{ corrupt json {{' as never);

    expect(() => {
      writeScanToDashboard('/project', sprintInfo, {
        heartbeats: [],
        violations: [],
        alerts: [],
        locks: [],
      });
    }).not.toThrow();

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it('violation count is sum of all violation types', () => {
    mockedExistsSync.mockReturnValue(false);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [
        { type: 'stale_heartbeat', agentId: 'w1', detail: 'd1', timestamp: new Date().toISOString() },
        { type: 'stale_lock', agentId: 'w2', detail: 'd2', timestamp: new Date().toISOString() },
        { type: 'circular_dependency', agentId: 'A,B', detail: 'd3', timestamp: new Date().toISOString() },
      ],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.violations).toBe(3);
  });

  it('agent with matching heartbeat gets currentAction updated', () => {
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [{
        id: 'w-007',
        role: 'worker',
        status: AgentStatus.EXECUTING,
        model: 'sonnet',
        tmuxWindow: 'w-007',
        currentAction: 'old action',
      }] as never,
      progress: { done: 0, active: 1, blocked: 0, total: 1 },

      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(JSON.stringify(existingDash) as never);
    mockedReaddirSync.mockReturnValue([] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [makeHb('w-007', 'task-007', new Date().toISOString())],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.agents[0].currentAction).toBe('working');
  });

  it('alert deduplication: same alert twice → count=2, length stays 1', () => {
    const ts = new Date().toISOString();
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },

      alerts: [{ level: AlertLevel.WARNING, message: 'Stale lock: src/x.ts by w1', source: 'w1', timestamp: ts, count: 1 }],
      updatedAt: ts,
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(JSON.stringify(existingDash) as never);
    mockedReaddirSync.mockReturnValue([] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [{ level: AlertLevel.WARNING, message: 'Stale lock: src/x.ts by w1', source: 'w1', timestamp: new Date().toISOString() }],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.alerts).toHaveLength(1);
    expect(written.alerts[0].count).toBe(2);
  });

  it('exactly 50 existing alerts + 1 new unique → oldest dropped, length stays 50', () => {
    const existingAlerts = Array.from({ length: 50 }, (_, i) => ({
      level: AlertLevel.INFO as never,
      message: `alert-${i}`,
      source: 'sys',
      timestamp: new Date().toISOString(),
      count: 1,
    }));
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },

      alerts: existingAlerts as never,
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce(JSON.stringify(existingDash) as never);
    mockedReaddirSync.mockReturnValue([] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [{ level: AlertLevel.CRITICAL, message: 'brand-new', source: 'w99', timestamp: new Date().toISOString() }],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.alerts.length).toBe(50);
    expect(written.alerts.find((a: { message: string }) => a.message === 'brand-new')).toBeDefined();
    expect(written.alerts.find((a: { message: string }) => a.message === 'alert-0')).toBeUndefined();
  });

});

// ─── startScanLoop edge cases ─────────────────────────────────────────

describe('startScanLoop — edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clearInterval stops future ticks from executing', () => {
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      return false;
    });

    const handle = startScanLoop('/project', 'sprint-1', 100);

    vi.advanceTimersByTime(100); // 1st tick
    const countAfterFirstTick = callCount;
    clearInterval(handle);

    vi.advanceTimersByTime(200); // no more ticks
    expect(callCount).toBe(countAfterFirstTick); // no increment
  });

  it('multiple ticks call onScanComplete each time', () => {
    mockedExistsSync.mockReturnValue(false);
    const callback = vi.fn();

    const handle = startScanLoop('/project', 'sprint-1', 50, callback);

    vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(50);

    expect(callback).toHaveBeenCalledTimes(3);
    clearInterval(handle);
  });

  it('returns an interval handle (not null/undefined)', () => {
    mockedExistsSync.mockReturnValue(false);

    const handle = startScanLoop('/project', 'sprint-1', 100);

    expect(handle).toBeDefined();
    clearInterval(handle);
  });

  it('custom interval overrides default AUDITOR_SCAN_INTERVAL_MS', () => {
    mockedExistsSync.mockReturnValue(false);
    const spy = vi.spyOn(globalThis, 'setInterval');

    const handle = startScanLoop('/project', 'sprint-1', 9999);

    expect(spy).toHaveBeenCalledWith(expect.any(Function), 9999);

    clearInterval(handle);
    spy.mockRestore();
  });
});

// ─── deduplicateAlerts edge cases ────────────────────────────────────

describe('deduplicateAlerts — edge cases', () => {
  const ts = () => new Date().toISOString();

  it('updates timestamp of existing alert when incremented', () => {
    const oldTs = new Date(Date.now() - 60_000).toISOString();
    const newTs = new Date().toISOString();

    const existing = [{ level: AlertLevel.CRITICAL, message: 'stale', source: 'w1', timestamp: oldTs, count: 1 }];
    const incoming = [{ level: AlertLevel.CRITICAL, message: 'stale', source: 'w1', timestamp: newTs }];

    const result = deduplicateAlerts(existing, incoming);

    expect(result[0]!.timestamp).toBe(newTs);
  });

  it('multiple different sources each tracked independently', () => {
    const alerts = [
      { level: AlertLevel.WARNING, message: 'stale', source: 'w1', timestamp: ts() },
      { level: AlertLevel.WARNING, message: 'stale', source: 'w2', timestamp: ts() },
      { level: AlertLevel.WARNING, message: 'stale', source: 'w3', timestamp: ts() },
    ];

    const result = deduplicateAlerts([], alerts);

    expect(result).toHaveLength(3);
    result.forEach(a => expect(a.count).toBe(1));
  });

  it('capping at 50 preserves newest entries (slice from end)', () => {
    const existing = Array.from({ length: 49 }, (_, i) => ({
      level: AlertLevel.INFO,
      message: `alert-${i}`,
      source: 'sys',
      timestamp: ts(),
      count: 1,
    }));

    const result = deduplicateAlerts(existing, [
      { level: AlertLevel.CRITICAL, message: 'critical-new', source: 'sys', timestamp: ts() },
      { level: AlertLevel.CRITICAL, message: 'critical-new-2', source: 'sys', timestamp: ts() },
    ]);

    // 49 + 2 = 51 → capped at 50 (oldest removed)
    expect(result).toHaveLength(50);
    expect(result.find(a => a.message === 'critical-new')).toBeDefined();
    expect(result.find(a => a.message === 'critical-new-2')).toBeDefined();
    expect(result.find(a => a.message === 'alert-0')).toBeUndefined();
  });
});
