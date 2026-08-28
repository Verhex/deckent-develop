/**
 * End-to-end chain seal for admitted repair overflow.
 *
 * The real FIX phase and durable queue authority are exercised against a
 * tmpdir. Only process/provider seams are replaced: the collector fixture
 * releases one slot at a time and feeds each result through the production
 * Brain-ingest callback.
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
  createSafetyPoint: vi.fn(), rollback: vi.fn(), getRollbackPolicy: vi.fn(),
  recordRollbackInDebt: vi.fn(), saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(), deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn(() => true), safetyBranchExists: vi.fn(() => false),
  isGitRepo: vi.fn(() => true), cleanOrphanSafetyPoint: vi.fn(() => false),
  loadSafetyPoint: vi.fn(() => null),
}));
vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(), runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(), parseTscErrorFiles: vi.fn(() => []),
}));
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));
vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''), showSplashIfEnabled: vi.fn(() => ''),
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
import {
  admitRepairQueueRecord,
  readRepairQueueAuthority,
  transitionRepairQueueRecord,
} from '../../src/orchestra/repair-queue-authority.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';

let root: string;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Chain-seal fixture ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-704',
    ...overrides,
  };
}

function makeFixTask(id: string, fixForTaskId: string): Task {
  return makeTask(id, { isPriorityFix: true, fixForTaskId });
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
    notes: 'hermetic collector completed repair',
    testVerification: {
      applicability: 'REQUIRED', outcome: 'PASSED', commands: ['fixture-check'],
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
    // A direct repair is logical attempt 2, so the retry ceiling must admit
    // that attempt; `1` correctly excludes every persisted `-fix` task.
    max_fix_retries: 2,
    execution_budget: {
      roles: { worker: { default: { maxCacheReadTokens: 5_000_000, maxTurns: 48 } } },
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

const BREAKER_POLICY = {
  enabled: true,
  max_fix_retries: 1,
  max_unresolved_tasks: 1,
  min_unresolved_ratio_percent: 1,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'deckent-repair-chain-seal-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  vi.mocked(evaluateWithRubric).mockReturnValue({
    decision: 'DONE', totalScore: 90, rubricScores: [], retryCount: 0,
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('repair dispatch chain seal', () => {
  it('drains every admitted overflow repair before PAUSE and preserves honest PAUSE afterward', async () => {
    const originals = ['704-a', '704-b', '704-c'].map(id =>
      makeTask(id, { status: TaskStatus.NO_GO }),
    );
    const repairs = originals.map(task => makeFixTask(`${task.id}-fix`, task.id));
    repairs.forEach(persistTask);
    const sprint = makeSprint(originals);
    const evaluations = new Map(
      originals.map(task => [task.id, TaskEvaluation.NO_GO] as const),
    );
    const dispatches: string[] = [];
    let fencedBeforeDrain = false;

    vi.mocked(spawnWorkers).mockImplementation(async (_projectRoot, wave) => {
      wave.tasks[0]!.status = TaskStatus.EXECUTING;
      return wave.tasks.slice(1);
    });
    vi.mocked(waitForResults).mockImplementation(async (
      _projectRoot,
      waitedSprint,
      _timeout,
      queue,
      spawnOptions,
    ) => {
      expect(queue?.map(task => task.id)).toEqual(repairs.slice(1).map(task => task.id));
      expect(readRepairQueueAuthority(root).records).toMatchObject([
        { taskId: repairs[0]!.id, dispatchStatus: 'dispatched' },
        ...repairs.slice(1).map(task => ({
          taskId: task.id,
          dispatchStatus: 'queued' as const,
        })),
      ]);

      expect(sprint.status).not.toBe(SprintStatus.PAUSED);
      fencedBeforeDrain = true;

      const ordered = [
        ...waitedSprint.tasks.filter(task => task.status === TaskStatus.EXECUTING),
        ...(queue ?? []),
      ];
      const results: TaskResult[] = [];
      for (const task of ordered) {
        dispatches.push(task.id);
        const result = makeResult(task.id);
        await spawnOptions?.evaluateCollectedResult?.(task, result);
        results.push(result);
      }
      return results;
    });

    const fixOutcome = await runFixPhase(
      root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined,
    );

    expect(fixOutcome).toBeUndefined();
    expect(fencedBeforeDrain).toBe(true);
    expect(dispatches).toEqual(repairs.map(task => task.id));
    expect(readRepairQueueAuthority(root).records).toMatchObject(
      repairs.map(task => ({ taskId: task.id, dispatchStatus: 'settled' })),
    );
    expect(sprint.status).not.toBe(SprintStatus.PAUSED);

    const {
      applyCascadeCircuitBreaker,
      resolveRepairQuiescence,
    } = await vi.importActual<
      typeof import('../../src/orchestra/sprint-controller.js')
    >('../../src/orchestra/sprint-controller.js');
    const fence = admitRepairQueueRecord(root, {
      taskId: '704-fenced-repair',
      sprintId: 'sprint-704',
      birthClass: 'FIX',
      admittedAt: '2026-08-28T00:00:00.000Z',
      attempt: { attemptId: '704-fenced-repair', ordinal: 1 },
    });
    const notDrained = resolveRepairQuiescence(root);
    expect(notDrained).toMatchObject({
      kind: 'DRAIN_REQUIRED', pendingQueueCount: 1,
    });
    expect(applyCascadeCircuitBreaker(
      root, sprint, evaluations, BREAKER_POLICY, 'en', notDrained,
    )).toBe(false);
    expect(sprint.status).not.toBe(SprintStatus.PAUSED);
    transitionRepairQueueRecord(root, fence.queueId, 'dispatched');
    transitionRepairQueueRecord(root, fence.queueId, 'settled');
    expect(resolveRepairQuiescence(root)).toMatchObject({ kind: 'QUIESCENT' });

    const impossible = makeTask('704-impossible', { status: TaskStatus.NO_GO });
    const honestPauseSprint = makeSprint([impossible]);
    const unresolved = new Map([[impossible.id, TaskEvaluation.NO_GO]]);
    const drained = resolveRepairQuiescence(root);
    expect(applyCascadeCircuitBreaker(
      root, honestPauseSprint, unresolved, BREAKER_POLICY, 'en', drained,
    )).toBe(true);
    expect(honestPauseSprint.status).toBe(SprintStatus.PAUSED);
  });
});
