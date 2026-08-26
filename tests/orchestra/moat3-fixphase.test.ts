// ─── MOAT-3 FIX-Phase Re-Dispatch Tests (Sprint 354 Task 354-010) ────────
//
// Sprint 351 (351-008) built the CLASSIFICATION half of MOAT-3's FIX story:
// `classifyFixPhaseTasks()` splits NOT_DISPATCHED tasks out of the NO_GO
// blame-fix pipeline into `reDispatchCandidateTaskIds` (see
// moat3-not-dispatched.test.ts). This suite covers the FIX-half wired in
// `runFixPhase` (src/orchestra/sprint-phases.ts): NOT_DISPATCHED tasks are
// actually re-queued for ONE honest re-dispatch attempt via the same
// spawnWorkers/waitForResults seam the "-fix" pipeline uses, capped at
// exactly one round (a disk marker prevents a second attempt across a
// resumed/re-entrant FIX phase — no infinite loop), and the provider-limit
// skipFix guard's NO_GO-only classification stays uncontaminated by
// NOT_DISPATCHED entries.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult } from '../../src/core/types.js';

// ─── Mocks (pattern mirrors tests/orchestra/fix-phase-map.test.ts) ───────
//
// REAL FILESYSTEM (FAZ4B): runFixPhase's entry (`persistPhaseTransition` →
// `publishCanonicalRunStatusReadModel`) is an atomic write→rename→readback→
// digest publication chain that an in-memory fs mock cannot carry
// (RunStatusReadModelError PERSIST_FAILED — RECORDED-FAILED approach, do not
// retry). Each test gets a fresh real scratch project root under tmpdir; the
// 1-round re-dispatch marker, .hb dispatch-trace evidence and fix-task
// discovery all go through the REAL disk, exactly like production.

// Real fs, mocked processes: git/tsc probes must not escape the sandbox. A bare
// vi.fn() would return undefined and crash callers reading `.status`.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
  spawn: vi.fn(),
  exec: vi.fn(),
}));

// Partial mock: keep the REAL pure classifiers (classifyFixPhaseTasks,
// gatherDispatchTraceEvidence, classifyMissingResultDispatch) so this suite
// exercises the actual disk-evidence logic — only the heavy/git-touching
// evaluateWithRubric + reconcileEvaluationSpuriousNoGo are stubbed.
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    // R8/ADR-087: spurious recovery is async now — async passthrough.
    reconcileEvaluationSpuriousNoGo: vi.fn(async (evaluation: EvaluationResult) => evaluation),
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
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
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
}));

// core/constants.js is REAL — a factory-mock here went stale twice (fix-phase-map
// dersi: post-485 export'u eksik eski constants mock'u 9 testi öldürdü). Real fs
// + real constants means new module-load-time constant reads can never break
// this suite silently.

// event-stream.js is mocked (unlike fix-phase-map.test.ts) so this suite can
// assert on the RE_DISPATCH_RESULT summary-counter payload directly, instead
// of relying on the real writeEvent's fail-soft try/catch swallow.
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => 'sprint-354'),
  readEvents: vi.fn(() => []),
  SCOPE_INSUFFICIENT_CHANNEL: 'WORKER→BRAIN:SCOPE_INSUFFICIENT',
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { spawnWorkers, waitForResults } from '../../src/orchestra/sprint-controller.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

let root: string;

