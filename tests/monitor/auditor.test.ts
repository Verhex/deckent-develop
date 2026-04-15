import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAlert,
  scanHeartbeats,
  scanResultFiles,
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
  deduplicateAlerts,
  // Sprint 138 — migrated + new exports
  CODE_VERIFIED_DONE,
  tryCodeVerifiedDone,
  writeCodeVerifiedResult,
  parseEvidenceCommand,
  inferAffectedTests,
  verifyFunctional,
  validateTechDebt,
  verifyWorkerResult,
  parseADRs,
  checkADRCompliance,
  // Sprint 139 — cache invalidation + multi-signal stale detection
  readHeartbeatCached,
  clearHeartbeatCache,
  getHeartbeatCacheSize,
  isWorkerProcessAlive,
  isWorkerStale,
  // Sprint 139 Task 016 — orphan HB cleanup
  detectOrphans,
  cleanupOrphanHBs,
  // Sprint 139 Task 032 — dependency violation alert
  detectDependencyViolations,
  // Sprint 139 Task 043 — event hook real wire
  emitVerificationEvent,
  emitADRViolationEvent,
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

import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, statSync, mkdirSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { writeEvent } from '../../src/orchestra/event-stream.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedStatSync = vi.mocked(statSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedWriteEvent = vi.mocked(writeEvent);
const mockedRenameSync = vi.mocked(renameSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  mockedReaddirSync.mockReturnValue([] as never);
  // Sprint 139: Default statSync mock — returns a fresh mtime so readHeartbeatCached works
  mockedStatSync.mockReturnValue({ mtimeMs: Date.now() } as never);
  // Sprint 139: Clear heartbeat cache between tests to avoid state leakage
  clearHeartbeatCache();
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
    mockedExistsSync.mockImplementation((path: unknown) => {
      const p = String(path);
      // .tasks dir exists, .hb files exist, but NO .result file for this task
      return !p.endsWith('.result');
    });
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

  it('does not mark agent as stale when timestamp is malformed placeholder text (resilient)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: '<current ISO timestamp>', filesChangedCount: 0, sequence: 0,
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('does not mark agent as stale when timestamp is empty string', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: '', filesChangedCount: 0, sequence: 0,
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('fresh UTC ISO timestamp (new Date().toISOString()) is NOT marked as stale', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const freshTimestamp = new Date().toISOString();
    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: freshTimestamp, filesChangedCount: 0, sequence: 0,
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('timestamp 121 seconds old is marked as stale (>120s threshold)', () => {
    mockedExistsSync.mockImplementation((path: unknown) => {
      const p = String(path);
      // .tasks dir exists, .hb files exist, but NO .result file for this task
      return !p.endsWith('.result');
    });
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const staleTimestamp = new Date(Date.now() - 121_000).toISOString();
    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: staleTimestamp, filesChangedCount: 0, sequence: 0,
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');
    expect(result.staleAgents).toHaveLength(1);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.level).toBe(AlertLevel.CRITICAL);
  });

  it('malformed timestamp: agent still appears in heartbeats list (tracked but not stale)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    const malformedHb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: 'not-a-date', filesChangedCount: 0, sequence: 0,
    };
    const freshHb: Heartbeat = {
      workerId: 'w2', taskId: 'task-002', status: 'TESTING' as never,
      currentAction: 'testing', timestamp: new Date().toISOString(), filesChangedCount: 1, sequence: 1,
    };

    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(malformedHb) as never)
      .mockReturnValueOnce(JSON.stringify(freshHb) as never);

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(2);
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('skips stale check for heartbeats with DONE status', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    // Heartbeat has DONE status but a very old timestamp — should NOT be flagged as stale
    const staleTimestamp = new Date(Date.now() - 600_000).toISOString();
    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'DONE' as never,
      currentAction: 'Task completed', timestamp: staleTimestamp, filesChangedCount: 5, sequence: 10,
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(hb) as never);

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('skips stale check when .result file exists with successful selfAssessment (cleanup_delay_ms scenario)', () => {
    // Simulates the window between writeResult() and finalizeHeartbeat() delay deletion:
    // .result file is written, but .hb file hasn't been deleted yet (cleanup_delay_ms > 0).
    // Auditor should NOT generate false positive stale alerts in this window.
    // shouldReportStale() reconciles HB with .result content (DONE/GO_WITH_TECH_DEBT suppresses alert).
    mockedExistsSync.mockImplementation((path: unknown) => {
      const p = String(path);
      // .hb file exists (not yet deleted), .result file also exists
      return p.endsWith('.hb') || p.endsWith('.result') || p.endsWith('.tasks');
    });
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const staleTimestamp = new Date(Date.now() - 300_000).toISOString(); // 5 minutes old
    const hb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'EXECUTING' as never,
      currentAction: 'running', timestamp: staleTimestamp, filesChangedCount: 2, sequence: 3,
    };
    const doneResult = { taskId: 'task-001', selfAssessment: 'DONE', notes: 'completed' };

    mockedReadFileSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith('.result')) return JSON.stringify(doneResult) as never;
      return JSON.stringify(hb) as never;
    });

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
    // No stale agents or alerts when .result file exists with DONE selfAssessment
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
  });

  it('other active workers are not affected by completed task heartbeat cleanup', () => {
    mockedExistsSync.mockImplementation((path: unknown) => {
      const p = String(path);
      // task-002 has .result file (completed), task-001 does not
      if (p.endsWith('task-002.result')) return true;
      if (p.endsWith('.hb') || p === '/project/.tasks') return true;
      return false;
    });
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    const freshTimestamp = new Date().toISOString();
    const staleTimestamp = new Date(Date.now() - 300_000).toISOString();

    const activeHb: Heartbeat = {
      workerId: 'w1', taskId: 'task-001', status: 'CODING' as never,
      currentAction: 'coding', timestamp: freshTimestamp, filesChangedCount: 1, sequence: 2,
    };
    const completedHb: Heartbeat = {
      workerId: 'w2', taskId: 'task-002', status: 'EXECUTING' as never,
      currentAction: 'old', timestamp: staleTimestamp, filesChangedCount: 5, sequence: 10,
    };
    const doneResult = { taskId: 'task-002', selfAssessment: 'DONE', notes: 'completed' };

    mockedReadFileSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith('task-002.result')) return JSON.stringify(doneResult) as never;
      if (p.includes('task-001.hb')) return JSON.stringify(activeHb) as never;
      if (p.includes('task-002.hb')) return JSON.stringify(completedHb) as never;
      throw new Error('ENOENT');
    });

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(2);
    // Active worker (task-001) has fresh heartbeat — no stale alert
    // Completed worker (task-002) has .result file with DONE — skipped by shouldReportStale
    expect(result.staleAgents).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
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

