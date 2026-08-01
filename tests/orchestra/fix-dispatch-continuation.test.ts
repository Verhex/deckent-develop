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
 * Mock shape mirrors tests/orchestra/cascade-unblock-wire.test.ts (same phase,
 * same hermetic no-disk contract).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult,
} from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => [] as string[]),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  statSync: vi.fn(() => ({ mtimeMs: 0, size: 0 })),
  unlinkSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
  parseDebtTable: vi.fn(() => []),
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/task-result-authority.js', () => ({
  assertTaskResultAuthoritiesReady: vi.fn(),
  readAuthoritativeTaskResult: vi.fn((projectRoot: string, taskId: string) => ({
    state: 'absent',
    result: null,
    settlementRef: null,
    rawResultPath: `${projectRoot}/.tasks/task-${taskId}.result`,
  })),
  readRuntimeBudgetEvaluationAuthority: vi.fn(() => null),
}));

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    reconcileEvaluationSpuriousNoGo: vi.fn((evaluation) => evaluation),
  };
});

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

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
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

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',
  BRAIN_DIR: '.brain',
  TASKS_DIR: '.tasks',
  DEBT_FILE: 'DEBT.md',
  DECKENT_VERSION: '0.4.0-test',
  DECKENT_DIR: '.deckent',
  SETTINGS_DIR: '.deckent/settings',
  SPRINTS_DIR: 'sprints',
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
import { existsSync, readdirSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────

const PROJECT_ROOT = '/tmp/test-project-487';

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
    projectRoot: PROJECT_ROOT,
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

/** Publish the given fix tasks as `.tasks/task-<id>.json` files on the mocked FS. */
function publishFixTasks(fixTasks: Task[]): void {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readdirSync).mockReturnValue(
    fixTasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>,
  );
  vi.mocked(readJsonSafe).mockImplementation((path: string) => {
    const match = fixTasks.find(t => path.endsWith(`task-${t.id}.json`));
    return (match ?? null) as never;
  });
}

function eventsOn(channel: string): CapturedEvent[] {
  return capturedEvents.filter(e => e.channel === channel);
}

const UNBLOCK_APPLIED = 'BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED';
const UNBLOCK_WITHHELD = 'BRAIN→*:DEPENDENCY_UNBLOCK_WITHHELD';

