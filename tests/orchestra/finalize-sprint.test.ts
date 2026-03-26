/**
 * tests/orchestra/finalize-sprint.test.ts
 *
 * Tests for finalizeSprint function and the deckent finalize CLI command builder.
 * Covers: sprint log writing, MEMORY.md update, RETRO.md writing,
 *         PROJECT-IDENTITY.md update, last_sprint_id config update,
 *         decay trigger, afterSprint hooks, idempotency, edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus,
} from '../../src/core/types.js';
import type { Task, Sprint, SprintMetrics, TaskResult, ResolvedConfig } from '../../src/core/types.js';

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
    getNextSprintId: vi.fn().mockReturnValue('sprint-042'),
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
    totalTasks: 3, completedTasks: 2, techDebtTasks: 1, noGoTasks: 0,
    durationMs: 60000, coveragePercent: 90, noGoRate: 0, newDebtCount: 1,
    resolvedDebtCount: 0, totalOpenDebt: 2, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
  updateProjectIdentity: vi.fn(),
}));

vi.mock('../../src/core/usage-tracker.js', () => ({
  UsageTracker: vi.fn().mockImplementation(() => ({
    recordCall: vi.fn(),
    getSprintUsage: vi.fn().mockReturnValue({ sprintId: 'sprint-042', entries: [], totalCalls: 0, totalTokens: 0, modelBreakdown: [] }),
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
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-042', branchName: 'backup', createdAt: new Date().toISOString() }),
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
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false, tscPassed: true, targetedTestsPassed: true, targetedTestFiles: [], alerts: [], testCountDelta: 0 }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true, tscPassed: true, testsPassed: true, testCount: 0, testPassed: 0, testFailed: 0, coverage: 0, baselineSaved: false }),
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

import { existsSync, readdirSync } from 'node:fs';
import { finalizeSprint } from '../../src/orchestra/sprint-controller.js';
import type { FinalizeSprintOptions } from '../../src/orchestra/sprint-controller.js';
import { writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs, updateProjectIdentity } from '../../src/orchestra/sprint-reporter.js';
import { runDecay } from '../../src/orchestra/debt-manager.js';
import { updateLastSprintId } from '../../src/core/utils.js';
import { runHooks } from '../../src/core/plugin-hooks.js';

// ─── Test Helpers ────────────────────────────────────────────────────

const PROJECT_ROOT = '/test/project';

function createTestTask(id: string, title: string = `Task ${id}`): Task {
  return {
    id,
    title,
    description: `Description for ${title}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-042',
    createdAt: new Date().toISOString(),
  };
}

function createTestResult(taskId: string, passed: boolean = true, coverage: number = 95): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/test.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: passed,
    coverage,
    selfAssessment: passed ? 'DONE' : 'NO_GO',
    notes: 'test result',
  };
}

function createTestSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-042',
    number: 42,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: new Date(Date.now() - 60000).toISOString(),
    completedAt: new Date().toISOString(),
  };
}

const defaultMetrics: SprintMetrics = {
  totalTasks: 3,
  completedTasks: 2,
  techDebtTasks: 1,
  noGoTasks: 0,
  durationMs: 60000,
  coveragePercent: 90,
  noGoRate: 0,
  newDebtCount: 1,
  resolvedDebtCount: 0,
  totalOpenDebt: 2,
  boundaryViolations: 0,
  crossAssignments: 0,
  contextLinesUsed: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('finalizeSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateMetrics).mockReturnValue({ ...defaultMetrics });
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('should return calculated metrics', async () => {
    const tasks = [createTestTask('042-001'), createTestTask('042-002')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map<string, TaskEvaluation>([
      ['042-001', TaskEvaluation.DONE],
      ['042-002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const results = [createTestResult('042-001'), createTestResult('042-002', true, 80)];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics).toBeDefined();
    expect(metrics.totalTasks).toBe(3);
    expect(vi.mocked(calculateMetrics)).toHaveBeenCalledWith(sprint, evaluations, results, []);
  });

  it('should set sprint.metrics', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(sprint.metrics).toBeDefined();
    expect(sprint.metrics?.totalTasks).toBe(3);
  });

  it('should call writeSprintLog', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(writeSprintLog)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      sprint,
      expect.objectContaining({ totalTasks: 3 }),
      evaluations,
    );
  });

  it('should call writeRetrospective (updates MEMORY.md and RETRO.md)', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(writeRetrospective)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      sprint,
      evaluations,
      expect.objectContaining({ totalTasks: 3 }),
      undefined, // no usageTracker passed
      undefined, // agentMap
      undefined, // skillMap
      results,
    );
  });

  it('should pass usageTracker to writeRetrospective when provided', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];
    const mockTracker = { recordCall: vi.fn() } as unknown as import('../../src/core/usage-tracker.js').UsageTracker;

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { usageTracker: mockTracker });

    expect(vi.mocked(writeRetrospective)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      sprint,
      evaluations,
      expect.any(Object),
      mockTracker,
      undefined, // agentMap
      undefined, // skillMap
      results,
    );
  });

  it('should call updateProjectIdentity', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(updateProjectIdentity)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      'sprint-042',
      expect.objectContaining({ totalTasks: 3 }),
      expect.any(Number),
    );
  });

  it('should call updateLastSprintId', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalledWith(PROJECT_ROOT, 'sprint-042');
  });

  it('should call runDecay', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(runDecay)).toHaveBeenCalledWith(PROJECT_ROOT, 'sprint-042');
  });

  it('should skip decay when skipDecay option is true', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { skipDecay: true });

    expect(vi.mocked(runDecay)).not.toHaveBeenCalled();
  });

  it('should run afterSprint hooks', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(runHooks)).toHaveBeenCalledWith('afterSprint', expect.objectContaining({
      hook: 'afterSprint',
      sprint,
      projectRoot: PROJECT_ROOT,
    }));
  });

  it('should skip hooks when skipHooks option is true', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { skipHooks: true });

    expect(vi.mocked(runHooks)).not.toHaveBeenCalled();
  });

  it('should call updateProjectDocs when config is provided', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];
    const config = { projectRoot: PROJECT_ROOT, projectName: 'test' } as ResolvedConfig;

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { config });

    expect(vi.mocked(updateProjectDocs)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      expect.objectContaining({ sprint, evaluations }),
      config,
    );
  });

  it('should NOT call updateProjectDocs when config is not provided', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(updateProjectDocs)).not.toHaveBeenCalled();
  });

  it('should handle empty evaluations gracefully', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map<string, TaskEvaluation>();
    const results: TaskResult[] = [];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics).toBeDefined();
    expect(vi.mocked(writeSprintLog)).toHaveBeenCalled();
    expect(vi.mocked(writeRetrospective)).toHaveBeenCalled();
  });

  it('should handle empty tasks gracefully', async () => {
    const sprint = createTestSprint([]);
    const evaluations = new Map<string, TaskEvaluation>();
    const results: TaskResult[] = [];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics).toBeDefined();
  });

  it('should survive writeSprintLog failure', async () => {
    vi.mocked(writeSprintLog).mockImplementationOnce(() => { throw new Error('disk full'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    // Should not throw
    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    // Other actions still run
    expect(vi.mocked(writeRetrospective)).toHaveBeenCalled();
    expect(vi.mocked(updateProjectIdentity)).toHaveBeenCalled();
  });

  it('should survive writeRetrospective failure', async () => {
    vi.mocked(writeRetrospective).mockImplementationOnce(() => { throw new Error('disk full'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    expect(vi.mocked(updateProjectIdentity)).toHaveBeenCalled();
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalled();
  });

  it('should survive updateProjectIdentity failure', async () => {
    vi.mocked(updateProjectIdentity).mockImplementationOnce(() => { throw new Error('write error'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalled();
    expect(vi.mocked(runDecay)).toHaveBeenCalled();
  });

  it('should survive runDecay failure', async () => {
    vi.mocked(runDecay).mockImplementationOnce(() => { throw new Error('decay error'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    expect(vi.mocked(runHooks)).toHaveBeenCalled();
  });

  it('should survive afterSprint hook failure', async () => {
    vi.mocked(runHooks).mockRejectedValueOnce(new Error('hook error'));
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
  });

  it('should count total sprints from .brain/sprints/ directory', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('sprints')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['sprint-040.md', 'sprint-041.md', 'sprint-042.md'] as unknown as ReturnType<typeof readdirSync>);

    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(updateProjectIdentity)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      'sprint-042',
      expect.any(Object),
      3, // 3 sprint files
    );
  });

  it('should be idempotent-safe: calling twice does not throw', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics1 = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    const metrics2 = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics1).toBeDefined();
    expect(metrics2).toBeDefined();
    // Both should have been called twice (idempotent = safe to call twice)
    expect(vi.mocked(writeSprintLog)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalledTimes(2);
  });

  it('should handle multiple tasks with mixed evaluations', async () => {
    const tasks = [
      createTestTask('042-001', 'Feature A'),
      createTestTask('042-002', 'Feature B'),
      createTestTask('042-003', 'Feature C'),
    ];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map<string, TaskEvaluation>([
      ['042-001', TaskEvaluation.DONE],
      ['042-002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['042-003', TaskEvaluation.NO_GO],
    ]);
    const results = [
      createTestResult('042-001', true, 95),
      createTestResult('042-002', true, 75),
      createTestResult('042-003', false, 0),
    ];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics).toBeDefined();
    expect(vi.mocked(writeRetrospective)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      sprint,
      evaluations,
      expect.any(Object),
      undefined, // no usageTracker
      undefined, // agentMap
      undefined, // skillMap
      results,
    );
  });

  it('should combine all options correctly', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];
    const config = { projectRoot: PROJECT_ROOT, projectName: 'test' } as ResolvedConfig;

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, {
      skipDecay: true,
      skipHooks: true,
      config,
    });

    expect(vi.mocked(runDecay)).not.toHaveBeenCalled();
    expect(vi.mocked(runHooks)).not.toHaveBeenCalled();
    expect(vi.mocked(updateProjectDocs)).toHaveBeenCalled();
    expect(vi.mocked(writeSprintLog)).toHaveBeenCalled();
    expect(vi.mocked(writeRetrospective)).toHaveBeenCalled();
    expect(vi.mocked(updateProjectIdentity)).toHaveBeenCalled();
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalled();
  });
});

describe('FinalizeSprintOptions type', () => {
  it('should accept empty options object', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    // Should compile and run without error
    const opts: FinalizeSprintOptions = {};
    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, opts);
    expect(metrics).toBeDefined();
  });

  it('should accept undefined options', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, undefined);
    expect(metrics).toBeDefined();
  });
});
