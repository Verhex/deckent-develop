/**
 * FIX Dispatch & Dependency Continuation — Sprint 487 Task 487-019
 *
 * Pins the repair-attempt continuation contract of `runFixPhase`:
 *
 *   1. an accepted FIX attempt is folded into the LOGICAL LINEAGE (its verdict
 *      projects onto the root) and is never counted as a new work-item;
 *   2. dependants are released only on AGGREGATE settlement — an accepted
 *      verdict for the root with no sibling repair attempt still in flight;
 *   3. PAUSE is preserved whenever repair remains impossible, and the
 *      withholding is observable (`BRAIN→*:DEPENDENCY_UNBLOCK_WITHHELD`)
 *      instead of reading as "pending forever";
 *   4. dependency release is authorized by the Brain verdict at result-ingest
 *      time (`evaluateCollectedResult`), never by the worker's raw
 *      `selfAssessment` — the EXECUTE wave already had this seam, the FIX wave
 *      did not, so a raw-DONE repair claim aggregated onto its `fixForTaskId`
 *      and released the root's dependants.
 *
 * ─── REAL FILESYSTEM (FAZ4A-S7, mirrors S4's fix-phase-map.test.ts) ──
 * The node:fs / constants / utils / task-result-authority mocks are
 * deliberately GONE. runFixPhase's entry (`persistPhaseTransition` →
 * `publishCanonicalRunStatusReadModel`) is an atomic write→rename→readback→
 * digest publication chain that an in-memory fs mock cannot carry
 * (RECORDED-FAILED approach, do not retry). Each test gets a fresh real
 * scratch project root under tmpdir; fix-task discovery goes through REAL
 * `.tasks/task-*.json` files and the real readJsonSafe, the NOT_DISPATCHED
 * one-round budget marker (`.redispatch-attempted`) and task-status
 * persistence are asserted on real disk — exactly like production.
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
import type {
  Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult,
} from '../../src/core/types.js';

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

// HYBRID (importOriginal spread): only the rubric grader + spurious-NO_GO
// reconcile are stubbed; classifyFixPhaseTasks & friends stay REAL. Impls are
// passed at factory time so vi.clearAllMocks preserves the passthrough.
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    reconcileEvaluationSpuriousNoGo: vi.fn(async (evaluation: EvaluationResult) => evaluation),
  };
});

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  // Row 3309 made the overflow-queue return value load-bearing (runFixPhase
  // publishes it as spawn-skip observability) — a bare vi.fn() resolving
  // undefined kills the whole phase with `undefined.map`.
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
  showSplashIfEnabled: vi.fn(() => ''),
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));

type CapturedEvent = {
  source: string;
  target: string;
  channel: string;
  payload: unknown;
};
const capturedEvents: CapturedEvent[] = [];

vi.mock('../../src/orchestra/event-stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/event-stream.js')>();
  return {
    ...actual,
    writeEvent: vi.fn(
      (
        _projectRoot: string,
        _sprintId: string,
        source: string,
        target: string,
        channel: string,
        payload: unknown,
      ) => {
        capturedEvents.push({ source, target, channel, payload });
        return null;
      },
    ),
    getCurrentSprintId: vi.fn(() => 'sprint-487'),
    readSequence: vi.fn(() => 0),
  };
});

vi.mock('../../src/orchestra/mid-sprint-adapter.js', () => ({
  MidSprintAdapter: vi.fn().mockImplementation(() => ({
    shouldReroute: () => ({ should: false }),
    applyReroute: () => undefined,
  })),
}));
vi.mock('../../src/orchestra/outcome-tracker.js', () => ({
  OutcomeTracker: vi.fn().mockImplementation(() => ({})),
}));

// sprint-spawner stays REAL (the unblock/respawn logic under test); only its
// provider-touching dispatch tail is stubbed so a wave can be driven hermetically.
vi.mock('../../src/orchestra/scheduler-effects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/scheduler-effects.js')>();
  return {
    ...actual,
    executeSpawnTask: vi.fn(async (effect: { task: Task }) => ({
      kind: 'spawned' as const, taskId: effect.task.id,
    })),
  };
});

// ─── Imports (after mocks) ──────────────────────────────────────────

import {
  runFixPhase, resolveFixContinuation,
} from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────

let root: string;

function makeTask(id: string, deps: string[] = [], overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Test task ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: deps,
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-487',
    ...overrides,
  };
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`src/${taskId}.ts`],
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
    id: 'sprint-487',
    number: 487,
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

/** Publish the given fix tasks as REAL `.tasks/task-<id>.json` files on disk. */
function publishFixTasks(fixTasks: Task[]): void {
  for (const task of fixTasks) {
    writeFileSync(
      join(root, '.tasks', `task-${task.id}.json`),
      JSON.stringify(task, null, 2),
      'utf-8',
    );
  }
}