describe('checkStaleLocks — auto_clean_locks', () => {
  it('removes stale lock file when autoClean=true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project', true);

    expect(mockedUnlinkSync).toHaveBeenCalledOnce();
    expect(result.removedLocks).toContain('src/file.ts');
  });

  it('does NOT remove stale lock when autoClean=false (default)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project', false);

    expect(mockedUnlinkSync).not.toHaveBeenCalled();
    expect(result.removedLocks).toHaveLength(0);
  });

  it('does NOT remove stale lock when autoClean omitted (default false)', () => {
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

    expect(mockedUnlinkSync).not.toHaveBeenCalled();
    expect(result.removedLocks).toHaveLength(0);
  });

  it('does NOT remove fresh (non-stale) lock even when autoClean=true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const freshLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(freshLock) as never);

    const result = checkStaleLocks('/project', true);

    expect(mockedUnlinkSync).not.toHaveBeenCalled();
    expect(result.removedLocks).toHaveLength(0);
    expect(result.staleLocks).toHaveLength(0);
  });

  it('logs INFO alert (not WARNING) when lock is auto-removed', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project', true);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.level).toBe(AlertLevel.INFO);
    expect(result.alerts[0]!.message).toContain('Auto-removed stale lock');
  });

  it('logs WARNING alert (not INFO) when lock is stale but autoClean=false', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project', false);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.level).toBe(AlertLevel.WARNING);
  });

  it('still reports staleLocks violation even after auto-removal', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project', true);

    expect(result.staleLocks).toHaveLength(1);
    expect(result.staleLocks[0]!.type).toBe('stale_lock');
  });

  it('handles unlinkSync failure gracefully — falls back to WARNING alert', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__file.ts.lock'] as never);
    mockedUnlinkSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });

    const staleLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(staleLock) as never);

    const result = checkStaleLocks('/project', true);

    expect(result.removedLocks).toHaveLength(0);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.level).toBe(AlertLevel.WARNING);
  });

  it('removes multiple stale locks when autoClean=true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__a.ts.lock', 'src__b.ts.lock'] as never);

    const staleA: LockInfo = {
      filePath: 'src/a.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    const staleB: LockInfo = {
      filePath: 'src/b.ts',
      ownerWorkerId: 'w2',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-002',
    };
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(staleA) as never)
      .mockReturnValueOnce(JSON.stringify(staleB) as never);

    const result = checkStaleLocks('/project', true);

    expect(mockedUnlinkSync).toHaveBeenCalledTimes(2);
    expect(result.removedLocks).toHaveLength(2);
    expect(result.removedLocks).toContain('src/a.ts');
    expect(result.removedLocks).toContain('src/b.ts');
  });

  it('mixes stale + fresh: only removes stale ones when autoClean=true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['src__stale.ts.lock', 'src__fresh.ts.lock'] as never);

    const stale: LockInfo = {
      filePath: 'src/stale.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: 'task-001',
    };
    const fresh: LockInfo = {
      filePath: 'src/fresh.ts',
      ownerWorkerId: 'w2',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-002',
    };
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify(stale) as never)
      .mockReturnValueOnce(JSON.stringify(fresh) as never);

    const result = checkStaleLocks('/project', true);

    expect(mockedUnlinkSync).toHaveBeenCalledOnce();
    expect(result.removedLocks).toHaveLength(1);
    expect(result.removedLocks).toContain('src/stale.ts');
    expect(result.locks).toHaveLength(2);
  });

  it('runScanCycle passes autoCleanLocks=true to checkStaleLocks', () => {
    // Minimal mocks — no tasks dir, no locks dir, no heartbeats
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never);

    const result = runScanCycle('/project', 'sprint-001', true);

    // Should complete without error, removedLocks is not returned from runScanCycle
    // but the call chain works
    expect(result.violations).toEqual([]);
    expect(result.alerts).toEqual([]);
  });

  it('removedLocks is empty array when no locks dir exists', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = checkStaleLocks('/project', true);

    expect(result.removedLocks).toEqual([]);
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
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

});

describe('deduplicateAlerts', () => {
  const ts = () => new Date().toISOString();

  it('adds new alerts with count=1', () => {
    const result = deduplicateAlerts([], [
      { level: AlertLevel.WARNING, message: 'stale lock', source: 'w1', timestamp: ts() },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(1);
    expect(result[0]!.message).toBe('stale lock');
  });

  it('does not add duplicate source+message — increments count instead', () => {
    const existing = [
      { level: AlertLevel.CRITICAL, message: 'Stale agent: w1', source: 'w1', timestamp: ts(), count: 1 },
    ];
    const incoming = [
      { level: AlertLevel.CRITICAL, message: 'Stale agent: w1', source: 'w1', timestamp: ts() },
    ];

    const result = deduplicateAlerts(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(2);
  });

  it('allows same message with different source', () => {
    const existing = [
      { level: AlertLevel.WARNING, message: 'Stale agent detected', source: 'w1', timestamp: ts(), count: 1 },
    ];
    const incoming = [
      { level: AlertLevel.WARNING, message: 'Stale agent detected', source: 'w2', timestamp: ts() },
    ];

    const result = deduplicateAlerts(existing, incoming);

    expect(result).toHaveLength(2);
    expect(result.find(a => a.source === 'w1')!.count).toBe(1);
    expect(result.find(a => a.source === 'w2')!.count).toBe(1);
  });

  it('count increments correctly across multiple duplicates', () => {
    let result = deduplicateAlerts([], [
      { level: AlertLevel.CRITICAL, message: 'stale', source: 'w1', timestamp: ts() },
    ]);
    result = deduplicateAlerts(result, [
      { level: AlertLevel.CRITICAL, message: 'stale', source: 'w1', timestamp: ts() },
    ]);
    result = deduplicateAlerts(result, [
      { level: AlertLevel.CRITICAL, message: 'stale', source: 'w1', timestamp: ts() },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(3);
  });

  it('caps result at 50 (removes oldest when over limit)', () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({
      level: AlertLevel.INFO,
      message: `alert-${i}`,
      source: 'sys',
      timestamp: ts(),
      count: 1,
    }));

    const result = deduplicateAlerts(existing, [
      { level: AlertLevel.WARNING, message: 'new-alert', source: 'sys', timestamp: ts() },
    ]);

    expect(result).toHaveLength(50);
    // newest alert should be present
    expect(result.find(a => a.message === 'new-alert')).toBeDefined();
    // oldest should be gone
    expect(result.find(a => a.message === 'alert-0')).toBeUndefined();
  });

  it('returns empty array when both inputs are empty', () => {
    expect(deduplicateAlerts([], [])).toEqual([]);
  });

  it('handles undefined source correctly (deduplicates by message only)', () => {
    const existing = [
      { level: AlertLevel.INFO, message: 'generic', timestamp: ts(), count: 1 },
    ];
    const incoming = [
      { level: AlertLevel.INFO, message: 'generic', timestamp: ts() },
    ];

    const result = deduplicateAlerts(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(2);
  });

  it('writeScanToDashboard uses deduplication — repeated alerts do not stack', () => {
    const alert = { level: 'CRITICAL' as never, message: 'Stale agent: w1', source: 'w1', timestamp: ts(), count: 1 };
    const existingDash: DashboardState = {
      sprint: { id: 's1', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: 0 },

      alerts: [alert],
      updatedAt: ts(),
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingDash) as never);

    writeScanToDashboard('/project', { id: 's1', number: 1, phase: 'EXECUTE', status: 'ACTIVE' }, {
      heartbeats: [],
      violations: [],
      alerts: [{ level: 'CRITICAL' as never, message: 'Stale agent: w1', source: 'w1', timestamp: ts() }],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    // Should still be 1 alert, not 2
    expect(written.alerts).toHaveLength(1);
    expect(written.alerts[0].count).toBe(2);
  });
});

describe('scanResultFiles', () => {
  it('returns zero when tasks dir does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = scanResultFiles('/project');

    expect(result.resultCount).toBe(0);
    expect(result.doneTaskIds.size).toBe(0);
  });

  it('counts result files correctly', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'task-001.result', 'task-002.result', 'task-001.json', 'task-001.hb',
    ] as never);

    const result = scanResultFiles('/project');

    expect(result.resultCount).toBe(2);
    expect(result.doneTaskIds.size).toBe(2);
  });

  it('extracts task IDs from result filenames', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'task-019-001.result', 'task-019-002.result',
    ] as never);

    const result = scanResultFiles('/project');

    expect(result.doneTaskIds.has('019-001')).toBe(true);
    expect(result.doneTaskIds.has('019-002')).toBe(true);
  });

  it('ignores non-result files', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'task-001.json', 'task-001.hb', 'task-001.plan', 'task-001.log',
    ] as never);

    const result = scanResultFiles('/project');

    expect(result.resultCount).toBe(0);
    expect(result.doneTaskIds.size).toBe(0);
  });

  it('returns empty set when no files in dir', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([] as never);

    const result = scanResultFiles('/project');

    expect(result.resultCount).toBe(0);
    expect(result.doneTaskIds.size).toBe(0);
  });
});

