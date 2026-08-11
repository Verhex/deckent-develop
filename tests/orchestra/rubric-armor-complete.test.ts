/**
 * tests/orchestra/rubric-armor-complete.test.ts — 369-001 RUBRIC-ARMOR-COMPLETE
 *
 * born-484 armor (see evaluate-loop-armor.test.ts) previously guarded only the
 * main EVALUATE per-task loop's `evaluateWithRubric` call. Four other call
 * sites in sprint-phases.ts had the SAME class of bug (a rubric fault escapes
 * uncaught into an outer catch, truncating whatever loop it ran in): the
 * extension-hit late-result path, the alive-grace-result path, the FIX-phase
 * re-eval, and the NOT_DISPATCHED re-dispatch re-eval. 369-001 extracted the
 * armor into a single `safeRubricReconcile` helper shared by every call site.
 *
 * This suite covers the two call sites the task explicitly requires new
 * coverage for: the EVALUATE-phase extension-hit path (runEvaluatePhase) and
 * the FIX-phase re-eval path (runFixPhase). Both mirror evaluate-loop-armor's
 * contract:
 *   1. A rubric fault on one task must NOT truncate the loop — every other
 *      task still gets a real evaluation.
 *   2. The faulted task gets an HONEST fallback: worker NO_GO stays NO_GO,
 *      anything else caps at GO_WITH_TECH_DEBT (never a fabricated DONE).
 *   3. The fault is surfaced: BRAIN→AUDITOR:EVALUATION_FAULT event is written.
 *
 * Mock scaffold merges evaluate-loop-armor.test.ts (runEvaluatePhase harness)
 * and fix-phase-map.test.ts (runFixPhase harness) — both call sites live in
 * the same module and share the same transitive mock surface.
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
  getCurrentSprintId: vi.fn(() => 'sprint-369'),
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

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';

import { runEvaluatePhase, runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `rubric-armor-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'rubric armor test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: [`docs/${id}.md`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-369',
    ...overrides,
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
    id: 'sprint-369',
    number: 369,
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

function makeEvalResult(decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 90 : decision === 'GO_WITH_TECH_DEBT' ? 65 : 30,
    rubricScores: [],
    retryCount: 1,
  };
}

/** Config granting a runtime extension unconditionally (fresh heartbeat, empty state map). */
function makeExtensionConfig(): ResolvedConfig {
  return {
    language: 'en',
    deckent_style: 'sprint',
    activeModeConfig: { max_workers: 2 },
    timeout: { runtime_extension_enabled: true },
  } as unknown as ResolvedConfig;
}

function makeFixConfig(): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: { max_workers: 4 },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test-project',
    version: '0.4.0',
    // Dynamic FIX tasks are re-authorized from owner policy before dispatch;
    // a missing execution_budget is a typed budget-policy hold (DECKENT_E077)
    // that would fail the whole phase before the rubric armor ever runs.
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

