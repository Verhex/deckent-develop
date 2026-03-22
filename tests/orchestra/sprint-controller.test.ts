/**
 * tests/orchestra/sprint-controller.test.ts
 *
 * Tests for the extracted sprint-controller module.
 * Covers: cleanup, isStaleTaskFile, pauseSprint, resumeSprint,
 *         checkAndAutoPause, checkAndAutoResume, RunSprintOptions interface,
 *         PauseState, BrainError, readContext, checkUsage,
 *         adjustSprintSize, evaluateResult, isDocTask, getDefaultProvider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus, AlertLevel,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, UsageMetrics, SystemProfile, TaskResult } from '../../src/core/types.js';

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
}));

vi.mock('../../src/core/usage-tracker.js', () => ({
  UsageTracker: vi.fn().mockImplementation(() => ({
    recordCall: vi.fn(),
    getSprintUsage: vi.fn().mockReturnValue({ sprintId: 'sprint-001', entries: [], totalCalls: 0, totalTokens: 0, modelBreakdown: [] }),
    getTotalUsage: vi.fn(),
    getModelBreakdown: vi.fn().mockReturnValue([]),
    listSprints: vi.fn().mockReturnValue([]),
  })),
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
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn().mockReturnValue(null),
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ languages: [], frameworks: [], tools: [] }),
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
    loadAgents: vi.fn().mockReturnValue([]),
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
import { killWorker, listWorkers } from '../../src/orchestra/tmux.js';
import { updateDashboard } from '../../src/monitor/auditor.js';
import { releaseAllLocks } from '../../src/agents/worker.js';

import {
  cleanup,
  isStaleTaskFile,
  pauseSprint,
  resumeSprint,
  checkAndAutoPause,
  checkAndAutoResume,
  BrainError,
  isDocTask,
  evaluateResult,
  adjustSprintSize,
  checkUsage,
  getDefaultProvider,
  getChannelRegistry,
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
const mockedKillWorker = vi.mocked(killWorker);
const mockedListWorkers = vi.mocked(listWorkers);
const mockedUpdateDashboard = vi.mocked(updateDashboard);
const mockedReleaseAllLocks = vi.mocked(releaseAllLocks);

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

function makeConfig(thresholds = { '5hr': 0.8, weekly: 0.9 }): ResolvedConfig {
  return {
    projectName: 'test',
    mode: 'max_plan',
    projectRoot: '/tmp/test',
    language: 'en',
    version: '1.0.0',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'opus',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'opus',
      usage_thresholds: thresholds,
    },
    modes: {} as ResolvedConfig['modes'],
  } as ResolvedConfig;
}

function mockClaudeUsage(fiveHrPercent: number, weeklyPercent: number): void {
  mockedSpawnSync.mockReturnValue({
    status: 0,
    stdout: `5hr: ${fiveHrPercent}%\nweekly: ${weeklyPercent}%`,
    stderr: '',
    pid: 1,
    output: [],
    signal: null,
  } as ReturnType<typeof spawnSync>);
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

describe('checkAndAutoPause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('returns false when usage is below thresholds', () => {
    mockClaudeUsage(50, 60); // 50% < 80%, 60% < 90%
    const sprint = makeSprint();
    const config = makeConfig();

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('returns true and pauses when 5hr threshold exceeded', () => {
    mockClaudeUsage(85, 60); // 85% >= 80%
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('returns true and pauses when weekly threshold exceeded', () => {
    mockClaudeUsage(50, 95); // 95% >= 90%
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });
});

describe('checkAndAutoResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('returns false for non-PAUSED sprint', () => {
    mockClaudeUsage(10, 10);
    const sprint = makeSprint({ status: SprintStatus.ACTIVE });
    const config = makeConfig();

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('returns true and resumes when usage drops below resume threshold', () => {
    // Resume threshold = 80% of 0.8 = 0.64 -> need < 64%
    mockClaudeUsage(50, 50);
    const task = makeTask({ status: TaskStatus.PAUSED });
    const sprint = makeSprint({ tasks: [task], status: SprintStatus.PAUSED });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('returns false when usage is still above resume threshold', () => {
    // Resume threshold = 80% of 0.8 = 0.64 -> need < 64%, but 70% >= 64%
    mockClaudeUsage(70, 50);
    const sprint = makeSprint({ status: SprintStatus.PAUSED });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
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

describe('adjustSprintSize', () => {
  it('returns full size when no thresholds exceeded', () => {
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });
    const usage: UsageMetrics = { fiveHourPercent: 50, weeklyPercent: 50, measuredAt: new Date().toISOString() };

    const result = adjustSprintSize(config, usage);

    expect(result.size).toBe('full');
    expect(result.modelConstraint).toBeNull();
  });

  it('returns reduced size when 5hr threshold exceeded', () => {
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });
    const usage: UsageMetrics = { fiveHourPercent: 85, weeklyPercent: 50, measuredAt: new Date().toISOString() };

    const result = adjustSprintSize(config, usage);

    expect(result.size).toBe('reduced');
    expect(result.modelConstraint).toBe('sonnet');
  });

  it('returns minimal size when both thresholds exceeded', () => {
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });
    const usage: UsageMetrics = { fiveHourPercent: 85, weeklyPercent: 95, measuredAt: new Date().toISOString() };

    const result = adjustSprintSize(config, usage);

    expect(result.size).toBe('minimal');
    expect(result.maxWorkers).toBe(1);
  });
});

describe('checkUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed usage when claude CLI succeeds', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: '5hr: 42.5%\nweekly: 18.3%',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const config = makeConfig();
    const result = checkUsage(config);

    expect(result.fiveHourPercent).toBe(42.5);
    expect(result.weeklyPercent).toBe(18.3);
  });

  it('returns safe defaults when CLI fails', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const config = makeConfig();
    const result = checkUsage(config);

    expect(result.fiveHourPercent).toBe(50);
    expect(result.weeklyPercent).toBe(30);
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
