/**
 * tests/orchestra/evaluate-loop-armor.test.ts — born-484 per-task fault armor
 *
 * born-484 (2026-07-03 live case): a TypeError thrown by evaluateWithRubric on
 * the FIRST collected result (codex worker's array-shaped `notes`) escaped the
 * per-task loop in runEvaluatePhase, was swallowed by the outer catch (dashboard
 * line only), and the sprint closed "0/0" while all 8 workers had delivered.
 *
 * Contract under test:
 *   1. A rubric fault on one task must NOT truncate the loop — every other
 *      task still gets a real evaluation.
 *   2. The faulted task gets an HONEST fallback: worker NO_GO stays NO_GO,
 *      anything else caps at GO_WITH_TECH_DEBT (never a fabricated DONE).
 *   3. The fault is surfaced: BRAIN→AUDITOR:EVALUATION_FAULT event is written.
 *
 * Mock scaffold mirrors evaluate-enforcement-gates.test.ts (the proven
 * runEvaluatePhase harness).
 */

// ─── Mocks (hoisted before any imports) ──────────────────────────────────────

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, debugLog: vi.fn() };
});

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    enforceHonestResultGate: vi.fn((r: unknown) => ({ result: r, honest: true })),
    classifyExitWithoutResult: vi.fn(() => ({ hasExitMarker: false })),
    buildVerifyAndCompleteGuidance: vi.fn(() => ''),
    writeHonestSentinelResult: vi.fn(),
  };
});

vi.mock('../../src/orchestra/result-promoter.js', () => ({
  attemptPartialPromotion: vi.fn(),
}));

vi.mock('../../src/agents/worker-rollback.js', () => ({
  revertFilesToHead: vi.fn(),
  rollbackWorkerScope: vi.fn(),
  snapshotWorkerScope: vi.fn(),
  dropWorkerSnapshot: vi.fn(),
  writeStashRef: vi.fn(),
  readStashRef: vi.fn(() => null),
  clearStashRef: vi.fn(),
  WorkerRollbackError: class WorkerRollbackError extends Error {},
}));

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

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

vi.mock('../../src/orchestra/sprint-spawner.js', () => ({
  applyCascadeToSprint: vi.fn(() => ({
    decision: { shouldCascade: false, category: 'RUNTIME' },
    blockedTaskIds: [] as string[],
  })),
  applyUnblockToSprint: vi.fn(() => [] as string[]),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => 'sprint-484'),
  readSequence: vi.fn(() => 0),
  readEvents: vi.fn(() => []),
  SCOPE_INSUFFICIENT_CHANNEL: 'WORKER→BRAIN:SCOPE_INSUFFICIENT',
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplashIfEnabled: vi.fn(() => ''),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig } from '../../src/core/types.js';

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `eval-armor-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'armor test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: [`docs/${id}.md`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-484',
  } as unknown as Task;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`docs/${taskId}.md`],
    linesAdded: 20,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-484',
    number: 484,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  } as unknown as Sprint;
}

const passingEvaluation: EvaluationResult = {
  decision: 'DONE',
  totalScore: 95,
  rubricScores: [{ criterion: 'correctness', score: 95, passed: true, reason: 'ok' }],
  retryCount: 0,
};

function makeConfig(): ResolvedConfig {
  return {
    language: 'en',
    deckent_style: 'sprint',
    activeModeConfig: { max_workers: 2 },
  } as unknown as ResolvedConfig;
}

// ══════════════════════════════════════════════════════════════════════════════

describe('runEvaluatePhase per-task fault armor (born-484)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a rubric TypeError on task 1 does not truncate the loop — task 2 still evaluated', async () => {
    const t1 = makeTask('484-001');
    const t2 = makeTask('484-002');
    const sprint = makeSprint([t1, t2]);
    const r1 = makeResult('484-001');
    const r2 = makeResult('484-002');

    vi.mocked(evaluateWithRubric).mockImplementation((res: TaskResult) => {
      if (res.taskId === '484-001') {
        // live born-484 shape: TypeError out of isVerificationTask
        throw new TypeError('(result.notes ?? "").toLowerCase is not a function');
      }
      return passingEvaluation;
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [r1, r2], evaluations, 90, makeConfig());

    // Loop survived: BOTH tasks have entries.
    expect(evaluations.size).toBe(2);
    expect(evaluations.get('484-002')).toBe(TaskEvaluation.DONE);
  });

  it('faulted task falls back honestly: worker DONE caps at GO_WITH_TECH_DEBT', async () => {
    const t1 = makeTask('484-001');
    const sprint = makeSprint([t1]);
    const r1 = makeResult('484-001', { selfAssessment: 'DONE' });

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [r1], evaluations, 90, makeConfig());

    expect(evaluations.get('484-001')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('faulted task with worker NO_GO stays NO_GO (no silent promotion)', async () => {
    const t1 = makeTask('484-001');
    const sprint = makeSprint([t1]);
    const r1 = makeResult('484-001', { selfAssessment: 'NO_GO' });

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [r1], evaluations, 90, makeConfig());

    expect(evaluations.get('484-001')).toBe(TaskEvaluation.NO_GO);
  });

  it('surfaces the fault as BRAIN→AUDITOR:EVALUATION_FAULT event', async () => {
    const t1 = makeTask('484-001');
    const sprint = makeSprint([t1]);
    const r1 = makeResult('484-001');

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [r1], evaluations, 90, makeConfig());

    const channels = vi.mocked(writeEvent).mock.calls.map(c => c[4]);
    expect(channels).toContain('BRAIN→AUDITOR:EVALUATION_FAULT');
  });
});