describe('writeScanToDashboard — result file progress', () => {
  const sprintInfo = { id: 'sprint-001', number: 1, phase: 'EXECUTE', status: 'ACTIVE' };

  it('sets progress.done from .result file count', () => {
    mockedExistsSync
      .mockReturnValueOnce(false)  // dashPath does not exist
      .mockReturnValueOnce(true);  // tasksDir exists for scanResultFiles
    mockedReaddirSync.mockReturnValue(['task-001.result', 'task-002.result'] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.progress.done).toBe(2);
  });

  it('sets progress.active to heartbeats without matching result', () => {
    mockedExistsSync
      .mockReturnValueOnce(false)  // dashPath
      .mockReturnValueOnce(true);  // tasksDir
    mockedReaddirSync.mockReturnValue(['task-001.result'] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [
        { workerId: 'w-001', taskId: '001', status: 'CODING' as never, currentAction: 'working', timestamp: new Date().toISOString(), filesChangedCount: 1, sequence: 1 },
        { workerId: 'w-002', taskId: '002', status: 'CODING' as never, currentAction: 'working', timestamp: new Date().toISOString(), filesChangedCount: 1, sequence: 1 },
      ],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    // task-001 has result (done), task-002 does not (active)
    expect(written.progress.active).toBe(1);
  });

  it('sets progress.done=0 and active=heartbeat count when no result files', () => {
    mockedExistsSync
      .mockReturnValueOnce(false)  // dashPath
      .mockReturnValueOnce(true);  // tasksDir
    mockedReaddirSync.mockReturnValue(['task-001.json', 'task-001.hb'] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [
        { workerId: 'w-001', taskId: '001', status: 'CODING' as never, currentAction: 'working', timestamp: new Date().toISOString(), filesChangedCount: 0, sequence: 0 },
      ],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.progress.done).toBe(0);
    expect(written.progress.active).toBe(1);
  });

  it('marks agent status as DONE when task has .result file', () => {
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [{ id: 'w-001', role: 'worker', status: 'EXECUTING' as never, model: 'sonnet', tmuxWindow: 'w-001', taskId: '001' }] as never,
      progress: { done: 0, active: 1, blocked: 0, total: 2 },

      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync
      .mockReturnValueOnce(true)   // dashPath exists
      .mockReturnValueOnce(true);  // tasksDir exists
    mockedReadFileSync.mockReturnValueOnce(JSON.stringify(existingDash) as never);
    mockedReaddirSync.mockReturnValue(['task-001.result'] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.agents[0].status).toBe('DONE');
  });

  it('preserves progress.total and progress.blocked from existing dashboard', () => {
    const existingDash: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE' as never, status: 'ACTIVE' as never },
      agents: [],
      progress: { done: 1, active: 2, blocked: 1, total: 8 },

      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    mockedExistsSync
      .mockReturnValueOnce(true)   // dashPath exists
      .mockReturnValueOnce(true);  // tasksDir exists
    mockedReadFileSync.mockReturnValueOnce(JSON.stringify(existingDash) as never);
    mockedReaddirSync.mockReturnValue([
      'task-001.result', 'task-002.result', 'task-003.result',
    ] as never);

    writeScanToDashboard('/project', sprintInfo, {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
    });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.progress.done).toBe(3);
    expect(written.progress.total).toBe(8);
    expect(written.progress.blocked).toBe(1);
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

// ═══════════════════════════════════════════════════════════════════════
// Sprint 138 — Migration + New Features Tests
// ═══════════════════════════════════════════════════════════════════════

describe('tryCodeVerifiedDone (migration regression)', () => {
  it('should return NOT_TRIGGERED when result is already DONE', async () => {
    const result = await tryCodeVerifiedDone('001', '/tmp/test', {
      fileExists: async () => true,
      readResultJson: async () => ({
        taskId: '001',
        workerId: 'w-001',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 90,
        selfAssessment: 'DONE' as const,
        notes: 'All good',
      }),
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('already DONE');
  });

  it('should verify code on disk for Docker NO_GO pattern', async () => {
    const result = await tryCodeVerifiedDone('002', '/tmp/test', {
      fileExists: async (p: string) => p.endsWith('.result'),
      readResultJson: async () => ({
        taskId: '002',
        workerId: 'w-002',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: false,
        coverage: 0,
        selfAssessment: 'NO_GO' as const,
        notes: 'Docker worker exited without writing result file',
      }),
      readTaskJson: async () => ({
        ...makeTask('002', []),
        description: '**Kanıt:** `grep "hello" src/test.ts` → hit',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/test.ts'] },
      }),
      runGitStatus: async () => ({ modified: true }),
      runGrepEvidence: async () => ({ hit: true }),
    });
    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.verifiedFiles).toContain('src/test.ts');
  });
});

describe('CODE_VERIFIED_DONE constant', () => {
  it('exports the sentinel value', () => {
    expect(CODE_VERIFIED_DONE).toBe('CODE_VERIFIED_DONE');
  });
});

describe('parseEvidenceCommand', () => {
  it('parses grep command from Kanıt line', () => {
    const cmd = parseEvidenceCommand('**Kanıt:** `grep -n "hello" src/test.ts` → hit');
    expect(cmd).toBe('grep -n "hello" src/test.ts');
  });

  it('returns null for disallowed commands', () => {
    const cmd = parseEvidenceCommand('**Kanıt:** `rm -rf /` → dangerous');
    expect(cmd).toBeNull();
  });

  it('returns null when no Kanıt line exists', () => {
    const cmd = parseEvidenceCommand('Just some description without evidence');
    expect(cmd).toBeNull();
  });
});

describe('inferAffectedTests', () => {
  it('maps src files to test paths', () => {
    const tests = inferAffectedTests(['src/core/config.ts', 'src/monitor/auditor.ts']);
    expect(tests).toEqual([
      'tests/core/config.test.ts',
      'tests/monitor/auditor.test.ts',
    ]);
  });

  it('skips non-src files', () => {
    const tests = inferAffectedTests(['docs/README.md', 'package.json']);
    expect(tests).toEqual([]);
  });

  it('skips test files', () => {
    const tests = inferAffectedTests(['src/core/config.test.ts']);
    expect(tests).toEqual([]);
  });
});

describe('verifyFunctional', () => {
  it('returns PASS when no affected tests exist', async () => {
    const result = await verifyFunctional('001', '/tmp/test', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['docs/README.md'],
      linesAdded: 10,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: '',
    });
    expect(result.verdict).toBe('PASS');
    expect(result.reason).toContain('No affected test files');
  });
});

describe('validateTechDebt', () => {
  it('passes when notes explain tech debt', async () => {
    const result = await validateTechDebt('001', '/tmp/test', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['src/core/config.ts'],
      linesAdded: 50,
      linesRemoved: 10,
      testsPassed: true,
      coverage: 80,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Coverage is at 80% instead of target 90% due to complex async edge cases that need dedicated integration tests',
    });
    expect(result.verdict).toBe('PASS');
  });

  it('downgrades to NO_GO when notes are empty', async () => {
    const result = await validateTechDebt('001', '/tmp/test', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['src/core/config.ts'],
      linesAdded: 50,
      linesRemoved: 10,
      testsPassed: true,
      coverage: 80,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: '',
    });
    expect(result.verdict).toBe('DOWNGRADE');
    expect(result.newStatus).toBe('NO_GO');
  });
});

describe('verifyWorkerResult (3-pipeline dispatch)', () => {
  it('dispatches NO_GO to tryCodeVerifiedDone pipeline', async () => {
    const result = await verifyWorkerResult('001', '/tmp/test', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Some real failure',
    });
    // Should go through tryCodeVerifiedDone pipeline and fail (no Docker pattern)
    expect(result.verdict).toBe('FAIL');
  });

  it('dispatches GO_WITH_TECH_DEBT to validateTechDebt pipeline', async () => {
    const result = await verifyWorkerResult('001', '/tmp/test', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['src/core/config.ts'],
      linesAdded: 50,
      linesRemoved: 10,
      testsPassed: true,
      coverage: 80,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Coverage at 80% — async edge cases need dedicated integration tests for full coverage',
    });
    expect(result.verdict).toBe('PASS');
  });

  it('dispatches DONE to verifyFunctional pipeline', async () => {
    const result = await verifyWorkerResult('001', '/tmp/test', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['docs/README.md'],
      linesAdded: 10,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Updated docs',
    });
    expect(result.verdict).toBe('PASS');
  });
});

