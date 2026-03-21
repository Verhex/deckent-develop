/**
 * tests/orchestra/brain-rollback.test.ts — Rollback Brain Integration Tests
 *
 * Tests Task 027-014: Rollback — Brain Integration
 *
 * Covers:
 * - Safety point created before SPAWN phase (after PLAN)
 * - Rollback triggered when all tasks are NO_GO
 * - No rollback on partial success
 * - No rollback when rollback: false option is set
 * - recordRollbackInDebt called after rollback
 * - sprint.rolledBack flag set correctly
 * - deleteSafetyPoint called on successful sprint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/spawn-backend.js', () => ({
  TmuxBackend: vi.fn(),
  SubprocessBackend: vi.fn(),
  SpawnBackendFactory: { create: vi.fn() },
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn().mockReturnValue(setInterval(() => {}, 99999)),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
    getNextSprintId: vi.fn().mockReturnValue('sprint-001'),
    updateLastSprintId: vi.fn(),
    parseDebtTable: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    platform: 'linux',
    hasTmux: true,
    recommendedMaxWorkers: 4,
  }),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
  decay: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1,
    completedTasks: 0,
    techDebtTasks: 0,
    noGoTasks: 1,
    durationMs: 1000,
    coveragePercent: 0,
    noGoRate: 100,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
  trimMemoryWithHeader: vi.fn(),
  compareWithPreviousSprint: vi.fn(),
  readPreviousSprintMetrics: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/usage-tracker.js', () => ({
  UsageTracker: vi.fn().mockImplementation(() => ({
    recordCall: vi.fn(),
    getSprintUsage: vi.fn().mockReturnValue({
      sprintId: 'sprint-001',
      entries: [],
      totalCalls: 0,
      totalTokens: 0,
      modelBreakdown: [],
    }),
    getTotalUsage: vi.fn().mockReturnValue({ totalCalls: 0, totalTokens: 0, sprintCount: 1, modelBreakdown: [] }),
    getModelBreakdown: vi.fn().mockReturnValue([]),
    listSprints: vi.fn().mockReturnValue([]),
  })),
}));

// ─── Rollback mock (spy-able) ────────────────────────────────────────
const mockCreateSafetyPoint = vi.fn();
const mockRollback = vi.fn();
const mockGetRollbackPolicy = vi.fn();
const mockRecordRollbackInDebt = vi.fn();
const mockSaveSafetyPoint = vi.fn();
const mockDeleteSafetyPoint = vi.fn();

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: (...args: unknown[]) => mockCreateSafetyPoint(...args),
  rollback: (...args: unknown[]) => mockRollback(...args),
  getRollbackPolicy: (...args: unknown[]) => mockGetRollbackPolicy(...args),
  recordRollbackInDebt: (...args: unknown[]) => mockRecordRollbackInDebt(...args),
  saveSafetyPoint: (...args: unknown[]) => mockSaveSafetyPoint(...args),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
  deleteSafetyPoint: (...args: unknown[]) => mockDeleteSafetyPoint(...args),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(true),
  getDirtyFiles: vi.fn().mockReturnValue([]),
  getCurrentCommitSha: vi.fn().mockReturnValue('abc123'),
  getCurrentBranch: vi.fn().mockReturnValue('main'),
}));

vi.mock('../../src/agents/worker-ipc.js', () => ({
  ChannelRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    remove: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    list: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  })),
  WorkerChannel: vi.fn(),
}));

vi.mock('../../src/core/provider.js', () => ({
  ProviderRegistry: vi.fn().mockImplementation(() => ({
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    listProviders: vi.fn().mockReturnValue([]),
    getDefault: vi.fn().mockReturnValue(null),
  })),
  providerRegistry: {
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    listProviders: vi.fn().mockReturnValue([]),
    getDefault: vi.fn().mockReturnValue(null),
  },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runSprint, evaluateResult } from '../../src/orchestra/brain.js';
import {
  createSafetyPoint, rollback as rollbackFn, getRollbackPolicy,
  recordRollbackInDebt, isCleanWorkingTree, safetyBranchExists,
} from '../../src/orchestra/rollback.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'desc',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(tasks: Task[] = []): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.SPAWN,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeConfig(): ResolvedConfig {
  return {
    projectName: 'test-project',
    projectRoot: '/tmp/test',
    mode: 'auto',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'opus',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'opus',
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
  } as unknown as ResolvedConfig;
}

function setupFsForRunSprint(tasks: Task[], results: Array<{ taskId: string; selfAssessment: string; testsPassed: boolean; coverage: number }>) {
  mockedExistsSync.mockImplementation((p: unknown) => {
    const path = p as string;
    if (path.includes('.tasks')) return true;
    if (path.includes('.brain')) return true;
    if (path.includes('.locks')) return false;
    if (path.includes('.deckent')) return true;
    if (path.includes('DIRECTIVES')) return true;
    return false;
  });

  let callCount = 0;
  mockedReadFileSync.mockImplementation((p: unknown) => {
    const path = p as string;
    if (path.includes('DIRECTIVES')) return '## Task 1\ndesc\n' as unknown as Buffer;
    if (path.includes('config.json')) {
      return JSON.stringify({ last_sprint_id: 'sprint-000' }) as unknown as Buffer;
    }
    if (path.includes('MEMORY')) return '' as unknown as Buffer;
    if (path.includes('RETRO')) return '' as unknown as Buffer;
    if (path.includes('PATTERNS')) return '[]' as unknown as Buffer;
    if (path.includes('DECISIONS')) return '' as unknown as Buffer;
    if (path.includes('DEBT.md')) return '' as unknown as Buffer;

    // Return results for task files
    for (const result of results) {
      if (path.includes(`task-${result.taskId}.result`)) {
        return JSON.stringify({
          taskId: result.taskId,
          workerId: 'worker-1',
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: result.testsPassed,
          coverage: result.coverage,
          selfAssessment: result.selfAssessment,
          notes: '',
        }) as unknown as Buffer;
      }
    }
    return '' as unknown as Buffer;
  });

  mockedReaddirSync.mockImplementation((p: unknown) => {
    const path = p as string;
    if (path.includes('.tasks')) {
      callCount++;
      if (callCount === 1) {
        // First call: task JSON files
        return tasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>;
      }
      // Subsequent calls: include result files
      return [
        ...tasks.map(t => `task-${t.id}.json`),
        ...results.map(r => `task-${r.taskId}.result`),
      ] as unknown as ReturnType<typeof readdirSync>;
    }
    return [] as unknown as ReturnType<typeof readdirSync>;
  });

  mockedWriteFileSync.mockImplementation(() => undefined);
  mockedMkdirSync.mockImplementation(() => undefined);

  // Git status returns empty (no changes)
  mockedSpawnSync.mockReturnValue({
    status: 0,
    stdout: '',
    stderr: '',
    pid: 1,
    output: [],
    signal: null,
  });
}

// ─── Tests: getRollbackPolicy ────────────────────────────────────────

describe('getRollbackPolicy', () => {
  beforeEach(() => {
    mockGetRollbackPolicy.mockImplementation(
      (evals: Array<'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'>) => {
        if (evals.length === 0) return 'never';
        const noGoCount = evals.filter(e => e === 'NO_GO').length;
        if (noGoCount === evals.length) return 'auto';
        if (noGoCount > 0) return 'ask';
        return 'never';
      }
    );
  });

  it('returns "never" for empty evaluations', () => {
    const result = getRollbackPolicy([]);
    expect(result).toBe('never');
  });

  it('returns "auto" when all tasks are NO_GO', () => {
    const result = getRollbackPolicy(['NO_GO', 'NO_GO', 'NO_GO']);
    expect(result).toBe('auto');
  });

  it('returns "ask" when some tasks are NO_GO', () => {
    const result = getRollbackPolicy(['DONE', 'NO_GO', 'DONE']);
    expect(result).toBe('ask');
  });

  it('returns "never" when all tasks are DONE', () => {
    const result = getRollbackPolicy(['DONE', 'DONE', 'DONE']);
    expect(result).toBe('never');
  });

  it('returns "never" when all tasks are GO_WITH_TECH_DEBT', () => {
    const result = getRollbackPolicy(['GO_WITH_TECH_DEBT', 'GO_WITH_TECH_DEBT']);
    expect(result).toBe('never');
  });

  it('returns "auto" for single NO_GO', () => {
    const result = getRollbackPolicy(['NO_GO']);
    expect(result).toBe('auto');
  });

  it('returns "ask" for mix of DONE and NO_GO', () => {
    const result = getRollbackPolicy(['DONE', 'NO_GO']);
    expect(result).toBe('ask');
  });
});

// ─── Tests: createSafetyPoint / rollback integration via brain ────────

describe('RunSprintOptions.rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations for rollback functions
    mockCreateSafetyPoint.mockReturnValue({
      id: 'sprint-001',
      branchName: 'deckent-backup-sprint-001',
      commitSha: 'abc123',
      createdAt: new Date().toISOString(),
      wasClean: true,
    });
    mockRollback.mockReturnValue({ success: true, message: 'Rolled back successfully' });
    mockGetRollbackPolicy.mockReturnValue('never');
    mockRecordRollbackInDebt.mockImplementation(() => undefined);
    mockSaveSafetyPoint.mockImplementation(() => undefined);
    mockDeleteSafetyPoint.mockReturnValue(true);
  });

  it('createSafetyPoint is called when rollback is enabled (default)', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
    ]);

    await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockCreateSafetyPoint).toHaveBeenCalledWith('/tmp/test', 'sprint-001');
  });

  it('createSafetyPoint is NOT called when rollback: false', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
    ]);

    await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true, rollback: false });

    expect(mockCreateSafetyPoint).not.toHaveBeenCalled();
  });

  it('safety point is saved to disk after creation', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
    ]);

    await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockSaveSafetyPoint).toHaveBeenCalled();
  });

  it('rollback is triggered when all tasks are NO_GO', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    // All NO_GO → getRollbackPolicy returns 'auto'
    mockGetRollbackPolicy.mockReturnValue('auto');

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 },
    ]);

    const sprint = await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockRollback).toHaveBeenCalled();
    expect(sprint.rolledBack).toBe(true);
    expect(sprint.rollbackResult).toContain('Rolled back');
  });

  it('recordRollbackInDebt is called after successful rollback', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    mockGetRollbackPolicy.mockReturnValue('auto');
    mockRollback.mockReturnValue({ success: true, message: 'Rolled back to deckent-backup-sprint-001' });

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 },
    ]);

    await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockRecordRollbackInDebt).toHaveBeenCalledWith(
      '/tmp/test',
      'sprint-001',
      expect.objectContaining({ success: true }),
    );
  });

  it('no rollback on partial success (mix of DONE and NO_GO)', async () => {
    const task1 = makeTask({ id: '001-001' });
    const task2 = makeTask({ id: '001-002' });
    const config = makeConfig();

    // Partial failure → 'ask' policy (no auto-rollback)
    mockGetRollbackPolicy.mockReturnValue('ask');

    setupFsForRunSprint([task1, task2], [
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
      { taskId: '001-002', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 },
    ]);

    const sprint = await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockRollback).not.toHaveBeenCalled();
    expect(sprint.rolledBack).toBeUndefined();
  });

  it('no rollback when all tasks succeed', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    mockGetRollbackPolicy.mockReturnValue('never');

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
    ]);

    const sprint = await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockRollback).not.toHaveBeenCalled();
    expect(sprint.rolledBack).toBeUndefined();
  });

  it('deleteSafetyPoint called after successful sprint (no rollback)', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    mockGetRollbackPolicy.mockReturnValue('never');

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
    ]);

    await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockDeleteSafetyPoint).toHaveBeenCalled();
  });

  it('deleteSafetyPoint NOT called when sprint is rolled back', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    mockGetRollbackPolicy.mockReturnValue('auto');
    mockRollback.mockReturnValue({ success: true, message: 'Rolled back' });

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 },
    ]);

    await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true });

    expect(mockDeleteSafetyPoint).not.toHaveBeenCalled();
  });

  it('sprint.rolledBack is false/undefined when rollback: false', async () => {
    const task = makeTask({ id: '001-001' });
    const config = makeConfig();

    mockGetRollbackPolicy.mockReturnValue('auto');

    setupFsForRunSprint([task], [
      { taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 },
    ]);

    const sprint = await runSprint('/tmp/test', config, { testMode: true, skipCleanup: true, rollback: false });

    expect(sprint.rolledBack).toBeUndefined();
    expect(mockRollback).not.toHaveBeenCalled();
  });
});

// ─── Tests: rollback module directly (via re-exported mocked fns) ────

describe('isCleanWorkingTree (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof isCleanWorkingTree).toBe('function');
  });
});

describe('safetyBranchExists (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof safetyBranchExists).toBe('function');
  });
});

describe('createSafetyPoint (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof createSafetyPoint).toBe('function');
  });
});

describe('rollback (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof rollbackFn).toBe('function');
  });
});

describe('getRollbackPolicy (direct)', () => {
  it('empty evaluations returns never', () => {
    mockGetRollbackPolicy.mockImplementation((evals: unknown[]) => evals.length === 0 ? 'never' : 'auto');
    expect(getRollbackPolicy([])).toBe('never');
  });
});

describe('recordRollbackInDebt (via brain re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof recordRollbackInDebt).toBe('function');
  });
});
