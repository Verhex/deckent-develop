/**
 * PROMOTE-W1b — Partial Promotion Wiring Tests (sprint-306, task 306-001)
 *
 * Verifies that `attemptPartialPromotion` is correctly wired into
 * `runEvaluatePhase` only for exact attempt attribution, without mutating the
 * shared Git HEAD, and that the PARTIAL_PROMOTION_APPLIED event is emitted.
 *
 * Also includes a unit test for `revertFilesToHead` in worker-rollback.ts.
 */

// ─── Mocks (must be hoisted before any imports) ──────────────────────────────

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
    verifyDiskAgainstClaim: vi.fn(() => undefined),
    classifyExitWithoutResult: vi.fn(() => ({ hasExitMarker: false })),
    buildVerifyAndCompleteGuidance: vi.fn(() => ''),
    isStubResult: vi.fn(() => false),
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
  getCurrentSprintId: vi.fn(() => 'sprint-306'),
  readSequence: vi.fn(() => 0),
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig,
} from '../../src/core/types.js';

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { evaluateWithRubric, enforceHonestResultGate } from '../../src/orchestra/result-evaluator.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { attemptPartialPromotion } from '../../src/orchestra/result-promoter.js';
import { revertFilesToHead } from '../../src/agents/worker-rollback.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `promote-w1b-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id = '306-001', overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Partial promotion test',
    model: 'sonnet',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-306',
    ...overrides,
  };
}