function readTaskFile(taskId: string): Task {
  return JSON.parse(
    readFileSync(join(root, '.tasks', `task-${taskId}.json`), 'utf-8'),
  ) as Task;
}

function eventsOn(channel: string): CapturedEvent[] {
  return capturedEvents.filter(e => e.channel === channel);
}

const UNBLOCK_APPLIED = 'BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED';
const UNBLOCK_WITHHELD = 'BRAIN→*:DEPENDENCY_UNBLOCK_WITHHELD';

async function runFix(sprint: Sprint, evaluations: Map<string, TaskEvaluation>) {
  return runFixPhase(
    root, sprint, evaluations, [], makeConfig(),
    undefined, 'v1', undefined,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedEvents.length = 0;
  // clearAllMocks does NOT reset implementations — restore collector defaults
  // so one test's mockImplementation can never leak into the next.
  vi.mocked(waitForResults).mockResolvedValue([]);
  root = mkdtempSync(join(tmpdir(), 'deckent-fdc-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── resolveFixContinuation (pure) ──────────────────────────────────

describe('487-019 — resolveFixContinuation', () => {
  it('an attempt with no lineage releases nothing', () => {
    const orphan = makeTask('487-900-fix', [], { isPriorityFix: true });
    const decision = resolveFixContinuation(
      orphan, TaskEvaluation.DONE, new Map([[orphan.id, orphan]]),
    );
    expect(decision.accepted).toBe(true);
    expect(decision.rootTaskId).toBeUndefined();
    expect(decision.projectOntoRoot).toBe(false);
    expect(decision.unblockDependents).toBe(false);
    expect(decision.withheldReason).toBe('no-lineage');
  });

  it('a NO_GO attempt withholds the release (repair-rejected)', () => {
    const root0 = makeTask('487-001', [], { status: TaskStatus.NO_GO });
    const fix = makeTask('487-001-fix', [], { isPriorityFix: true, fixForTaskId: root0.id });
    const decision = resolveFixContinuation(
      fix, TaskEvaluation.NO_GO, new Map([[root0.id, root0], [fix.id, fix]]),
    );
    expect(decision.rootTaskId).toBe('487-001');
    expect(decision.accepted).toBe(false);
    expect(decision.projectOntoRoot).toBe(false);
    expect(decision.unblockDependents).toBe(false);
    expect(decision.withheldReason).toBe('repair-rejected');
  });

  it('GO_WITH_TECH_DEBT counts as an accepted aggregate settlement', () => {
    const root0 = makeTask('487-002', [], { status: TaskStatus.NO_GO });
    const fix = makeTask('487-002-fix', [], { isPriorityFix: true, fixForTaskId: root0.id });
    const decision = resolveFixContinuation(
      fix, TaskEvaluation.GO_WITH_TECH_DEBT, new Map([[root0.id, root0], [fix.id, fix]]),
    );
    expect(decision.accepted).toBe(true);
    expect(decision.projectOntoRoot).toBe(true);
    expect(decision.unblockDependents).toBe(true);
    expect(decision.withheldReason).toBeUndefined();
  });

  it('a fix-of-a-fix resolves to the ROOT, not the intermediate attempt', () => {
    const root0 = makeTask('487-003', [], { status: TaskStatus.NO_GO });
    const fix1 = makeTask('487-003-fix', [], {
      isPriorityFix: true, fixForTaskId: root0.id, status: TaskStatus.NO_GO,
    });
    const fix2 = makeTask('487-003-fix-fix', [], {
      isPriorityFix: true, fixForTaskId: fix1.id,
    });
    const decision = resolveFixContinuation(
      fix2, TaskEvaluation.DONE,
      new Map([[root0.id, root0], [fix1.id, fix1], [fix2.id, fix2]]),
    );
    expect(decision.rootTaskId).toBe('487-003');
    expect(decision.unblockDependents).toBe(true);
  });

  it('an accepted attempt whose lineage still has an in-flight sibling withholds the release', () => {
    const root0 = makeTask('487-004', [], { status: TaskStatus.NO_GO });
    const fixA = makeTask('487-004-fix-a', [], { isPriorityFix: true, fixForTaskId: root0.id });
    const fixB = makeTask('487-004-fix-b', [], {
      isPriorityFix: true, fixForTaskId: root0.id, status: TaskStatus.EXECUTING,
    });
    const decision = resolveFixContinuation(
      fixA, TaskEvaluation.DONE,
      new Map([[root0.id, root0], [fixA.id, fixA], [fixB.id, fixB]]),
    );
    expect(decision.accepted).toBe(true);
    expect(decision.projectOntoRoot).toBe(true);
    expect(decision.unblockDependents).toBe(false);
    expect(decision.withheldReason).toBe('repair-in-flight');
    expect(decision.pendingAttemptIds).toEqual(['487-004-fix-b']);
  });

  it('a self-referencing fixForTaskId is cycle-bounded, not an infinite walk', () => {
    const cyclic = makeTask('487-005-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-005-fix',
    });
    const decision = resolveFixContinuation(
      cyclic, TaskEvaluation.DONE, new Map([[cyclic.id, cyclic]]),
    );
    expect(decision.rootTaskId).toBeUndefined();
    expect(decision.unblockDependents).toBe(false);
  });
});

// ─── runFixPhase wiring ─────────────────────────────────────────────

describe('487-019 — runFixPhase dispatch & dependency continuation', () => {
  it('accepted FIX folds into the logical lineage and is never counted as a new task', async () => {
    const rootTask = makeTask('487-010', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-011', ['487-010'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-010-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-010',
    });
    const sprint = makeSprint([rootTask, dependent]);
    const rootCountBefore = sprint.tasks.length;
    const evaluations = new Map([['487-010', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixTask]);
    vi.mocked(waitForResults).mockResolvedValue([makeResult(fixTask.id)]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFix(sprint, evaluations);

    // The attempt's verdict is projected onto the LOGICAL ROOT…
    expect(evaluations.get('487-010')).toBe(TaskEvaluation.DONE);
    // …and the attempt itself keeps its own verdict (attempt analytics intact).
    expect(evaluations.get('487-010-fix')).toBe(TaskEvaluation.DONE);
    // …while never joining the sprint's work-item set as a new task.
    expect(sprint.tasks).toHaveLength(rootCountBefore);
    expect(sprint.tasks.some(t => t.id === '487-010-fix')).toBe(false);
  });

  it('accepted FIX releases the root dependants (PAUSED → PENDING) on aggregate DONE', async () => {
    const rootTask = makeTask('487-020', [], { status: TaskStatus.NO_GO });
    const depA = makeTask('487-021', ['487-020'], { status: TaskStatus.PAUSED });
    const depB = makeTask('487-022', ['487-020'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-020-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-020',
    });
    const sprint = makeSprint([rootTask, depA, depB]);
    const evaluations = new Map([['487-020', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixTask]);
    vi.mocked(waitForResults).mockResolvedValue([makeResult(fixTask.id)]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFix(sprint, evaluations);

    expect(rootTask.status).toBe(TaskStatus.DONE);
    expect(depA.status).toBe(TaskStatus.PENDING);
    expect(depB.status).toBe(TaskStatus.PENDING);
    // Real-file proof: the settled root and the reopened dependants reach disk
    // (persistTaskStatus), so spawner disk-reads see the release.
    expect(readTaskFile('487-020').status).toBe(TaskStatus.DONE);
    expect(readTaskFile('487-021').status).toBe(TaskStatus.PENDING);
    expect(readTaskFile('487-022').status).toBe(TaskStatus.PENDING);

    const applied = eventsOn(UNBLOCK_APPLIED);
    expect(applied).toHaveLength(1);
    const payload = applied[0]!.payload as {
      resolvedTaskId: string; fixTaskId: string; unblockedTaskIds: string[];
    };
    expect(payload.resolvedTaskId).toBe('487-020');
    expect(payload.fixTaskId).toBe('487-020-fix');
    expect(payload.unblockedTaskIds.sort()).toEqual(['487-021', '487-022']);
    expect(eventsOn(UNBLOCK_WITHHELD)).toHaveLength(0);
  });

  it('NO_GO FIX preserves PAUSE — dependants stay parked and the withholding is observable', async () => {
    const rootTask = makeTask('487-030', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-031', ['487-030'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-030-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-030',
    });
    const sprint = makeSprint([rootTask, dependent]);
    const evaluations = new Map([['487-030', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixTask]);
    // The repair worker still SELF-CLAIMS DONE; the Brain verdict is NO_GO.
    vi.mocked(waitForResults).mockResolvedValue([
      makeResult(fixTask.id, { selfAssessment: 'DONE', testsPassed: false }),
    ]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runFix(sprint, evaluations);

    expect(rootTask.status).toBe(TaskStatus.NO_GO);
    expect(dependent.status).toBe(TaskStatus.PAUSED);
    // The root keeps its unresolved projection — a rejected attempt never
    // rewrites the lineage verdict.
    expect(evaluations.get('487-030')).toBe(TaskEvaluation.NO_GO);
    expect(eventsOn(UNBLOCK_APPLIED)).toHaveLength(0);

    const withheld = eventsOn(UNBLOCK_WITHHELD);
    expect(withheld).toHaveLength(1);
    const payload = withheld[0]!.payload as {
      rootTaskId: string; fixTaskId: string; reason: string;
      pausedDependentTaskIds: string[]; totalWithheld: number;
    };
    expect(payload.rootTaskId).toBe('487-030');
    expect(payload.fixTaskId).toBe('487-030-fix');
    expect(payload.reason).toBe('repair-rejected');
    expect(payload.pausedDependentTaskIds).toEqual(['487-031']);
    expect(payload.totalWithheld).toBe(1);
  });

  it('an accepted attempt withholds the release while a sibling repair attempt is in flight', async () => {
    const rootTask = makeTask('487-040', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-041', ['487-040'], { status: TaskStatus.PAUSED });
    const fixA = makeTask('487-040-fix-a', [], {
      isPriorityFix: true, fixForTaskId: '487-040',
    });
    const fixB = makeTask('487-040-fix-b', [], {
      isPriorityFix: true, fixForTaskId: '487-040', status: TaskStatus.EXECUTING,
    });
    const sprint = makeSprint([rootTask, dependent]);
    const evaluations = new Map([['487-040', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixA, fixB]);
    vi.mocked(waitForResults).mockResolvedValue([makeResult(fixA.id)]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFix(sprint, evaluations);

    // Lineage folding still happens (the accepted attempt IS the root's verdict)…
    expect(evaluations.get('487-040')).toBe(TaskEvaluation.DONE);
    // …but the dependency release waits for the aggregate to settle.
    expect(rootTask.status).toBe(TaskStatus.NO_GO);
    expect(dependent.status).toBe(TaskStatus.PAUSED);
    expect(eventsOn(UNBLOCK_APPLIED)).toHaveLength(0);

    const withheld = eventsOn(UNBLOCK_WITHHELD);
    expect(withheld.length).toBeGreaterThanOrEqual(1);
    const payload = withheld[0]!.payload as {
      reason: string; pendingAttemptIds: string[];
    };
    expect(payload.reason).toBe('repair-in-flight');
    expect(payload.pendingAttemptIds).toContain('487-040-fix-b');
  });

  it('the FIX wave ingests results under Brain authority — a raw self-claim cannot release a dependency', async () => {
    const rootTask = makeTask('487-050', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-051', ['487-050'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-050-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-050',
    });
    const sprint = makeSprint([rootTask, dependent]);
    const evaluations = new Map([['487-050', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixTask]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    // Simulate the collector: the ingest seam decides the status a repair
    // attempt is settled with, exactly as the EXECUTE wave does.
    const ingestVerdicts: TaskEvaluation[] = [];
    vi.mocked(waitForResults).mockImplementation((async (
      _projectRoot: string,
      spawnSprint: Sprint,
      _timeoutMs: unknown,
      _queue: unknown,
      spawnOpts?: {
        evaluateCollectedResult?: (task: Task, result: TaskResult) => Promise<TaskEvaluation>;
      },
    ) => {
      const attempt = spawnSprint.tasks[0]!;
      // Raw worker claim is DONE — the seam must not honor it.
      const rawResult = makeResult(attempt.id, { selfAssessment: 'DONE' });
      if (spawnOpts?.evaluateCollectedResult) {
        ingestVerdicts.push(await spawnOpts.evaluateCollectedResult(attempt, rawResult));
      }
      return [rawResult];
    }) as unknown as typeof waitForResults);

    await runFix(sprint, evaluations);

    // The seam was wired and returned the Brain verdict, not the raw claim.
    expect(ingestVerdicts).toEqual([TaskEvaluation.NO_GO]);
    // One attempt is scored exactly once — the ingest verdict is reused by the
    // post-wave loop instead of re-running the rubric.
    expect(vi.mocked(evaluateWithRubric)).toHaveBeenCalledTimes(1);
    // …and the dependency was NOT released by the raw result.
    expect(dependent.status).toBe(TaskStatus.PAUSED);
    expect(eventsOn(UNBLOCK_APPLIED)).toHaveLength(0);
    expect(eventsOn(UNBLOCK_WITHHELD)).toHaveLength(1);
  });
});

// ─── 487-019-xfix: the phase's OTHER result waves ───────────────────
//
// runFixPhase drains three waves: the main FIX wave, the NOT_DISPATCHED
// re-dispatch wave and the POSTFIX-PENDING-SCAN safety net. Only the first
// carried the Brain-authorized ingest seam, so a raw `selfAssessment:"DONE"`
// collected by either sibling wave still settled its task — and released its
// dependants — with no Brain verdict. These pin the seam on all three.

describe('487-019-xfix — every FIX-phase wave ingests under Brain authority', () => {
  // No fix tasks are written to the real `.tasks/` directory in these tests:
  // the main FIX wave is a no-op so each test drives exactly one sibling wave.

  /** Record the ingest seam each wave was given, then answer with a raw DONE claim. */
  function collectViaRawDoneClaim(seen: { taskId: string; seamWired: boolean; verdict?: TaskEvaluation }[]) {
    vi.mocked(waitForResults).mockImplementation((async (
      _projectRoot: string,
      waveSprint: Sprint,
      _timeoutMs: unknown,
      _queue: unknown,
      waveOpts?: {
        evaluateCollectedResult?: (task: Task, result: TaskResult) => Promise<TaskEvaluation>;
      },
    ) => {
      const results: TaskResult[] = [];
      for (const task of waveSprint.tasks) {
        const rawResult = makeResult(task.id, { selfAssessment: 'DONE', testsPassed: false });
        const entry: { taskId: string; seamWired: boolean; verdict?: TaskEvaluation } = {
          taskId: task.id,
          seamWired: waveOpts?.evaluateCollectedResult !== undefined,
        };
        if (waveOpts?.evaluateCollectedResult) {
          entry.verdict = await waveOpts.evaluateCollectedResult(task, rawResult);
        }
        seen.push(entry);
        results.push(rawResult);
      }
      return results;
    }) as unknown as typeof waitForResults);
  }

  it('the NOT_DISPATCHED re-dispatch wave settles on the Brain verdict, not the raw claim', async () => {
    const candidate = makeTask('487-060', [], { status: TaskStatus.PENDING });
    const dependent = makeTask('487-061', ['487-060'], { status: TaskStatus.PAUSED });
    const sprint = makeSprint([candidate, dependent]);
    const evaluations = new Map([['487-060', TaskEvaluation.NOT_DISPATCHED]]);

    // The one-round budget marker (`task-487-060.redispatch-attempted`) does
    // not exist on the fresh real scratch root, so the wave is admitted.
    const seen: { taskId: string; seamWired: boolean; verdict?: TaskEvaluation }[] = [];
    collectViaRawDoneClaim(seen);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runFix(sprint, evaluations);

    const wave = seen.find(s => s.taskId === '487-060');
    expect(wave).toBeDefined();
    expect(wave!.seamWired).toBe(true);
    // The seam returned the Brain verdict — the raw "DONE" claim was not honored.
    expect(wave!.verdict).toBe(TaskEvaluation.NO_GO);
    expect(evaluations.get('487-060')).toBe(TaskEvaluation.NO_GO);
    // One attempt is scored exactly once (the post-wave loop reuses the ingest verdict).
    expect(vi.mocked(evaluateWithRubric)).toHaveBeenCalledTimes(1);
    // …so nothing released the dependant.
    expect(dependent.status).toBe(TaskStatus.PAUSED);
    expect(eventsOn(UNBLOCK_APPLIED)).toHaveLength(0);
    // Real-file proof: the one-round budget marker was burned on real disk
    // BEFORE the attempt, so a re-entrant FIX phase can never retry this task.
    expect(existsSync(join(root, '.tasks', 'task-487-060.redispatch-attempted'))).toBe(true);
  });

  it('the POSTFIX-PENDING-SCAN safety net settles on the Brain verdict, not the raw claim', async () => {
    const stalled = makeTask('487-070', [], { status: TaskStatus.PENDING });
    const sprint = makeSprint([stalled]);
    const evaluations = new Map<string, TaskEvaluation>();

    const seen: { taskId: string; seamWired: boolean; verdict?: TaskEvaluation }[] = [];
    collectViaRawDoneClaim(seen);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    // respawnEligibleTasks is a no-op unless the dependency pipeline is on
    // (sprint-spawner.ts guard) — enabling it is what makes the REAL
    // safety-net wave observable here (executeSpawnTask tail stubbed).
    const config = { ...makeConfig(), dependency_pipeline_enabled: true } as ResolvedConfig;
    await runFixPhase(
      root, sprint, evaluations, [], config,
      undefined, 'v1', undefined,
    );

    const wave = seen.find(s => s.taskId === '487-070');
    expect(wave).toBeDefined();
    expect(wave!.seamWired).toBe(true);
    expect(wave!.verdict).toBe(TaskEvaluation.NO_GO);
    expect(evaluations.get('487-070')).toBe(TaskEvaluation.NO_GO);
    expect(vi.mocked(evaluateWithRubric)).toHaveBeenCalledTimes(1);
  });
});
