/**
 * Repair-wave overflow wiring regression tests.
 *
 * Real tmpdir state is used for runFixPhase's persistence boundary. Process
 * work is hermetic: spawnWorkers and waitForResults are injected seams. The
 * collector seam models slot release and dependency-aware queue selection so
 * these tests pin the queue hand-off without starting a worker process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SprintPhase,
  SprintStatus,
  TaskEvaluation,
  TaskStatus,
} from '../../src/core/types.js';
import type {
  EvaluationResult,
  ResolvedConfig,
  Sprint,
  Task,
  TaskResult,
} from '../../src/core/types.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
  spawn: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/orchestra/result-evaluator.js')
  >();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    reconcileEvaluationSpuriousNoGo: vi.fn(
      async (evaluation: EvaluationResult) => evaluation,
    ),
  };
});

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(async () => []),
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: vi.fn(async () => []),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));
vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn(),
  rollback: vi.fn(),
  getRollbackPolicy: vi.fn(),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn(() => true),
  safetyBranchExists: vi.fn(() => false),
  isGitRepo: vi.fn(() => true),
  cleanOrphanSafetyPoint: vi.fn(() => false),
  loadSafetyPoint: vi.fn(() => null),
}));
vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));
vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
  showSplashIfEnabled: vi.fn(() => ''),
}));
vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => 'sprint-704'),
  readEvents: vi.fn(() => []),
  SCOPE_INSUFFICIENT_CHANNEL: 'WORKER→BRAIN:SCOPE_INSUFFICIENT',
}));

import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import {
  spawnWorkers,
  waitForResults,
} from '../../src/orchestra/sprint-controller.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';

let root: string;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Repair overflow fixture ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [`src/${id}.ts`],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'pass',
      noGoCriteria: 'fail',
      techDebtAcceptable: 'minor',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-704',
    ...overrides,
  };
}

function makeFixTask(id: string, fixForTaskId: string, dependencies: string[] = []): Task {
  return makeTask(id, {
    isPriorityFix: true,
    fixForTaskId,
    dependencies,
  });
}

function makeResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`src/${taskId}.ts`],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'collector fixture completed',
    testVerification: {
      applicability: 'REQUIRED',
      outcome: 'PASSED',
      commands: ['fixture-check'],
    },
    criteriaEvidence: [],
    techDebtCriterionIds: [],
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-704',
    number: 704,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(task => `w-${task.id}`),
  };
}

function makeConfig(): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: { max_workers: 1 },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: root,
    version: '0.4.0',
    worker_provider: 'claude',
    max_fix_retries: 1,
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

function persistTask(task: Task): void {
  writeFileSync(
    join(root, '.tasks', `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8',
  );
}

function doneEvaluation(): EvaluationResult {
  return { decision: 'DONE', totalScore: 90, rubricScores: [], retryCount: 0 };
}

function injectCollector(dispatches: string[]): void {
  vi.mocked(waitForResults).mockImplementation(async (
    _projectRoot,
    waitedSprint,
    _timeout,
    queue,
    spawnOptions,
  ) => {
    if (queue === undefined) {
      throw new Error('repair overflow queue was discarded');
    }

    const completed = new Set<string>();
    const pending = [...queue];
    const ordered = [
      ...waitedSprint.tasks.filter(task => task.status === TaskStatus.EXECUTING),
    ];
    while (pending.length > 0) {
      const nextIndex = pending.findIndex(task =>
        (task.dependencies ?? []).every(dependency => completed.has(dependency)),
      );
      if (nextIndex < 0) break;
      const [next] = pending.splice(nextIndex, 1);
      if (next) ordered.push(next);
    }

    const results: TaskResult[] = [];
    for (const task of ordered) {
      dispatches.push(task.id);
      completed.add(task.id);
      const result = makeResult(task.id);
      await spawnOptions?.evaluateCollectedResult?.(task, result);
      results.push(result);
      // A newly completed dependency may unblock an earlier FIFO member.
      for (let index = 0; index < pending.length;) {
        const taskToCheck = pending[index];
        if (taskToCheck && (taskToCheck.dependencies ?? []).every(
          dependency => completed.has(dependency),
        )) {
          pending.splice(index, 1);
          ordered.push(taskToCheck);
        } else {
          index += 1;
        }
      }
    }
    return results;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'deckent-repair-overflow-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  vi.mocked(evaluateWithRubric).mockReturnValue(doneEvaluation());
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('runFixPhase repair overflow dispatch', () => {
  it('hands a slot-overflow FIX task to the collector and dispatches it after the slot opens', async () => {
    const original = makeTask('704-a', { status: TaskStatus.NO_GO });
    const overflowOriginal = makeTask('704-b', { status: TaskStatus.NO_GO });
    const first = makeFixTask('704-a-fix', original.id);
    const overflow = makeFixTask('704-b-fix', overflowOriginal.id);
    persistTask(first);
    persistTask(overflow);
    const dispatches: string[] = [];

    vi.mocked(spawnWorkers).mockImplementation(async (_root, wave) => {
      wave.tasks[0]!.status = TaskStatus.EXECUTING;
      return [wave.tasks[1]!];
    });
    injectCollector(dispatches);

    await runFixPhase(
      root,
      makeSprint([original, overflowOriginal]),
      new Map([
        [original.id, TaskEvaluation.NO_GO],
        [overflowOriginal.id, TaskEvaluation.NO_GO],
      ]),
      [],
      makeConfig(),
      undefined,
      'v1',
      undefined,
    );

    expect(waitForResults).toHaveBeenCalled();
    expect(vi.mocked(waitForResults).mock.calls[0]?.[3]?.map(task => task.id)).toEqual([
      overflow.id,
    ]);
    expect(dispatches).toEqual([first.id, overflow.id]);
  });

  it('hands NOT_DISPATCHED re-dispatch overflow to the collector', async () => {
    const first = makeTask('704-r1');
    const overflow = makeTask('704-r2');
    const sprint = makeSprint([first, overflow]);
    const dispatches: string[] = [];

    vi.mocked(spawnWorkers).mockImplementation(async (_root, wave) => {
      wave.tasks[0]!.status = TaskStatus.EXECUTING;
      return [wave.tasks[1]!];
    });
    injectCollector(dispatches);

    await runFixPhase(
      root,
      sprint,
      new Map([
        [first.id, TaskEvaluation.NOT_DISPATCHED],
        [overflow.id, TaskEvaluation.NOT_DISPATCHED],
      ]),
      [],
      makeConfig(),
      undefined,
      'v1',
      undefined,
    );

    expect(vi.mocked(waitForResults).mock.calls[0]?.[3]).toEqual([overflow]);
    expect(dispatches).toEqual([first.id, overflow.id]);
  });

  it('preserves queue order when an earlier dependency is not yet complete', async () => {
    const gateOriginal = makeTask('704-gate', { status: TaskStatus.NO_GO });
    const blockedOriginal = makeTask('704-blocked', { status: TaskStatus.NO_GO });
    const readyOriginal = makeTask('704-ready', { status: TaskStatus.NO_GO });
    const gate = makeFixTask('704-gate-fix', gateOriginal.id);
    const blocked = makeFixTask('704-blocked-fix', blockedOriginal.id, [gate.id]);
    const ready = makeFixTask('704-ready-fix', readyOriginal.id);
    persistTask(gate);
    persistTask(blocked);
    persistTask(ready);
    const dispatches: string[] = [];

    vi.mocked(spawnWorkers).mockImplementation(async (_root, wave) => {
      const gateInWave = wave.tasks.find(task => task.id === gate.id)!;
      gateInWave.status = TaskStatus.EXECUTING;
      return [
        wave.tasks.find(task => task.id === blocked.id)!,
        wave.tasks.find(task => task.id === ready.id)!,
      ];
    });
    injectCollector(dispatches);

    await runFixPhase(
      root,
      makeSprint([gateOriginal, blockedOriginal, readyOriginal]),
      new Map([
        [gateOriginal.id, TaskEvaluation.NO_GO],
        [blockedOriginal.id, TaskEvaluation.NO_GO],
        [readyOriginal.id, TaskEvaluation.NO_GO],
      ]),
      [],
      makeConfig(),
      undefined,
      'v1',
      undefined,
    );

    const handedOff = vi.mocked(waitForResults).mock.calls[0]?.[3];
    expect(handedOff?.map(task => task.id)).toEqual([blocked.id, ready.id]);
    expect(dispatches).toEqual([gate.id, ready.id, blocked.id]);
  });

  it('pins the fourth waitForResults argument as a defined overflow queue', async () => {
    const original = makeTask('704-pin', { status: TaskStatus.NO_GO });
    const overflowOriginal = makeTask('704-pin-2', { status: TaskStatus.NO_GO });
    const first = makeFixTask('704-pin-fix', original.id);
    const overflow = makeFixTask('704-pin-2-fix', overflowOriginal.id);
    persistTask(first);
    persistTask(overflow);
    vi.mocked(spawnWorkers).mockResolvedValue([overflow]);
    injectCollector([]);

    await runFixPhase(
      root,
      makeSprint([original, overflowOriginal]),
      new Map([
        [original.id, TaskEvaluation.NO_GO],
        [overflowOriginal.id, TaskEvaluation.NO_GO],
      ]),
      [],
      makeConfig(),
      undefined,
      'v1',
      undefined,
    );

    expect(vi.mocked(waitForResults).mock.calls[0]?.[3]).toBeDefined();
    expect(vi.mocked(waitForResults).mock.calls[0]?.[3]).toEqual([overflow]);
  });
});