function markerPath(taskId: string): string {
  return join(root, '.tasks', `task-${taskId}.redispatch-attempted`);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '354-777',
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
    testVerification: { applicability: 'REQUIRED', outcome: 'PASSED', commands: ['fixture-check'] },
    criteriaEvidence: [],
    techDebtCriterionIds: [],
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-354',
    number: 354,
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

function mockCollectedWave(results: TaskResult[]): void {
  vi.mocked(waitForResults).mockImplementation(async (
    _projectRoot,
    waitedSprint,
    _timeout,
    _queue,
    spawnOptions,
  ) => {
    for (const result of results) {
      const task = waitedSprint.tasks.find(candidate => candidate.id === result.taskId);
      if (task && spawnOptions?.evaluateCollectedResult) {
        await spawnOptions.evaluateCollectedResult(task, result);
      }
    }
    return results;
  });
}

function reDispatchResultEvent(): Record<string, unknown> | undefined {
  const call = vi.mocked(writeEvent).mock.calls.find(c => c[4] === 'BRAIN→WORKER:RE_DISPATCH_RESULT');
  return call?.[5] as Record<string, unknown> | undefined;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('FIX Phase — NOT_DISPATCHED re-dispatch execution (354-010)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-moat3-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('re-dispatches a NOT_DISPATCHED task via the same spawn/wait seam as the fix pipeline', async () => {
    const task = makeTask({ id: '354-777', status: TaskStatus.EXECUTING });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>([['354-777', TaskEvaluation.NOT_DISPATCHED]]);

    mockCollectedWave([makeResult('354-777')]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Re-dispatched through the real spawn seam, task status reset to PENDING
    expect(spawnWorkers).toHaveBeenCalledTimes(1);
    const spawnedSprint = vi.mocked(spawnWorkers).mock.calls[0][1] as Sprint;
    expect(spawnedSprint.tasks.map(t => t.id)).toEqual(['354-777']);
    expect(spawnedSprint.tasks[0].status).toBe(TaskStatus.PENDING);
    expect(waitForResults).toHaveBeenCalledTimes(1);

    // Honest outcome: real DONE, not a synthetic result
    expect(evaluations.get('354-777')).toBe(TaskEvaluation.DONE);

    // Marker written to the REAL disk — the one round is now spent
    expect(existsSync(markerPath('354-777'))).toBe(true);

    // Separate summary counter (goCriteria)
    expect(reDispatchResultEvent()).toMatchObject({ attempted: 1, succeeded: 1, failed: 0, stillNotDispatched: 0, exhausted: 0 });
  });

  it('second attempt with no result and no disk trace stays honestly NOT_DISPATCHED (not silently dropped)', async () => {
    const task = makeTask({ id: '354-778' });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>([['354-778', TaskEvaluation.NOT_DISPATCHED]]);

    vi.mocked(waitForResults).mockResolvedValue([]); // second dispatch also produced nothing

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(spawnWorkers).toHaveBeenCalledTimes(1);
    expect(evaluations.get('354-778')).toBe(TaskEvaluation.NOT_DISPATCHED);
    expect(reDispatchResultEvent()).toMatchObject({ attempted: 1, succeeded: 0, failed: 0, stillNotDispatched: 1 });
    // Retry budget is spent even though the round failed to dispatch again
    expect(existsSync(markerPath('354-778'))).toBe(true);
  });

  it('second attempt with no result but a disk trace (.hb) is a real NO_GO, not a dispatch gap', async () => {
    const task = makeTask({ id: '354-779' });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>([['354-779', TaskEvaluation.NOT_DISPATCHED]]);

    vi.mocked(waitForResults).mockImplementation(async () => {
      // Simulate a worker that started (left a .hb) then crashed before writing .result
      writeFileSync(join(root, '.tasks', 'task-354-779.hb'), new Date().toISOString(), 'utf-8');
      return [];
    });

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(evaluations.get('354-779')).toBe(TaskEvaluation.NO_GO);
    expect(reDispatchResultEvent()).toMatchObject({ attempted: 1, succeeded: 0, failed: 1, stillNotDispatched: 0 });
  });

  it('a task whose marker already exists is excluded — no second re-dispatch round (max-1 cap)', async () => {
    // simulates a prior FIX-phase round already spent — real marker on disk
    writeFileSync(markerPath('354-780'), new Date().toISOString(), 'utf-8');
    const task = makeTask({ id: '354-780' });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>([['354-780', TaskEvaluation.NOT_DISPATCHED]]);

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(spawnWorkers).not.toHaveBeenCalled();
    expect(waitForResults).not.toHaveBeenCalled();
    // Left untouched — still honestly NOT_DISPATCHED
    expect(evaluations.get('354-780')).toBe(TaskEvaluation.NOT_DISPATCHED);
    expect(reDispatchResultEvent()).toMatchObject({ attempted: 0, exhausted: 1 });
  });

  it('two sequential runFixPhase calls prove the 1-round cap holds (no infinite re-dispatch loop)', async () => {
    const task = makeTask({ id: '354-781' });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>([['354-781', TaskEvaluation.NOT_DISPATCHED]]);

    vi.mocked(waitForResults).mockResolvedValue([]); // never produces a result, either round

    // Round 1 — dispatch is attempted, marker gets written, stays NOT_DISPATCHED
    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);
    expect(spawnWorkers).toHaveBeenCalledTimes(1);
    expect(evaluations.get('354-781')).toBe(TaskEvaluation.NOT_DISPATCHED);

    vi.mocked(spawnWorkers).mockClear();
    vi.mocked(waitForResults).mockClear();

    // Round 2 — sprint controller re-enters FIX for the same still-NOT_DISPATCHED
    // task (e.g. a resumed sprint). The marker from round 1 must block a retry.
    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);
    expect(spawnWorkers).not.toHaveBeenCalled();
    expect(waitForResults).not.toHaveBeenCalled();
    expect(evaluations.get('354-781')).toBe(TaskEvaluation.NOT_DISPATCHED);
  });

  it('unverified provider-limit prose never suppresses an honest NOT_DISPATCHED retry', async () => {
    const noGoTask = makeTask({ id: '354-782', status: TaskStatus.NO_GO });
    const ndTasks = ['354-783', '354-784', '354-785', '354-786'].map(id => makeTask({ id }));
    const sprint = makeSprint([noGoTask, ...ndTasks]);
    const evaluations = new Map<string, TaskEvaluation>([
      ['354-782', TaskEvaluation.NO_GO],
      ['354-783', TaskEvaluation.NOT_DISPATCHED],
      ['354-784', TaskEvaluation.NOT_DISPATCHED],
      ['354-785', TaskEvaluation.NOT_DISPATCHED],
      ['354-786', TaskEvaluation.NOT_DISPATCHED],
    ]);
    const results: TaskResult[] = [
      makeResult('354-782', {
        testsPassed: false,
        selfAssessment: 'NO_GO',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        notes: 'Provider usage limit exceeded: usage_limit',
      }),
    ];
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase(root, sprint, evaluations, results, makeConfig(), undefined, 'v1', undefined);

    expect(spawnWorkers).toHaveBeenCalledTimes(1);
    const dispatchedSprint = vi.mocked(spawnWorkers).mock.calls[0]?.[1] as Sprint;
    expect(dispatchedSprint.tasks.map(task => task.id)).toEqual(ndTasks.map(task => task.id));
    expect(evaluations.get('354-782')).toBe(TaskEvaluation.NO_GO);
    for (const task of ndTasks) {
      expect(evaluations.get(task.id)).toBe(TaskEvaluation.NOT_DISPATCHED);
    }
  });

  it('redispatch proceeds normally when NO_GO entries exist but are not usage-limit-flavored', async () => {
    const noGoTask = makeTask({ id: '354-787' });
    const ndTask = makeTask({ id: '354-788' });
    const sprint = makeSprint([noGoTask, ndTask]);
    const evaluations = new Map<string, TaskEvaluation>([
      ['354-787', TaskEvaluation.NO_GO],
      ['354-788', TaskEvaluation.NOT_DISPATCHED],
    ]);
    const results: TaskResult[] = [
      makeResult('354-787', {
        testsPassed: false,
        selfAssessment: 'NO_GO',
        notes: 'TypeError: cannot read property of undefined',
      }),
    ];
    mockCollectedWave([makeResult('354-788')]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFixPhase(root, sprint, evaluations, results, makeConfig(), undefined, 'v1', undefined);

    // Re-dispatch ran, and only touched the NOT_DISPATCHED task
    expect(spawnWorkers).toHaveBeenCalledTimes(1);
    const spawnedSprint = vi.mocked(spawnWorkers).mock.calls[0][1] as Sprint;
    expect(spawnedSprint.tasks.map(t => t.id)).toEqual(['354-788']);
    expect(evaluations.get('354-788')).toBe(TaskEvaluation.DONE);
    // The real NO_GO task's evaluation is untouched by the redispatch block
    expect(evaluations.get('354-787')).toBe(TaskEvaluation.NO_GO);
  });
});
