import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAlert,
  scanHeartbeats,
  checkBoundaryViolations,
  checkStaleLocks,
  detectDeadlocks,
  resetDashboard,
  updateDashboard,
  detectPatterns,
  buildWorkerScopeMap,
  runScanCycle,
  startScanLoop,
  writeScanToDashboard,
} from '../../src/monitor/auditor.js';
import { AlertLevel, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskScope, DashboardState, Heartbeat, LockInfo } from '../../src/core/types.js';
import { AUDITOR_SCAN_INTERVAL_MS } from '../../src/core/constants.js';

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
});

describe('createAlert', () => {
  it('returns proper Alert with all fields and ISO timestamp', () => {
    const alert = createAlert(AlertLevel.CRITICAL, 'Agent stale', 'worker-1');

    expect(alert.level).toBe(AlertLevel.CRITICAL);
    expect(alert.message).toBe('Agent stale');
    expect(alert.source).toBe('worker-1');
    expect(alert.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('allows optional source (undefined)', () => {
    const alert = createAlert(AlertLevel.INFO, 'Test');

    expect(alert.source).toBeUndefined();
  });
});

describe('scanHeartbeats', () => {
  it('returns empty when no .hb files exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = scanHeartbeats('/project');

    expect(result.heartbeats).toEqual([]);
    expect(result.staleAgents).toEqual([]);
    expect(result.alerts).toEqual([]);
  });

  it('parses valid heartbeat files', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    const freshTimestamp = new Date().toISOString();
    const hb1: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: freshTimestamp, filesChangedCount: 1, sequence: 0,
    };
    const hb2: Heartbeat = {
      workerId: 'w2', taskId: 'task-002', status: 'TESTING' as never,
      currentAction: 'testing', timestamp: freshTimestamp, filesChangedCount: 2, sequence: 1,
    };

    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(hb1) as never)
      .mockReturnValueOnce(JSON.stringify(hb2) as never);

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(2);
  });

  it('detects stale agent (>120s)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const staleTimestamp = new Date(Date.now() - 200_000).toISOString();
    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: staleTimestamp, filesChangedCount: 0, sequence: 0,
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');
    expect(result.staleAgents).toHaveLength(1);
    expect(result.staleAgents[0]!.type).toBe('stale_heartbeat');
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.level).toBe(AlertLevel.CRITICAL);
  });

  it('skips invalid JSON (1 valid + 1 invalid → 1 heartbeat)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    const validHb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(), filesChangedCount: 0, sequence: 0,
    };

    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(validHb) as never)
      .mockImplementationOnce(() => { throw new Error('bad json'); });

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
  });
});

describe('checkBoundaryViolations', () => {
  it('returns empty when git has no changes', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>();
    const result = checkBoundaryViolations('/project', scopes);
    expect(result).toEqual([]);
  });

  it('detects file outside scope', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/api/routes.ts | 5 +++++\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: ['src/core/'], filesRead: [], filesWrite: [] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.type).toBe('file_outside_scope');
  });

  it('passes file within scope', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/core/types.ts | 3 +++\n 1 file changed\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const scopes = new Map<string, TaskScope>([
      ['w1', { directories: ['src/core/'], filesRead: [], filesWrite: [] }],
    ]);

    const result = checkBoundaryViolations('/project', scopes);
    expect(result).toEqual([]);
  });
});

describe('checkStaleLocks', () => {
  it('returns empty when no .lock files', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = checkStaleLocks('/project');
    expect(result.locks).toEqual([]);
    expect(result.staleLocks).toEqual([]);
  });

  it('detects stale lock (>5min)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project');
    expect(result.staleLocks).toHaveLength(1);
    expect(result.staleLocks[0]!.type).toBe('stale_lock');
    expect(result.alerts).toHaveLength(1);
  });

  it('passes fresh lock without issues', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const freshLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-001',
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(freshLock) as never);

    const result = checkStaleLocks('/project');
    expect(result.locks).toHaveLength(1);
    expect(result.staleLocks).toEqual([]);
  });
});

describe('detectDeadlocks', () => {
  it('returns empty for acyclic dependencies (A→B→C)', () => {
    const tasks: Task[] = [
      makeTask('A', []),
      makeTask('B', ['A']),
      makeTask('C', ['B']),
    ];

    expect(detectDeadlocks(tasks)).toEqual([]);
  });

  it('detects circular dependency (A↔B)', () => {
    const tasks: Task[] = [
      makeTask('A', ['B']),
      makeTask('B', ['A']),
    ];

    const result = detectDeadlocks(tasks);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('circular_dependency');
  });

  it('returns empty when no dependencies', () => {
    const tasks: Task[] = [
      makeTask('A', []),
      makeTask('B', []),
    ];

    expect(detectDeadlocks(tasks)).toEqual([]);
  });
});

