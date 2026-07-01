/**
 * SMOKE-AUDIT (sprint-355 task 355-014) — disk-verify + close the real gap.
 *
 * Disk-verify findings (see .tasks/task-355-014.plan / .result for full
 * evidence): `src/orchestra/post-sprint-smoke.ts` was intentionally deleted
 * in c2bf175e (dead code, zero prod callers, superseded by A17). The LIVE
 * Tier-1 smoke chain is `proof-of-function.ts`, wired into `runEvaluatePhase`
 * (sprint-phases.ts) via afa7955a and confirmed present on HEAD.
 *
 * `tests/orchestra/promote-w1b.test.ts`'s "Tier-1 DONE task with a failing
 * Smoke command" test claims to exercise this path through the real
 * `runEvaluatePhase`, but its `vi.mock('node:child_process', ...)` omits a
 * `spawn` export — `defaultSmokeRunner`'s `spawn(...)` call throws Vitest's
 * auto-mock error, which is caught and surfaces as a smoke failure. The
 * assertion passes, but not because a real command ran and its output
 * failed to match — the command never executes. This suite fills that gap
 * with a deliberately-controlled fake `spawn` (an EventEmitter-based fake
 * child process, not an accidentally-undefined export) so the exec seam is
 * inspectable: we assert both the downgrade AND that the fake process was
 * actually invoked with the task's Smoke command.
 *
 * goCriteria (task 355-014) requires fake-exec here, not real-binary exec —
 * consistent with karpathy-discipline.md CUSTOM Test Hermeticity (no real
 * subprocess side effects in the test suite).
 */

// ─── Mocks (must be hoisted before any imports; scaffolding mirrors the
// proven-working set in promote-w1b.test.ts — only node:child_process differs:
// a controllable fake `spawn` instead of an accidentally-incomplete mock) ────

import { EventEmitter } from 'node:events';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: spawnMock,
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
  getCurrentSprintId: vi.fn(() => 'sprint-355'),
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

// ─── Imports (after mocks) ────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig,
} from '../../src/core/types.js';

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric, enforceHonestResultGate } from '../../src/orchestra/result-evaluator.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Fake child process (deliberate, inspectable fake-exec) ───────────

interface FakeChild extends EventEmitter {
  stdout: EventEmitter & { setEncoding: (enc: string) => void };
  stderr: EventEmitter & { setEncoding: (enc: string) => void };
  kill: (signal?: string) => void;
}

function makeFakeChild(stdout: string, stderr: string, exitCode: number | null): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.kill = vi.fn();
  // Defer past the synchronous listener-attachment in defaultSmokeRunner.
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', stdout);
    if (stderr) child.stderr.emit('data', stderr);
    child.emit('close', exitCode);
  });
  return child;
}

// ─── Helpers ────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `smoke-audit-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id: string, overrides: Partial<Task> & { smoke?: { command: string; expect: string } } = {}): Task {
  const { smoke, ...rest } = overrides;
  const base = {
    id,
    title: `Task ${id}`,
    description: 'SMOKE-AUDIT test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: [],
      filesRead: [],
      filesWrite: ['src/api/foo.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-355',
    ...rest,
  } as Task;
  if (smoke !== undefined) {
    (base as Task & { smoke?: unknown }).smoke = smoke;
  }
  return base;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/api/foo.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'DONE',
    notes: 'test',
    ...overrides,
  };
}

function makeSprint(tasks: Task[], id = 'sprint-355'): Sprint {
  return {
    id,
    number: 355,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map((t) => `w-${t.id}`),
  };
}

function makeDoneEval(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    decision: 'DONE',
    totalScore: 95,
    rubricScores: [],
    retryCount: 0,
    ...overrides,
  };
}

function makeConfig(): ResolvedConfig {
  return {
    partial_promotion_enabled: false,
    language: 'en',
    deckent_style: 'sprint',
    activeModeConfig: { max_workers: 2 },
  } as ResolvedConfig;
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('SMOKE-AUDIT — proof-of-function gate through the real runEvaluatePhase (fake-exec)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
    vi.mocked(enforceHonestResultGate).mockImplementation((r: unknown) => ({
      result: r as TaskResult,
      honest: true,
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Tier-1 DONE task, fake smoke process exits non-zero with non-matching output → downgraded + event, and the fake process was actually invoked with the task command', async () => {
    const task = makeTask('355-014-a', {
      smoke: { command: 'node dist/cli/entry.js serve --port 3211', expect: '__DECKENT_API_TOKEN__' },
    });
    const result = makeResult('355-014-a');
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    spawnMock.mockImplementation(() => makeFakeChild('<!doctype html>...', 'connection refused', 1));
    vi.mocked(evaluateWithRubric).mockReturnValue(makeDoneEval());

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig());

    expect(evaluations.get(task.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);

    // Proves this is real wiring, not a short-circuit: the fake exec seam
    // was actually reached with the task's own Smoke command.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[0]).toBe('node');
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(
      ['dist/cli/entry.js', 'serve', '--port', '3211'],
    );

    const pofEvent = vi.mocked(writeEvent).mock.calls.find(
      (c) => c[4] === 'BRAIN→AUDITOR:PROOF_OF_FUNCTION_MISMATCH',
    );
    expect(pofEvent).toBeDefined();
    expect(pofEvent![5]).toMatchObject({
      taskId: task.id,
      originalVerdict: 'DONE',
      upgradedVerdict: 'GO_WITH_TECH_DEBT',
    });
  });

  it('Tier-1 DONE task, fake smoke process exits 0 with matching output → DONE preserved, no mismatch event', async () => {
    const task = makeTask('355-014-b', {
      smoke: { command: 'node dist/cli/entry.js serve --port 3211', expect: '__DECKENT_API_TOKEN__' },
    });
    const result = makeResult('355-014-b');
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    spawnMock.mockImplementation(() => makeFakeChild('ok __DECKENT_API_TOKEN__ present', '', 0));
    vi.mocked(evaluateWithRubric).mockReturnValue(makeDoneEval());

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig());

    expect(evaluations.get(task.id)).toBe(TaskEvaluation.DONE);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const pofEvent = vi.mocked(writeEvent).mock.calls.find(
      (c) => c[4] === 'BRAIN→AUDITOR:PROOF_OF_FUNCTION_MISMATCH',
    );
    expect(pofEvent).toBeUndefined();
  });

  it('Tier-0 task (no Smoke declared, non-user-surface scope) → gate stays inert, fake exec never invoked', async () => {
    const task = makeTask('355-014-c', {
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    });
    const result = makeResult('355-014-c');
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeDoneEval());

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig());

    expect(evaluations.get(task.id)).toBe(TaskEvaluation.DONE);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