describe('parseADRs', () => {
  it('parses ADR entries from DECISIONS.md content', () => {
    const content = `# Decisions

## ADR-001: Use TypeScript
**Status:** accepted
**Decision:** Use TypeScript for all source code.

## ADR-005: Synchronous I/O
**Status:** deprecated
**Decision:** Use synchronous I/O for simplicity.

## ADR-010: Minimal Dependencies
**Status:** accepted
**Decision:** Keep runtime dependencies minimal.
`;
    const adrs = parseADRs(content);
    expect(adrs).toHaveLength(3);
    expect(adrs[0]!.id).toBe('ADR-001');
    expect(adrs[0]!.status).toBe('accepted');
    expect(adrs[1]!.id).toBe('ADR-005');
    expect(adrs[1]!.status).toBe('deprecated');
    expect(adrs[2]!.id).toBe('ADR-010');
    expect(adrs[2]!.status).toBe('accepted');
  });
});

describe('checkADRCompliance', () => {
  it('detects ADR-006 violation (spawnSync with shell:true)', () => {
    // Mock DECISIONS.md
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('DECISIONS.md')) {
        return `## ADR-006: Safe Spawn\n**Status:** accepted\n**Decision:** Always use array args.`;
      }
      if (p.includes('src/bad-file.ts')) {
        return `const r = spawnSync('cmd', { shell: true });`;
      }
      return '';
    });
    mockedExistsSync.mockReturnValue(true);

    const violations = checkADRCompliance('/tmp/test', ['src/bad-file.ts']);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.adrId).toBe('ADR-006');
    expect(violations[0]!.severity).toBe('error');
  });

  it('returns no violations for clean files', () => {
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('DECISIONS.md')) {
        return `## ADR-006: Safe Spawn\n**Status:** accepted\n**Decision:** Always use array args.`;
      }
      if (p.includes('src/good-file.ts')) {
        return `const r = spawnSync('cmd', ['arg1']);`;
      }
      return '';
    });
    mockedExistsSync.mockReturnValue(true);

    const violations = checkADRCompliance('/tmp/test', ['src/good-file.ts']);
    expect(violations).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Sprint 139 — Heartbeat Cache Invalidation + Multi-Signal Stale Detection
// ═══════════════════════════════════════════════════════════════════════

describe('readHeartbeatCached', () => {
  const hbPath = '/project/.tasks/task-001.hb';
  const sampleHb: Heartbeat = {
    workerId: 'w-001',
    taskId: '001',
    status: 'CODING' as never,
    currentAction: 'writing',
    timestamp: new Date().toISOString(),
    filesChangedCount: 1,
    sequence: 5,
    progress: 50,
  };

  it('reads from disk on first access and caches result', () => {
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);
    mockedReadFileSync.mockReturnValue(JSON.stringify(sampleHb));

    const result = readHeartbeatCached(hbPath);
    expect(result).toEqual(sampleHb);
    expect(getHeartbeatCacheSize()).toBe(1);
    expect(mockedReadFileSync).toHaveBeenCalledOnce();
  });

  it('returns cached value when mtime unchanged', () => {
    // First read — populate cache
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);
    mockedReadFileSync.mockReturnValue(JSON.stringify(sampleHb));
    readHeartbeatCached(hbPath);

    // Reset call count
    mockedReadFileSync.mockClear();

    // Second read — same mtime, should hit cache
    const result = readHeartbeatCached(hbPath);
    expect(result).toEqual(sampleHb);
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });

  it('re-reads from disk when mtime changes', () => {
    // First read — populate cache
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);
    mockedReadFileSync.mockReturnValue(JSON.stringify(sampleHb));
    readHeartbeatCached(hbPath);

    // mtime changed — should re-read
    const updatedHb = { ...sampleHb, sequence: 10, currentAction: 'testing' };
    mockedStatSync.mockReturnValue({ mtimeMs: 2000 } as never);
    mockedReadFileSync.mockReturnValue(JSON.stringify(updatedHb));

    const result = readHeartbeatCached(hbPath);
    expect(result).toEqual(updatedHb);
    expect(result?.sequence).toBe(10);
  });

  it('returns null and clears cache when file does not exist', () => {
    mockedStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = readHeartbeatCached(hbPath);
    expect(result).toBeNull();
    expect(getHeartbeatCacheSize()).toBe(0);
  });

  it('returns null and clears cache when file is malformed JSON', () => {
    mockedStatSync.mockReturnValue({ mtimeMs: 3000 } as never);
    mockedReadFileSync.mockReturnValue('not json');

    const result = readHeartbeatCached(hbPath);
    expect(result).toBeNull();
    expect(getHeartbeatCacheSize()).toBe(0);
  });

  it('clearHeartbeatCache empties the cache', () => {
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);
    mockedReadFileSync.mockReturnValue(JSON.stringify(sampleHb));
    readHeartbeatCached(hbPath);
    expect(getHeartbeatCacheSize()).toBe(1);

    clearHeartbeatCache();
    expect(getHeartbeatCacheSize()).toBe(0);
  });
});