describe('updateDashboard', () => {
  it('writes JSON to .dashboard file', () => {
    const state: DashboardState = {
      sprint: { id: 's1', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 0, active: 1, blocked: 0, total: 2 },
      usage: { fiveHourPercent: 0.1, weeklyPercent: 0.05, measuredAt: new Date().toISOString() },
      alerts: [],
      updatedAt: new Date().toISOString(),
    };

    updateDashboard('/project', state);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const callArgs = mockedWriteFileSync.mock.calls[0]!;
    expect(String(callArgs[0])).toContain('.dashboard');
    expect(JSON.parse(callArgs[1] as string)).toEqual(state);
  });
});

describe('detectPatterns', () => {
  it('appends new pattern', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('not found'); });

    detectPatterns('/project', [
      { type: 'stale_heartbeat', agentId: 'w1', detail: 'stale', timestamp: new Date().toISOString() },
    ], 'sprint-1');

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string) as Array<{ pattern: string }>;
    expect(written).toHaveLength(1);
    expect(written[0]!.pattern).toBe('stale_heartbeat');
  });

  it('increments occurrence for existing pattern', () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify([
      { pattern: 'stale_heartbeat', occurrences: 2, firstDetectedInSprint: 's1', lastDetectedInSprint: 's1', resolved: false },
    ]) as never);

    detectPatterns('/project', [
      { type: 'stale_heartbeat', agentId: 'w1', detail: 'stale', timestamp: new Date().toISOString() },
    ], 'sprint-2');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string) as Array<{ occurrences: number }>;
    expect(written[0]!.occurrences).toBe(3);
  });

  it('truncates when exceeding PATTERNS_MAX_LINES', () => {
    // Create many existing patterns to exceed limit
    const manyPatterns = Array.from({ length: 50 }, (_, i) => ({
      pattern: `pattern-${i}`,
      occurrences: 1,
      firstDetectedInSprint: 's1',
      lastDetectedInSprint: 's1',
      resolved: false,
    }));
    mockedReadFileSync.mockReturnValue(JSON.stringify(manyPatterns) as never);

    detectPatterns('/project', [
      { type: 'new_pattern' as never, agentId: 'w1', detail: 'new', timestamp: new Date().toISOString() },
    ], 'sprint-2');

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    // Should have removed oldest entries to fit within limit
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string) as unknown[];
    expect(written.length).toBeLessThanOrEqual(50);
  });
});

describe('buildWorkerScopeMap', () => {
  it('builds scope map from task files', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.json', 'task-002.json'] as never);

    const task1: Partial<Task> = {
      id: 'task-001', assignedWorker: 'w1',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] },
    };
    const task2: Partial<Task> = {
      id: 'task-002', assignedWorker: 'w2',
      scope: { directories: ['src/api/'], filesRead: [], filesWrite: [] },
    };

    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(task1) as never)
      .mockReturnValueOnce(JSON.stringify(task2) as never);

    const map = buildWorkerScopeMap('/project');
    expect(map.size).toBe(2);
    expect(map.get('w1')!.directories).toEqual(['src/core/']);
    expect(map.get('w2')!.directories).toEqual(['src/api/']);
  });
});

describe('runScanCycle', () => {
  it('combines all sub-scan results', () => {
    // Setup: no tasks dir for heartbeats, locks; no git changes
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const result = runScanCycle('/project', 'sprint-1');

    expect(result.heartbeats).toEqual([]);
    expect(result.violations).toEqual([]);
    expect(result.alerts).toEqual([]);
    expect(result.locks).toEqual([]);
  });
});

describe('startScanLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls runScanCycle on each tick', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const handle = startScanLoop('/project', 'sprint-1', 100);

    vi.advanceTimersByTime(100);
    // At least one cycle should have been attempted
    // (existsSync is called as part of scanHeartbeats)
    expect(mockedExistsSync).toHaveBeenCalled();

    clearInterval(handle);
    vi.useRealTimers();
  });

  it('uses default AUDITOR_SCAN_INTERVAL_MS', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');

    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const handle = startScanLoop('/project', 'sprint-1');

    expect(spy).toHaveBeenCalledWith(expect.any(Function), AUDITOR_SCAN_INTERVAL_MS);

    clearInterval(handle);
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('continues loop even if runScanCycle throws', () => {
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      if (callCount <= 3) throw new Error('boom');
      return false;
    });
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const handle = startScanLoop('/project', 'sprint-1', 50);

    vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(50);
    // Should not throw — loop continues
    expect(callCount).toBeGreaterThanOrEqual(2);

    clearInterval(handle);
    vi.useRealTimers();
  });
});

