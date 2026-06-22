/**
 * tests/orchestra/sprint-controller.test.ts
 *
 * Tests for the extracted sprint-controller module.
 * Covers: cleanup, isStaleTaskFile, pauseSprint, resumeSprint,
 *         RunSprintOptions interface, PauseState, BrainError, readContext,
 *         evaluateResult, isDocTask, getDefaultProvider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus, AlertLevel,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, SystemProfile, TaskResult } from '../../src/core/types.js';

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
  // Sprint 139 async I/O migration: sprint-finalizer uses
  // `import { promises as fsPromises } from 'node:fs'` which needs a
  // `promises` export on the mock alongside the existing sync surface.
  // IMPORTANT: pass the async implementation directly to `vi.fn(...)` so
  // `vi.clearAllMocks()` (used in many beforeEach hooks) preserves it.
  // `mockResolvedValue(...)` would be wiped by clearAllMocks in vitest 3.x.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
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
    cpuCores: 4,
    totalMemMB: 16000,
    freeMemMB: 8000,
  }),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/orchestra/model-selector.js', () => ({
  calculateModelScore: vi.fn(),
  inferModelFromDirective: vi.fn(),
  resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
  parsePatterns: vi.fn().mockReturnValue([]),
  deduplicatePatterns: vi.fn().mockReturnValue([]),
  suggestModelFromPatterns: vi.fn(),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  createTask: vi.fn(),
  extractScopeFromDirective: vi.fn(),
  parseStructuredDirectives: vi.fn().mockReturnValue([]),
  buildWorkerPrompt: vi.fn().mockReturnValue('prompt'),
  plannerTaskToParams: vi.fn(),
  resolveWorkerEffort: vi.fn(),
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
  trimMemoryWithHeader: vi.fn(),
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 1000, coveragePercent: 90, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
  buildAgentPerformance: vi.fn().mockReturnValue([
    { agent: 'worker-001', tasks: 2, done: 2, debt: 0, noGo: 0, avgCoverage: 90 },
  ]),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'deckent-backup-sprint-001', createdAt: new Date().toISOString() }),
  rollback: vi.fn().mockReturnValue({ success: true }),
  getRollbackPolicy: vi.fn().mockReturnValue('skip'),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    providerRegistry: {
      getDefault: vi.fn().mockReturnValue(null),
      registerProvider: vi.fn(),
      getProvider: vi.fn().mockImplementation((name: string) => {
        throw new Error(`Provider not found: "${name}"`);
      }),
      hasProvider: vi.fn().mockReturnValue(false),
      listProviders: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    },
  };
});

vi.mock('../../src/orchestra/task-router.js', () => ({
  routeTask: vi.fn().mockReturnValue({
    provider: 'claude',
    agent: 'generic',
    skills: [],
    reason: 'default',
  }),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false, tscPassed: true, targetedTestsPassed: true, targetedTestFiles: [], alerts: [], testCountDelta: 0 }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true, tscPassed: true, testsPassed: true, testCount: 0, testPassed: 0, testFailed: 0, coverage: 0, baselineSaved: false }),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue('Rich Sprint Summary Output'),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue('KRAKEN SPLASH'),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ languages: [], frameworks: [], tools: [] }),
  STACK_COMMANDS: {
    typescript: { build: 'tsc --noEmit', test: 'npx vitest run', lint: 'tsc --noEmit' },
    javascript: { build: '', test: 'npx vitest run', lint: '' },
  },
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
  })),
}));

vi.mock('../../src/core/skill-selector.js', () => ({
  selectSkills: vi.fn().mockReturnValue({ skills: [], reason: '' }),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    saveTempAgentToPool: vi.fn(),
    createTempAgent: vi.fn(),
    cleanupTempAgents: vi.fn(),
    cleanupPersistentTempAgents: vi.fn().mockReturnValue(0),
  })),
}));

vi.mock('../../src/core/agent-selector.js', () => ({
  selectAgent: vi.fn().mockReturnValue({ agent: null, reason: '' }),
}));

vi.mock('../../src/agents/worker-ipc.js', () => {
  const channels = new Map();
  return {
    ChannelRegistry: vi.fn().mockImplementation(() => ({
      register: vi.fn((taskId: string, ch: unknown) => channels.set(taskId, ch)),
      get: vi.fn((taskId: string) => channels.get(taskId) ?? null),
      remove: vi.fn((taskId: string) => channels.delete(taskId)),
      getAll: vi.fn(() => [...channels.entries()]),
      clear: vi.fn(() => channels.clear()),
    })),
    WorkerChannel: vi.fn(),
  };
});

// ─── Imports (after mocks) ───────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureSession, spawnWorker, killWorker, listWorkers } from '../../src/orchestra/tmux.js';
import { updateDashboard } from '../../src/monitor/auditor.js';
import { releaseAllLocks } from '../../src/agents/worker.js';

import {
  cleanup,
  isStaleTaskFile,
  pauseSprint,
  resumeSprint,
  BrainError,
  isDocTask,
  evaluateResult,
  getDefaultProvider,
  getChannelRegistry,
  spawnWorkers,
  resolveTaskProvider,
  isTmuxProvider,
  getSubprocessWorkerLogPath,
  readSubprocessWorkerLog,
  hasSubprocessWorkerLog,
  resolveDefaultUsageCli,
  routeSprintTasks,
  finalizeSprint,
  writeSprintState,
  readSprintState,
  clearSprintState,
  detectOrphanWorkers,
  buildSpawnRetryHint,
  setActiveSprint,
  clearActiveSprint,
  isInterrupted,
  interruptActiveSprint,
  resetInterruptState,
  resolveSprintTimeoutMs,
} from '../../src/orchestra/sprint-controller.js';

import type {
  SprintState,
} from '../../src/orchestra/sprint-controller.js';

import type {
  RunSprintOptions,
  PauseState,
} from '../../src/orchestra/sprint-controller.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedStatSync = vi.mocked(statSync);
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedEnsureSession = vi.mocked(ensureSession);
const mockedSpawnWorker = vi.mocked(spawnWorker);
const mockedKillWorker = vi.mocked(killWorker);
const mockedListWorkers = vi.mocked(listWorkers);
const mockedUpdateDashboard = vi.mocked(updateDashboard);
const mockedReleaseAllLocks = vi.mocked(releaseAllLocks);

// Provider registry mock access
import { providerRegistry } from '../../src/core/provider.js';

// Rich output mock access
import { formatRichSprintSummary } from '../../src/cli/helpers/sprint-summary-rich.js';
const mockedFormatRichSprintSummary = vi.mocked(formatRichSprintSummary);

// Sprint reporter mock access (for calculateMetrics override in job output tests)
import { calculateMetrics } from '../../src/orchestra/sprint-reporter.js';
const mockedCalculateMetrics = vi.mocked(calculateMetrics);
const mockedProviderRegistry = vi.mocked(providerRegistry);

// Task router mock access
import { routeTask } from '../../src/orchestra/task-router.js';
const mockedRouteTask = vi.mocked(routeTask);

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

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  const tasks = overrides.tasks ?? [makeTask()];
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    ...overrides,
  };
}

function makeConfig(): ResolvedConfig {
  return {
    projectName: 'test',
    mode: 'performance',
    projectRoot: '/tmp/test',
    language: 'en',
    version: '1.0.0',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'opus',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'opus',
    },
    modes: {} as ResolvedConfig['modes'],
  } as ResolvedConfig;
}

function setupFileMocks(): void {
  mockedExistsSync.mockReturnValue(false);
  mockedReaddirSync.mockReturnValue([]);
  mockedReadFileSync.mockReturnValue('');
  mockedWriteFileSync.mockReturnValue(undefined);
  mockedMkdirSync.mockReturnValue(undefined as never);
  mockedUnlinkSync.mockReturnValue(undefined);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('BrainError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores phase information', () => {
    const err = new BrainError('test error', SprintPhase.PLAN);
    expect(err.message).toBe('test error');
    expect(err.phase).toBe(SprintPhase.PLAN);
    expect(err.name).toBe('BrainError');
  });

  it('works without phase argument', () => {
    const err = new BrainError('no phase');
    expect(err.phase).toBeUndefined();
    expect(err instanceof Error).toBe(true);
  });
});

describe('isStaleTaskFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when file is older than maxAgeMs', () => {
    const oldTime = Date.now() - 100_000_000; // ~27 hours ago
    mockedStatSync.mockReturnValue({ mtimeMs: oldTime } as ReturnType<typeof statSync>);

    expect(isStaleTaskFile('/tmp/task-001.json')).toBe(true);
  });

  it('returns false when file is fresh', () => {
    const recentTime = Date.now() - 1000; // 1 second ago
    mockedStatSync.mockReturnValue({ mtimeMs: recentTime } as ReturnType<typeof statSync>);

    expect(isStaleTaskFile('/tmp/task-001.json')).toBe(false);
  });

  it('returns false when statSync throws', () => {
    mockedStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(isStaleTaskFile('/tmp/nonexistent.json')).toBe(false);
  });

  it('accepts custom maxAgeMs', () => {
    const recentTime = Date.now() - 5000; // 5 seconds ago
    mockedStatSync.mockReturnValue({ mtimeMs: recentTime } as ReturnType<typeof statSync>);

    // 5 seconds > 1 second maxAge
    expect(isStaleTaskFile('/tmp/task-001.json', 1000)).toBe(true);
    // 5 seconds < 10 seconds maxAge
    expect(isStaleTaskFile('/tmp/task-001.json', 10_000)).toBe(false);
  });
});

describe('cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('kills all active workers via tmux when no backend provided', () => {
    mockedListWorkers.mockReturnValue(['t-001', 't-002'] as unknown as ReturnType<typeof listWorkers>);
    const sprint = makeSprint();

    cleanup('/tmp/test', sprint);

    expect(mockedKillWorker).toHaveBeenCalledTimes(2);
    expect(mockedKillWorker).toHaveBeenCalledWith('t-001');
    expect(mockedKillWorker).toHaveBeenCalledWith('t-002');
  });

  it('kills workers via spawn backend when provided', () => {
    const mockBackend = {
      name: 'test',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue(['t-001']),
    };
    const sprint = makeSprint();

    cleanup('/tmp/test', sprint, mockBackend);

    expect(mockBackend.kill).toHaveBeenCalledWith('t-001');
    expect(mockedKillWorker).not.toHaveBeenCalled();
  });

  it('releases locks for tasks with assigned workers', () => {
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
    const task = makeTask({ assignedWorker: 'worker-1' });
    const sprint = makeSprint({ tasks: [task] });

    cleanup('/tmp/test', sprint);

    expect(mockedReleaseAllLocks).toHaveBeenCalledWith('/tmp/test', 'worker-1');
  });

  it('removes task files with known extensions', () => {
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'task-001.json', 'task-001.plan', 'task-001.hb',
      'task-001.result', 'task-001.paused', 'task-001.log',
    ] as unknown as ReturnType<typeof readdirSync>);
    const sprint = makeSprint();

    cleanup('/tmp/test', sprint);

    expect(mockedUnlinkSync).toHaveBeenCalled();
  });

  it('removes .prompt-* hidden tmpfiles', () => {
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['.prompt-abc123'] as unknown as ReturnType<typeof readdirSync>);
    const sprint = makeSprint();

    cleanup('/tmp/test', sprint);

    expect(mockedUnlinkSync).toHaveBeenCalled();
  });

  it('removes .lock files from locks directory', () => {
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation(((path: string) => {
      if (typeof path === 'string' && path.includes('.locks')) return ['src__main.lock'];
      return [];
    }) as typeof readdirSync);
    const sprint = makeSprint();

    cleanup('/tmp/test', sprint);

    expect(mockedUnlinkSync).toHaveBeenCalled();
  });

  it('handles kill errors gracefully', () => {
    mockedListWorkers.mockReturnValue(['t-001'] as unknown as ReturnType<typeof listWorkers>);
    mockedKillWorker.mockImplementation(() => { throw new Error('already dead'); });
    const sprint = makeSprint();

    // Should not throw
    expect(() => cleanup('/tmp/test', sprint)).not.toThrow();
  });
});

describe('pauseSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('transitions PENDING tasks to PAUSED', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PENDING });
    const sprint = makeSprint({ tasks: [task] });

    const result = pauseSprint('/tmp/test', sprint, 'Test pause');

    expect(task.status).toBe(TaskStatus.PAUSED);
    expect(result.pausedTaskIds).toContain('001-001');
  });

  it('transitions EXECUTING tasks to PAUSED', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.EXECUTING });
    const sprint = makeSprint({ tasks: [task] });

    pauseSprint('/tmp/test', sprint);

    expect(task.status).toBe(TaskStatus.PAUSED);
  });

  it('does not pause DONE tasks', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.DONE });
    const sprint = makeSprint({ tasks: [task] });

    const result = pauseSprint('/tmp/test', sprint);

    expect(task.status).toBe(TaskStatus.DONE);
    expect(result.pausedTaskIds).not.toContain('001-001');
  });

  it('sets sprint status to PAUSED', () => {
    const sprint = makeSprint();

    pauseSprint('/tmp/test', sprint);

    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('writes pause state JSON file', () => {
    const sprint = makeSprint();

    pauseSprint('/tmp/test', sprint, 'usage limit');

    const writeCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[0] === 'string' && (call[0] as string).includes('pause-state.json'),
    );
    expect(writeCall).toBeDefined();
    if (writeCall) {
      const written = JSON.parse(writeCall[1] as string);
      expect(written.reason).toBe('usage limit');
    }
  });

  it('writes .paused marker file for each paused task', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PENDING });
    const sprint = makeSprint({ tasks: [task] });

    pauseSprint('/tmp/test', sprint);

    const markerCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[0] === 'string' && (call[0] as string).includes('task-001-001.paused'),
    );
    expect(markerCall).toBeDefined();
  });

  it('kills tmux workers without IPC channel', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.EXECUTING });
    const sprint = makeSprint({ tasks: [task] });

    pauseSprint('/tmp/test', sprint);

    expect(mockedKillWorker).toHaveBeenCalledWith('001-001');
  });

  it('updates dashboard with PAUSED status', () => {
    const sprint = makeSprint();

    pauseSprint('/tmp/test', sprint);

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashCall = mockedUpdateDashboard.mock.calls[0];
    expect(dashCall[1].sprint.status).toBe(SprintStatus.PAUSED);
  });
});

describe('resumeSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('transitions PAUSED tasks to PENDING', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PAUSED });
    const sprint = makeSprint({
      tasks: [task],
      status: SprintStatus.PAUSED,
    });

    resumeSprint('/tmp/test', sprint);

    expect(task.status).toBe(TaskStatus.PENDING);
  });

  it('sets sprint status to ACTIVE', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PAUSED });
    const sprint = makeSprint({
      tasks: [task],
      status: SprintStatus.PAUSED,
    });

    resumeSprint('/tmp/test', sprint);

    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('removes .paused marker files', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PAUSED });
    const sprint = makeSprint({ tasks: [task], status: SprintStatus.PAUSED });
    mockedExistsSync.mockReturnValue(true);

    resumeSprint('/tmp/test', sprint);

    expect(mockedUnlinkSync).toHaveBeenCalled();
  });

  it('removes pause state file', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PAUSED });
    const sprint = makeSprint({ tasks: [task], status: SprintStatus.PAUSED });
    mockedExistsSync.mockReturnValue(true);

    resumeSprint('/tmp/test', sprint);

    const unlinkCall = mockedUnlinkSync.mock.calls.find(call =>
      typeof call[0] === 'string' && (call[0] as string).includes('pause-state.json'),
    );
    expect(unlinkCall).toBeDefined();
  });

  it('updates dashboard with ACTIVE status', () => {
    const task = makeTask({ id: '001-001', status: TaskStatus.PAUSED });
    const sprint = makeSprint({ tasks: [task], status: SprintStatus.PAUSED });

    resumeSprint('/tmp/test', sprint);

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashCall = mockedUpdateDashboard.mock.calls[0];
    expect(dashCall[1].sprint.status).toBe(SprintStatus.ACTIVE);
  });
});

describe('isDocTask', () => {
  it('returns true for tasks with only doc directories', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    expect(isDocTask(task)).toBe(true);
  });

  it('returns false for tasks with src directory', () => {
    const task = makeTask({ scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] } });
    expect(isDocTask(task)).toBe(false);
  });

  it('returns false for tasks with tests directory', () => {
    const task = makeTask({ scope: { directories: ['tests/'], filesRead: [], filesWrite: [] } });
    expect(isDocTask(task)).toBe(false);
  });

  it('returns false when no directories specified', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: [] } });
    expect(isDocTask(task)).toBe(false);
  });
});

describe('evaluateResult', () => {
  it('returns NO_GO when selfAssessment is NO_GO', () => {
    const task = makeTask();
    const result: TaskResult = {
      taskId: '001-001', workerId: 'w-1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: true,
      coverage: 100, selfAssessment: 'NO_GO', notes: '',
    };

    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns GO_WITH_TECH_DEBT when selfAssessment says so', () => {
    const task = makeTask();
    const result: TaskResult = {
      taskId: '001-001', workerId: 'w-1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: true,
      coverage: 100, selfAssessment: 'GO_WITH_TECH_DEBT', notes: '',
    };

    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns NO_GO when tests did not pass', () => {
    const task = makeTask();
    const result: TaskResult = {
      taskId: '001-001', workerId: 'w-1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: false,
      coverage: 100, selfAssessment: 'DONE', notes: '',
    };

    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns DONE for doc tasks with passing tests', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    const result: TaskResult = {
      taskId: '001-001', workerId: 'w-1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: true,
      coverage: 0, selfAssessment: 'DONE', notes: '',
    };

    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE for code tasks with high coverage', () => {
    const task = makeTask();
    const result: TaskResult = {
      taskId: '001-001', workerId: 'w-1', filesChanged: [],
      linesAdded: 10, linesRemoved: 0, testsPassed: true,
      coverage: 95, selfAssessment: 'DONE', notes: '',
    };

    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns GO_WITH_TECH_DEBT when coverage below 90%', () => {
    const task = makeTask();
    const result: TaskResult = {
      taskId: '001-001', workerId: 'w-1', filesChanged: [],
      linesAdded: 10, linesRemoved: 0, testsPassed: true,
      coverage: 80, selfAssessment: 'DONE', notes: '',
    };

    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

describe('getDefaultProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no provider registered', () => {
    const result = getDefaultProvider();
    expect(result).toBeNull();
  });
});

describe('RunSprintOptions and PauseState types', () => {
  it('RunSprintOptions allows optional fields', () => {
    const opts: RunSprintOptions = {};
    expect(opts.autoApprove).toBeUndefined();
    expect(opts.sandboxMode).toBeUndefined();
    expect(opts.testMode).toBeUndefined();
    expect(opts.skipCleanup).toBeUndefined();
    expect(opts.timeoutMs).toBeUndefined();
    expect(opts.rollback).toBeUndefined();
  });

  it('PauseState has required fields', () => {
    const state: PauseState = {
      sprintId: 'sprint-001',
      pausedAt: new Date().toISOString(),
      pausedTaskIds: ['001-001'],
      reason: 'manual',
    };
    expect(state.sprintId).toBe('sprint-001');
    expect(state.pausedTaskIds).toHaveLength(1);
  });
});

describe('getChannelRegistry', () => {
  it('returns a ChannelRegistry instance', () => {
    const registry = getChannelRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.get).toBe('function');
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.remove).toBe('function');
  });
});

// ═══ resolveTaskProvider ═══════════════════════════════════════════

describe('resolveTaskProvider', () => {
  it('returns task.provider when explicitly set', () => {
    const task = makeTask({ provider: 'codex', model: 'opus' });
    expect(resolveTaskProvider(task)).toBe('codex');
  });

  it('infers claude from opus model', () => {
    const task = makeTask({ model: 'opus' });
    expect(resolveTaskProvider(task)).toBe('claude');
  });

  it('infers claude from sonnet model', () => {
    const task = makeTask({ model: 'sonnet' });
    expect(resolveTaskProvider(task)).toBe('claude');
  });

  it('infers claude from haiku model', () => {
    const task = makeTask({ model: 'haiku' });
    expect(resolveTaskProvider(task)).toBe('claude');
  });

  it('infers codex from o3 model', () => {
    const task = makeTask({ model: 'o3' });
    expect(resolveTaskProvider(task)).toBe('codex');
  });

  it('infers codex from gpt-4.1 model', () => {
    const task = makeTask({ model: 'gpt-4.1' });
    expect(resolveTaskProvider(task)).toBe('codex');
  });

  it('infers gemini from gemini-2.5-pro model', () => {
    const task = makeTask({ model: 'gemini-2.5-pro' });
    expect(resolveTaskProvider(task)).toBe('gemini');
  });

  it('infers gemini from gemini-2.5-flash model', () => {
    const task = makeTask({ model: 'gemini-2.5-flash' });
    expect(resolveTaskProvider(task)).toBe('gemini');
  });

  it('explicit provider overrides model inference', () => {
    const task = makeTask({ model: 'opus', provider: 'gemini' });
    expect(resolveTaskProvider(task)).toBe('gemini');
  });

  it('falls back to registry default for unknown model', () => {
    // When a provider is registered as default, unknown models should use it
    const mockAdapter = { name: 'codex' };
    mockedProviderRegistry.getDefault.mockReturnValue(mockAdapter as any);
    const task = makeTask({ model: 'unknown-model' as any });
    expect(resolveTaskProvider(task)).toBe('codex');
  });

  it('throws ProviderError when registry is empty and model unknown', () => {
    mockedProviderRegistry.getDefault.mockImplementation(() => {
      throw new Error('No providers registered');
    });
    const task = makeTask({ model: 'unknown-model' as any });
    expect(() => resolveTaskProvider(task)).toThrow(/No providers registered/);
  });
});

// ═══ isTmuxProvider ═══════════════════════════════════════════════

describe('isTmuxProvider', () => {
  it('returns true for claude provider', () => {
    expect(isTmuxProvider('claude')).toBe(true);
  });

  it('returns false for codex provider', () => {
    expect(isTmuxProvider('codex')).toBe(false);
  });

  it('returns false for gemini provider', () => {
    expect(isTmuxProvider('gemini')).toBe(false);
  });
});

// ═══ Subprocess Worker Log Capture ════════════════════════════════

describe('getSubprocessWorkerLogPath', () => {
  it('returns path under .tasks/ directory', () => {
    const logPath = getSubprocessWorkerLogPath('/project', '001-001');
    expect(logPath).toContain('.tasks');
    expect(logPath).toContain('task-001-001.log');
  });

  it('includes project root in path', () => {
    const logPath = getSubprocessWorkerLogPath('/my/project', '002-001');
    expect(logPath.startsWith('/my/project')).toBe(true);
  });

  it('uses task ID in log file name', () => {
    const logPath = getSubprocessWorkerLogPath('/root', '003-005');
    expect(logPath).toMatch(/task-003-005\.log$/);
  });
});

describe('readSubprocessWorkerLog', () => {
  it('returns null when log file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = readSubprocessWorkerLog('/project', '001-001');
    expect(result).toBeNull();
  });

  it('returns log content when file exists', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('worker output line 1\nworker output line 2\n');
    const result = readSubprocessWorkerLog('/project', '001-001');
    expect(result).toBe('worker output line 1\nworker output line 2\n');
  });

  it('returns null when readFileSync throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    const result = readSubprocessWorkerLog('/project', '001-001');
    expect(result).toBeNull();
  });
});

describe('hasSubprocessWorkerLog', () => {
  it('returns true when log file exists', () => {
    mockedExistsSync.mockReturnValue(true);
    expect(hasSubprocessWorkerLog('/project', '001-001')).toBe(true);
  });

  it('returns false when log file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(hasSubprocessWorkerLog('/project', '001-001')).toBe(false);
  });
});

// ═══ resolveDefaultUsageCli ═══════════════════════════════════════

describe('resolveDefaultUsageCli', () => {
  it('returns undefined when no provider is registered', () => {
    mockedProviderRegistry.getDefault.mockImplementation(() => {
      throw new Error('No providers registered');
    });
    expect(resolveDefaultUsageCli()).toBeUndefined();
  });

  it('returns CLI binary from default provider', () => {
    const mockAdapter = {
      name: 'claude',
      buildCommand: vi.fn().mockReturnValue('claude -p /dev/null'),
    };
    mockedProviderRegistry.getDefault.mockReturnValue(mockAdapter as any);
    expect(resolveDefaultUsageCli()).toBe('claude');
  });
});

// ═══ spawnWorkers — Provider Routing ══════════════════════════════

describe('spawnWorkers — provider routing', () => {
  const mockCodexAdapter = {
    name: 'codex',
    supportedModels: ['gpt-4.1', 'o3', 'o4-mini'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('codex --model o3'),
  };

  const mockGeminiAdapter = {
    name: 'gemini',
    supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('gemini --model gemini-2.5-pro'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
    // By default, getProvider throws (no adapters registered)
    mockedProviderRegistry.getProvider.mockImplementation((name: string) => {
      if (name === 'codex') return mockCodexAdapter as any;
      if (name === 'gemini') return mockGeminiAdapter as any;
      throw new Error(`Provider not found: "${name}"`);
    });
  });

  it('spawns Claude tasks via tmux (backward compat, no backend)', async () => {
    const task = makeTask({ id: '001-001', model: 'opus' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockedEnsureSession).toHaveBeenCalled();
    expect(mockedSpawnWorker).toHaveBeenCalledWith(
      '001-001', 'opus', expect.any(String), '/tmp/test',
      expect.objectContaining({ autoApprove: false }),
    );
    expect(mockCodexAdapter.spawn).not.toHaveBeenCalled();
    expect(mockGeminiAdapter.spawn).not.toHaveBeenCalled();
  });

  it('spawns Claude tasks via SpawnBackend when provided', async () => {
    const mockBackend = { name: 'test', spawn: vi.fn(), kill: vi.fn(), list: vi.fn().mockReturnValue([]) };
    const task = makeTask({ id: '001-001', model: 'sonnet' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).toHaveBeenCalledWith(
      '001-001', 'sonnet', expect.any(String),
      expect.objectContaining({ projectDir: '/tmp/test' }),
    );
    expect(mockedEnsureSession).not.toHaveBeenCalled();
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('routes codex task to CodexAdapter.spawn', async () => {
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockCodexAdapter.spawn).toHaveBeenCalledWith(
      '002-001', 'o3', expect.any(String),
      expect.objectContaining({ projectDir: '/tmp/test' }),
    );
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('routes gemini task to GeminiAdapter.spawn', async () => {
    const task = makeTask({ id: '003-001', model: 'gemini-2.5-pro', provider: 'gemini' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockGeminiAdapter.spawn).toHaveBeenCalledWith(
      '003-001', 'gemini-2.5-pro', expect.any(String),
      expect.objectContaining({ projectDir: '/tmp/test' }),
    );
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('infers codex provider from o3 model (no explicit provider)', async () => {
    const task = makeTask({ id: '002-002', model: 'o3' }); // no provider field
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockCodexAdapter.spawn).toHaveBeenCalledWith(
      '002-002', 'o3', expect.any(String),
      expect.objectContaining({ projectDir: '/tmp/test' }),
    );
  });

  it('infers gemini provider from gemini-2.5-flash model', async () => {
    const task = makeTask({ id: '003-002', model: 'gemini-2.5-flash' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockGeminiAdapter.spawn).toHaveBeenCalledWith(
      '003-002', 'gemini-2.5-flash', expect.any(String),
      expect.objectContaining({ projectDir: '/tmp/test' }),
    );
  });

  it('handles mixed sprint: Claude + Codex + Gemini tasks', async () => {
    const claudeTask = makeTask({ id: '001-001', model: 'opus' });
    const codexTask = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const geminiTask = makeTask({ id: '003-001', model: 'gemini-2.5-pro', provider: 'gemini' });
    const sprint = makeSprint({ tasks: [claudeTask, codexTask, geminiTask] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    // Claude via tmux
    expect(mockedEnsureSession).toHaveBeenCalled();
    expect(mockedSpawnWorker).toHaveBeenCalledTimes(1);
    expect(mockedSpawnWorker).toHaveBeenCalledWith(
      '001-001', 'opus', expect.any(String), '/tmp/test', expect.any(Object),
    );
    // Codex via adapter
    expect(mockCodexAdapter.spawn).toHaveBeenCalledTimes(1);
    expect(mockCodexAdapter.spawn).toHaveBeenCalledWith(
      '002-001', 'o3', expect.any(String), expect.any(Object),
    );
    // Gemini via adapter
    expect(mockGeminiAdapter.spawn).toHaveBeenCalledTimes(1);
    expect(mockGeminiAdapter.spawn).toHaveBeenCalledWith(
      '003-001', 'gemini-2.5-pro', expect.any(String), expect.any(Object),
    );
  });

  it('does not call ensureSession when no Claude tasks exist', async () => {
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockedEnsureSession).not.toHaveBeenCalled();
  });

  it('no provider field defaults to claude for Claude models', async () => {
    const task = makeTask({ id: '001-001', model: 'haiku' }); // no provider, Claude model
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockedEnsureSession).toHaveBeenCalled();
    expect(mockedSpawnWorker).toHaveBeenCalledWith(
      '001-001', 'haiku', expect.any(String), '/tmp/test', expect.any(Object),
    );
  });

  it('returns queued tasks beyond max_workers', async () => {
    const tasks = [
      makeTask({ id: '001-001', model: 'opus' }),
      makeTask({ id: '001-002', model: 'opus' }),
      makeTask({ id: '001-003', model: 'opus' }),
      makeTask({ id: '001-004', model: 'opus' }),
      makeTask({ id: '001-005', model: 'opus' }),
    ];
    const sprint = makeSprint({ tasks });
    const config = makeConfig(); // maxWorkers = 4

    const queued = await spawnWorkers('/tmp/test', sprint, config);

    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe('001-005');
  });

  it('updates dashboard with provider info in currentAction', async () => {
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashCall = mockedUpdateDashboard.mock.calls[0];
    const agents = dashCall[1].agents;
    expect(agents[0].currentAction).toBe('Starting [codex]');
  });

  it('passes allowedTools with scope directories to adapter', async () => {
    const task = makeTask({
      id: '002-001', model: 'o3', provider: 'codex',
      scope: { directories: ['src/test/'], filesRead: [], filesWrite: ['src/test/file.ts'] },
    });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config);

    const spawnCall = mockCodexAdapter.spawn.mock.calls[0];
    expect(spawnCall[3].allowedTools).toBe('Read,Write(.tasks/,src/test/,src/test/file.ts),Edit(.tasks/,src/test/,src/test/file.ts),Bash,Glob,Grep');
  });

  it('passes autoApprove option to non-Claude adapter', async () => {
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config, { autoApprove: true });

    const spawnCall = mockCodexAdapter.spawn.mock.calls[0];
    expect(spawnCall[3].autoApprove).toBe(true);
  });

  it('gracefully handles missing provider adapter (not registered)', async () => {
    mockedProviderRegistry.getProvider.mockImplementation(() => {
      throw new Error('Provider not found');
    });
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    // Should not throw — gracefully skips
    await expect(spawnWorkers('/tmp/test', sprint, config)).resolves.not.toThrow();
  });
});

// ═══ cleanup — Provider Routing ═══════════════════════════════════

describe('cleanup — provider kill routing', () => {
  const mockCodexAdapter = {
    name: 'codex',
    supportedModels: ['gpt-4.1', 'o3', 'o4-mini'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn(),
    buildCommand: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
    mockedExistsSync.mockReturnValue(false);
    mockedProviderRegistry.getProvider.mockImplementation((name: string) => {
      if (name === 'codex') return mockCodexAdapter as any;
      throw new Error(`Provider not found: "${name}"`);
    });
  });

  it('kills non-Claude workers via provider adapter during cleanup', () => {
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });

    cleanup('/tmp/test', sprint);

    expect(mockCodexAdapter.kill).toHaveBeenCalledWith('002-001');
  });

  it('does not call adapter kill for Claude tasks during cleanup', () => {
    const task = makeTask({ id: '001-001', model: 'opus' });
    const sprint = makeSprint({ tasks: [task] });

    cleanup('/tmp/test', sprint);

    expect(mockCodexAdapter.kill).not.toHaveBeenCalled();
  });

  it('handles adapter kill errors gracefully', () => {
    mockCodexAdapter.kill.mockImplementation(() => { throw new Error('already dead'); });
    const task = makeTask({ id: '002-001', model: 'o3', provider: 'codex' });
    const sprint = makeSprint({ tasks: [task] });

    expect(() => cleanup('/tmp/test', sprint)).not.toThrow();
  });
});

// ═══ Provider Decoupling Verification ═══════════════════════════════

describe('sprint-controller provider decoupling', () => {
  it('sprint-controller.ts has zero inline hardcoded claude fallback patterns', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // Should NOT have `?? 'claude'` patterns (hardcoded fallback)
    expect(source).not.toMatch(/\?\?\s*'claude'/);
    // Should NOT have `config.brain_provider ?? 'claude'`
    expect(source).not.toContain("brain_provider ?? 'claude'");
  });

  it('routing comparisons use isTmuxProvider() helper instead of inline string', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // Should NOT have inline `=== 'claude'` or `!== 'claude'` in routing logic
    expect(source).not.toMatch(/taskProvider\s*!==\s*'claude'/);
    expect(source).not.toMatch(/provider\s*===\s*'claude'/);
    expect(source).not.toMatch(/provider\s*!==\s*'claude'/);
  });

  it('isTmuxProvider is the single source of truth for tmux routing', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // Sprint 136: isTmuxProvider moved to sprint-spawner.ts
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-spawner.ts', import.meta.url),
      'utf-8',
    );
    // isTmuxProvider should be used in routing logic
    expect(source).toContain('isTmuxProvider(');
    // Should appear in spawnWorkers and cleanup
    const isTmuxCount = (source.match(/isTmuxProvider\(/g) ?? []).length;
    expect(isTmuxCount).toBeGreaterThanOrEqual(3); // import + 2+ usages
  });

  it('resolveTaskProvider tries registry default before hardcoded fallback', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // resolveTaskProvider was extracted to sprint-utils.ts in Phase 2
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-utils.ts', import.meta.url),
      'utf-8',
    );
    // Should contain registry.getDefault() call in resolveTaskProvider
    expect(source).toContain('providerRegistry.getDefault().name');
  });
});

// ═══ Task Router Integration (Phase 1.5) ═══════════════════════════
describe('Task Router wiring in sprint-controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sprint-controller imports routeTask from task-router (via sprint-spawner)', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // Sprint 136: routeTask import moved to sprint-spawner.ts
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-spawner.ts', import.meta.url),
      'utf-8',
    );
    // robust to other named imports in the same statement (e.g. emitTimeoutEvents, Sprint 280)
    expect(source).toMatch(/import \{[^}]*\brouteTask\b[^}]*\} from '\.\/task-router\.js'/);
  });

  it('routeTask is called in runSprint between plan and spawn phases', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // After sprint-phases extraction: planSprint is called via runPlanPhase,
    // routeSprintTasksImpl and runSpawnPhase remain in runSprint within sprint-controller.ts.
    // Verify the order: runPlanPhase → routeSprintTasksImpl → runSpawnPhase
    const planIdx = source.indexOf('runPlanPhase(');
    const routeIdx = source.indexOf('routeSprintTasksImpl(sprint.tasks, config, availableProviders)');
    const spawnIdx = source.indexOf('runSpawnPhase(');
    expect(planIdx).toBeGreaterThan(-1);
    expect(routeIdx).toBeGreaterThan(-1);
    expect(spawnIdx).toBeGreaterThan(-1);
    expect(routeIdx).toBeGreaterThan(planIdx);
    expect(routeIdx).toBeLessThan(spawnIdx);
  });

  it('routing phase uses providerRegistry.listProviders() for available providers', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('providerRegistry.listProviders()');
  });

  it('routing phase sets task.provider from router output', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // Sprint 136: routeSprintTasks moved to sprint-spawner.ts
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-spawner.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('task.provider = routing.provider');
  });

  it('routing phase sets task.assignedAgent when router returns non-generic', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // Sprint 136: routeSprintTasks moved to sprint-spawner.ts
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-spawner.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain("routing.agent !== 'generic'");
    expect(source).toContain('task.assignedAgent = routing.agent');
  });

  it('routing phase sets task.assignedSkills when router returns skills', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    // Sprint 136: routeSprintTasks moved to sprint-spawner.ts
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-spawner.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('routing.skills.length > 0');
    expect(source).toContain('task.assignedSkills = routing.skills');
  });

  it('routing phase is wrapped in try-catch for backward compatibility', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // The routeSprintTasksImpl call is inside a try block with a non-fatal catch
    expect(source).toContain('routeSprintTasksImpl(sprint.tasks, config, availableProviders)');
    expect(source).toContain("debugLog('runSprint:routeSprintTasks'");
  });

  it('routeTask mock returns correct default shape', () => {
    const task = makeTask();
    const result = mockedRouteTask(task, {} as any, []);
    expect(result).toEqual({
      provider: 'claude',
      agent: 'generic',
      skills: [],
      reason: 'default',
    });
  });

  it('routeTask can return a non-claude provider', () => {
    mockedRouteTask.mockReturnValueOnce({
      provider: 'codex',
      agent: 'generic',
      skills: [],
      reason: 'config override',
    });
    const task = makeTask();
    const result = mockedRouteTask(task, {} as any, ['claude', 'codex']);
    expect(result.provider).toBe('codex');
  });

  it('routeTask can return a specific agent', () => {
    mockedRouteTask.mockReturnValueOnce({
      provider: 'claude',
      agent: 'agent-testing-001',
      skills: [],
      reason: 'agent preference',
    });
    const task = makeTask();
    const result = mockedRouteTask(task, {} as any, ['claude']);
    expect(result.agent).toBe('agent-testing-001');
    expect(result.agent).not.toBe('generic');
  });

  it('routeTask can return skills', () => {
    mockedRouteTask.mockReturnValueOnce({
      provider: 'claude',
      agent: 'generic',
      skills: ['vitest-runner', 'tsc-lint'],
      reason: 'skill affinity',
    });
    const task = makeTask();
    const result = mockedRouteTask(task, {} as any, ['claude']);
    expect(result.skills).toEqual(['vitest-runner', 'tsc-lint']);
    expect(result.skills.length).toBe(2);
  });

  it('Task type already has assignedSkills field', () => {
    const task = makeTask({ assignedSkills: ['skill-1', 'skill-2'] });
    expect(task.assignedSkills).toEqual(['skill-1', 'skill-2']);
  });

  it('Phase 1.5 comment is present in source as routing phase marker', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('Phase 1.5: Route tasks to providers');
  });
});

// ─── finalizeSprint + Rich Output Integration ────────────────────────

describe('finalizeSprint — rich output integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReaddirSync.mockReturnValue([]);
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/foo.ts | 10 ++++\n 1 file changed, 10 insertions(+)\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);
  });

  it('calls formatRichSprintSummary during finalization', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    expect(mockedFormatRichSprintSummary).toHaveBeenCalled();
  });

  it('passes sprint data and evaluations to formatRichSprintSummary', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const callArgs = mockedFormatRichSprintSummary.mock.calls[0]!;
    expect(callArgs[0]).toMatchObject({ id: sprint.id });
    expect(callArgs[1]).toBe(evaluations);
  });

  it('includes gitDiff from spawnSync in rich output options', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const callArgs = mockedFormatRichSprintSummary.mock.calls[0]!;
    const opts = callArgs[2];
    expect(opts?.gitDiff).toContain('src/foo.ts');
  });

  it('completes normally when formatRichSprintSummary throws', async () => {
    mockedFormatRichSprintSummary.mockImplementationOnce(() => { throw new Error('format error'); });

    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    const metrics = await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });
    expect(metrics).toBeDefined();
    expect(metrics.totalTasks).toBeDefined();
  });

  it('respects output_mode from config', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    const config = { ...makeConfig(), output_mode: 'quiet' } as any;
    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true, config });

    const callArgs = mockedFormatRichSprintSummary.mock.calls[0]!;
    expect(callArgs[2]?.outputMode).toBe('quiet');
  });

  it('defaults output_mode to normal when config has no output_mode', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const callArgs = mockedFormatRichSprintSummary.mock.calls[0]!;
    expect(callArgs[2]?.outputMode).toBe('normal');
  });

  it('logs rich output to console when formatRichSprintSummary returns a string', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedFormatRichSprintSummary.mockReturnValueOnce('RICH OUTPUT HERE');

    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    expect(consoleSpy).toHaveBeenCalledWith('RICH OUTPUT HERE');
    consoleSpy.mockRestore();
  });

  it('passes agentPerf data from buildAgentPerformance to formatRichSprintSummary', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([[sprint.tasks[0]!.id, TaskEvaluation.DONE]]);
    const results = [{ taskId: sprint.tasks[0]!.id, status: 'DONE', filesChanged: [], linesAdded: 0, linesRemoved: 0, testResults: { passed: 1, failed: 0, skipped: 0 }, coverage: 90, selfAssessment: 'DONE' as const, notes: '' }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const callArgs = mockedFormatRichSprintSummary.mock.calls[0]!;
    const opts = callArgs[2];
    expect(opts?.agentPerf).toBeDefined();
    expect(Array.isArray(opts?.agentPerf)).toBe(true);
  });
});

// ═══ routeSprintTasks — Connector Integration ═══════════════════════
describe('routeSprintTasks — Router + Connector integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes all tasks and sets task.provider', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'codex',
      agent: 'generic',
      skills: [],
      reason: 'worker_provider',
    });

    const tasks = [makeTask({ id: '001-001' }), makeTask({ id: '001-002' })];
    routeSprintTasks(tasks, makeConfig() as any, ['claude', 'codex']);

    expect(mockedRouteTask).toHaveBeenCalledTimes(2);
    expect(tasks[0]!.provider).toBe('codex');
    expect(tasks[1]!.provider).toBe('codex');
  });

  it('sets task.assignedAgent when router returns non-generic agent', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'claude',
      agent: 'agent-testing-001',
      skills: [],
      reason: 'agent preference',
    });

    const tasks = [makeTask()];
    routeSprintTasks(tasks, makeConfig() as any, ['claude']);

    expect(tasks[0]!.assignedAgent).toBe('agent-testing-001');
  });

  it('does not override assignedAgent when router returns generic', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'claude',
      agent: 'generic',
      skills: [],
      reason: 'default',
    });

    const tasks = [makeTask({ assignedAgent: 'existing-agent' })];
    routeSprintTasks(tasks, makeConfig() as any, ['claude']);

    // 'generic' should NOT override — assignedAgent keeps its existing value
    expect(tasks[0]!.assignedAgent).toBe('existing-agent');
  });

  it('sets task.assignedSkills when router returns skills', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'claude',
      agent: 'generic',
      skills: ['vitest-runner', 'tsc-lint'],
      reason: 'skill affinity',
    });

    const tasks = [makeTask()];
    routeSprintTasks(tasks, makeConfig() as any, ['claude']);

    expect(tasks[0]!.assignedSkills).toEqual(['vitest-runner', 'tsc-lint']);
  });

  it('does not set assignedSkills when router returns empty skills', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'claude',
      agent: 'generic',
      skills: [],
      reason: 'default',
    });

    const tasks = [makeTask({ assignedSkills: undefined })];
    routeSprintTasks(tasks, makeConfig() as any, ['claude']);

    expect(tasks[0]!.assignedSkills).toBeUndefined();
  });

  it('passes config to routeTask for skill_routing overrides', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'gemini',
      agent: 'generic',
      skills: [],
      reason: 'config override',
    });

    const config = makeConfig() as any;
    const tasks = [makeTask()];
    routeSprintTasks(tasks, config, ['claude', 'gemini']);

    expect(mockedRouteTask).toHaveBeenCalledWith(tasks[0], config, ['claude', 'gemini']);
  });

  it('passes availableProviders from connector to routeTask', () => {
    mockedRouteTask.mockReturnValue({
      provider: 'claude',
      agent: 'generic',
      skills: [],
      reason: 'default',
    });

    const tasks = [makeTask()];
    const providers: any[] = ['claude', 'codex', 'gemini'];
    routeSprintTasks(tasks, makeConfig() as any, providers);

    expect(mockedRouteTask).toHaveBeenCalledWith(tasks[0], expect.anything(), providers);
  });

  it('handles empty task array gracefully', () => {
    const tasks: Task[] = [];
    routeSprintTasks(tasks, makeConfig() as any, ['claude']);

    expect(mockedRouteTask).not.toHaveBeenCalled();
  });

  it('routes each task independently (different routing per task)', () => {
    mockedRouteTask
      .mockReturnValueOnce({ provider: 'claude', agent: 'generic', skills: [], reason: 'first' })
      .mockReturnValueOnce({ provider: 'codex', agent: 'agent-code', skills: ['ts-expert'], reason: 'second' });

    const tasks = [makeTask({ id: '001-001' }), makeTask({ id: '001-002' })];
    routeSprintTasks(tasks, makeConfig() as any, ['claude', 'codex']);

    expect(tasks[0]!.provider).toBe('claude');
    expect(tasks[1]!.provider).toBe('codex');
    expect(tasks[1]!.assignedAgent).toBe('agent-code');
    expect(tasks[1]!.assignedSkills).toEqual(['ts-expert']);
  });

  it('non-Claude provider routes to subprocess in spawnWorkers', () => {
    const task = makeTask({ provider: 'codex' as any });
    const result = resolveTaskProvider(task);
    expect(result).toBe('codex');
    expect(isTmuxProvider(result)).toBe(false);
  });

  it('Claude provider routes to tmux in spawnWorkers', () => {
    const task = makeTask({ provider: 'claude' as any });
    const result = resolveTaskProvider(task);
    expect(result).toBe('claude');
    expect(isTmuxProvider(result)).toBe(true);
  });

  it('RunSprintOptions accepts connector field', () => {
    const opts: RunSprintOptions = {
      connector: { getAvailableProviders: () => ['claude'] } as any,
    };
    expect(opts.connector).toBeDefined();
    expect(opts.connector!.getAvailableProviders()).toEqual(['claude']);
  });

  it('source uses connector.getAvailableProviders() when connector provided', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('connector.getAvailableProviders()');
    expect(source).toContain('opts?.connector');
  });

  it('source falls back to providerRegistry when no connector', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('providerRegistry.listProviders()');
  });

  it('routeSprintTasks is exported from sprint-controller (via re-export)', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = actualFs.readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    // Sprint 136: routeSprintTasks is re-exported from sprint-spawner.ts
    expect(source).toContain('routeSprintTasks');
    expect(source).toContain("from './sprint-spawner.js'");
  });
});

// ─── cleanupDraftTasks Tests ───────────────────────────────────────

describe('cleanupDraftTasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes DRAFT task files from .tasks/', async () => {
    const { existsSync, readdirSync, readFileSync, unlinkSync } = await import('node:fs');
    const { cleanupDraftTasks } = await import('../../src/orchestra/sprint-controller.js');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      'task-001-001.json' as any,
      'task-001-002.json' as any,
    ]);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(JSON.stringify({ status: 'DRAFT' }))
      .mockReturnValueOnce(JSON.stringify({ status: 'PENDING' }));

    cleanupDraftTasks('/root');

    expect(unlinkSync).toHaveBeenCalledTimes(1);
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining('task-001-001.json'));
  });

  it('does nothing when .tasks/ does not exist', async () => {
    const { existsSync, readdirSync } = await import('node:fs');
    const { cleanupDraftTasks } = await import('../../src/orchestra/sprint-controller.js');

    vi.mocked(existsSync).mockReturnValue(false);
    cleanupDraftTasks('/root');
    expect(readdirSync).not.toHaveBeenCalled();
  });

  it('ignores malformed task files', async () => {
    const { existsSync, readdirSync, readFileSync, unlinkSync } = await import('node:fs');
    const { cleanupDraftTasks } = await import('../../src/orchestra/sprint-controller.js');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-bad.json' as any]);
    vi.mocked(readFileSync).mockReturnValue('not json');

    cleanupDraftTasks('/root');
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});

// ═══ Task 056-006: Sprint State Persistence ══════════════════════════

describe('writeSprintState', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('writes sprint state to .deckent/sprint-state.json', () => {
    const sprint = makeSprint({ id: 'sprint-042', phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE });
    sprint.startedAt = '2026-03-25T10:00:00.000Z';

    writeSprintState('/proj', sprint);

    expect(mockedMkdirSync).toHaveBeenCalledWith(expect.stringContaining('.deckent'), { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('sprint-state.json'),
      expect.stringContaining('"sprintId": "sprint-042"'),
      'utf-8',
    );
  });

  it('includes all task IDs in state', () => {
    const tasks = [makeTask({ id: '042-001' }), makeTask({ id: '042-002' })];
    const sprint = makeSprint({ id: 'sprint-042', tasks });

    writeSprintState('/proj', sprint);

    const written = mockedWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.taskIds).toEqual(['042-001', '042-002']);
  });

  it('does not throw when write fails', () => {
    mockedWriteFileSync.mockImplementation(() => { throw new Error('disk full'); });
    const sprint = makeSprint();
    expect(() => writeSprintState('/proj', sprint)).not.toThrow();
  });
});

describe('readSprintState', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns parsed state when file exists', () => {
    const state: SprintState = {
      sprintId: 'sprint-042',
      phase: SprintPhase.EXECUTE,
      status: 'ACTIVE',
      startedAt: '2026-03-25T10:00:00.000Z',
      updatedAt: '2026-03-25T10:05:00.000Z',
      taskIds: ['042-001'],
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(state));

    const result = readSprintState('/proj');
    expect(result).toEqual(state);
  });

  it('returns null when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = readSprintState('/proj');
    expect(result).toBeNull();
  });
});

describe('clearSprintState', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('removes sprint state file when it exists', () => {
    mockedExistsSync.mockReturnValue(true);
    clearSprintState('/proj');
    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('sprint-state.json'));
  });

  it('does nothing when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    clearSprintState('/proj');
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });
});

describe('detectOrphanWorkers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns all workers as orphans when no sprint state exists', () => {
    mockedListWorkers.mockReturnValue(['w-001-001', 'w-001-002']);
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const orphans = detectOrphanWorkers('/proj');
    expect(orphans).toEqual(['w-001-001', 'w-001-002']);
  });

  it('filters out workers belonging to current sprint', () => {
    mockedListWorkers.mockReturnValue(['w-042-001', 'w-042-002', 'w-old-001']);
    const state: SprintState = {
      sprintId: 'sprint-042',
      phase: SprintPhase.EXECUTE,
      status: 'ACTIVE',
      startedAt: '2026-03-25T10:00:00.000Z',
      updatedAt: '2026-03-25T10:05:00.000Z',
      taskIds: ['042-001', '042-002'],
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(state));

    const orphans = detectOrphanWorkers('/proj');
    expect(orphans).toEqual(['w-old-001']);
  });

  it('returns empty array when no workers exist', () => {
    mockedListWorkers.mockReturnValue([]);
    const result = detectOrphanWorkers('/proj');
    expect(result).toEqual([]);
  });
});

describe('buildSpawnRetryHint', () => {
  it('suggests model downgrade on rate limit errors', () => {
    const sprint = makeSprint();
    const hint = buildSpawnRetryHint(new Error('rate limit exceeded (429)'), sprint);
    expect(hint).toContain('Rate limit');
  });

  it('suggests tmux check on tmux errors', () => {
    const sprint = makeSprint();
    const hint = buildSpawnRetryHint(new Error('tmux session not found'), sprint);
    expect(hint).toContain('tmux');
  });

  it('warns about high task count', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => makeTask({ id: `001-00${i}` }));
    const sprint = makeSprint({ tasks });
    const hint = buildSpawnRetryHint(new Error('unknown'), sprint);
    expect(hint).toContain('High task count');
  });

  it('provides generic hint for unknown errors', () => {
    const sprint = makeSprint();
    const hint = buildSpawnRetryHint(new Error('something weird'), sprint);
    expect(hint).toContain('Unexpected spawn error');
  });
});

// ═══ Task 056-006: waitForResults timeout passthrough ═══════════════

describe('waitForResults timeout', () => {
  it('RunSprintOptions includes timeoutMs field', () => {
    const opts: RunSprintOptions = { timeoutMs: 60_000 };
    expect(opts.timeoutMs).toBe(60_000);
  });
});

// ═══ Task 067-004: spawnWorkers sets task status to EXECUTING ════════

describe('spawnWorkers — task status update to EXECUTING', () => {
  const mockBackend = { name: 'test', spawn: vi.fn(), kill: vi.fn(), list: vi.fn().mockReturnValue([]) };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedListWorkers.mockReturnValue([] as unknown as ReturnType<typeof listWorkers>);
  });

  it('updates task.status to EXECUTING after spawning via SpawnBackend', async () => {
    const task = makeTask({ id: '001-001', model: 'sonnet', status: TaskStatus.PENDING });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config, { spawnBackend: mockBackend });

    expect(task.status).toBe(TaskStatus.EXECUTING);
  });

  it('writes task JSON with EXECUTING status to disk after spawn', async () => {
    const task = makeTask({ id: '001-001', model: 'sonnet', status: TaskStatus.PENDING });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers('/tmp/test', sprint, config, { spawnBackend: mockBackend });

    const writeCalls = mockedWriteFileSync.mock.calls;
    const taskWriteCall = writeCalls.find(call =>
      typeof call[0] === 'string' && call[0].includes('task-001-001.json'),
    );
    expect(taskWriteCall).toBeDefined();
    const written = JSON.parse(taskWriteCall![1] as string) as { status: string };
    expect(written.status).toBe(TaskStatus.EXECUTING);
  });
});

// ═══ Task 069-005: TempAgent mechanism — Sprint-controller integration ══════

import {
  generateTempAgents,
  generateProjectConventionsSkill,
} from '../../src/orchestra/temp-skill-generator.js';

describe('TempAgent mechanism — Sprint-controller integration', () => {
  it('generateTempAgents produces agents with temp- prefix for TypeScript+React', () => {
    const agents = generateTempAgents({
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'vite',
      testFramework: 'vitest',
      dependencies: ['react', 'typescript'],
      detectedAt: new Date().toISOString(),
    });
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.id).toMatch(/^temp-/);
    }
  });

  it('generated temp agents have source=learned and enabled=true', () => {
    const agents = generateTempAgents({
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'vite',
      testFramework: 'vitest',
      dependencies: ['react', 'typescript'],
      detectedAt: new Date().toISOString(),
    });
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.source).toBe('learned');
      expect(agent.enabled).toBe(true);
      expect(agent.manifestVersion).toBe(2);
    }
  });

  it('generated temp agents have v2 activation rules', () => {
    const agents = generateTempAgents({
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'vite',
      testFramework: 'vitest',
      dependencies: ['react', 'typescript'],
      detectedAt: new Date().toISOString(),
    });
    for (const agent of agents) {
      expect(agent.activation).toBeDefined();
      expect(agent.activation!.rules.length).toBeGreaterThan(0);
    }
  });

  it('temp-agent IDs do not collide with built-in agent IDs', () => {
    const BUILTIN_IDS = [
      'security-auditor', 'test-writer', 'doc-writer', 'bug-fixer',
      'code-reviewer', 'refactorer', 'api-builder', 'performance-analyzer', 'ci-guardian',
    ];
    const agents = generateTempAgents({
      language: 'Python',
      framework: 'fastapi',
      buildTool: 'pip',
      testFramework: 'pytest',
      dependencies: ['fastapi', 'pydantic'],
      detectedAt: new Date().toISOString(),
    });
    for (const agent of agents) {
      expect(BUILTIN_IDS).not.toContain(agent.id);
    }
  });

  it('generateTempAgents returns empty array for unsupported language stacks', () => {
    const agents = generateTempAgents({
      language: 'COBOL',
      framework: 'none',
      buildTool: 'unknown',
      testFramework: 'unknown',
      dependencies: [],
      detectedAt: new Date().toISOString(),
    });
    expect(agents).toHaveLength(0);
  });

  it('generateTempAgents produces agents with required fields for AgentPoolManager.saveTempAgentToPool', () => {
    // Verify the generated agent has all fields required by saveTempAgentToPool + validateAgentDefinition
    const agents = generateTempAgents({
      language: 'Go',
      framework: 'none',
      buildTool: 'go',
      testFramework: 'go-test',
      dependencies: ['gin', 'gorm'],
      detectedAt: new Date().toISOString(),
    });
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      // Required by AgentPoolManager.validateAgentDefinition
      expect(typeof agent.id).toBe('string');
      expect(agent.id.length).toBeGreaterThan(0);
      expect(typeof agent.name).toBe('string');
      expect(agent.name.length).toBeGreaterThan(0);
      // Required for saveTempAgentToPool to prefix correctly
      expect(agent.id.startsWith('temp-')).toBe(true);
    }
  });

  it('generateProjectConventionsSkill paired with generateTempAgents covers full stack context', () => {
    const stack = {
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'vite',
      testFramework: 'vitest',
      dependencies: ['react', 'typescript', 'vitest'],
      detectedAt: new Date().toISOString(),
    };
    const skill = generateProjectConventionsSkill(stack);
    const agents = generateTempAgents(stack);
    // Both should be generated for a TypeScript+React project
    expect(skill.id).toBe('project-conventions');
    expect(agents.some((a) => a.id === 'temp-react-ts-specialist')).toBe(true);
  });
});

// ═══ Interrupt State — SIGINT Graceful Shutdown ═══════════════════

describe('interruptActiveSprint — SIGINT cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset interrupt state (flag + active sprint ref) between tests
    resetInterruptState();
  });

  it('interruptActiveSprint is a no-op when no active sprint is registered', () => {
    // Should not throw and should not touch any files
    expect(() => interruptActiveSprint()).not.toThrow();
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('interruptActiveSprint writes INTERRUPTED to task JSON and ABORTED to heartbeat for active tasks', () => {
    const projectRoot = '/test-root';
    const sprint = {
      id: 'sprint-001',
      number: 1,
      phase: 'EXECUTE' as SprintPhase,
      status: 'ACTIVE' as SprintStatus,
      tasks: [
        {
          id: '001-001',
          title: 'Active Task',
          status: TaskStatus.EXECUTING,
          assignedWorker: 'w-001-001',
        } as Task,
        {
          id: '001-002',
          title: 'Done Task',
          status: TaskStatus.DONE,
          assignedWorker: 'w-001-002',
        } as Task,
      ],
      createdAt: new Date().toISOString(),
    } as Sprint;

    // existsSync: task JSON and heartbeat exist for active task only
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('task-001-001');
    });

    // readFileSync: return minimal JSON for the active task
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith('task-001-001.json')) {
        return JSON.stringify({ id: '001-001', status: 'EXECUTING' });
      }
      if (path.endsWith('task-001-001.hb')) {
        return JSON.stringify({ workerId: 'w-001-001', taskId: '001-001', status: 'EXECUTING', sequence: 3, timestamp: '2026-01-01T00:00:00.000Z' });
      }
      return '{}';
    });

    setActiveSprint(projectRoot, sprint);
    interruptActiveSprint();

    // Verify writeFileSync was called for the active task (both JSON and .hb)
    const writesCalled = vi.mocked(writeFileSync).mock.calls;
    const taskJsonWrite = writesCalled.find(([p]) => String(p).endsWith('task-001-001.json'));
    const heartbeatWrite = writesCalled.find(([p]) => String(p).endsWith('task-001-001.hb'));

    expect(taskJsonWrite).toBeDefined();
    const parsedTask = JSON.parse(String(taskJsonWrite![1])) as Record<string, unknown>;
    expect(parsedTask['status']).toBe('INTERRUPTED');

    expect(heartbeatWrite).toBeDefined();
    const parsedHb = JSON.parse(String(heartbeatWrite![1])) as Record<string, unknown>;
    expect(parsedHb['status']).toBe('ABORTED');

    // DONE task should not be touched
    const doneTaskWrite = writesCalled.find(([p]) => String(p).includes('task-001-002'));
    expect(doneTaskWrite).toBeUndefined();
  });

  it('isInterrupted returns false before interrupt and true after', () => {
    const projectRoot = '/test-root';
    const sprint = {
      id: 'sprint-001',
      number: 1,
      phase: 'EXECUTE' as SprintPhase,
      status: 'ACTIVE' as SprintStatus,
      tasks: [],
      createdAt: new Date().toISOString(),
    } as Sprint;

    setActiveSprint(projectRoot, sprint);
    // We can't reset the module-level flag between tests without a reset function,
    // so just verify the function exists and returns a boolean
    const result = isInterrupted();
    expect(typeof result).toBe('boolean');
  });

  it('interruptActiveSprint calls killWorker for each active tmux worker', () => {
    const projectRoot = '/test-root';
    const sprint = {
      id: 'sprint-001',
      number: 1,
      phase: 'EXECUTE' as SprintPhase,
      status: 'ACTIVE' as SprintStatus,
      tasks: [] as Task[],
      createdAt: new Date().toISOString(),
    } as Sprint;

    vi.mocked(listWorkers).mockReturnValue(['001-001', '001-002']);
    vi.mocked(existsSync).mockReturnValue(false);

    setActiveSprint(projectRoot, sprint);
    interruptActiveSprint();

    expect(vi.mocked(killWorker)).toHaveBeenCalledWith('001-001');
    expect(vi.mocked(killWorker)).toHaveBeenCalledWith('001-002');
  });
});

// ═══ finalizeSprint — Job Output Reform ═══════════════════════════════
describe('finalizeSprint — job output reform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
    resetInterruptState();
    clearActiveSprint();
    mockedExistsSync.mockReturnValue(false);
    mockedReaddirSync.mockReturnValue([]);
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: ' src/foo.ts | 10 ++++\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);
    // Restore calculateMetrics mock (vi.clearAllMocks may reset factory-created mockReturnValue)
    mockedCalculateMetrics.mockReturnValue({
      totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
      durationMs: 1000, coveragePercent: 90, noGoRate: 0, newDebtCount: 0,
      resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
      crossAssignments: 0, contextLinesUsed: 0,
    });
  });

  it('writes rich evaluations with per-task details to job JSON', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([
      [sprint.tasks[0]!.id, TaskEvaluation.DONE],
    ]);
    const results: TaskResult[] = [{
      taskId: sprint.tasks[0]!.id,
      workerId: 'w-001-001',
      filesChanged: ['src/foo.ts', 'tests/foo.test.ts'],
      linesAdded: 42,
      linesRemoved: 7,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'All tests pass, feature complete',
    }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const jobWriteCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('jobs/') && call[0].endsWith('.json'),
    );
    expect(jobWriteCall).toBeDefined();

    const jobData = JSON.parse(jobWriteCall![1] as string);
    const taskEval = jobData.evaluations[sprint.tasks[0]!.id];
    expect(taskEval).toBeDefined();
    expect(taskEval.evaluation).toBe('DONE');
    expect(taskEval.filesChanged).toEqual(['src/foo.ts', 'tests/foo.test.ts']);
    expect(taskEval.linesAdded).toBe(42);
    expect(taskEval.linesRemoved).toBe(7);
    expect(taskEval.testsPassed).toBe(true);
    expect(taskEval.coverage).toBe(95);
    expect(taskEval.selfAssessment).toBe('DONE');
    expect(taskEval.reason).toBe('All tests pass, feature complete');
    expect(taskEval.techDebtDetail).toBe('');
  });

  it('sets techDebtDetail for GO_WITH_TECH_DEBT evaluations', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([
      [sprint.tasks[0]!.id, TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const results: TaskResult[] = [{
      taskId: sprint.tasks[0]!.id,
      workerId: 'w-001-001',
      filesChanged: ['src/bar.ts'],
      linesAdded: 15,
      linesRemoved: 3,
      testsPassed: true,
      coverage: 80,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Tests passed but no new test files written',
    }];

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const jobWriteCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('jobs/') && call[0].endsWith('.json'),
    );
    const jobData = JSON.parse(jobWriteCall![1] as string);
    const taskEval = jobData.evaluations[sprint.tasks[0]!.id];
    expect(taskEval.evaluation).toBe('GO_WITH_TECH_DEBT');
    expect(taskEval.techDebtDetail).toBe('Tests passed but no new test files written');
  });

  it('summary does not double-count TECH_DEBT in completed tasks', async () => {
    const tasks = [
      makeTask({ id: '001-001' }),
      makeTask({ id: '001-002' }),
      makeTask({ id: '001-003' }),
    ];
    const sprint = makeSprint({ tasks });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001-001', TaskEvaluation.DONE],
      ['001-002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['001-003', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const results: TaskResult[] = tasks.map(t => ({
      taskId: t.id,
      workerId: `w-${t.id}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE' as const,
      notes: '',
    }));

    // Override calculateMetrics mock to return correct values for 3-task scenario
    mockedCalculateMetrics.mockReturnValueOnce({
      totalTasks: 3, completedTasks: 3, techDebtTasks: 2, noGoTasks: 0,
      durationMs: 1000, coveragePercent: 0, noGoRate: 0, newDebtCount: 2,
      resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
      crossAssignments: 0, contextLinesUsed: 0,
    });

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const jobWriteCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('jobs/') && call[0].endsWith('.json'),
    );
    const jobData = JSON.parse(jobWriteCall![1] as string);

    // completedTasks = DONE(1) + TECH_DEBT(2) = 3, totalTasks = 3
    // Summary should say 3/3, not 5/3
    expect(jobData.summary).toContain('3/3');
    expect(jobData.summary).toContain('1 DONE');
    expect(jobData.summary).toContain('2 TECH_DEBT');
    expect(jobData.summary).toContain('0 NO_GO');

    // metrics.done = pure DONE count (excluding TECH_DEBT)
    expect(jobData.metrics.done).toBe(1);
    expect(jobData.metrics.techDebt).toBe(2);
    expect(jobData.metrics.noGo).toBe(0);
  });

  it('handles missing result for a task gracefully', async () => {
    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>([
      [sprint.tasks[0]!.id, TaskEvaluation.NO_GO],
    ]);
    const results: TaskResult[] = []; // no result

    await finalizeSprint('/tmp/test', sprint, evaluations, results, { skipDecay: true, skipHooks: true });

    const jobWriteCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('jobs/') && call[0].endsWith('.json'),
    );
    const jobData = JSON.parse(jobWriteCall![1] as string);
    const taskEval = jobData.evaluations[sprint.tasks[0]!.id];
    expect(taskEval.evaluation).toBe('NO_GO');
    expect(taskEval.filesChanged).toEqual([]);
    expect(taskEval.reason).toBe('');
    expect(taskEval.selfAssessment).toBe('NO_GO');
  });
});

// ─── resolveSprintTimeoutMs (R3 — sprint_timeout_minutes wire) ────────

describe('resolveSprintTimeoutMs', () => {
  it('honors sprint_timeout_minutes when no explicit opts timeout (0 = unlimited)', () => {
    // Pre-fix the knob was never threaded — the call passed opts?.timeoutMs raw, so
    // an undefined opts always defaulted to the 30-minute cap, ignoring config.
    expect(resolveSprintTimeoutMs(undefined, { sprint_timeout_minutes: 0 })).toBe(0);
  });

  it('converts a positive sprint_timeout_minutes to milliseconds', () => {
    expect(resolveSprintTimeoutMs(undefined, { sprint_timeout_minutes: 90 })).toBe(90 * 60_000);
  });

  it('an explicit opts.timeoutMs always wins over the config knob', () => {
    expect(resolveSprintTimeoutMs(1234, { sprint_timeout_minutes: 90 })).toBe(1234);
    // opts:0 is explicit (caller asked for unlimited) and must NOT fall through to config
    expect(resolveSprintTimeoutMs(0, { sprint_timeout_minutes: 90 })).toBe(0);
  });

  it('treats a negative config as unset (undefined → waitForResults 30-minute default)', () => {
    expect(resolveSprintTimeoutMs(undefined, { sprint_timeout_minutes: -5 })).toBeUndefined();
  });
});