/** Fresh heartbeat so evaluateRuntimeExtension grants an extension. */
function writeHeartbeat(root: string, taskId: string): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.hb`),
    JSON.stringify({
      workerId: `w-${taskId}`, taskId, status: 'EXECUTING', sequence: 1,
      timestamp: new Date().toISOString(),
    }),
    'utf-8',
  );
}

/** Pre-writes the .result file so pollForResultFile resolves on its first disk check. */
function writeResultFile(root: string, taskId: string, result: TaskResult): void {
  writeFileSync(join(root, TASKS_DIR, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
}

/** Writes a PENDING fix-task JSON so runFixPhase's disk scan discovers it. */
function writeFixTaskFile(root: string, task: Task): void {
  writeFileSync(join(root, TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task), 'utf-8');
}

function makeFixTask(id: string, fixForTaskId: string, overrides: Partial<Task> = {}): Task {
  return makeTask(id, {
    title: `Fix for ${fixForTaskId}`,
    isPriorityFix: true,
    fixForTaskId,
    status: TaskStatus.PENDING,
    ...overrides,
  } as Partial<Task>);
}

// ══════════════════════════════════════════════════════════════════════════════

describe('runEvaluatePhase extension-hit fault armor (369-001)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a rubric TypeError on the extension-hit late-result does not truncate the loop — sibling task still evaluated', async () => {
    const tExt = makeTask('369-ext-1');
    const tNormal = makeTask('369-ext-2');
    const sprint = makeSprint([tExt, tNormal]);

    writeHeartbeat(root, tExt.id);
    writeResultFile(root, tExt.id, makeResult(tExt.id, { selfAssessment: 'DONE' }));
    const normalResult = makeResult(tNormal.id);

    vi.mocked(evaluateWithRubric).mockImplementation((res: TaskResult) => {
      if (res.taskId === tExt.id) {
        // live born-484 shape: TypeError out of isVerificationTask
        throw new TypeError('(result.notes ?? "").toLowerCase is not a function');
      }
      return passingEvaluation;
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [normalResult], evaluations, 90, makeExtensionConfig(), new Map());

    // Loop survived: BOTH tasks have entries.
    expect(evaluations.size).toBe(2);
    expect(evaluations.get(tNormal.id)).toBe(TaskEvaluation.DONE);
  });

  it('extension-hit fault falls back honestly: worker DONE caps at GO_WITH_TECH_DEBT', async () => {
    const tExt = makeTask('369-ext-3');
    const sprint = makeSprint([tExt]);

    writeHeartbeat(root, tExt.id);
    writeResultFile(root, tExt.id, makeResult(tExt.id, { selfAssessment: 'DONE' }));

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [], evaluations, 90, makeExtensionConfig(), new Map());

    expect(evaluations.get(tExt.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('extension-hit fault with worker NO_GO stays NO_GO (no silent promotion)', async () => {
    const tExt = makeTask('369-ext-4');
    const sprint = makeSprint([tExt]);

    writeHeartbeat(root, tExt.id);
    writeResultFile(root, tExt.id, makeResult(tExt.id, { selfAssessment: 'NO_GO', testsPassed: false }));

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [], evaluations, 90, makeExtensionConfig(), new Map());

    expect(evaluations.get(tExt.id)).toBe(TaskEvaluation.NO_GO);
  });

  it('surfaces the extension-hit fault as BRAIN→AUDITOR:EVALUATION_FAULT', async () => {
    const tExt = makeTask('369-ext-5');
    const sprint = makeSprint([tExt]);

    writeHeartbeat(root, tExt.id);
    writeResultFile(root, tExt.id, makeResult(tExt.id));

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [], evaluations, 90, makeExtensionConfig(), new Map());

    const faultCall = vi.mocked(writeEvent).mock.calls.find(c => c[4] === 'BRAIN→AUDITOR:EVALUATION_FAULT');
    expect(faultCall).toBeDefined();
    expect((faultCall?.[5] as Record<string, unknown>)?.taskId).toBe(tExt.id);
  });
});

describe('runFixPhase re-eval fault armor (369-001)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a rubric TypeError on one fix task does not truncate the FIX loop — sibling fix task still evaluated', async () => {
    const fixA = makeFixTask('369-fix-a', '369-orig-a');
    const fixB = makeFixTask('369-fix-b', '369-orig-b');
    writeFixTaskFile(root, fixA);
    writeFixTaskFile(root, fixB);
    // Lineage-membership gate: a pending FIX child is only selected when its
    // ancestor root is a member of the CURRENT sprint and already terminal
    // (parent NO_GO — a stale child may never race an in-flight ancestor).
    const sprint = makeSprint([
      makeTask('369-orig-a', { status: TaskStatus.NO_GO }),
      makeTask('369-orig-b', { status: TaskStatus.NO_GO }),
    ]);

    const resultA = makeResult(fixA.id, { selfAssessment: 'DONE' });
    const resultB = makeResult(fixB.id, { selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([resultA, resultB]);

    vi.mocked(evaluateWithRubric).mockImplementation((res: TaskResult) => {
      if (res.taskId === fixA.id) {
        throw new TypeError('(result.notes ?? "").toLowerCase is not a function');
      }
      return makeEvalResult('DONE');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runFixPhase(root, sprint, evaluations, [], makeFixConfig(), undefined, 'v1', undefined);

    // Loop survived: BOTH fix tasks have entries.
    expect(evaluations.get(fixB.id)).toBe(TaskEvaluation.DONE);
    expect(evaluations.get(fixA.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('FIX-phase fault with worker NO_GO stays NO_GO (no silent promotion)', async () => {
    const fixA = makeFixTask('369-fix-c', '369-orig-c');
    writeFixTaskFile(root, fixA);
    const sprint = makeSprint([makeTask('369-orig-c', { status: TaskStatus.NO_GO })]);

    const resultA = makeResult(fixA.id, { selfAssessment: 'NO_GO', testsPassed: false });
    vi.mocked(waitForResults).mockResolvedValue([resultA]);

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runFixPhase(root, sprint, evaluations, [], makeFixConfig(), undefined, 'v1', undefined);

    expect(evaluations.get(fixA.id)).toBe(TaskEvaluation.NO_GO);
  });

  it('surfaces the FIX-phase fault as BRAIN→AUDITOR:EVALUATION_FAULT', async () => {
    const fixA = makeFixTask('369-fix-d', '369-orig-d');
    writeFixTaskFile(root, fixA);
    const sprint = makeSprint([makeTask('369-orig-d', { status: TaskStatus.NO_GO })]);

    const resultA = makeResult(fixA.id, { selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([resultA]);

    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('boom');
    });

    const evaluations = new Map<string, TaskEvaluation>();
    await runFixPhase(root, sprint, evaluations, [], makeFixConfig(), undefined, 'v1', undefined);

    const faultCall = vi.mocked(writeEvent).mock.calls.find(c => c[4] === 'BRAIN→AUDITOR:EVALUATION_FAULT');
    expect(faultCall).toBeDefined();
    expect((faultCall?.[5] as Record<string, unknown>)?.taskId).toBe(fixA.id);
  });
});