async function runFix(sprint: Sprint, evaluations: Map<string, TaskEvaluation>) {
  return runFixPhase(
    PROJECT_ROOT, sprint, evaluations, [], makeConfig(),
    undefined, 'v1', undefined,
  );
}

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
    const root = makeTask('487-001', [], { status: TaskStatus.NO_GO });
    const fix = makeTask('487-001-fix', [], { isPriorityFix: true, fixForTaskId: root.id });
    const decision = resolveFixContinuation(
      fix, TaskEvaluation.NO_GO, new Map([[root.id, root], [fix.id, fix]]),
    );
    expect(decision.rootTaskId).toBe('487-001');
    expect(decision.accepted).toBe(false);
    expect(decision.projectOntoRoot).toBe(false);
    expect(decision.unblockDependents).toBe(false);
    expect(decision.withheldReason).toBe('repair-rejected');
  });

  it('GO_WITH_TECH_DEBT counts as an accepted aggregate settlement', () => {
    const root = makeTask('487-002', [], { status: TaskStatus.NO_GO });
    const fix = makeTask('487-002-fix', [], { isPriorityFix: true, fixForTaskId: root.id });
    const decision = resolveFixContinuation(
      fix, TaskEvaluation.GO_WITH_TECH_DEBT, new Map([[root.id, root], [fix.id, fix]]),
    );
    expect(decision.accepted).toBe(true);
    expect(decision.projectOntoRoot).toBe(true);
    expect(decision.unblockDependents).toBe(true);
    expect(decision.withheldReason).toBeUndefined();
  });

  it('a fix-of-a-fix resolves to the ROOT, not the intermediate attempt', () => {
    const root = makeTask('487-003', [], { status: TaskStatus.NO_GO });
    const fix1 = makeTask('487-003-fix', [], {
      isPriorityFix: true, fixForTaskId: root.id, status: TaskStatus.NO_GO,
    });
    const fix2 = makeTask('487-003-fix-fix', [], {
      isPriorityFix: true, fixForTaskId: fix1.id,
    });
    const decision = resolveFixContinuation(
      fix2, TaskEvaluation.DONE,
      new Map([[root.id, root], [fix1.id, fix1], [fix2.id, fix2]]),
    );
    expect(decision.rootTaskId).toBe('487-003');
    expect(decision.unblockDependents).toBe(true);
  });

  it('an accepted attempt whose lineage still has an in-flight sibling withholds the release', () => {
    const root = makeTask('487-004', [], { status: TaskStatus.NO_GO });
    const fixA = makeTask('487-004-fix-a', [], { isPriorityFix: true, fixForTaskId: root.id });
    const fixB = makeTask('487-004-fix-b', [], {
      isPriorityFix: true, fixForTaskId: root.id, status: TaskStatus.EXECUTING,
    });
    const decision = resolveFixContinuation(
      fixA, TaskEvaluation.DONE,
      new Map([[root.id, root], [fixA.id, fixA], [fixB.id, fixB]]),
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
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents.length = 0;
  });

  it('accepted FIX folds into the logical lineage and is never counted as a new task', async () => {
    const root = makeTask('487-010', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-011', ['487-010'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-010-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-010',
    });
    const sprint = makeSprint([root, dependent]);
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
    const root = makeTask('487-020', [], { status: TaskStatus.NO_GO });
    const depA = makeTask('487-021', ['487-020'], { status: TaskStatus.PAUSED });
    const depB = makeTask('487-022', ['487-020'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-020-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-020',
    });
    const sprint = makeSprint([root, depA, depB]);
    const evaluations = new Map([['487-020', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixTask]);
    vi.mocked(waitForResults).mockResolvedValue([makeResult(fixTask.id)]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFix(sprint, evaluations);

    expect(root.status).toBe(TaskStatus.DONE);
    expect(depA.status).toBe(TaskStatus.PENDING);
    expect(depB.status).toBe(TaskStatus.PENDING);

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
    const root = makeTask('487-030', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-031', ['487-030'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-030-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-030',
    });
    const sprint = makeSprint([root, dependent]);
    const evaluations = new Map([['487-030', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixTask]);
    // The repair worker still SELF-CLAIMS DONE; the Brain verdict is NO_GO.
    vi.mocked(waitForResults).mockResolvedValue([
      makeResult(fixTask.id, { selfAssessment: 'DONE', testsPassed: false }),
    ]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runFix(sprint, evaluations);

    expect(root.status).toBe(TaskStatus.NO_GO);
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
    const root = makeTask('487-040', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-041', ['487-040'], { status: TaskStatus.PAUSED });
    const fixA = makeTask('487-040-fix-a', [], {
      isPriorityFix: true, fixForTaskId: '487-040',
    });
    const fixB = makeTask('487-040-fix-b', [], {
      isPriorityFix: true, fixForTaskId: '487-040', status: TaskStatus.EXECUTING,
    });
    const sprint = makeSprint([root, dependent]);
    const evaluations = new Map([['487-040', TaskEvaluation.NO_GO]]);

    publishFixTasks([fixA, fixB]);
    vi.mocked(waitForResults).mockResolvedValue([makeResult(fixA.id)]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFix(sprint, evaluations);

    // Lineage folding still happens (the accepted attempt IS the root's verdict)…
    expect(evaluations.get('487-040')).toBe(TaskEvaluation.DONE);
    // …but the dependency release waits for the aggregate to settle.
    expect(root.status).toBe(TaskStatus.NO_GO);
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
    const root = makeTask('487-050', [], { status: TaskStatus.NO_GO });
    const dependent = makeTask('487-051', ['487-050'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('487-050-fix', [], {
      isPriorityFix: true, fixForTaskId: '487-050',
    });
    const sprint = makeSprint([root, dependent]);
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
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents.length = 0;
    // No fix tasks on disk: the main FIX wave is a no-op so each test drives
    // exactly one sibling wave.
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(null as never);
    vi.mocked(existsSync).mockReturnValue(true);
  });

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

    // The one-round budget marker must be unspent for the wave to run.
    vi.mocked(existsSync).mockImplementation(
      (p: unknown) => !String(p).endsWith('.redispatch-attempted'),
    );
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
  });

  it('the POSTFIX-PENDING-SCAN safety net settles on the Brain verdict, not the raw claim', async () => {
    const stalled = makeTask('487-070', [], { status: TaskStatus.PENDING });
    const sprint = makeSprint([stalled]);
    const evaluations = new Map<string, TaskEvaluation>();

    const seen: { taskId: string; seamWired: boolean; verdict?: TaskEvaluation }[] = [];
    collectViaRawDoneClaim(seen);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    // respawnEligibleTasks is a no-op unless the dependency pipeline is on —
    // enabling it is what makes the safety-net wave observable here.
    const config = { ...makeConfig(), dependency_pipeline_enabled: true } as ResolvedConfig;
    await runFixPhase(
      PROJECT_ROOT, sprint, evaluations, [], config,
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
