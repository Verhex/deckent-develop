/**
 * auditor-stale-race.test.ts — Tests for Sprint 149 Auditor Stale Alert Race Condition Fix
 *
 * Sprint 149 Task 9: Auditor only generates stale alerts for tasks in EXECUTING state.
 * Tasks in PENDING/CLAIMED/DRAFT/PAUSED should never trigger stale alerts because
 * the worker hasn't started executing yet.
 *
 * Root cause: Sprint 148 T-148-004 — auditor reported "stale worker" for ASSIGNED state
 * tasks that had no heartbeat yet, causing false positive alerts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearHeartbeatCache,
  isWorkerStale,
  scanHeartbeats,
  writeScanToDashboard,
} from '../../src/monitor/auditor.js';
import type { HeartbeatAuthoritySnapshot } from '../../src/monitor/auditor.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: '' }),
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  CHANNELS: {
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
  },
}));

vi.mock('../../src/core/file-lock.js', () => ({
  clearOrphanLocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/authority-enforcer.js', () => ({
  checkAuthority: vi.fn().mockReturnValue({ allowed: true }),
  emitAuthorityViolation: vi.fn(),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    getByType: vi.fn().mockReturnValue([]),
    close: vi.fn(),
  })),
}));

import { readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';

const mockedReaddirSync = vi.mocked(readdirSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedStatSync = vi.mocked(statSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedReadJsonSafe = vi.mocked(readJsonSafe);

const PROJECT_ROOT = '/tmp/test-project';
const STALE_TIMESTAMP = new Date(Date.now() - 300_000).toISOString(); // 5 min ago (stale)
const FRESH_TIMESTAMP = new Date(Date.now() - 10_000).toISOString(); // 10s ago (fresh)

function createHeartbeat(taskId: string, workerId: string, timestamp: string, status = 'EXECUTING') {
  return {
    taskId,
    workerId,
    timestamp,
    status,
    sequence: 1,
    backend: 'subprocess',
    currentAction: 'working',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearHeartbeatCache();
});

describe('Auditor Stale Alert Race Condition Fix (Sprint 149)', () => {
  it('projects a dynamic FIX heartbeat by its activity task identity', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([] as never);
    mockedReadJsonSafe.mockImplementation((path: string) => {
      if (path.endsWith('task-661-006-fix.json')) {
        return {
          id: '661-006-fix',
          model: 'gpt-5.6-sol',
          assignedAgent: 'bug-fixer',
          createdAt: '2026-08-24T11:00:00.000Z',
        } as never;
      }
      return null;
    });

    writeScanToDashboard(
      PROJECT_ROOT,
      { id: 'sprint-661', number: 661, phase: 'FIX', status: 'RUNNING' },
      {
        heartbeats: [{
          workerId: 'w-661-006-fix',
          taskId: '661-006-fix',
          status: 'EXECUTING',
          currentAction: 'repairing',
          timestamp: '2026-08-24T12:00:00.000Z',
          sequence: 0,
          progress: 0,
          filesChangedCount: 0,
          backend: 'docker',
        }] as never,
        violations: [],
        alerts: [],
        locks: [],
      },
    );

    const dashboardWrite = mockedWriteFileSync.mock.calls.find(
      ([, contents]) => String(contents).includes('"agents"'),
    );
    expect(dashboardWrite).toBeDefined();
    const dashboard = JSON.parse(String(dashboardWrite![1])) as {
      agents: Array<{ taskId: string; currentAction: string }>;
    };
    expect(dashboard.agents).toContainEqual(expect.objectContaining({
      taskId: '661-006-fix',
      currentAction: 'repairing',
    }));
    expect(mockedReadJsonSafe).not.toHaveBeenCalledWith(
      expect.stringContaining('task-undefined.json'),
    );
  });

  it('uses exact-attempt host authority and never converts unavailable into dead', () => {
    const hb = { ...createHeartbeat('host-1', 'w-host-1', STALE_TIMESTAMP), attemptId: 'attempt-1' };
    const snapshot = (liveness: 'alive' | 'not-alive' | 'unknown'): HeartbeatAuthoritySnapshot => ({
      identity: { runId: 'run', taskId: 'host-1', attemptId: 'attempt-1', workerId: 'docker-host-1', fence: 'f' },
      authority: {
        schemaVersion: 1,
        identity: { runId: 'run', taskId: 'host-1', attemptId: 'attempt-1', workerId: 'docker-host-1', fence: 'f' },
        holds: [],
        latest: {
          runId: 'run', taskId: 'host-1', attemptId: 'attempt-1', workerId: 'docker-host-1', fence: 'f',
          hostSequence: 1,
          hostObservedAt: new Date().toISOString(),
          hostProcessOutcome: liveness === 'alive'
            ? { state: 'running', exitCode: null }
            : { state: 'exited', exitCode: 1 },
          workerTaskVerdict: 'pending',
          liveness,
        },
      },
    });

    expect(isWorkerStale(hb as never, PROJECT_ROOT, 120_000, undefined, snapshot('alive'))).toBe(false);
    expect(isWorkerStale(hb as never, PROJECT_ROOT, 120_000, undefined, snapshot('unknown'))).toBe(false);
    expect(isWorkerStale(hb as never, PROJECT_ROOT, 120_000, undefined, snapshot('not-alive'))).toBe(true);
    expect(isWorkerStale(hb as never, PROJECT_ROOT, 120_000)).toBe(false);
  });

  it('PENDING task with stale HB → no stale alert (false positive suppressed)', () => {
    const hb = createHeartbeat('001', 'w-001', STALE_TIMESTAMP);
    const task = { id: '001', status: 'PENDING', dependencies: [] };

    mockedExistsSync.mockImplementation((p: any) => {
      if (typeof p === 'string' && p.includes('.tasks')) return true;
      if (typeof p === 'string' && p.endsWith('.result')) return false;
      return true;
    });
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as any);
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() - 300_000 } as any);

    // readJsonSafe: called for HB (from readHeartbeatCached), then for .result check in isWorkerStale,
    // then for shouldReportStale, then for task.json
    mockedReadJsonSafe.mockImplementation((path: string) => {
      if (path.endsWith('.hb')) return hb as any;
      if (path.endsWith('.json')) return task as any;
      if (path.endsWith('.result')) return null;
      return null;
    });

    const result = scanHeartbeats(PROJECT_ROOT, 120_000);

    // No CRITICAL alerts — PENDING task should be skipped
    const criticalAlerts = result.alerts.filter(a => a.level === 'CRITICAL');
    expect(criticalAlerts).toHaveLength(0);
    expect(result.staleAgents).toHaveLength(0);
  });

  it('CLAIMED task with stale HB → no stale alert', () => {
    const hb = createHeartbeat('002', 'w-002', STALE_TIMESTAMP);
    const task = { id: '002', status: 'CLAIMED', dependencies: [] };

    mockedExistsSync.mockImplementation((p: any) => {
      if (typeof p === 'string' && p.includes('.tasks')) return true;
      if (typeof p === 'string' && p.endsWith('.result')) return false;
      return true;
    });
    mockedReaddirSync.mockReturnValue(['task-002.hb'] as any);
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() - 300_000 } as any);

    mockedReadJsonSafe.mockImplementation((path: string) => {
      if (path.endsWith('.hb')) return hb as any;
      if (path.endsWith('.json')) return task as any;
      if (path.endsWith('.result')) return null;
      return null;
    });

    const result = scanHeartbeats(PROJECT_ROOT, 120_000);

    const criticalAlerts = result.alerts.filter(a => a.level === 'CRITICAL');
    expect(criticalAlerts).toHaveLength(0);
    expect(result.staleAgents).toHaveLength(0);
  });

  it('EXECUTING task with fresh HB → no alert', () => {
    const hb = createHeartbeat('003', 'w-003', FRESH_TIMESTAMP);

    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-003.hb'] as any);
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() - 5_000 } as any);

    mockedReadJsonSafe.mockImplementation((path: string) => {
      if (path.endsWith('.hb')) return hb as any;
      return null;
    });

    const result = scanHeartbeats(PROJECT_ROOT, 120_000);

    expect(result.alerts).toHaveLength(0);
    expect(result.staleAgents).toHaveLength(0);
    expect(result.heartbeats).toHaveLength(1);
  });

  it('EXECUTING task with stale HB → CRITICAL alert (genuine stale)', () => {
    const hb = createHeartbeat('004', 'w-004', STALE_TIMESTAMP);
    const task = { id: '004', status: 'EXECUTING', dependencies: [] };

    mockedExistsSync.mockImplementation((p: any) => {
      if (typeof p === 'string' && p.endsWith('.result')) return false;
      return true;
    });
    mockedReaddirSync.mockReturnValue(['task-004.hb'] as any);
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() - 300_000 } as any);

    mockedReadJsonSafe.mockImplementation((path: string) => {
      if (path.endsWith('.hb')) return hb as any;
      if (path.endsWith('.json')) return task as any;
      if (path.endsWith('.result')) return null;
      return null;
    });

    const result = scanHeartbeats(PROJECT_ROOT, 120_000);

    const criticalAlerts = result.alerts.filter(a => a.level === 'CRITICAL');
    expect(criticalAlerts).toHaveLength(1);
    expect(criticalAlerts[0]!.message).toContain('Stale agent detected');
    expect(criticalAlerts[0]!.message).toContain('w-004');
    expect(result.staleAgents).toHaveLength(1);
  });

  it('DONE task with stale HB → WARNING alert (downgrade, not CRITICAL)', () => {
    const hb = createHeartbeat('005', 'w-005', STALE_TIMESTAMP);
    const task = { id: '005', status: 'DONE', dependencies: [] };
    const resultFile = { selfAssessment: 'DONE', taskId: '005' };

    mockedExistsSync.mockImplementation((p: any) => {
      // .result exists for DONE task
      if (typeof p === 'string' && p.endsWith('.result')) return true;
      return true;
    });
    mockedReaddirSync.mockReturnValue(['task-005.hb'] as any);
    mockedStatSync.mockReturnValue({ mtimeMs: Date.now() - 300_000 } as any);

    mockedReadJsonSafe.mockImplementation((path: string) => {
      if (path.endsWith('.hb')) return hb as any;
      if (path.endsWith('.json')) return task as any;
      if (path.endsWith('.result')) return resultFile as any;
      return null;
    });

    const result = scanHeartbeats(PROJECT_ROOT, 120_000);

    // isWorkerStale sees .result with DONE → returns false (not stale)
    // So it should skip stale reporting entirely via multi-signal check
    const criticalAlerts = result.alerts.filter(a => a.level === 'CRITICAL');
    expect(criticalAlerts).toHaveLength(0);
    expect(result.staleAgents).toHaveLength(0);
  });
});
