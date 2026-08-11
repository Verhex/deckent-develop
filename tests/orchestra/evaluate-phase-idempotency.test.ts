/**
 * runEvaluatePhase Idempotency Lock Tests — Sprint 157 Task 002
 *
 * Validates the PID-bound idempotency guard added to runEvaluatePhase to close
 * the dual-evaluator race documented in Sprint 156 dogfood evidence:
 *   - fix_phase_timeout batch trigger could re-invoke runEvaluatePhase before
 *     the first call completed handleEvaluation / cascade-event side-effects.
 *   - resume/reconcile path could re-invoke runEvaluatePhase on tasks already
 *     evaluated in the same sprint.
 *
 * Strategy under test: `.deckent/<sprintId>-evaluate-lock` PID-bound file.
 * Second concurrent caller observes the live lock and early-returns NO_OP.
 * Stale locks (process dead) are reclaimed. Same-PID re-entry returns NO_OP
 * to prevent recursion.
 *
 * Tests use a real temporary projectRoot so the lock file's filesystem ops
 * (existsSync / writeFileSync / readFileSync / unlinkSync) exercise real
 * POSIX semantics, while heavyweight collaborators (debt-manager, plugin-hooks,
 * cascade applier, event-stream, notify, auditor) are mocked to keep the
 * suite hermetic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { isPidAlive } from '../../src/core/pid-liveness.js';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, EvaluationResult,
} from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────
// node:fs is intentionally NOT mocked — the lock file is real disk state.

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    debugLog: vi.fn(),
  };
});

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
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
  getCurrentSprintId: vi.fn(() => 'sprint-159'),
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

// ─── Imports (after mocks) ──────────────────────────────────────────

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(
    tmpdir(),
    `evaluate-phase-idempotency-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Test task ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-159',
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

function makeSprint(tasks: Task[], id = 'sprint-159'): Sprint {
  return {
    id,
    number: Number(id.replace('sprint-', '')) || 159,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeEvalResult(decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 90 : decision === 'GO_WITH_TECH_DEBT' ? 65 : 30,
    rubricScores: [],
    retryCount: 1,
  };
}

function lockPath(root: string, sprintId: string): string {
  return join(root, '.deckent', `${sprintId}-evaluate-lock`);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runEvaluatePhase — PID-bound Idempotency Lock (Sprint 157 Task 002)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Canonical race close: 2 parallel calls → second is NO_OP ────

  it('two parallel runEvaluatePhase calls — second is NO_OP, single result set', async () => {
    // Arrange — single task with valid result so both calls would otherwise
    // mutate evaluations / call handleEvaluation.
    const t1 = makeTask('159-001');
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();
    const r1 = makeResult('159-001');

    // Act — fire both calls before awaiting either, so they overlap on the
    // event loop boundary that the lock file must close.
    const callA = runEvaluatePhase(root, sprint, [r1], evaluations);
    const callB = runEvaluatePhase(root, sprint, [r1], evaluations);
    await Promise.all([callA, callB]);

    // Assert — evaluations Map populated exactly once.
    expect(evaluations.get('159-001')).toBe(TaskEvaluation.DONE);
    expect(evaluations.size).toBe(1);

    // Assert — handleEvaluation invoked exactly once across both calls.
    // The second caller observed the lock, early-returned NO_OP, and did
    // NOT trigger debt-manager side-effects.
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledTimes(1);

    // Assert — lock file cleaned up after the winning call finishes.
    expect(existsSync(lockPath(root, sprint.id))).toBe(false);
  });

  // ─── Same-PID sequential re-entry → second is NO_OP ──────────────

  it('same-PID re-entry (sequential) — second call is NO_OP', async () => {
    // Arrange — manually plant a lock owned by this process to simulate
    // an already-in-flight evaluation pass within the same orchestrator
    // (e.g. resume path firing a second runEvaluatePhase before the first
    // releases its lock).
    const t1 = makeTask('159-002');
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(
      lockPath(root, sprint.id),
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        sprintId: sprint.id,
      }),
      'utf-8',
    );

    // Act
    await runEvaluatePhase(root, sprint, [makeResult('159-002')], evaluations);

    // Assert — second call early-returned: no evaluations populated, no
    // handleEvaluation side-effect.
    expect(evaluations.size).toBe(0);
    expect(vi.mocked(handleEvaluation)).not.toHaveBeenCalled();

    // The pre-planted lock must remain intact — releasing another caller's
    // lock would break the very contract this guard enforces.
    expect(existsSync(lockPath(root, sprint.id))).toBe(true);
    const payload = JSON.parse(readFileSync(lockPath(root, sprint.id), 'utf-8')) as { pid: number };
    expect(payload.pid).toBe(process.pid);
  });

  // ─── Stale-PID lock → reclaimed ──────────────────────────────────

  it('stale lock (dead PID) is reclaimed by new caller', async () => {
    // Arrange — plant a lock owned by a synthetic PID that is virtually
    // guaranteed not to exist on the host. Sprint 179 W2-7: route the probe
    // through `isPidAlive()` so the loop is platform-portable (Linux uses
    // /proc/<pid>; darwin/win32 falls back to process.kill with EPERM
    // treated as "alive but not ours", removing the macOS CI flake where
    // ESRCH/EPERM ambiguity sometimes advanced past dead PIDs).
    let deadPid = (1 << 30) >>> 0;
    for (let i = 0; i < 64; i++) {
      if (!isPidAlive(deadPid)) break;
      deadPid += 1;
    }
    const stalePayload = {
      pid: deadPid,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      sprintId: 'sprint-159',
    };
    const t1 = makeTask('159-003');
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(lockPath(root, sprint.id), JSON.stringify(stalePayload), 'utf-8');

    // Act
    await runEvaluatePhase(root, sprint, [makeResult('159-003')], evaluations);

    // Assert — caller reclaimed the stale lock, evaluated the task, and
    // released the lock on completion.
    expect(evaluations.get('159-003')).toBe(TaskEvaluation.DONE);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledTimes(1);
    expect(existsSync(lockPath(root, sprint.id))).toBe(false);
  });

  // ─── Live other-PID lock → NO_OP ─────────────────────────────────

  it('live other-PID lock — caller is NO_OP, foreign lock preserved', async () => {
    // Arrange — use PID 1 (init / launchd / systemd) as a process that is
    // virtually always alive on any POSIX host. This simulates a parallel
    // deckent process holding the evaluate lock.
    const foreignPayload = {
      pid: 1,
      startedAt: new Date().toISOString(),
      sprintId: 'sprint-159',
    };
    const t1 = makeTask('159-004');
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();
    writeFileSync(lockPath(root, sprint.id), JSON.stringify(foreignPayload), 'utf-8');

    // Act
    await runEvaluatePhase(root, sprint, [makeResult('159-004')], evaluations);

    // Assert — caller observed live foreign lock and bailed out cleanly.
    expect(evaluations.size).toBe(0);
    expect(vi.mocked(handleEvaluation)).not.toHaveBeenCalled();

    // The foreign lock is untouched (PID still 1, same startedAt).
    expect(existsSync(lockPath(root, sprint.id))).toBe(true);
    const payload = JSON.parse(readFileSync(lockPath(root, sprint.id), 'utf-8')) as {
      pid: number; sprintId: string;
    };
    expect(payload.pid).toBe(1);
    expect(payload.sprintId).toBe('sprint-159');
  });

  // ─── Lock payload integrity ──────────────────────────────────────

  it('successful run releases the lock and writes a valid payload while held', async () => {
    // Arrange — intercept handleEvaluation to snapshot the lock file mid-call.
    let mid: { pid: number; startedAt: string; sprintId: string } | null = null;
    vi.mocked(handleEvaluation).mockImplementationOnce(() => {
      const path = lockPath(root, 'sprint-159');
      if (existsSync(path)) {
        mid = JSON.parse(readFileSync(path, 'utf-8'));
      }
    });

    const t1 = makeTask('159-005');
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    // Act
    await runEvaluatePhase(root, sprint, [makeResult('159-005')], evaluations);

    // Assert — mid-call snapshot was captured with a well-formed payload.
    expect(mid).not.toBeNull();
    expect(mid!.pid).toBe(process.pid);
    expect(mid!.sprintId).toBe('sprint-159');
    expect(typeof mid!.startedAt).toBe('string');
    // ISO 8601 sanity: parseable date.
    expect(Number.isFinite(Date.parse(mid!.startedAt))).toBe(true);

    // Assert — lock released after the call completes.
    expect(existsSync(lockPath(root, sprint.id))).toBe(false);
  });

  // ─── Sequential acquire after release works ─────────────────────

  it('sequential calls after release each acquire successfully', async () => {
    const t1 = makeTask('159-006');
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    // First call: succeeds, mutates Map, releases lock.
    await runEvaluatePhase(root, sprint, [makeResult('159-006')], evaluations);
    expect(evaluations.get('159-006')).toBe(TaskEvaluation.DONE);
    expect(existsSync(lockPath(root, sprint.id))).toBe(false);

    // Reset call counter so the second pass can be asserted independently.
    vi.mocked(handleEvaluation).mockClear();

    // Second sequential call (e.g. a legitimate post-FIX re-evaluation pass):
    // lock has been released, so it should acquire and run normally.
    evaluations.clear();
    await runEvaluatePhase(root, sprint, [makeResult('159-006')], evaluations);
    expect(evaluations.get('159-006')).toBe(TaskEvaluation.DONE);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledTimes(1);
    expect(existsSync(lockPath(root, sprint.id))).toBe(false);
  });
});
