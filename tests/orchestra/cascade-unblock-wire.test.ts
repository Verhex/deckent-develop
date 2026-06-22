/**
 * Cascade / Unblock Runtime Wire Tests — Sprint 156 Task 003
 *
 * Validates that runEvaluatePhase wires applyCascadeToSprint after each NO_GO
 * (PENDING → PAUSED for transitive dependents) and that runFixPhase wires
 * applyUnblockToSprint after each fix DONE/GO_WITH_TECH_DEBT (PAUSED → PENDING).
 *
 * Two new aggregate event channels are also asserted:
 *   - BRAIN→*:DEPENDENCY_CASCADE_APPLIED (one per NO_GO)
 *   - BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED (one per resolved fix)
 *
 * Prior to Sprint 156 Task 003, applyCascadeToSprint and applyUnblockToSprint
 * were exported from sprint-spawner.ts but had no runtime caller (dangling).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult,
} from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

// node:fs — no real disk I/O; persistTaskStatus / handleEvaluation writes are stubbed
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => [] as string[]),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
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

// Result evaluator: rubric scoring and FailureContext type are real; only
// evaluateWithRubric is overridden so tests can drive evaluation outcomes.
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    // R8/ADR-087: override the real async spurious helper with a passthrough so
    // the mocked evaluateWithRubric decision flows through unchanged (no subprocess).
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
  BRAIN_DIR: '.brain',
  TASKS_DIR: '.tasks',
  DEBT_FILE: 'DEBT.md',
  DECKENT_VERSION: '0.4.0-test',
  DECKENT_DIR: '.deckent',
}));

// event-stream: capture every writeEvent invocation. CHANNELS + getCurrentSprintId
// must remain functional because sprint-spawner internals reference them.
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
    getCurrentSprintId: vi.fn(() => 'sprint-156'),
    readSequence: vi.fn(() => 0),
  };
});

// MidSprintAdapter + OutcomeTracker: imported dynamically inside runFixPhase.
// Stubbed to no-ops to keep the FIX path hermetic.
vi.mock('../../src/orchestra/mid-sprint-adapter.js', () => ({
  MidSprintAdapter: vi.fn().mockImplementation(() => ({
    shouldReroute: () => ({ should: false }),
    applyReroute: () => undefined,
  })),
}));
vi.mock('../../src/orchestra/outcome-tracker.js', () => ({
  OutcomeTracker: vi.fn().mockImplementation(() => ({})),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import {
  runEvaluatePhase, runFixPhase,
} from '../../src/orchestra/sprint-phases.js';
import { existsSync, readdirSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────

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
    sprintId: 'sprint-156',
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
    id: 'sprint-156',
    number: 156,
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
    projectRoot: '/tmp/test-project',
    version: '0.4.0',
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('Sprint 156 Task 003 — Cascade / Unblock Runtime Wire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents.length = 0;
  });

  // ─── runEvaluatePhase: NO_GO → cascade → dependents PAUSED ──────

  it('runEvaluatePhase: NO_GO with CODE failure cascades to 2 dependents (PAUSED)', async () => {
    // Arrange — T1 fails; T2 depends on T1; T3 depends on T1
    const t1 = makeTask('156-001', []);
    const t2 = makeTask('156-002', ['156-001']);
    const t3 = makeTask('156-003', ['156-001']);
    const sprint = makeSprint([t1, t2, t3]);
    const evaluations = new Map<string, TaskEvaluation>();

    // T1 result with CODE failure pattern in notes (test failed → CODE category)
    const r1 = makeResult('156-001', {
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'tsc error: type error in src/156-001.ts',
    });
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    // Act
    await runEvaluatePhase('/tmp/test-project', sprint, [r1], evaluations);

    // Assert — T1 evaluation recorded as NO_GO
    expect(evaluations.get('156-001')).toBe(TaskEvaluation.NO_GO);

    // Assert — T2 + T3 transitioned PENDING → PAUSED via cascade
    expect(t2.status).toBe(TaskStatus.PAUSED);
    expect(t3.status).toBe(TaskStatus.PAUSED);

    // Assert — aggregate event emitted with blocked task IDs
    const cascadeEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→*:DEPENDENCY_CASCADE_APPLIED',
    );
    expect(cascadeEvents).toHaveLength(1);
    const payload = cascadeEvents[0].payload as {
      failedTaskId: string;
      shouldCascade: boolean;
      failureCategory: string;
      blockedTaskIds: string[];
      totalBlocked: number;
    };
    expect(payload.failedTaskId).toBe('156-001');
    expect(payload.shouldCascade).toBe(true);
    expect(payload.failureCategory).toBe('CODE');
    expect(payload.blockedTaskIds.sort()).toEqual(['156-002', '156-003']);
    expect(payload.totalBlocked).toBe(2);

    // Assert — broadcast target is '*'
    expect(cascadeEvents[0].source).toBe('brain');
    expect(cascadeEvents[0].target).toBe('*');
  });

  // ─── runEvaluatePhase: RUNTIME failure → no cascade ─────────────

  it('runEvaluatePhase: RUNTIME failure does NOT cascade (dependents stay PENDING)', async () => {
    const t1 = makeTask('156-010', []);
    const t2 = makeTask('156-011', ['156-010']);
    const sprint = makeSprint([t1, t2]);
    const evaluations = new Map<string, TaskEvaluation>();

    // RUNTIME failure: docker worker exited pattern
    const r1 = makeResult('156-010', {
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'docker worker exited without writing result',
    });
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runEvaluatePhase('/tmp/test-project', sprint, [r1], evaluations);

    // T2 stays PENDING — no cascade for RUNTIME failures
    expect(t2.status).toBe(TaskStatus.PENDING);

    // Aggregate event still emitted (decision: shouldCascade=false), with empty blockedTaskIds
    const cascadeEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→*:DEPENDENCY_CASCADE_APPLIED',
    );
    expect(cascadeEvents).toHaveLength(1);
    const payload = cascadeEvents[0].payload as {
      shouldCascade: boolean;
      blockedTaskIds: string[];
      failureCategory: string;
    };
    expect(payload.shouldCascade).toBe(false);
    expect(payload.blockedTaskIds).toEqual([]);
    expect(payload.failureCategory).toBe('RUNTIME');
  });

  // ─── runEvaluatePhase: DONE result → no cascade event ───────────

  it('runEvaluatePhase: DONE result emits no cascade event', async () => {
    const t1 = makeTask('156-020', []);
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    const r1 = makeResult('156-020', { selfAssessment: 'DONE' });
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runEvaluatePhase('/tmp/test-project', sprint, [r1], evaluations);

    const cascadeEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→*:DEPENDENCY_CASCADE_APPLIED',
    );
    expect(cascadeEvents).toHaveLength(0);
  });

  // ─── runFixPhase: fix DONE → 2 dependents UNBLOCKED ─────────────

  it('runFixPhase: fix DONE unblocks 2 PAUSED dependents (PAUSED → PENDING)', async () => {
    // Arrange — T1 was NO_GO, T2 + T3 were cascade-blocked PAUSED.
    // Fix task for T1 succeeds → T2 + T3 should go back to PENDING.
    const t1 = makeTask('156-001', [], { status: TaskStatus.NO_GO });
    const t2 = makeTask('156-002', ['156-001'], { status: TaskStatus.PAUSED });
    const t3 = makeTask('156-003', ['156-001'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('156-001-fix', [], {
      isPriorityFix: true,
      fixForTaskId: '156-001',
    });
    const sprint = makeSprint([t1, t2, t3]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('156-001', TaskEvaluation.NO_GO);

    // .tasks/ contains the fix task JSON
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      [`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult(fixTask.id, { selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act
    await runFixPhase(
      '/tmp/test-project', sprint, evaluations, [], makeConfig(),
      undefined, 'v1', undefined,
    );

    // Assert — original T1 flipped to DONE (so doneTasks set sees it)
    expect(t1.status).toBe(TaskStatus.DONE);

    // Assert — T2 + T3 unblocked back to PENDING
    expect(t2.status).toBe(TaskStatus.PENDING);
    expect(t3.status).toBe(TaskStatus.PENDING);

    // Assert — aggregate unblock event emitted
    const unblockEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED',
    );
    expect(unblockEvents).toHaveLength(1);
    const payload = unblockEvents[0].payload as {
      resolvedTaskId: string;
      fixTaskId: string;
      unblockedTaskIds: string[];
      totalUnblocked: number;
    };
    expect(payload.resolvedTaskId).toBe('156-001');
    expect(payload.fixTaskId).toBe('156-001-fix');
    expect(payload.unblockedTaskIds.sort()).toEqual(['156-002', '156-003']);
    expect(payload.totalUnblocked).toBe(2);

    // Broadcast target
    expect(unblockEvents[0].source).toBe('brain');
    expect(unblockEvents[0].target).toBe('*');
  });

  // ─── runFixPhase: fix NO_GO → no unblock ────────────────────────

  it('runFixPhase: fix NO_GO does NOT unblock dependents (stay PAUSED)', async () => {
    const t1 = makeTask('156-040', [], { status: TaskStatus.NO_GO });
    const t2 = makeTask('156-041', ['156-040'], { status: TaskStatus.PAUSED });
    const fixTask = makeTask('156-040-fix', [], {
      isPriorityFix: true,
      fixForTaskId: '156-040',
    });
    const sprint = makeSprint([t1, t2]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('156-040', TaskEvaluation.NO_GO);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      [`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult(fixTask.id, {
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'still failing',
    });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runFixPhase(
      '/tmp/test-project', sprint, evaluations, [], makeConfig(),
      undefined, 'v1', undefined,
    );

    // T2 still PAUSED, T1 still NO_GO
    expect(t1.status).toBe(TaskStatus.NO_GO);
    expect(t2.status).toBe(TaskStatus.PAUSED);

    const unblockEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED',
    );
    expect(unblockEvents).toHaveLength(0);
  });
});