describe('isWorkerProcessAlive', () => {
  it('detects running Docker container', () => {
    const hb: Heartbeat = {
      workerId: 'w-001', taskId: '001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'docker',
    };

    mockedSpawnSync.mockReturnValue({
      stdout: 'deckent-w-001\n', stderr: '', status: 0, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    expect(isWorkerProcessAlive(hb)).toBe(true);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['ps', '--filter', 'name=deckent-w-001', '--format', '{{.Names}}'],
      expect.objectContaining({ timeout: 5_000 }),
    );
  });

  it('returns false for stopped Docker container', () => {
    const hb: Heartbeat = {
      workerId: 'w-002', taskId: '002', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'docker',
    };

    mockedSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: 0, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    expect(isWorkerProcessAlive(hb)).toBe(false);
  });

  it('detects active tmux session', () => {
    const hb: Heartbeat = {
      workerId: 'w-003', taskId: '003', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'tmux',
    };

    mockedSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: 0, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    expect(isWorkerProcessAlive(hb)).toBe(true);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux',
      ['has-session', '-t', 'w-003'],
      expect.objectContaining({ timeout: 5_000 }),
    );
  });

  it('returns false for dead tmux session', () => {
    const hb: Heartbeat = {
      workerId: 'w-004', taskId: '004', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'tmux',
    };

    mockedSpawnSync.mockReturnValue({
      stdout: '', stderr: 'session not found', status: 1, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    expect(isWorkerProcessAlive(hb)).toBe(false);
  });

  it('returns false for subprocess backend (conservative)', () => {
    const hb: Heartbeat = {
      workerId: 'w-005', taskId: '005', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'subprocess',
    };

    expect(isWorkerProcessAlive(hb)).toBe(false);
    // Should not call spawnSync for subprocess
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it('returns false when backend is undefined', () => {
    const hb: Heartbeat = {
      workerId: 'w-006', taskId: '006', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
    };

    expect(isWorkerProcessAlive(hb)).toBe(false);
  });

  it('returns false when spawnSync throws', () => {
    const hb: Heartbeat = {
      workerId: 'w-007', taskId: '007', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 1, progress: 50,
      backend: 'docker',
    };

    mockedSpawnSync.mockImplementation(() => { throw new Error('spawn failed'); });

    expect(isWorkerProcessAlive(hb)).toBe(false);
  });
});

describe('isWorkerStale', () => {
  const projectRoot = '/project';

  function makeHb(overrides: Partial<Heartbeat> = {}): Heartbeat {
    return {
      workerId: 'w-001', taskId: '001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: new Date().toISOString(),
      filesChangedCount: 0, sequence: 5, progress: 50,
      ...overrides,
    };
  }

  it('returns false (not stale) when HB timestamp is fresh', () => {
    const hb = makeHb(); // fresh timestamp
    mockedExistsSync.mockReturnValue(false);

    // Fresh HB → not stale, no secondary signals needed
    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(false);
  });

  it('returns false (not stale) when HB is fresh AND result exists', () => {
    const hb = makeHb();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'DONE' }));

    // Fresh HB → not stale (primary signal sufficient)
    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(false);
  });

  it('returns false (not stale) when HB is stale but result DONE', () => {
    const staleTimestamp = new Date(Date.now() - 300_000).toISOString(); // 5min ago
    const hb = makeHb({ timestamp: staleTimestamp, backend: 'docker' });

    // .result exists with DONE — secondary signal A suppresses stale
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'DONE' }));

    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(false);
  });

  it('returns false (not stale) when HB is stale but container running', () => {
    const staleTimestamp = new Date(Date.now() - 300_000).toISOString();
    const hb = makeHb({ timestamp: staleTimestamp, backend: 'docker' });

    // No .result file
    mockedExistsSync.mockReturnValue(false);

    // Docker container running — secondary signal B suppresses stale
    mockedSpawnSync.mockReturnValue({
      stdout: 'deckent-w-001\n', stderr: '', status: 0, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(false);
  });

  it('returns true (stale) when all 3 signals indicate dead', () => {
    const staleTimestamp = new Date(Date.now() - 300_000).toISOString();
    const hb = makeHb({ timestamp: staleTimestamp });

    mockedExistsSync.mockReturnValue(false); // no .result
    // No backend → isWorkerProcessAlive returns false

    // 0 signals → stale
    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(true);
  });

  it('returns true for malformed timestamp', () => {
    const hb = makeHb({ timestamp: 'not-a-date' });

    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(true);
  });

  it('Sprint 138 false positive regression: DONE result suppresses stale', () => {
    // Simulate Sprint 138 pattern: worker finished but HB is old
    const staleTimestamp = new Date(Date.now() - 600_000).toISOString(); // 10min ago
    const hb = makeHb({ timestamp: staleTimestamp, backend: 'tmux' });

    // .result file exists with GO_WITH_TECH_DEBT (in DONE_SET)
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'GO_WITH_TECH_DEBT' }));

    // tmux session dead — doesn't matter, result file signals completion
    mockedSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: 1, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    // Signal A (result DONE_SET) → not stale despite HB being old
    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(false);
  });

  it('returns true (stale) when HB stale + result NO_GO + no process', () => {
    const staleTimestamp = new Date(Date.now() - 600_000).toISOString();
    const hb = makeHb({ timestamp: staleTimestamp, backend: 'tmux' });

    // .result exists but NO_GO → not in DONE_SET
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'NO_GO' }));

    // tmux session dead
    mockedSpawnSync.mockReturnValue({
      stdout: '', stderr: '', status: 1, signal: null,
      pid: 1, output: [], error: undefined,
    } as never);

    // No secondary signals alive → genuinely stale
    expect(isWorkerStale(hb, projectRoot, 120_000)).toBe(true);
  });

  it('considers sequence progression via hbPath cache', () => {
    const staleTimestamp = new Date(Date.now() - 300_000).toISOString();
    const hbPath = '/project/.tasks/task-001.hb';

    // Pre-populate cache with older sequence
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);
    const oldHb = makeHb({ sequence: 3, timestamp: staleTimestamp });
    mockedReadFileSync.mockReturnValue(JSON.stringify(oldHb));
    readHeartbeatCached(hbPath); // cache with sequence=3

    // Now check newer HB (sequence=5 > cached sequence=3)
    const newHb = makeHb({ sequence: 5, timestamp: staleTimestamp });
    mockedExistsSync.mockReturnValue(false); // no .result

    // Signal C: sequence progression → not stale (any secondary signal is enough)
    expect(isWorkerStale(newHb, projectRoot, 120_000, hbPath)).toBe(false);
  });
});

