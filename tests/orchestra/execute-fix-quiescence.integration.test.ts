/**
 * Sprint-486 quiescence replay.
 *
 * This joins the live EXECUTE collector to the FIX dispatcher: a subscription
 * task exhausts only its own measured budget, its dependant is parked, an
 * unrelated admitted task still drains, and the resulting repair is spawned
 * and settled.  `timeoutMs: 0` is deliberate: completion must come from
 * quiescence, never from a deadline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: () => ({
    waitForChange: () => new Promise<void>(resolve => { setTimeout(resolve, 5); }),
    close: () => undefined,
  }),
}));

const { fixWait, fixSpawn } = vi.hoisted(() => ({
  fixWait: vi.fn(),
  fixSpawn: vi.fn(),
}));
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: fixSpawn,
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: fixWait,
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(), handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(), resolveDebt: vi.fn(), runDecay: vi.fn(),
}));
vi.mock('../../src/orchestra/result-evaluator.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>()),
  evaluateWithRubric: vi.fn(),
  reconcileEvaluationSpuriousNoGo: vi.fn(value => value),
}));
vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(), startScanLoop: vi.fn(), writeScanToDashboard: vi.fn(), runScanCycle: vi.fn(),
}));
vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn(() => ({ loadAgents: () => [] })),
  getAgentPrompt: vi.fn(() => ({ source: 'none', content: undefined })),
  // 524-012 moved the integrity gate onto resolvePrompt — a closed factory
  // missing it hangs the whole replay on a swallowed missing-export throw
  // (the same rot class the init-rot fix closed for node:fs mocks).
  resolvePrompt: vi.fn(() => ({
    content: '', source: 'none', degraded: true, availability: 'none',
    layer: null, blocker: 'prompt-unresolvable', declaredDigest: null, actualDigest: null,
  })),
  classifyPersonaIntegrity: vi.fn(() => 'unreadable'),
}));
vi.mock('../../src/core/skill-pool.js', () => ({ SkillPoolManager: vi.fn(() => ({ loadSkills: () => [] })) }));
vi.mock('../../src/core/stack-detector.js', () => ({ detectProjectStack: vi.fn(() => ({})) }));
vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(), runCiRegressionCheck: vi.fn(), resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(), parseTscErrorFiles: vi.fn(() => []),
}));
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({ calculateMetrics: vi.fn() }));
vi.mock('../../src/cli/helpers/splash.js', () => ({ showSplash: vi.fn(() => '') }));
vi.mock('../../src/core/notify.js', () => ({ notify: vi.fn(async () => undefined) }));

import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { ResolvedConfig, Sprint, Task, TaskResult } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
  settleTestRuntimeBudget,
} from '../helpers/budgeted-docker-execution-fixture.js';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, title: id, description: id, model: 'claude-sonnet-5', provider: 'claude', type: 'code-development',
    budget: TEST_REMOTE_EXECUTION_BUDGET, budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
    effort: 'normal', priority: 'NORMAL', reason: 'test', assignedAgent: 'frontend-designer', assignedSkills: [],
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] }, dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING, sprintId: 'sprint-486', createdAt: '2026-07-31T00:00:00.000Z',
    // Keep the replay on the injected measured backend. Without this explicit
    // backend route, the Claude adapter owns dispatch and the fixture never
    // writes the independent task's terminal result.
    backend: 'test-host-isolated',
    ...overrides,
  } as Task;
}

function result(taskId: string, selfAssessment: 'DONE' | 'NO_GO' = 'DONE'): TaskResult {
  return {
    taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0, linesRemoved: 0,
    testsPassed: selfAssessment === 'DONE', coverage: 0, selfAssessment, notes: 'test failed in replay',
    tokenUsage: {
      inputTokens: 1, outputTokens: 1, cacheReadTokens: 0,
      source: 'provider-adapter', provider: 'claude', model: 'claude-sonnet-5',
    },
    cost: { usd: 0.01, currency: 'USD', pricingSource: 'provider-envelope', isLocal: false },
  };
}

function config(root: string): ResolvedConfig {
  return {
    mode: 'balanced', activeModeConfig: { max_workers: 1 }, modes: {}, language: 'en', projectName: 'test',
    projectRoot: root, version: '0.1.0', auth_mode: 'subscription', worker_provider: 'claude',
    spawn_backend: 'test-host-isolated',
    fix_phase_enabled: true, max_fix_retries: 1,
    execution_budget: { roles: { worker: { default: TEST_REMOTE_EXECUTION_BUDGET } }, landing: { reserve_ratio: 0.25 } },
  } as ResolvedConfig;
}

describe('Sprint-486 EXECUTE/FIX quiescence replay', () => {
  let root: string;
  let spawned: string[];
  let backend: SpawnBackend;
  let previousXdgStateHome: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-486-quiescence-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    previousXdgStateHome = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = join(root, '.xdg-state');
    spawned = [];
    backend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'test-host-isolated', list: () => [], kill: vi.fn(), isAvailable: async () => true,
      spawn: (id: string) => {
        spawned.push(id);
        settleTestRuntimeBudget(root, id);
        writeFileSync(join(root, '.tasks', `task-${id}.result`), JSON.stringify(result(id)), 'utf8');
      },
    };
    fixWait.mockReset();
    fixSpawn.mockReset();
    // Row 3309 made the overflow-queue return value load-bearing (runFixPhase
    // publishes it as spawn-skip observability) — resolving undefined kills the
    // phase with `undefined.map`.
    fixSpawn.mockResolvedValue([]);
  });

  afterEach(() => {
    if (previousXdgStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousXdgStateHome;
    rmSync(root, { recursive: true, force: true });
  });

  it('drains admitted work before spawning and settling the NO_GO repair under an unlimited timeout', async () => {
    const exhausted = task('486-001', { status: TaskStatus.EXECUTING, budget: { ...TEST_REMOTE_EXECUTION_BUDGET, maxTokens: 5 } });
    // EVALUATE has already cascade-parked this dependant. EXECUTE must not
    // manufacture a result for it before handing the settled NO_GO to FIX.
    const dependant = task('486-002', { dependencies: [exhausted.id], status: TaskStatus.PAUSED });
    const independent = task('486-003', { status: TaskStatus.PENDING });
    const sprint: Sprint = {
      id: 'sprint-486', number: 486, tasks: [exhausted, dependant, independent], workers: [],
      phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE,
    } as Sprint;

    // Task-budget evidence is terminal and local to this subscription task;
    // it must not become a run-wide dispatch hold for the independent task.
    settleTestRuntimeBudget(root, exhausted.id);
    writeFileSync(join(root, '.tasks', `task-${exhausted.id}.result`), JSON.stringify(result(exhausted.id)), 'utf8');

    const evaluations = new Map<string, TaskEvaluation>();
    const executeResults = await waitForResults(
      root, sprint, 0, [independent],
      {
        spawnBackend: backend,
        autoApprove: true,
        evaluateCollectedResult: async (collectedTask, collected) => {
          const evaluation = collectedTask.id === exhausted.id
            ? TaskEvaluation.NO_GO : TaskEvaluation.DONE;
          evaluations.set(collectedTask.id, evaluation);
          return evaluation;
        },
      },
      undefined, config(root),
    );

    expect(spawned).toEqual([independent.id]);
    expect(executeResults.map(item => item.taskId).sort()).toEqual([exhausted.id, independent.id]);
    expect(evaluations.get(exhausted.id)).toBe(TaskEvaluation.NO_GO);

    expect(dependant.status).toBe(TaskStatus.PAUSED);

    const fix = task(`${exhausted.id}-fix`, { isPriorityFix: true, fixForTaskId: exhausted.id });
    writeFileSync(join(root, '.tasks', `task-${fix.id}.json`), JSON.stringify(fix), 'utf8');
    const settledFixResult = result(fix.id);
    fixWait.mockImplementation(async (...args: unknown[]) => {
      const waitedSprint = args[1] as Sprint;
      const spawnOptions = args[4] as {
        evaluateCollectedResult?: (task: Task, taskResult: TaskResult) => Promise<TaskEvaluation>;
      } | undefined;
      const waitedTask = waitedSprint.tasks.find(item => item.id === settledFixResult.taskId);
      if (waitedTask && spawnOptions?.evaluateCollectedResult) {
        await spawnOptions.evaluateCollectedResult(waitedTask, settledFixResult);
      }
      return [settledFixResult];
    });
    vi.mocked(evaluateWithRubric).mockReturnValue({ decision: 'DONE', totalScore: 100, rubricScores: [], retryCount: 0 });

    await runFixPhase(root, sprint, evaluations, executeResults, config(root), { autoApprove: true }, 'v1', backend);

    expect(fixSpawn).toHaveBeenCalledOnce();
    expect(fixSpawn.mock.calls[0]?.[1].tasks.map((item: Task) => item.id)).toEqual([fix.id]);
    expect(evaluations.get(exhausted.id)).toBe(TaskEvaluation.DONE);
  }, 10_000);
});
