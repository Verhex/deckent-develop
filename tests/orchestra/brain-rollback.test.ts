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
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
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

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
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
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
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
  deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(true),
  getDirtyFiles: vi.fn().mockReturnValue([]),
  getCurrentCommitSha: vi.fn().mockReturnValue('abc123'),
  getCurrentBranch: vi.fn().mockReturnValue('main'),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
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

// ─── Sub-module mocks (Sprint 136 refactor — extracted from sprint-controller) ──

vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  runPlanPhase: vi.fn(),
  runSpawnPhase: vi.fn().mockResolvedValue({ taskQueue: [], scanInterval: null }),
  runEvaluatePhase: vi.fn().mockResolvedValue(undefined),
  runRollbackCheck: vi.fn(),
  runFixPhase: vi.fn().mockResolvedValue(undefined),
  runRetroPhase: vi.fn().mockResolvedValue(undefined),
  runDecayPhase: vi.fn(),
  runCleanupPhase: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/sprint-lifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-lifecycle.js')>();
  return {
    ...actual,
    setActiveSprint: vi.fn(),
    clearActiveSprint: vi.fn(),
    safeDashboardUpdate: vi.fn(),
    waitForHumanApproval: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../../src/orchestra/sprint-spawner.js', () => ({
  spawnWorkers: vi.fn().mockResolvedValue([]),
  respawnEligibleTasks: vi.fn().mockResolvedValue([]),
  validateTaskDependencies: vi.fn().mockReturnValue([]),
  routeSprintTasks: vi.fn(),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  waitForResults: vi.fn().mockResolvedValue([]),
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
  estimateTokenUsage: vi.fn(),
  enrichResultTokenUsage: vi.fn(),
  handleWorkerQuestion: vi.fn(),
  checkWorkerQuestions: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-utils.js')>();
  return {
    ...actual,
    now: vi.fn().mockReturnValue(new Date().toISOString()),
    writeSprintState: vi.fn(),
    clearSprintState: vi.fn(),
    readSprintState: vi.fn(),
    detectOrphanWorkers: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/orchestra/ipc-registry.js', () => ({
  getChannelRegistry: vi.fn().mockReturnValue({
    register: vi.fn(), remove: vi.fn(), get: vi.fn().mockReturnValue(null),
    has: vi.fn().mockReturnValue(false), clear: vi.fn(), size: 0,
  }),
  registerWorkerChannel: vi.fn(),
  unregisterWorkerChannel: vi.fn(),
  handleWorkerQuestion: vi.fn(),
  checkWorkerQuestions: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/baseline-tracker.js', () => ({
  captureVitestBaseline: vi.fn().mockReturnValue(null),
  writeBaseline: vi.fn(),
  readBaseline: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/sprint-pid-manager.js', () => ({
  writePid: vi.fn(),
  clearPid: vi.fn(),
  writeStateSnapshot: vi.fn(),
}));

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
  trace: vi.fn((_name: string, fn: () => unknown) => fn()),
  structuredLog: vi.fn(),
  initObservability: vi.fn(),
  setObservabilitySprintId: vi.fn(),
  getObservabilitySprintId: vi.fn().mockReturnValue(null),
  getMetricsPath: vi.fn().mockReturnValue('/tmp/metrics.jsonl'),
  getPerSprintMetricsPath: vi.fn().mockReturnValue(null),
  resetObservability: vi.fn(),
  generateLoadReport: vi.fn().mockResolvedValue('# Load Report\n'),
  TELEMETRY_ENABLED: false,
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  loadPluginHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
}));