describe('scanHeartbeats with cache (Sprint 139 integration)', () => {
  it('uses cached heartbeats and multi-signal detection', () => {
    const freshTimestamp = new Date().toISOString();
    const hb: Heartbeat = {
      workerId: 'w-001', taskId: '001', status: 'CODING' as never,
      currentAction: 'writing', timestamp: freshTimestamp,
      filesChangedCount: 1, sequence: 5, progress: 50,
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);
    mockedReadFileSync.mockReturnValue(JSON.stringify(hb));

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
    expect(result.heartbeats[0]).toEqual(hb);
  });

  it('does not produce false positive stale alert when result DONE', () => {
    const staleTimestamp = new Date(Date.now() - 300_000).toISOString();
    const hb: Heartbeat = {
      workerId: 'w-002', taskId: '002', status: 'CODING' as never,
      currentAction: 'writing', timestamp: staleTimestamp,
      filesChangedCount: 1, sequence: 3, progress: 80,
    };

    mockedReaddirSync.mockReturnValue(['task-002.hb'] as never);
    mockedStatSync.mockReturnValue({ mtimeMs: 1000 } as never);

    // existsSync: true for tasksDir, true for result file
    mockedExistsSync.mockReturnValue(true);

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('.hb')) return JSON.stringify(hb);
      if (p.includes('.result')) return JSON.stringify({ selfAssessment: 'DONE' });
      if (p.includes('.json')) return JSON.stringify({ status: 'DONE' });
      return '';
    });

    // Fresh result DONE → 1 signal (result). HB stale → 0 signal. No backend → 0 signal.
    // Total 1 signal → stale=true, but shouldReportStale → false (DONE result) → skip
    const result = scanHeartbeats('/project');

    // Should NOT have any CRITICAL stale alert for this worker
    const criticalAlerts = result.alerts.filter(
      a => a.level === 'CRITICAL' && a.message.includes('w-002'),
    );
    expect(criticalAlerts).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Sprint 139 — Task 016: Orphan HB Cleanup
// ═══════════════════════════════════════════════════════════════════════

describe('detectOrphans', () => {
  it('returns empty when no .hb files exist', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return [] as never;
      return [] as never;
    });

    const result = detectOrphans('/project', new Set(['001', '002']));

    expect(result.orphanTaskIds).toEqual([]);
    expect(result.orphanHBPaths).toEqual([]);
  });

  it('returns empty when all HB task IDs are in active set', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-002.hb'] as never);

    const result = detectOrphans('/project', new Set(['001', '002']));

    expect(result.orphanTaskIds).toEqual([]);
    expect(result.orphanHBPaths).toEqual([]);
  });

  it('detects orphan HB when task ID is not in active set', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb', 'task-999.hb'] as never);

    const result = detectOrphans('/project', new Set(['001']));

    expect(result.orphanTaskIds).toEqual(['999']);
    expect(result.orphanHBPaths).toHaveLength(1);
    expect(result.orphanHBPaths[0]).toContain('task-999.hb');
  });

  it('detects multiple orphans', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'task-001.hb', 'task-old1.hb', 'task-old2.hb',
    ] as never);

    const result = detectOrphans('/project', new Set(['001']));

    expect(result.orphanTaskIds).toHaveLength(2);
    expect(result.orphanTaskIds).toContain('old1');
    expect(result.orphanTaskIds).toContain('old2');
  });

  it('auto-discovers active task IDs from disk when not provided', () => {
    mockedExistsSync.mockReturnValue(true);
    // readdirSync: first call for json files, second call for hb files
    mockedReaddirSync
      .mockReturnValueOnce(['task-001.json', 'task-002.json'] as never) // json scan
      .mockReturnValueOnce(['task-001.hb', 'task-orphan.hb'] as never);   // hb scan

    const result = detectOrphans('/project'); // no activeTaskIds → auto-discovery

    expect(result.orphanTaskIds).toEqual(['orphan']);
    expect(result.orphanHBPaths[0]).toContain('task-orphan.hb');
  });

  it('returns empty result when .tasks dir does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = detectOrphans('/project', new Set(['001']));

    expect(result.orphanTaskIds).toEqual([]);
    expect(result.orphanHBPaths).toEqual([]);
  });
});

describe('cleanupOrphanHBs', () => {
  beforeEach(() => {
    mockedMkdirSync.mockReturnValue(undefined as never);
    mockedRenameSync.mockReturnValue(undefined as never);
  });

  it('returns zero counts when no orphans exist', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as never);

    const result = cleanupOrphanHBs('/project', 'sprint-139', new Set(['001']));

    expect(result.orphanCount).toBe(0);
    expect(result.archived).toEqual([]);
    expect(result.locksReleased).toEqual([]);
    expect(mockedRenameSync).not.toHaveBeenCalled();
  });

  it('archives orphan HB files to .brain/archive/{sprintId}-orphan-hb/', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.locks')) return [] as never;    // no locks
      // .tasks dir scan (for orphan detect and active worker IDs)
      return ['task-001.hb', 'task-orphan.hb'] as never;
    });

    // readFileSync for active worker HB after archive (remaining HBs)
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ workerId: 'w-001' }) as never,
    );

    const result = cleanupOrphanHBs('/project', 'sprint-139', new Set(['001']));

    expect(result.orphanCount).toBe(1);
    expect(result.archived).toHaveLength(1);
    expect(result.archived[0]).toContain('task-orphan.hb');

    // mkdirSync called for archive dir
    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('sprint-139-orphan-hb'),
      expect.objectContaining({ recursive: true }),
    );
    // renameSync called to move file
    expect(mockedRenameSync).toHaveBeenCalledTimes(1);
  });

  it('continues processing other orphans when one rename fails', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.locks')) return [] as never;
      return ['task-001.hb', 'task-orphanA.hb', 'task-orphanB.hb'] as never;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ workerId: 'w-001' }) as never,
    );

    // First rename fails, second succeeds
    mockedRenameSync
      .mockImplementationOnce(() => { throw new Error('ENOENT'); })
      .mockReturnValueOnce(undefined as never);

    const result = cleanupOrphanHBs('/project', 'sprint-139', new Set(['001']));

    // orphanCount = 2 detected; archived = 1 (one failed)
    expect(result.orphanCount).toBe(2);
    expect(result.archived).toHaveLength(1); // only the one that succeeded
  });

  it('releases locks for orphan workers via clearOrphanLocks integration', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // .tasks exists, .locks exists
      return !path.includes('nonexistent');
    });
    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.locks')) {
        return ['src__orphan-worker__file.ts.lock'] as never;
      }
      if (d.includes('.tasks')) {
        return ['task-001.hb', 'task-orphan.hb'] as never;
      }
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('.lock')) {
        return JSON.stringify({
          filePath: 'src/orphan-worker/file.ts',
          ownerWorkerId: 'w-orphan',
          acquiredAt: new Date().toISOString(),
          taskId: 'orphan',
        }) as never;
      }
      // Active worker HB
      return JSON.stringify({ workerId: 'w-001' }) as never;
    });

    const result = cleanupOrphanHBs('/project', 'sprint-139', new Set(['001']));

    // Lock for w-orphan should be released (not in active set)
    expect(result.locksReleased).toHaveLength(1);
    expect(result.locksReleased[0]).toBe('src/orphan-worker/file.ts');
  });
});

