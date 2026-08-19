/**
 * EVALUATE Phase Pre-Dispatch Trigger Guard Tests — Sprint 192 Task 192-009 (W-INTEGRITY I-3)
 *
 * Validates the opt-in entry guard added to `runEvaluatePhase` to close the
 * Sprint 191 RC: Wave-N tasks evaluated before the dispatcher had a chance
 * to reach them, producing empty `evaluations` Maps and bogus cascade events.
 *
 * Strategy under test:
 *   • `findUndispatchedTaskIds(...)` pure helper computes the list of tasks
 *     that have neither a `.result`, nor `assignedWorker`, nor a `.hb`
 *     heartbeat, nor a non-PENDING status, nor an explicit DEFERRED override.
 *   • When `options.enforceDispatchGate === true` and at least one task is
 *     undispatched, runEvaluatePhase early-returns (no phase transition, no
 *     evaluation loop, lock released) and emits BRAIN→AUDITOR:EVALUATE_PREMATURE.
 *   • The flag is opt-in: legacy callers (e.g. existing tests, recovery paths)
 *     leave `enforceDispatchGate` undefined / false and observe pre-Sprint 192
 *     behavior unchanged.
 *
 * Tests use a real temporary projectRoot so disk-read predicates (existsSync,
 * readFileSync) exercise real POSIX semantics. Heavyweight collaborators are
 * mocked to keep the suite hermetic — same pattern as
 * evaluate-phase-idempotency.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, EvaluationResult,
} from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────
// node:fs is intentionally NOT mocked — entry-guard reads disk for .result/.hb.

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

const capturedEvents: { channel: string; payload: unknown }[] = [];
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn((
    _root: string, _sid: string, _src: string, _tgt: string,
    channel: string, payload: unknown,
  ) => {
    capturedEvents.push({ channel, payload });
  }),
  getCurrentSprintId: vi.fn(() => 'sprint-192'),
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

import {
  runEvaluatePhase,
  isTaskDispatched,
  findUndispatchedTaskIds,
} from '../../src/orchestra/sprint-phases.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(
    tmpdir(),
    `evaluate-trigger-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
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
    sprintId: 'sprint-192',
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

function makeSprint(tasks: Task[], id = 'sprint-192'): Sprint {
  return {
    id,
    number: Number(id.replace('sprint-', '')) || 192,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('runEvaluatePhase — Pre-Dispatch Trigger Guard (Sprint 192 Task 192-009)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents.length = 0;
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Test 1: Full-Dispatch Trigger OK ────────────────────────────

  it('full-dispatch (all tasks have .result) — guard passes, evaluation proceeds', async () => {
    const t1 = makeTask('192-001');
    const t2 = makeTask('192-002');
    const sprint = makeSprint([t1, t2]);
    const evaluations = new Map<string, TaskEvaluation>();
    const r1 = makeResult('192-001');
    const r2 = makeResult('192-002');

    await runEvaluatePhase(
      root, sprint, [r1, r2], evaluations,
      undefined, undefined, undefined, undefined,
      { enforceDispatchGate: true },
    );

    expect(evaluations.size).toBe(2);
    expect(evaluations.get('192-001')).toBe(TaskEvaluation.DONE);
    expect(evaluations.get('192-002')).toBe(TaskEvaluation.DONE);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledTimes(2);

    // No premature event emitted.
    const prematureEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
    );
    expect(prematureEvents).toHaveLength(0);
  });

  // ─── Test 2: Partial-Dispatch Wait ────────────────────────────────

  it('partial-dispatch (one task pre-dispatch) — guard fires, evaluations empty, premature event emitted', async () => {
    const t1 = makeTask('192-003');
    const t2 = makeTask('192-004'); // no result, no .hb, no assignedWorker → undispatched
    const sprint = makeSprint([t1, t2]);
    const evaluations = new Map<string, TaskEvaluation>();
    const r1 = makeResult('192-003');

    await runEvaluatePhase(
      root, sprint, [r1], evaluations,
      undefined, undefined, undefined, undefined,
      { enforceDispatchGate: true },
    );

    // Guard fired — no evaluations populated, no handleEvaluation calls.
    expect(evaluations.size).toBe(0);
    expect(vi.mocked(handleEvaluation)).not.toHaveBeenCalled();

    // Premature event emitted with the undispatched task id.
    const prematureEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
    );
    expect(prematureEvents).toHaveLength(1);
    const payload = prematureEvents[0].payload as {
      sprintId: string;
      undispatchedTaskIds: string[];
      totalTasks: number;
      collectedResults: number;
      deferredCount: number;
    };
    expect(payload.undispatchedTaskIds).toEqual(['192-004']);
    expect(payload.totalTasks).toBe(2);
    expect(payload.collectedResults).toBe(1);
    expect(payload.deferredCount).toBe(0);

    // Sprint phase stayed EXECUTE — no premature transition to EVALUATE.
    expect(sprint.phase).toBe(SprintPhase.EXECUTE);

    // Lock released so a subsequent post-dispatch call can re-enter.
    const lockPath = join(root, '.deckent', `${sprint.id}-evaluate-lock`);
    expect(existsSync(lockPath)).toBe(false);
  });

  // ─── Test 3: DEFERRED Override ────────────────────────────────────

  it('undispatched task explicitly DEFERRED — guard passes, deferred task skipped (no synthetic NO_GO)', async () => {
    const t1 = makeTask('192-005');
    const t2 = makeTask('192-006'); // undispatched but caller marks DEFERRED
    const sprint = makeSprint([t1, t2]);
    const evaluations = new Map<string, TaskEvaluation>();
    const r1 = makeResult('192-005');
    const deferred = new Set(['192-006']);

    await runEvaluatePhase(
      root, sprint, [r1], evaluations,
      undefined, undefined, undefined, deferred,
      { enforceDispatchGate: true },
    );

    // Guard passed (DEFERRED counts as dispatched-equivalent). Only t1 was
    // evaluated; t2 was skipped via the deferred-skip continue, so no
    // synthetic NO_GO entry was injected.
    expect(evaluations.size).toBe(1);
    expect(evaluations.get('192-005')).toBe(TaskEvaluation.DONE);
    expect(evaluations.has('192-006')).toBe(false);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledTimes(1);

    // No premature event.
    const prematureEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
    );
    expect(prematureEvents).toHaveLength(0);
  });

  // ─── Test 4: assignedWorker counts as dispatched ─────────────────

  it('task with assignedWorker (no .result yet) — guard passes (in-flight dispatch signal)', async () => {
    const t1 = makeTask('192-007', { assignedWorker: 'w-192-007', status: TaskStatus.EXECUTING });
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    await runEvaluatePhase(
      root, sprint, [], evaluations,
      undefined, undefined, undefined, undefined,
      { enforceDispatchGate: true },
    );

    // Guard passed — but no .result so the existing extension/liveness path
    // (per Sprint 191 hotfix) runs through. With no docker probe + no .hb,
    // checkWorkerLiveness returns 'dead' → synthetic NO_GO.
    const prematureEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
    );
    expect(prematureEvents).toHaveLength(0);

    // Phase transitioned because guard passed.
    expect(sprint.phase).toBe(SprintPhase.EVALUATE);
  });

  // ─── Test 5: heartbeat-only counts as dispatched ─────────────────

  it('task with .hb but no assignedWorker/.result — guard passes (worker-in-flight signal)', async () => {
    const t1 = makeTask('192-008'); // PENDING + no worker
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    // Plant a STALE heartbeat: the disk presence satisfies the guard's
    // dispatch signal (existsSync), but a 10-minute-old timestamp keeps
    // evaluateRuntimeExtension from granting a 5-min poll budget that
    // would block the test on the synthetic-NO_GO path. With no
    // assignedWorker, checkWorkerLiveness short-circuits to never-spawned
    // and the per-task loop exits via `continue`.
    const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const hbPath = join(root, '.tasks', `task-${t1.id}.hb`);
    writeFileSync(
      hbPath,
      JSON.stringify({ workerId: 'w-192-008', timestamp: staleIso }),
      'utf-8',
    );
    // 7094-F1d: `.hb` is a single spawn-time write in production, so its
    // mtime equals its content timestamp. The probe-based liveness path
    // reads file MTIME — a fixture written "now" would read alive and grant
    // the 5-min poll budget this test is deliberately avoiding.
    utimesSync(hbPath, new Date(staleIso), new Date(staleIso));

    await runEvaluatePhase(
      root, sprint, [], evaluations,
      undefined, undefined, undefined, undefined,
      { enforceDispatchGate: true },
    );

    // Guard passed — no premature event.
    const prematureEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
    );
    expect(prematureEvents).toHaveLength(0);
    expect(sprint.phase).toBe(SprintPhase.EVALUATE);
  });

  // ─── Test 6: Legacy (gate=false) preserves pre-Sprint 192 behavior ─

  it('gate disabled (legacy/test caller) — evaluation runs even with undispatched tasks', async () => {
    const t1 = makeTask('192-009'); // no result, no .hb, no worker
    const sprint = makeSprint([t1]);
    const evaluations = new Map<string, TaskEvaluation>();

    // Legacy call: no options arg, gate stays default (false).
    await runEvaluatePhase(root, sprint, [], evaluations);

    // Guard NOT fired — no premature event.
    const prematureEvents = capturedEvents.filter(
      e => e.channel === 'BRAIN→AUDITOR:EVALUATE_PREMATURE',
    );
    expect(prematureEvents).toHaveLength(0);

    // Phase transitioned (existing pre-Sprint 192 flow ran).
    expect(sprint.phase).toBe(SprintPhase.EVALUATE);
  });

  // ─── Test 7: isTaskDispatched pure helper ────────────────────────

  it('isTaskDispatched — recognizes each dispatch signal independently', () => {
    const empty = new Set<string>();

    // Collected (has result)
    const tA = makeTask('A');
    expect(isTaskDispatched(root, tA, new Set(['A']), empty)).toBe(true);

    // Explicitly deferred
    const tB = makeTask('B');
    expect(isTaskDispatched(root, tB, empty, new Set(['B']))).toBe(true);

    // assignedWorker (in-memory)
    const tC = makeTask('C', { assignedWorker: 'w-C' });
    expect(isTaskDispatched(root, tC, empty, empty)).toBe(true);

    // Advanced status
    const tD = makeTask('D', { status: TaskStatus.EXECUTING });
    expect(isTaskDispatched(root, tD, empty, empty)).toBe(true);

    // Heartbeat on disk
    const tE = makeTask('E');
    writeFileSync(
      join(root, '.tasks', 'task-E.hb'),
      JSON.stringify({ workerId: 'w-E', timestamp: new Date().toISOString() }),
      'utf-8',
    );
    expect(isTaskDispatched(root, tE, empty, empty)).toBe(true);

    // On-disk task.json with assignedWorker (worker claimed but in-memory stale)
    const tF = makeTask('F');
    writeFileSync(
      join(root, '.tasks', 'task-F.json'),
      JSON.stringify({ ...tF, assignedWorker: 'w-F-claimed' }),
      'utf-8',
    );
    expect(isTaskDispatched(root, tF, empty, empty)).toBe(true);

    // Pure undispatched — all signals absent
    const tG = makeTask('G');
    expect(isTaskDispatched(root, tG, empty, empty)).toBe(false);
  });

  // ─── Test 8: findUndispatchedTaskIds aggregate ───────────────────

  it('findUndispatchedTaskIds — returns only tasks lacking every dispatch signal', () => {
    const t1 = makeTask('U-1'); // collected
    const t2 = makeTask('U-2'); // pre-dispatch
    const t3 = makeTask('U-3', { assignedWorker: 'w-U-3' }); // dispatched
    const t4 = makeTask('U-4'); // pre-dispatch but deferred
    const sprint = makeSprint([t1, t2, t3, t4]);
    const results = [makeResult('U-1')];
    const deferred = new Set(['U-4']);

    const undispatched = findUndispatchedTaskIds(root, sprint, results, deferred);
    expect(undispatched).toEqual(['U-2']);
  });
});