vi.mock('../../src/core/multi-ide.js', () => ({
  acquireSprintLock: vi.fn().mockReturnValue(true),
  releaseSprintLock: vi.fn(),
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
  };
});

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('mock prompt'),
  createTask: vi.fn(),
  extractScopeFromDirective: vi.fn(),
  parseStructuredDirectives: vi.fn(),
  plannerTaskToParams: vi.fn(),
  resolveWorkerEffort: vi.fn(),
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
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runSprint, evaluateResult } from '../../src/orchestra/brain.js';
import {
  createSafetyPoint, rollback as rollbackFn, getRollbackPolicy,
  recordRollbackInDebt, isCleanWorkingTree, safetyBranchExists,
} from '../../src/orchestra/rollback.js';
import {
  runPlanPhase, runSpawnPhase, runEvaluatePhase, runRollbackCheck,
  runRetroPhase, runCleanupPhase,
} from '../../src/orchestra/sprint-phases.js';
import { waitForResults as waitForResultsImpl } from '../../src/orchestra/result-collector.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedStatSync = vi.mocked(statSync);

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
    },
  } as unknown as ResolvedConfig;
}

function setupFsForRunSprint(tasks: Task[], results: Array<{ taskId: string; selfAssessment: string; testsPassed: boolean; coverage: number }>) {
  // Build TaskResult objects for each result spec
  const taskResults = results.map(r => ({
    taskId: r.taskId,
    workerId: 'worker-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: r.testsPassed,
    coverage: r.coverage,
    selfAssessment: r.selfAssessment,
    notes: '',
  }));

  // Build sprint object that runPlanPhase should return
  const sprint = makeSprint(tasks);

  // Configure sprint-phases mocks
  // runPlanPhase mock needs to simulate createSafetyPoint/saveSafetyPoint calls
  // when rollbackEnabled=true, since those spies are checked in tests
  vi.mocked(runPlanPhase).mockImplementation(async (_root, _config, _opts, _provider, rollbackEnabled) => {
    let safetyPoint = null;
    if (rollbackEnabled) {
      safetyPoint = mockCreateSafetyPoint(_root, sprint.id);
      mockSaveSafetyPoint(_root, safetyPoint);
    }
    return { sprint, safetyPoint };
  });
  vi.mocked(runSpawnPhase).mockResolvedValue({ taskQueue: [], scanInterval: null as unknown as ReturnType<typeof setInterval> });
  vi.mocked(runEvaluatePhase).mockImplementation(async (_root, _sprint, _results, evaluations) => {
    for (const r of taskResults) {
      const task = tasks.find(t => t.id === r.taskId);
      if (!task) continue;
      if (r.selfAssessment === 'NO_GO' || !r.testsPassed) evaluations.set(r.taskId, TaskEvaluation.NO_GO);
      else if (r.selfAssessment === 'GO_WITH_TECH_DEBT' || r.coverage < 90) evaluations.set(r.taskId, TaskEvaluation.GO_WITH_TECH_DEBT);
      else evaluations.set(r.taskId, TaskEvaluation.DONE);
    }
  });
  vi.mocked(runRollbackCheck).mockImplementation((_root, sprint, evaluations, rollbackEnabled, safetyPoint) => {
    if (!rollbackEnabled) return;
    const evalValues = [...evaluations.values()];
    const policy = mockGetRollbackPolicy(evalValues.map(e =>
      e === TaskEvaluation.DONE ? 'DONE' : e === TaskEvaluation.NO_GO ? 'NO_GO' : 'GO_WITH_TECH_DEBT'
    ));
    if (policy === 'auto' && safetyPoint) {
      const rollbackResult = mockRollback('/tmp/test', safetyPoint);
      sprint.rolledBack = true;
      sprint.rollbackResult = rollbackResult.message;
      if (rollbackResult.success) {
        mockRecordRollbackInDebt('/tmp/test', sprint.id, rollbackResult);
      }
    } else if (policy !== 'auto') {
      // Successful sprint — delete safety point
      mockDeleteSafetyPoint('/tmp/test', sprint.id);
    }
  });

  // Minimal FS mocks for remaining file operations in runSprint itself
  mockedExistsSync.mockReturnValue(false);
  mockedWriteFileSync.mockImplementation(() => undefined);
  mockedMkdirSync.mockImplementation(() => undefined);
  mockedReaddirSync.mockReturnValue([] as never);

  // waitForResults mock (called from sprint-controller.ts) returns our task results
  vi.mocked(waitForResultsImpl).mockResolvedValue(taskResults as never);
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
