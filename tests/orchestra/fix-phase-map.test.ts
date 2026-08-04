/**
 * FIX Phase Map Mutation Tests
 *
 * Validates that runFixPhase() correctly updates the evaluations Map
 * when fix tasks complete with different outcomes (DONE, GO_WITH_TECH_DEBT, NO_GO).
 *
 * Sprint 126 reported debt-126-001-fix: fix task success didn't update original
 * task evaluation in the Map. Sprint 127 applied the fix (sprint-phases.ts).
 * These tests verify the fix is correct and prevents regression.
 *
 * ─── REAL FILESYSTEM (FAZ4A-S4) ─────────────────────────────────────
 * The node:fs / constants / utils mocks are deliberately GONE. runFixPhase's
 * entry (`persistPhaseTransition` → `publishCanonicalRunStatusReadModel`) is an
 * atomic write→rename→readback→digest publication chain that an in-memory fs
 * mock cannot carry (RunStatusReadModelError PERSIST_FAILED — RECORDED-FAILED
 * approach, do not retry). Each test gets a fresh real scratch project root
 * under tmpdir; fix-task discovery goes through REAL `.tasks/task-*.json`
 * files and the real readJsonSafe, exactly like production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

// Real fs, mocked processes: git/tsc probes must not escape the sandbox. A bare
// vi.fn() would return undefined and crash callers reading `.status`.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
  spawn: vi.fn(),
  exec: vi.fn(),
}));

// Mock result-evaluator — HYBRID (importOriginal spread): only the rubric
// grader + spurious-NO_GO reconcile are stubbed; every other export
// (classifyFixPhaseTasks, classifyExitWithoutResult, reconstructFromDurable-
// Evidence, …) stays REAL so runFixPhase's non-rubric branches run production
// code. NOTE: pass impls directly to vi.fn(...) so vi.clearAllMocks preserves
// the passthrough (mockImplementation set later would be wiped).
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    // R8/ADR-087: spurious recovery moved to this async helper — passthrough here.
    reconcileEvaluationSpuriousNoGo: vi.fn(async (evaluation: EvaluationResult) => evaluation),
  };
});

// Mock sprint-controller — spawnWorkers, waitForResults, etc.
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(),
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: vi.fn(async () => []),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

// Mock debt-manager
vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

// Mock auditor
vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
}));

// Mock agent-pool, skill-pool, stack-detector (used in V3 reroute path)
vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));

// Mock rollback
vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn(),
  rollback: vi.fn(),
  getRollbackPolicy: vi.fn(),
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

// Mock plugin-hooks
vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

// Mock sprint-reporter
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

// Mock splash
vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
  showSplashIfEnabled: vi.fn(() => ''),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { spawnWorkers, waitForResults } from '../../src/orchestra/sprint-controller.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────

let root: string;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '129-001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeFixTask(fixForTaskId: string | undefined, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: `fix-${fixForTaskId ?? 'orphan'}`,
    title: `Fix for ${fixForTaskId ?? 'unknown'}`,
    isPriorityFix: true,
    fixForTaskId,
    status: TaskStatus.PENDING,
    ...overrides,
  });
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/test.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'OK',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-129',
    number: 129,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeConfig(): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: { max_workers: 4 },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: root,
    version: '0.4.0',
    worker_provider: 'claude',
    execution_budget: {
      roles: {
        worker: {
          default: { maxCacheReadTokens: 5_000_000, maxTurns: 48 },
        },
      },
      landing: { reserve_ratio: 0.25 },
    },
  } as ResolvedConfig;
}

function makeEvalResult(decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 90 : decision === 'GO_WITH_TECH_DEBT' ? 65 : 30,
    rubricScores: [],
    retryCount: 1,
  };
}

/** Persist a task JSON into the scratch root's real `.tasks/` directory. */
function writeTaskFile(projectRoot: string, task: Task): void {
  writeFileSync(
    join(projectRoot, '.tasks', `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8',
  );
}

function readTaskFile(projectRoot: string, taskId: string): Task {
  return JSON.parse(
    readFileSync(join(projectRoot, '.tasks', `task-${taskId}.json`), 'utf-8'),
  ) as Task;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('FIX Phase — evaluations Map mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-fpm-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('re-authorizes a dynamic Codex FIX task from owner policy before dispatch', async () => {
    const originalTask = makeTask({ id: '129-budget-origin', status: TaskStatus.NO_GO });
    const fixTask = makeFixTask('129-budget-origin', {
      id: '129-budget-origin-fix',
      model: 'gpt-5.6-sol',
      forceModel: 'gpt-5.6-sol',
      provider: 'codex',
    });
    writeTaskFile(root, fixTask);
    vi.mocked(waitForResults).mockResolvedValue([]);

    const config = {
      ...makeConfig(),
      worker_provider: 'codex',
      execution_budget: {
        roles: {
          worker: {
            default: { maxCacheReadTokens: 5_000_000, maxTurns: 48 },
          },
        },
        landing: { reserve_ratio: 0.25 },
        final_only_usage: {
          action: 'allow-wall-clock-containment',
          roles: ['worker'],
          max_wall_clock_seconds: 600,
        },
      },
    } as ResolvedConfig;

    await runFixPhase(
      root,
      makeSprint([originalTask]),
      new Map([['129-budget-origin', TaskEvaluation.NO_GO]]),
      [],
      config,
      undefined,
      'v1',
      undefined,
    );

    const expectedAuthority = {
      id: fixTask.id,
      budget: { maxCacheReadTokens: 5_000_000, maxTurns: 48 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        resolvedProvider: 'codex',
        finalOnlyUsage: {
          maxWallClockSeconds: 600,
          profileRef: 'execution_budget.final_only_usage',
        },
      },
    };
    const dispatchedSprint = vi.mocked(spawnWorkers).mock.calls[0]?.[1];
    expect(dispatchedSprint?.tasks[0]).toMatchObject(expectedAuthority);
    // Real-file proof: the exact policy snapshot is persisted back to the
    // fix task's JSON before dispatch (owner-policy re-authorization audit).
    expect(readTaskFile(root, fixTask.id)).toMatchObject(expectedAuthority);
  });

  it('returns a typed FIX failure instead of swallowing missing budget authority', async () => {
    const originalTask = makeTask({
      id: '129-hold-origin',
      status: TaskStatus.NO_GO,
    });
    const fixTask = makeFixTask('129-hold-origin', {
      id: '129-hold-origin-fix',
      model: 'gpt-5.6-sol',
      provider: 'codex',
    });
    writeTaskFile(root, fixTask);

    const config = { ...makeConfig(), execution_budget: undefined } as ResolvedConfig;
    const outcome = await runFixPhase(
      root,
      makeSprint([originalTask]),
      new Map([['129-hold-origin', TaskEvaluation.NO_GO]]),
      [],
      config,
      undefined,
      'v1',
      undefined,
    );

    expect(outcome).toEqual({
      failed: true,
      code: 'DECKENT_E077',
      message: expect.stringContaining(
        `FIX_EXECUTION_BUDGET_HOLD:${fixTask.id}:budget-policy-missing`,
      ),
      taskId: fixTask.id,
    });
    expect(spawnWorkers).not.toHaveBeenCalled();
  });

  it('dispatches only pending fix tasks owned by the current sprint namespace', async () => {
    const currentRoot = makeTask({
      id: '129-current',
      status: TaskStatus.NO_GO,
    });
    const current = makeFixTask('129-current', {
      id: '129-current-fix',
      sprintId: 'sprint-129',
    });
    const foreign = makeFixTask('128-foreign', {
      id: '128-foreign-fix',
      sprintId: 'sprint-128',
    });
    writeTaskFile(root, foreign);
    writeTaskFile(root, current);
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase(
      root,
      makeSprint([currentRoot]),
      new Map([['129-current', TaskEvaluation.NO_GO]]),
      [],
      makeConfig(),
      undefined,
      'v1',
      undefined,
    );

    const dispatchedSprint = vi.mocked(spawnWorkers).mock.calls[0]?.[1];
    expect(dispatchedSprint?.tasks.map(task => task.id)).toEqual([current.id]);
  });

  it('does not dispatch a legacy unscoped orphan fix from another run', async () => {
    const currentRoot = makeTask({
      id: '129-current',
      status: TaskStatus.NO_GO,
    });
    const current = makeFixTask('129-current', {
      id: '129-current-fix',
      sprintId: 'sprint-129',
    });
    const orphan = makeFixTask('legacy-missing-root', {
      id: 'legacy-missing-root-fix',
      sprintId: undefined,
    });
    writeTaskFile(root, orphan);
    writeTaskFile(root, current);
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase(
      root,
      makeSprint([currentRoot]),
      new Map([['129-current', TaskEvaluation.NO_GO]]),
      [],
      makeConfig(),
      undefined,
      'v1',
      undefined,
    );

    const dispatchedSprint = vi.mocked(spawnWorkers).mock.calls[0]?.[1];
    expect(dispatchedSprint?.tasks.map(task => task.id)).toEqual([current.id]);
  });

  it('fix task DONE → original task evaluation updated to DONE in Map', async () => {
    // Arrange
    const originalTask = makeTask({ id: '129-001', status: TaskStatus.DONE });
    const fixTask = makeFixTask('129-001');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('129-001', TaskEvaluation.NO_GO); // original was NO_GO

    // Real `.tasks/` directory contains the fix task JSON
    writeTaskFile(root, fixTask);

    // Mock: fix worker returns a successful result
    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);

    // Mock: evaluateWithRubric returns DONE for fix result
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act
    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — original task's evaluation should be updated to DONE
    expect(evaluations.get('129-001')).toBe(TaskEvaluation.DONE);
    // Fix task itself should also be in the Map
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.DONE);
  });

  it('fix task GO_WITH_TECH_DEBT → original task evaluation updated to GO_WITH_TECH_DEBT in Map', async () => {
    // Arrange
    const originalTask = makeTask({ id: '129-002', status: TaskStatus.NO_GO });
    const fixTask = makeFixTask('129-002');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('129-002', TaskEvaluation.NO_GO);

    writeTaskFile(root, fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'GO_WITH_TECH_DEBT' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('GO_WITH_TECH_DEBT'));

    // Act
    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — original task evaluation should now be GO_WITH_TECH_DEBT
    expect(evaluations.get('129-002')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    // Real-file proof: an accepted repair settles the logical root — the
    // original task's DONE status reaches disk (persistTaskStatus).
    expect(readTaskFile(root, originalTask.id).status).toBe(TaskStatus.DONE);
  });

  it('fix task NO_GO → original task evaluation remains unchanged (still NO_GO)', async () => {
    // Arrange
    const originalTask = makeTask({ id: '129-003', status: TaskStatus.NO_GO });
    const fixTask = makeFixTask('129-003');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('129-003', TaskEvaluation.NO_GO);

    writeTaskFile(root, fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: false, selfAssessment: 'NO_GO' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    // Act
    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — original task evaluation must NOT change (rejected repair never projects onto root)
    expect(evaluations.get('129-003')).toBe(TaskEvaluation.NO_GO);
    // Fix task's own evaluation is recorded as NO_GO
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.NO_GO);
    // Rejected repair consumes retry budget through handleEvaluation with FIX-minting authority
    expect(handleEvaluation).toHaveBeenCalledWith(
      root,
      expect.objectContaining({ id: fixTask.id }),
      TaskEvaluation.NO_GO,
      expect.objectContaining({ taskId: fixTask.id }),
      { allowPriorityFixCreation: true },
    );
  });

  it('fixForTaskId undefined → orphan is ignored without crashing', async () => {
    // Arrange — fix task with no fixForTaskId (orphan fix)
    const fixTask = makeFixTask(undefined);
    const sprint = makeSprint([]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeTaskFile(root, fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act — should not throw even though fixForTaskId is undefined
    await expect(
      runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined),
    ).resolves.not.toThrow();

    // An orphan has no current-sprint root authority and must not dispatch.
    expect(spawnWorkers).not.toHaveBeenCalled();
    expect(evaluations.size).toBe(0);
    expect(evaluations.has(undefined as unknown as string)).toBe(false);
  });

  it('evaluations Map starts empty, fix task populates correct key-value pairs', async () => {
    // Arrange — empty evaluations Map, original task not pre-registered
    const originalTask = makeTask({ id: '129-005', status: TaskStatus.NO_GO });
    const fixTask = makeFixTask('129-005');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    // Note: original task '129-005' is NOT in the Map (empty start)

    writeTaskFile(root, fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act
    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — fix task itself is recorded
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.DONE);
    // The resolved attempt projects to its logical root even if the caller's
    // Map did not pre-seed that root.
    expect(evaluations.get('129-005')).toBe(TaskEvaluation.DONE);
    expect(evaluations.size).toBe(2);
  });

  it('dispatches a fix-of-a-fix in the same run and settles one logical root', async () => {
    const originalTask = makeTask({ id: '129-chain', status: TaskStatus.NO_GO });
    const firstFix = makeFixTask(originalTask.id, {
      id: '129-chain-fix',
      sprintId: 'sprint-129',
    });
    const secondFix = makeFixTask(firstFix.id, {
      id: '129-chain-fix-fix',
      sprintId: 'sprint-129',
    });
    const evaluations = new Map([[originalTask.id, TaskEvaluation.NO_GO]]);
    const results: TaskResult[] = [];

    // Round 1 discovers only the first fix on disk. The mocked handleEvaluation
    // mirrors production debt-manager authority: it persists the settled status
    // AND — on a NO_GO with FIX-minting authority — writes the `-fix` child
    // JSON, which round 2's real readdir/readJsonSafe scan then picks up.
    writeTaskFile(root, firstFix);
    vi.mocked(handleEvaluation).mockImplementation((projectRoot, task, evaluation) => {
      task.status = evaluation === TaskEvaluation.NO_GO
        ? TaskStatus.NO_GO
        : TaskStatus.DONE;
      writeTaskFile(projectRoot, task);
      if (task.id === firstFix.id && evaluation === TaskEvaluation.NO_GO) {
        writeTaskFile(projectRoot, secondFix);
      }
      return undefined as never;
    });
    vi.mocked(waitForResults)
      .mockResolvedValueOnce([
        makeResult(firstFix.id, { testsPassed: false, selfAssessment: 'NO_GO' }),
      ])
      .mockResolvedValueOnce([
        makeResult(secondFix.id, { testsPassed: true, selfAssessment: 'DONE' }),
      ]);
    vi.mocked(evaluateWithRubric)
      .mockReturnValueOnce(makeEvalResult('NO_GO'))
      .mockReturnValueOnce(makeEvalResult('DONE'));

    await runFixPhase(
      root,
      makeSprint([originalTask]),
      evaluations,
      results,
      { ...makeConfig(), max_fix_retries: 2 } as ResolvedConfig,
      undefined,
      'v1',
      undefined,
    );

    expect(spawnWorkers).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawnWorkers).mock.calls[0]?.[1].tasks.map(task => task.id))
      .toEqual([firstFix.id]);
    expect(vi.mocked(spawnWorkers).mock.calls[1]?.[1].tasks.map(task => task.id))
      .toEqual([secondFix.id]);
    // Owner-policy re-authorization enriches disk-read FIX tasks (budget/
    // budgetPolicy) before settle, so match on identity fields, not the
    // pristine fixture object.
    expect(handleEvaluation).toHaveBeenNthCalledWith(
      1,
      root,
      expect.objectContaining({ id: firstFix.id, fixForTaskId: originalTask.id }),
      TaskEvaluation.NO_GO,
      expect.objectContaining({ taskId: firstFix.id }),
      { allowPriorityFixCreation: true },
    );
    expect(handleEvaluation).toHaveBeenNthCalledWith(
      2,
      root,
      expect.objectContaining({ id: secondFix.id, fixForTaskId: firstFix.id }),
      TaskEvaluation.DONE,
      expect.objectContaining({ taskId: secondFix.id }),
      { allowPriorityFixCreation: false },
    );
    expect(evaluations.get(originalTask.id)).toBe(TaskEvaluation.DONE);
    expect(evaluations.get(firstFix.id)).toBe(TaskEvaluation.NO_GO);
    expect(evaluations.get(secondFix.id)).toBe(TaskEvaluation.DONE);
    expect(results.map(result => result.taskId)).toEqual([firstFix.id, secondFix.id]);
    // Real-file proof: the settled chain reaches disk — root flipped DONE,
    // intermediate NO_GO attempt keeps its honest verdict.
    expect(readTaskFile(root, originalTask.id).status).toBe(TaskStatus.DONE);
    expect(readTaskFile(root, firstFix.id).status).toBe(TaskStatus.NO_GO);
    expect(existsSync(join(root, '.tasks', `task-${secondFix.id}.json`))).toBe(true);
  });
});
