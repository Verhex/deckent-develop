/**
 * tests/orchestra/sprint-phases-fix.test.ts
 *
 * Tests for runFixPhase() evaluations Map update fix (Sprint 126, Task 1).
 * Verifies that after FIX phase, evaluations Map is correctly updated:
 *   - Successful fix → original task evaluation updated from NO_GO
 *   - Failed fix → original task evaluation remains NO_GO
 *   - Fix task without fixForTaskId → only fix task's own evaluation set
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Module Mocks ───────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    readJsonSafe: vi.fn(),
    parseDebtTable: vi.fn().mockReturnValue([]),
    debugLog: vi.fn(),
    countBrainLines: vi.fn().mockReturnValue(100),
    getNextSprintId: vi.fn().mockReturnValue('sprint-001'),
    updateLastSprintId: vi.fn(),
  };
});

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false, tscPassed: true, targetedTestsPassed: true, alerts: [] }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true }),
  parseTscErrorFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(setInterval(() => {}, 99999)),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
  resetDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ languages: [], frameworks: [], tools: [] }),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: (
    sprint: { id?: string; startedAt?: string; completedAt?: string },
    evaluations: Map<string, string>,
    results: { coverage: number }[],
    debt?: { resolved?: boolean; resolvedInSprintId?: string }[],
  ) => {
    let completedTasks = 0, techDebtTasks = 0, noGoTasks = 0;
    for (const ev of evaluations.values()) {
      if (ev === 'DONE') completedTasks++;
      else if (ev === 'GO_WITH_TECH_DEBT') { completedTasks++; techDebtTasks++; }
      else if (ev === 'NO_GO') noGoTasks++;
    }
    const totalTasks = evaluations.size;
    const coveragePercent = results.length > 0
      ? results.reduce((sum, r) => sum + r.coverage, 0) / results.length : 0;
    const noGoRate = totalTasks > 0 ? (noGoTasks / totalTasks) * 100 : 0;
    const startTime = sprint.startedAt ? new Date(sprint.startedAt).getTime() : Date.now();
    const endTime = sprint.completedAt ? new Date(sprint.completedAt).getTime() : Date.now();
    return {
      totalTasks, completedTasks, techDebtTasks, noGoTasks,
      durationMs: endTime - startTime, coveragePercent, noGoRate,
      newDebtCount: techDebtTasks,
      resolvedDebtCount: debt ? debt.filter(d => d.resolved && d.resolvedInSprintId === sprint.id).length : 0,
      totalOpenDebt: debt ? debt.filter(d => !d.resolved).length : 0,
      boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
    };
  },
  getPostFixEvaluationSummary: (evaluations: Map<string, string>) => {
    let done = 0, techDebt = 0, noGo = 0;
    for (const ev of evaluations.values()) {
      if (ev === 'DONE') done++;
      else if (ev === 'GO_WITH_TECH_DEBT') techDebt++;
      else noGo++;
    }
    return { done, techDebt, noGo, total: evaluations.size };
  },
}));

const mockEvaluateWithRubric = vi.fn().mockReturnValue({ decision: 'DONE', score: 100, criteria: [] });
vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  evaluateWithRubric: mockEvaluateWithRubric,
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'backup', createdAt: new Date().toISOString() }),
  rollback: vi.fn().mockReturnValue({ success: true }),
  getRollbackPolicy: vi.fn().mockReturnValue('skip'),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  TmuxBackend: vi.fn(),
  SubprocessBackend: vi.fn(),
  SpawnBackendFactory: { create: vi.fn() },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn().mockReturnValue(null),
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    hasProvider: vi.fn().mockReturnValue(false),
    listProviders: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../src/orchestra/task-router.js', () => ({
  routeTask: vi.fn().mockReturnValue({ provider: 'claude', agent: 'generic', skills: [], reason: 'default' }),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/orchestra/model-selector.js', () => ({
  resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  createTask: vi.fn(),
  buildWorkerPrompt: vi.fn().mockReturnValue('prompt'),
  parseStructuredDirectives: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    platform: 'linux', hasTmux: true, recommendedMaxWorkers: 4,
    cpuCores: 4, totalMemMB: 16000, freeMemMB: 8000,
  }),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

// Mock sprint-controller BEFORE importing sprint-phases
const mockEvaluateResult = vi.fn();
const mockWaitForResults = vi.fn();
const mockSpawnWorkers = vi.fn();

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error { code: string; constructor(m: string, c: string) { super(m); this.code = c; } },
  readContext: vi.fn().mockReturnValue({ memory: '', retro: '', debt: [], patterns: { active: [], resolved: [] }, decisions: '' }),
  planSprint: vi.fn().mockResolvedValue([]),
  writeSprintState: vi.fn(),
  spawnWorkers: mockSpawnWorkers,
  buildSpawnRetryHint: vi.fn().mockReturnValue(''),
  evaluateResult: mockEvaluateResult,
  waitForResults: mockWaitForResults,
  finalizeSprint: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn(),
}));

// ─── Import SUT after all mocks ────────────────────────────────────
import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { readdirSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import { handleEvaluation, handleCrossDependencies, escalateDebt, resolveDebt } from '../../src/orchestra/debt-manager.js';
import { calculateMetrics, getPostFixEvaluationSummary } from '../../src/orchestra/sprint-reporter.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-126',
    createdAt: '2026-04-09T00:00:00.000Z',
    ...overrides,
  } as Task;
}

function makeFixTask(id: string, fixForTaskId: string | undefined, overrides: Partial<Task> = {}): Task {
  return makeTask(id, {
    isPriorityFix: true,
    fixForTaskId,
    status: TaskStatus.PENDING,
    ...overrides,
  } as Partial<Task>);
}

function makeResult(taskId: string, selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/test.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: selfAssessment !== 'NO_GO',
    coverage: selfAssessment === 'DONE' ? 95 : 0,
    selfAssessment,
    notes: '',
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-126',
    status: SprintStatus.EVALUATING,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: '2026-04-09T00:00:00.000Z',
    config: {} as ResolvedConfig,
  } as Sprint;
}

function makeConfig(): ResolvedConfig {
  return {
    coverage_threshold: 90,
    max_workers: 4,
  } as unknown as ResolvedConfig;
}

// ═══ Tests ══════════════════════════════════════════════════════════

describe('runFixPhase — evaluations Map update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no fix tasks found on disk
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('updates original task evaluation from NO_GO to DONE when fix succeeds', async () => {
    const originalTask = makeTask('126-001');
    const fixTask = makeFixTask('126-001-fix', '126-001');

    // Setup: readdirSync returns fix task file, readJsonSafe returns fix task
    vi.mocked(readdirSync).mockReturnValue(['task-126-001-fix.json' as unknown as import('node:fs').Dirent]);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    // waitForResults returns successful fix result
    const fixResult = makeResult('126-001-fix', 'DONE');
    mockWaitForResults.mockResolvedValue([fixResult]);

    // evaluateWithRubric returns DONE for fix
    mockEvaluateWithRubric.mockReturnValue({ decision: 'DONE', score: 100, criteria: [] });

    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('126-001', TaskEvaluation.NO_GO); // Original was NO_GO
    const results: TaskResult[] = [];
    const sprint = makeSprint([originalTask]);

    await runFixPhase('/tmp/test', sprint, evaluations, results, makeConfig(), undefined, 'v1', undefined);

    // Original task evaluation should be updated to DONE
    expect(evaluations.get('126-001')).toBe(TaskEvaluation.DONE);
    // Fix task should also have its own evaluation
    expect(evaluations.get('126-001-fix')).toBe(TaskEvaluation.DONE);
  });

  it('updates original task evaluation to GO_WITH_TECH_DEBT when fix partially succeeds', async () => {
    const originalTask = makeTask('126-002');
    const fixTask = makeFixTask('126-002-fix', '126-002');

    vi.mocked(readdirSync).mockReturnValue(['task-126-002-fix.json' as unknown as import('node:fs').Dirent]);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult('126-002-fix', 'GO_WITH_TECH_DEBT');
    mockWaitForResults.mockResolvedValue([fixResult]);

    mockEvaluateWithRubric.mockReturnValue({ decision: 'GO_WITH_TECH_DEBT', score: 60, criteria: [] });

    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('126-002', TaskEvaluation.NO_GO);
    const sprint = makeSprint([originalTask]);

    await runFixPhase('/tmp/test', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(evaluations.get('126-002')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(evaluations.get('126-002-fix')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('does NOT update original task evaluation when fix fails (NO_GO)', async () => {
    const originalTask = makeTask('126-003');
    const fixTask = makeFixTask('126-003-fix', '126-003');

    vi.mocked(readdirSync).mockReturnValue(['task-126-003-fix.json' as unknown as import('node:fs').Dirent]);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult('126-003-fix', 'NO_GO');
    mockWaitForResults.mockResolvedValue([fixResult]);

    mockEvaluateWithRubric.mockReturnValue({ decision: 'NO_GO', score: 20, criteria: [] });

    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('126-003', TaskEvaluation.NO_GO);
    const sprint = makeSprint([originalTask]);

    await runFixPhase('/tmp/test', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Original task evaluation should remain NO_GO
    expect(evaluations.get('126-003')).toBe(TaskEvaluation.NO_GO);
    // Fix task should still get its own evaluation
    expect(evaluations.get('126-003-fix')).toBe(TaskEvaluation.NO_GO);
  });

  it('handles fix task without fixForTaskId — only sets fix task evaluation', async () => {
    const fixTask = makeFixTask('126-004-fix', undefined);

    vi.mocked(readdirSync).mockReturnValue(['task-126-004-fix.json' as unknown as import('node:fs').Dirent]);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult('126-004-fix', 'DONE');
    mockWaitForResults.mockResolvedValue([fixResult]);

    mockEvaluateWithRubric.mockReturnValue({ decision: 'DONE', score: 100, criteria: [] });

    const evaluations = new Map<string, TaskEvaluation>();
    const sprint = makeSprint([]);

    await runFixPhase('/tmp/test', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Fix task should have its own evaluation
    expect(evaluations.get('126-004-fix')).toBe(TaskEvaluation.DONE);
    // No other evaluations should be set (no original task)
    expect(evaluations.size).toBe(1);
  });

  it('does not update original when fixForTaskId is not in evaluations Map', async () => {
    const fixTask = makeFixTask('126-005-fix', '126-999'); // refers to non-existent task

    vi.mocked(readdirSync).mockReturnValue(['task-126-005-fix.json' as unknown as import('node:fs').Dirent]);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult('126-005-fix', 'DONE');
    mockWaitForResults.mockResolvedValue([fixResult]);

    mockEvaluateWithRubric.mockReturnValue({ decision: 'DONE', score: 100, criteria: [] });

    const evaluations = new Map<string, TaskEvaluation>();
    // Note: '126-999' is NOT in evaluations
    const sprint = makeSprint([]);

    await runFixPhase('/tmp/test', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Fix task gets its own evaluation
    expect(evaluations.get('126-005-fix')).toBe(TaskEvaluation.DONE);
    // Non-existent original should NOT be added
    expect(evaluations.has('126-999')).toBe(false);
    expect(evaluations.size).toBe(1);
  });

  it('calls resolveDebt only when fix eval is DONE (not GO_WITH_TECH_DEBT)', async () => {
    const originalTask = makeTask('126-006');
    const fixTask = makeFixTask('126-006-fix', '126-006');

    vi.mocked(readdirSync).mockReturnValue(['task-126-006-fix.json' as unknown as import('node:fs').Dirent]);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult('126-006-fix', 'GO_WITH_TECH_DEBT');
    mockWaitForResults.mockResolvedValue([fixResult]);

    mockEvaluateWithRubric.mockReturnValue({ decision: 'GO_WITH_TECH_DEBT', score: 60, criteria: [] });

    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('126-006', TaskEvaluation.NO_GO);
    const sprint = makeSprint([originalTask]);

    await runFixPhase('/tmp/test', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // resolveDebt should NOT be called for GO_WITH_TECH_DEBT
    expect(resolveDebt).not.toHaveBeenCalled();
    // But evaluation update should still happen
    expect(evaluations.get('126-006')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('does nothing when no fix tasks exist', async () => {
    vi.mocked(readdirSync).mockReturnValue([]);

    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('126-001', TaskEvaluation.NO_GO);
    const sprint = makeSprint([]);

    await runFixPhase('/tmp/test', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Evaluations should remain unchanged
    expect(evaluations.get('126-001')).toBe(TaskEvaluation.NO_GO);
    expect(evaluations.size).toBe(1);
    // spawnWorkers should not be called
    expect(mockSpawnWorkers).not.toHaveBeenCalled();
  });
});


// ═══ getPostFixEvaluationSummary Tests ═════════════════════════════

describe('getPostFixEvaluationSummary', () => {
  it('returns correct counts for mixed evaluations', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('001', TaskEvaluation.DONE);
    evaluations.set('002', TaskEvaluation.GO_WITH_TECH_DEBT);
    evaluations.set('003', TaskEvaluation.NO_GO);

    const summary = getPostFixEvaluationSummary(evaluations);

    expect(summary).toEqual({ done: 1, techDebt: 1, noGo: 1, total: 3 });
  });

  it('returns all zeros for empty Map', () => {
    const evaluations = new Map<string, TaskEvaluation>();

    const summary = getPostFixEvaluationSummary(evaluations);

    expect(summary).toEqual({ done: 0, techDebt: 0, noGo: 0, total: 0 });
  });

  it('returns correct counts when all tasks are NO_GO', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('001', TaskEvaluation.NO_GO);
    evaluations.set('002', TaskEvaluation.NO_GO);
    evaluations.set('003', TaskEvaluation.NO_GO);

    const summary = getPostFixEvaluationSummary(evaluations);

    expect(summary).toEqual({ done: 0, techDebt: 0, noGo: 3, total: 3 });
  });

  it('returns correct counts when all tasks are DONE', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('001', TaskEvaluation.DONE);
    evaluations.set('002', TaskEvaluation.DONE);
    evaluations.set('003', TaskEvaluation.DONE);

    const summary = getPostFixEvaluationSummary(evaluations);

    expect(summary).toEqual({ done: 3, techDebt: 0, noGo: 0, total: 3 });
  });

  it('handles post-FIX scenario: 2 NO_GO → DONE after fix', () => {
    // Simulate: start with 2 NO_GO + 1 DONE, then FIX converts both NO_GO → DONE
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('001', TaskEvaluation.NO_GO);
    evaluations.set('002', TaskEvaluation.NO_GO);
    evaluations.set('003', TaskEvaluation.DONE);

    // Before FIX
    let summary = getPostFixEvaluationSummary(evaluations);
    expect(summary).toEqual({ done: 1, techDebt: 0, noGo: 2, total: 3 });

    // Simulate FIX phase updating evaluations
    evaluations.set('001', TaskEvaluation.DONE);
    evaluations.set('002', TaskEvaluation.DONE);

    // After FIX
    summary = getPostFixEvaluationSummary(evaluations);
    expect(summary).toEqual({ done: 3, techDebt: 0, noGo: 0, total: 3 });
  });
});


// ═══ calculateMetrics — post-FIX evaluation integration ═══════════

describe('calculateMetrics — post-FIX evaluations', () => {
  it('reflects updated evaluations after FIX phase', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('001', TaskEvaluation.DONE);
    evaluations.set('002', TaskEvaluation.DONE);
    evaluations.set('003', TaskEvaluation.DONE);

    const sprint = makeSprint([makeTask('001'), makeTask('002'), makeTask('003')]);
    sprint.startedAt = '2026-04-09T00:00:00.000Z';
    sprint.completedAt = '2026-04-09T00:10:00.000Z';

    const results = [
      makeResult('001', 'DONE'),
      makeResult('002', 'DONE'),
      makeResult('003', 'DONE'),
    ];

    const metrics = calculateMetrics(sprint, evaluations, results);

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.completedTasks).toBe(3);
    expect(metrics.noGoTasks).toBe(0);
    expect(metrics.noGoRate).toBe(0);
  });

  it('shows correct metrics with mixed post-FIX evaluations', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('001', TaskEvaluation.DONE);
    evaluations.set('002', TaskEvaluation.GO_WITH_TECH_DEBT);
    evaluations.set('003', TaskEvaluation.NO_GO);

    const sprint = makeSprint([makeTask('001'), makeTask('002'), makeTask('003')]);
    sprint.startedAt = '2026-04-09T00:00:00.000Z';
    sprint.completedAt = '2026-04-09T00:10:00.000Z';

    const results = [
      makeResult('001', 'DONE'),
      makeResult('002', 'GO_WITH_TECH_DEBT'),
      makeResult('003', 'NO_GO'),
    ];

    const metrics = calculateMetrics(sprint, evaluations, results);

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.completedTasks).toBe(2); // DONE + GO_WITH_TECH_DEBT
    expect(metrics.techDebtTasks).toBe(1);
    expect(metrics.noGoTasks).toBe(1);
    expect(metrics.noGoRate).toBeCloseTo(33.33, 1);
  });

  it('calculates zero metrics for empty evaluations', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    const sprint = makeSprint([]);
    sprint.startedAt = '2026-04-09T00:00:00.000Z';
    sprint.completedAt = '2026-04-09T00:10:00.000Z';

    const metrics = calculateMetrics(sprint, evaluations, []);

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.noGoTasks).toBe(0);
    expect(metrics.noGoRate).toBe(0);
  });
});