describe('startScanLoop with callback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('invokes onScanComplete callback after scan', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const callback = vi.fn();
    const handle = startScanLoop('/project', 'sprint-1', 100, callback);

    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      heartbeats: expect.any(Array),
      violations: expect.any(Array),
      alerts: expect.any(Array),
      locks: expect.any(Array),
    }));

    clearInterval(handle);
    vi.useRealTimers();
  });

  it('swallows callback errors — loop continues', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const callback = vi.fn().mockImplementation(() => { throw new Error('callback boom'); });
    const handle = startScanLoop('/project', 'sprint-1', 50, callback);

    vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(50);
    // Should have been called twice despite first error
    expect(callback).toHaveBeenCalledTimes(2);

    clearInterval(handle);
    vi.useRealTimers();
  });
});

describe('writeScanToDashboard', () => {
  const sprintInfo = { id: 'sprint-001', number: 1, phase: 'EXECUTE', status: 'ACTIVE' };

  it('writes dashboard JSON with merged alerts', () => {
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 0, active: 1, blocked: 0, total: 2 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
      alerts: [{ level: 'INFO' as never, message: 'existing', timestamp: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingDash) as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [{ level: 'WARNING' as never, message: 'new alert', timestamp: new Date().toISOString() }],
      locks: [],
    });

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.alerts).toHaveLength(2);
  });

  it('updates agent statuses from heartbeats', () => {
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [{ id: 'w-001', role: 'worker', status: 'EXECUTING', model: 'sonnet', tmuxWindow: 'w-001' }] as never,
      progress: { done: 0, active: 1, blocked: 0, total: 1 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingDash) as never);

    const hbTimestamp = new Date().toISOString();
    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [{ workerId: 'w-001', taskId: '001', status: 'CODING' as never, currentAction: 'writing tests', timestamp: hbTimestamp, filesChangedCount: 3, sequence: 5 }],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.agents[0].lastHeartbeat).toBe(hbTimestamp);
    expect(written.agents[0].currentAction).toBe('writing tests');
  });

  it('handles no existing dashboard (fresh start)', () => {
    mockedExistsSync.mockReturnValue(false);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
    });

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.alerts).toEqual([]);
    expect(written.agents).toEqual([]);
  });

  it('limits alerts to 50', () => {
    const existingAlerts = Array.from({ length: 48 }, (_, i) => ({
      level: 'INFO' as never,
      message: `alert-${i}`,
      timestamp: new Date().toISOString(),
    }));
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
      alerts: existingAlerts as never,
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingDash) as never);

    const newAlerts = Array.from({ length: 5 }, (_, i) => ({
      level: 'WARNING' as never,
      message: `new-${i}`,
      timestamp: new Date().toISOString(),
    }));

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: newAlerts as never,
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.alerts.length).toBeLessThanOrEqual(50);
  });

  it('includes auditorLastScan in output', () => {
    mockedExistsSync.mockReturnValue(false);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.auditorLastScan).toBeDefined();
    expect(written.auditorLastScan).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes violations count', () => {
    mockedExistsSync.mockReturnValue(false);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [
        { type: 'stale_heartbeat', agentId: 'w1', detail: 'stale', timestamp: new Date().toISOString() },
        { type: 'file_outside_scope', agentId: 'w2', detail: 'bad', timestamp: new Date().toISOString() },
      ],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.violations).toBe(2);
  });

  it('dashboard JSON contains all DashboardState fields', () => {
    mockedExistsSync.mockReturnValue(false);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written).toHaveProperty('sprint');
    expect(written).toHaveProperty('agents');
    expect(written).toHaveProperty('progress');
    expect(written).toHaveProperty('usage');
    expect(written).toHaveProperty('alerts');
    expect(written).toHaveProperty('updatedAt');
    expect(written).toHaveProperty('auditorLastScan');
    expect(written).toHaveProperty('violations');
  });
});

describe('resetDashboard', () => {
  it('writes fresh state with correct sprint ID', () => {
    resetDashboard('/project', 'sprint-005', 3);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const callArgs = mockedWriteFileSync.mock.calls[0]!;
    expect(String(callArgs[0])).toContain('.dashboard');
    const written = JSON.parse(callArgs[1] as string);
    expect(written.sprint.id).toBe('sprint-005');
    expect(written.sprint.phase).toBe('PLAN');
    expect(written.sprint.status).toBe('PLANNING');
  });

  it('sets progress to 0/total with correct task count', () => {
    resetDashboard('/project', 'sprint-010', 7);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.progress).toEqual({ done: 0, active: 0, blocked: 0, total: 7 });
  });

  it('clears old alerts (empty alerts array)', () => {
    resetDashboard('/project', 'sprint-003', 2);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.alerts).toEqual([]);
  });

  it('clears old agents (empty agents array)', () => {
    resetDashboard('/project', 'sprint-003', 2);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.agents).toEqual([]);
  });

  it('sets updatedAt to ISO timestamp', () => {
    resetDashboard('/project', 'sprint-001', 1);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sets usage metrics to zero', () => {
    resetDashboard('/project', 'sprint-001', 1);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.usage.fiveHourPercent).toBe(0);
    expect(written.usage.weeklyPercent).toBe(0);
    expect(written.usage.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
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