function makeResult(taskId = '306-001', overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [
      'src/orchestra/sprint-phases.ts',
      'src/orchestra/result-promoter.ts',
      'src/unrelated/intruder.ts',      // boundary file (C)
    ],
    linesAdded: 30,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 85,
    // Rubric-originated NO_GO: worker did not author a concrete failure veto.
    selfAssessment: 'DONE',
    notes: 'accidentally touched out-of-scope file',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${taskId}`,
      baselineRef: 'HEAD:test',
      scopeDigest: 'a'.repeat(64),
    },
    ...overrides,
  };
}

function makeSprint(tasks: Task[], id = 'sprint-306'): Sprint {
  return {
    id,
    number: 306,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeNoGoEvalResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    decision: 'NO_GO',
    totalScore: 35,
    rubricScores: [],
    retryCount: 0,
    noGoCategory: 'BOUNDARY_VIOLATION',
    filesInScope: ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'],
    filesOutOfScope: ['src/unrelated/intruder.ts'],
    isPartialPromotable: true,
    ...overrides,
  };
}

type ConfigWithPP = ResolvedConfig & { partial_promotion_enabled?: boolean };

function makeConfig(ppEnabled: boolean): ConfigWithPP {
  return {
    partial_promotion_enabled: ppEnabled,
    language: 'en',
    deckent_style: 'sprint',
    activeModeConfig: { max_workers: 2 },
  } as ConfigWithPP;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PROMOTE-W1b — partial promotion wiring in runEvaluatePhase', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
    // Default honest gate: result is genuine (honest: true)
    vi.mocked(enforceHonestResultGate).mockImplementation((r: unknown) => ({
      result: r as TaskResult,
      honest: true,
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flag-on + NO_GO + isPartialPromotable → upgrades verdict to GO_WITH_TECH_DEBT', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    // Write a .result file so EVALUATE phase can read it
    writeFileSync(
      join(root, '.tasks', `task-${task.id}.result`),
      JSON.stringify(result),
      'utf-8',
    );

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(attemptPartialPromotion).mockReturnValue({
      promoted: true,
      reason: 'partial_promotion:in_scope_work_validated',
      inScopeFiles: ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'],
      droppedFiles: ['src/unrelated/intruder.ts'],
      promotedResult: { ...result, filesChanged: ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'] },
    });

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    // Verdict must be upgraded to GO_WITH_TECH_DEBT
    expect(evaluations.get(task.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledWith(
      root, task, TaskEvaluation.GO_WITH_TECH_DEBT, expect.anything(),
      { allowPriorityFixCreation: true },
    );
  });

  // ── Proof-of-Function gate wiring (A17) — verifyProofOfFunction was zero-caller ──
  it('Tier-1 DONE task with a failing Smoke command → downgraded to GO_WITH_TECH_DEBT + PROOF_OF_FUNCTION_MISMATCH event', async () => {
    // user-surface (Tier-1) task whose Smoke command runs but cannot match the expect.
    const task = makeTask('pof-001', {
      scope: { directories: [], filesRead: [], filesWrite: ['src/api/foo.ts'] },
      smoke: { command: 'node -e ""', expect: 'DECKENT_NONEXISTENT_MARKER' },
    });
    const result = makeResult('pof-001');
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    // Rubric returns DONE; the proof-of-function gate must then downgrade because
    // the Smoke command's output never contains the expected marker.
    vi.mocked(evaluateWithRubric).mockReturnValue(
      makeNoGoEvalResult({ decision: 'DONE', noGoCategory: undefined, isPartialPromotable: false }),
    );

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(false));

    // Pre-wire: stayed DONE (verifyProofOfFunction had zero callers). Post-wire: GO_WITH_TECH_DEBT.
    expect(evaluations.get(task.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    const pofEvent = vi.mocked(writeEvent).mock.calls.find(
      c => c[4] === 'BRAIN→AUDITOR:PROOF_OF_FUNCTION_MISMATCH',
    );
    expect(pofEvent).toBeDefined();
    expect(pofEvent![5]).toMatchObject({
      taskId: task.id,
      originalVerdict: 'DONE',
      upgradedVerdict: 'GO_WITH_TECH_DEBT',
    });
  });

  it('flag-on + NO_GO + isPartialPromotable → emits PARTIAL_PROMOTION_APPLIED event', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(
      join(root, '.tasks', `task-${task.id}.result`),
      JSON.stringify(result),
      'utf-8',
    );

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(attemptPartialPromotion).mockReturnValue({
      promoted: true,
      reason: 'partial_promotion:in_scope_work_validated',
      inScopeFiles: ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'],
      droppedFiles: ['src/unrelated/intruder.ts'],
      promotedResult: { ...result, filesChanged: ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'] },
    });

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    const eventCalls = vi.mocked(writeEvent).mock.calls;
    const ppEvent = eventCalls.find(c => c[4] === 'BRAIN→AUDITOR:PARTIAL_PROMOTION_APPLIED');
    expect(ppEvent).toBeDefined();
    expect(ppEvent![5]).toMatchObject({
      taskId: task.id,
      originalVerdict: 'NO_GO',
      upgradedVerdict: 'GO_WITH_TECH_DEBT',
    });
  });

  it('flag-on + NO_GO + isPartialPromotable → never mutates shared Git HEAD', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(
      join(root, '.tasks', `task-${task.id}.result`),
      JSON.stringify(result),
      'utf-8',
    );

    const inScope = ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'];
    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(attemptPartialPromotion).mockReturnValue({
      promoted: true,
      reason: 'partial_promotion:in_scope_work_validated',
      inScopeFiles: inScope,
      droppedFiles: ['src/unrelated/intruder.ts'],
      promotedResult: { ...result, filesChanged: inScope },
    });

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it('flag-on + NO_GO + isPartialPromotable → never reverts sibling worktree files', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(
      join(root, '.tasks', `task-${task.id}.result`),
      JSON.stringify(result),
      'utf-8',
    );

    const inScope = ['src/orchestra/sprint-phases.ts', 'src/orchestra/result-promoter.ts'];
    const dropped = ['src/unrelated/intruder.ts'];
    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(attemptPartialPromotion).mockReturnValue({
      promoted: true,
      reason: 'partial_promotion:in_scope_work_validated',
      inScopeFiles: inScope,
      droppedFiles: dropped,
      promotedResult: { ...result, filesChanged: inScope },
    });

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    expect(vi.mocked(revertFilesToHead)).not.toHaveBeenCalled();
  });

  it('flag-on + ambient result never enters partial promotion', async () => {
    const task = makeTask();
    const result = makeResult('306-001', { workAttribution: undefined });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');
    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    expect(vi.mocked(attemptPartialPromotion)).not.toHaveBeenCalled();
    expect(evaluations.get(task.id)).toBe(TaskEvaluation.NO_GO);
  });

  it('flag-OFF → full NO_GO, attemptPartialPromotion NOT called', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(
      join(root, '.tasks', `task-${task.id}.result`),
      JSON.stringify(result),
      'utf-8',
    );

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(false));

    expect(evaluations.get(task.id)).toBe(TaskEvaluation.NO_GO);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledWith(
      root, task, TaskEvaluation.NO_GO, expect.anything(),
      { allowPriorityFixCreation: true },
    );
    expect(vi.mocked(attemptPartialPromotion)).not.toHaveBeenCalled();
  });

  it('flag-on + dishonest result → honest-gate lock overrides to full NO_GO', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(
      join(root, '.tasks', `task-${task.id}.result`),
      JSON.stringify(result),
      'utf-8',
    );

    // Simulate dishonest gate detecting a stub
    vi.mocked(enforceHonestResultGate).mockImplementation((r: unknown) => ({
      result: r as TaskResult,
      honest: false,
      violation: 'DISHONEST_DONE_STUB',
    }));
    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    // Honest gate overrides partial promotion: must be NO_GO
    expect(evaluations.get(task.id)).toBe(TaskEvaluation.NO_GO);
  });
});

// ─── revertFilesToHead unit tests ─────────────────────────────────────────────
// Use vi.importActual so the REAL implementation runs while node:child_process
// execFileSync is still intercepted by the module-level mock above.

describe('revertFilesToHead — git checkout HEAD per-file pattern', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls git checkout HEAD -- <path> for each file', async () => {
    const { revertFilesToHead: rtfh } = await vi.importActual<
      typeof import('../../src/agents/worker-rollback.js')
    >('../../src/agents/worker-rollback.js');
    rtfh('/repo', ['src/a.ts', 'src/b.ts']);

    const calls = vi.mocked(execFileSync).mock.calls.filter(
      c => c[0] === 'git' && Array.isArray(c[1]) && c[1].includes('checkout'),
    );
    expect(calls.length).toBe(2);
    expect(calls[0]![1]).toEqual(['checkout', 'HEAD', '--', 'src/a.ts']);
    expect(calls[1]![1]).toEqual(['checkout', 'HEAD', '--', 'src/b.ts']);
  });

  it('falls back to git clean when checkout throws (untracked file)', async () => {
    const { revertFilesToHead: rtfh } = await vi.importActual<
      typeof import('../../src/agents/worker-rollback.js')
    >('../../src/agents/worker-rollback.js');

    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('path not in HEAD');
    });

    rtfh('/repo', ['src/new-file.ts']);

    const calls = vi.mocked(execFileSync).mock.calls;
    const checkoutAttempt = calls.find(
      c => c[0] === 'git' && Array.isArray(c[1]) && c[1][0] === 'checkout',
    );
    const cleanAttempt = calls.find(
      c => c[0] === 'git' && Array.isArray(c[1]) && c[1][0] === 'clean',
    );
    expect(checkoutAttempt).toBeDefined();
    expect(cleanAttempt).toBeDefined();
  });

  it('is a no-op for empty file list', async () => {
    const { revertFilesToHead: rtfh } = await vi.importActual<
      typeof import('../../src/agents/worker-rollback.js')
    >('../../src/agents/worker-rollback.js');
    rtfh('/repo', []);
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });
});