// ─── Sprint 139 Task 032: Dependency Violation Detection ─────────────

describe('detectDependencyViolations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReaddirSync.mockReturnValue([] as never);
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() } as never);
    clearHeartbeatCache();
  });

  it('returns empty array when tasks directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toEqual([]);
  });

  it('returns empty array when no HB files exist', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([] as never);

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toEqual([]);
  });

  it('detects violation when worker is executing before dep is DONE', () => {
    // Arrange: worker w-002 is EXECUTING task 002, which depends on task 001 (still PENDING)
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('.tasks')) return true;
      return false;
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-002.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-002.hb')) {
        return JSON.stringify({
          workerId: 'w-002',
          taskId: '002',
          status: 'EXECUTING',
          timestamp: new Date().toISOString(),
          sequence: 1,
        }) as never;
      }
      if (p.includes('task-002.json')) {
        return JSON.stringify({
          id: '002',
          dependencies: ['001'],
          status: 'EXECUTING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-001.json')) {
        return JSON.stringify({
          id: '001',
          dependencies: [],
          status: 'PENDING', // Not done yet!
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      workerId: 'w-002',
      taskId: '002',
      unresolvedDeps: ['001'],
    });
    expect(result[0]?.depStatuses?.['001']).toBe('PENDING');
  });

  it('does NOT flag violation when dep is DONE (status DONE)', () => {
    // Arrange: task 002 depends on task 001 which is DONE
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('.tasks');
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-002.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-002.hb')) {
        return JSON.stringify({
          workerId: 'w-002',
          taskId: '002',
          status: 'EXECUTING',
          timestamp: new Date().toISOString(),
          sequence: 1,
        }) as never;
      }
      if (p.includes('task-002.json')) {
        return JSON.stringify({
          id: '002',
          dependencies: ['001'],
          status: 'EXECUTING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-001.json')) {
        return JSON.stringify({
          id: '001',
          dependencies: [],
          status: 'DONE', // Done!
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(0);
  });

  it('does NOT flag violation when dep has a DONE .result file', () => {
    // Arrange: dep task JSON shows PENDING but .result shows DONE selfAssessment
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // .tasks dir exists, dep result file exists
      if (path.endsWith('task-001.result')) return true;
      if (path.includes('.tasks') && !path.includes('task-')) return true;
      return path.includes('.tasks');
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-002.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-002.hb')) {
        return JSON.stringify({
          workerId: 'w-002',
          taskId: '002',
          status: 'EXECUTING',
          timestamp: new Date().toISOString(),
          sequence: 1,
        }) as never;
      }
      if (p.includes('task-002.json')) {
        return JSON.stringify({
          id: '002',
          dependencies: ['001'],
          status: 'EXECUTING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-001.json')) {
        return JSON.stringify({
          id: '001',
          dependencies: [],
          status: 'PENDING', // JSON shows pending but result says DONE
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-001.result')) {
        return JSON.stringify({
          taskId: '001',
          selfAssessment: 'GO_WITH_TECH_DEBT', // GO_WITH_TECH_DEBT counts as done
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(0);
  });

  it('does NOT flag violation for workers with non-executing statuses (e.g., DONE)', () => {
    // Arrange: worker's HB shows DONE status
    mockedExistsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.tasks');
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-002.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-002.hb')) {
        return JSON.stringify({
          workerId: 'w-002',
          taskId: '002',
          status: 'DONE', // Worker already completed
          timestamp: new Date().toISOString(),
          sequence: 5,
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(0);
  });

  it('does NOT flag violation for tasks with no dependencies', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.tasks');
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-001.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-001.hb')) {
        return JSON.stringify({
          workerId: 'w-001',
          taskId: '001',
          status: 'EXECUTING',
          timestamp: new Date().toISOString(),
          sequence: 2,
        }) as never;
      }
      if (p.includes('task-001.json')) {
        return JSON.stringify({
          id: '001',
          dependencies: [], // No deps
          status: 'EXECUTING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(0);
  });

  it('handles multiple violations across multiple workers', () => {
    // Arrange: Two workers both violating dependency order
    mockedExistsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.tasks');
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-002.hb', 'task-003.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-002.hb')) {
        return JSON.stringify({
          workerId: 'w-002', taskId: '002', status: 'EXECUTING',
          timestamp: new Date().toISOString(), sequence: 1,
        }) as never;
      }
      if (p.includes('task-003.hb')) {
        return JSON.stringify({
          workerId: 'w-003', taskId: '003', status: 'CLAIMING',
          timestamp: new Date().toISOString(), sequence: 1,
        }) as never;
      }
      if (p.includes('task-002.json')) {
        return JSON.stringify({
          id: '002', dependencies: ['001'], status: 'EXECUTING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-003.json')) {
        return JSON.stringify({
          id: '003', dependencies: ['001', '002'], status: 'CLAIMING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-001.json')) {
        return JSON.stringify({
          id: '001', dependencies: [], status: 'PENDING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(2);
    const task2Violation = result.find(v => v.taskId === '002');
    const task3Violation = result.find(v => v.taskId === '003');
    expect(task2Violation?.unresolvedDeps).toContain('001');
    expect(task3Violation?.unresolvedDeps).toContain('001');
  });

  it('includes timestamp in violation result', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.tasks');
    });

    mockedReaddirSync.mockImplementation((dir: unknown) => {
      const d = String(dir);
      if (d.includes('.tasks')) return ['task-002.hb'] as never;
      return [] as never;
    });

    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-002.hb')) {
        return JSON.stringify({
          workerId: 'w-002', taskId: '002', status: 'EXECUTING',
          timestamp: new Date().toISOString(), sequence: 1,
        }) as never;
      }
      if (p.includes('task-002.json')) {
        return JSON.stringify({
          id: '002', dependencies: ['001'], status: 'EXECUTING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      if (p.includes('task-001.json')) {
        return JSON.stringify({
          id: '001', dependencies: [], status: 'PENDING',
          scope: { directories: [], filesRead: [], filesWrite: [] },
        }) as never;
      }
      return '{}' as never;
    });

    const result = detectDependencyViolations('/project', 'sprint-139');

    expect(result).toHaveLength(1);
    expect(result[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('runScanCycle includes dependencyViolations in result', () => {
    // Arrange: clean sprint (no files) — just verify the field is present
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' } as never);

    const result = runScanCycle('/project', 'sprint-139');

    expect(result).toHaveProperty('dependencyViolations');
    expect(Array.isArray(result.dependencyViolations)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Event Hook Real Wire Tests (Sprint 139 — Task 043)
// ═══════════════════════════════════════════════════════════════════════

describe('emitVerificationEvent (real wire)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeEvent with VERIFICATION_RESULT channel', () => {
    // Arrange
    const payload = { taskId: '001', verdict: 'PASS', reason: 'all tests pass' };

    // Act
    emitVerificationEvent('/project', 'sprint-139', payload);

    // Assert
    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'auditor',
      'brain',
      'AUDITOR→BRAIN:VERIFICATION_RESULT',
      payload,
    );
  });

  it('does not throw if writeEvent throws (fail-safe)', () => {
    // Arrange
    mockedWriteEvent.mockImplementationOnce(() => { throw new Error('disk full'); });

    // Act + Assert: no throw
    expect(() =>
      emitVerificationEvent('/project', 'sprint-139', {
        taskId: '002', verdict: 'FAIL', reason: 'tests failed',
      }),
    ).not.toThrow();
  });

  it('passes status field when provided', () => {
    // Arrange
    const payload = { taskId: '003', verdict: 'DOWNGRADE', status: 'GO_WITH_TECH_DEBT', reason: 'partial' };

    // Act
    emitVerificationEvent('/project', 'sprint-139', payload);

    // Assert: status is forwarded in payload
    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project', 'sprint-139', 'auditor', 'brain',
      'AUDITOR→BRAIN:VERIFICATION_RESULT',
      expect.objectContaining({ status: 'GO_WITH_TECH_DEBT' }),
    );
  });
});

describe('emitADRViolationEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeEvent with ADR_VIOLATION channel when violations exist', () => {
    // Arrange
    const violations = [{
      adrId: 'ADR-006',
      adrTitle: 'spawnSync Security Pattern',
      violation: 'File src/foo.ts matches forbidden pattern',
      severity: 'error' as const,
    }];

    // Act
    emitADRViolationEvent('/project', 'sprint-139', violations, ['src/foo.ts']);

    // Assert
    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'auditor',
      'brain',
      'AUDITOR→BRAIN:ADR_VIOLATION',
      expect.objectContaining({
        violationCount: 1,
        violations: expect.arrayContaining([
          expect.objectContaining({ adrId: 'ADR-006' }),
        ]),
        changedFiles: ['src/foo.ts'],
      }),
    );
  });

  it('does NOT call writeEvent when violations list is empty', () => {
    // Act
    emitADRViolationEvent('/project', 'sprint-139', [], []);

    // Assert
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('does not throw if writeEvent throws (fail-safe)', () => {
    // Arrange
    mockedWriteEvent.mockImplementationOnce(() => { throw new Error('I/O error'); });
    const violations = [{
      adrId: 'ADR-008',
      adrTitle: 'Brain Merkezi Import',
      violation: 'Circular import detected',
      severity: 'error' as const,
    }];

    // Act + Assert: no throw
    expect(() =>
      emitADRViolationEvent('/project', 'sprint-139', violations, ['src/monitor/auditor.ts']),
    ).not.toThrow();
  });
});

describe('verifyWorkerResult — event hook integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default fs setup — no task files
    mockedExistsSync.mockReturnValue(false);
    mockedReaddirSync.mockReturnValue([] as never);
  });

  it('emits VERIFICATION_RESULT event when sprintId is provided', async () => {
    // Act
    await verifyWorkerResult('001', '/project', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'All done',
    }, 'sprint-139');

    // Assert: writeEvent called with VERIFICATION_RESULT
    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'auditor',
      'brain',
      'AUDITOR→BRAIN:VERIFICATION_RESULT',
      expect.objectContaining({ taskId: '001' }),
    );
  });

  it('does NOT emit event when sprintId is omitted (backward compat)', async () => {
    // Act
    await verifyWorkerResult('001', '/project', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'All done',
    });
    // No sprintId → no writeEvent call

    // Assert
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('still returns correct verdict when event write fails', async () => {
    // Arrange: writeEvent throws
    mockedWriteEvent.mockImplementationOnce(() => { throw new Error('no space'); });

    // Act
    const result = await verifyWorkerResult('001', '/project', {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['docs/README.md'],
      linesAdded: 5,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'docs update',
    }, 'sprint-139');

    // Assert: verdict is still correct despite event failure
    expect(result.verdict).toBe('PASS');
  });
});

describe('checkADRCompliance — event hook integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits ADR_VIOLATION event when sprintId provided and violation found', () => {
    // Arrange: DECISIONS.md with ADR-006 accepted, file with violation
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) {
        return `## ADR-006: spawnSync Security Pattern\n**Status:** accepted\n**Decision:** Use spawnSync.\n` as never;
      }
      if (path.includes('src/bad.ts')) {
        return `spawnSync('cmd', { shell: true });\n` as never;
      }
      if (path.includes('package.json')) {
        return JSON.stringify({ dependencies: { commander: '^13' } }) as never;
      }
      return '' as never;
    });

    // Act
    const violations = checkADRCompliance('/project', ['src/bad.ts'], 'sprint-139');

    // Assert: violations found + event emitted
    expect(violations.length).toBeGreaterThan(0);
    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project', 'sprint-139', 'auditor', 'brain',
      'AUDITOR→BRAIN:ADR_VIOLATION',
      expect.objectContaining({ violationCount: expect.any(Number) }),
    );
  });

  it('does NOT emit event when no violations found', () => {
    // Arrange: clean file — no pattern match
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) {
        return `## ADR-006: spawnSync Security Pattern\n**Status:** accepted\n**Decision:** Use spawnSync.\n` as never;
      }
      if (path.includes('src/good.ts')) {
        return `spawnSync('cmd', ['--arg']);\n` as never;  // safe pattern
      }
      return '' as never;
    });

    // Act
    const violations = checkADRCompliance('/project', ['src/good.ts'], 'sprint-139');

    // Assert: no violations → no event
    expect(violations).toHaveLength(0);
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('does NOT emit event when sprintId is omitted', () => {
    // Arrange: file with violation but no sprintId
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('DECISIONS.md')) {
        return `## ADR-006: spawnSync\n**Status:** accepted\n` as never;
      }
      if (path.includes('src/violation.ts')) {
        return `spawnSync('cmd', { shell: true });\n` as never;
      }
      return '' as never;
    });

    // Act: no sprintId
    checkADRCompliance('/project', ['src/violation.ts']);

    // Assert: no event written
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });
});
