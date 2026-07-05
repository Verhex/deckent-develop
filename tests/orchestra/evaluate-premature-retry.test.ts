/**
 * Sprint 370 Task 370-001 — EVAL-PREMATURE-RETRY (born-484 family closure).
 *
 * `runEvaluatePhase`'s dispatch-gate (`BRAIN→AUDITOR:EVALUATE_PREMATURE`,
 * sprint-phases.ts) early-returns while `evaluations` stays empty, even when
 * `results` already holds collected worker output. Before this fix,
 * `runSprint` had no idea this happened and marched to FIX/RETRO with a
 * truncated evaluations Map — the same externally-visible shape as the
 * born-484 `EVALUATE_ABORTED` surface, but silent.
 *
 * `retryEvaluateIfEmpty` (sprint-controller.ts) runs immediately after the
 * primary `runEvaluatePhase` call inside `runSprint` and closes this gap:
 *   1. evaluations empty + results non-empty → retry runEvaluatePhase ONCE.
 *   2. still empty after the retry → loud abort: stderr + notify + event
 *      (`BRAIN→AUDITOR:EVALUATE_EMPTY_AFTER_RETRY`) + `sprint.evaluateAborted`.
 *   3. normal path (evaluations already populated) → zero-effect no-op.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskEvaluation, TaskStatus, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, TaskResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────
// vi.mock factories are hoisted above all other module code, so the mock
// fns they close over must be created via vi.hoisted (plain top-level
// `const`s would still be in the temporal dead zone at hoist-time).
const capturedEvents: { channel: string; payload: unknown }[] = [];
const { runEvaluatePhaseMock, notifyAsyncMock, writeEventMock } = vi.hoisted(() => ({
  runEvaluatePhaseMock: vi.fn(),
  notifyAsyncMock: vi.fn(),
  writeEventMock: vi.fn(),
}));

// Partial-mock sprint-phases.js: only runEvaluatePhase is overridden so its
// call count/behavior is controllable per test; every other export (used
// elsewhere in sprint-controller.ts's module graph) stays real.
vi.mock('../../src/orchestra/sprint-phases.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-phases.js')>();
  return {
    ...actual,
    runEvaluatePhase: runEvaluatePhaseMock,
  };
});

vi.mock('../../src/core/notify.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/notify.js')>();
  return {
    ...actual,
    notifyAsync: notifyAsyncMock,
  };
});

vi.mock('../../src/orchestra/event-stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/event-stream.js')>();
  return {
    ...actual,
    writeEvent: writeEventMock,
    getCurrentSprintId: vi.fn(() => null),
  };
});

writeEventMock.mockImplementation((
  _root: string, _sid: string, _src: string, _tgt: string,
  channel: string, payload: unknown,
) => {
  capturedEvents.push({ channel, payload });
  return null;
});

// ─── Imports (after mocks) ──────────────────────────────────────────

import { retryEvaluateIfEmpty } from '../../src/orchestra/sprint-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(id: string): Task {
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
    sprintId: 'sprint-370',
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-370',
    number: 370,
    status: SprintStatus.EVALUATING,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  } as Sprint;
}

function makeResult(taskId: string): TaskResult {
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
  };
}

describe('retryEvaluateIfEmpty (Sprint 370 Task 370-001)', () => {
  let root: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents.length = 0;
    root = mkdtempSync(join(tmpdir(), 'deckent-eval-premature-retry-'));
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it('empty-then-filled: retries exactly once, populates evaluations, no abort surfaced', async () => {
    const t1 = makeTask('370-a');
    const sprint = makeSprint([t1]);
    const results = [makeResult('370-a')];
    const evaluations = new Map<string, TaskEvaluation>();
    const deferred = new Set<string>();

    // Second call (the retry) populates evaluations — simulates the gate
    // clearing on re-entry (dispatch had actually landed by then).
    runEvaluatePhaseMock.mockImplementationOnce(async (_root, _sprint, _results, evals: Map<string, TaskEvaluation>) => {
      evals.set('370-a', TaskEvaluation.DONE);
    });

    await retryEvaluateIfEmpty(root, sprint, results, evaluations, 90, deferred);

    expect(runEvaluatePhaseMock).toHaveBeenCalledTimes(1);
    expect(evaluations.size).toBe(1);
    expect(evaluations.get('370-a')).toBe(TaskEvaluation.DONE);

    const abortEvents = capturedEvents.filter(e => e.channel === 'BRAIN→AUDITOR:EVALUATE_EMPTY_AFTER_RETRY');
    expect(abortEvents).toHaveLength(0);
    expect(notifyAsyncMock).not.toHaveBeenCalled();
    expect((sprint as Sprint & { evaluateAborted?: string }).evaluateAborted).toBeUndefined();
  });

  it('empty-then-still-empty: retries once, then loudly aborts (event + notify + flag)', async () => {
    const t1 = makeTask('370-b');
    const sprint = makeSprint([t1]);
    const results = [makeResult('370-b')];
    const evaluations = new Map<string, TaskEvaluation>();
    const deferred = new Set<string>();

    // Retry call is a no-op — evaluations stays empty (genuinely stuck state).
    runEvaluatePhaseMock.mockImplementationOnce(async () => undefined);

    await retryEvaluateIfEmpty(root, sprint, results, evaluations, 90, deferred);

    expect(runEvaluatePhaseMock).toHaveBeenCalledTimes(1);
    expect(evaluations.size).toBe(0);

    const abortEvents = capturedEvents.filter(e => e.channel === 'BRAIN→AUDITOR:EVALUATE_EMPTY_AFTER_RETRY');
    expect(abortEvents).toHaveLength(1);
    const payload = abortEvents[0]!.payload as {
      sprintId: string; collectedResults: number; totalTasks: number;
    };
    expect(payload.sprintId).toBe('sprint-370');
    expect(payload.collectedResults).toBe(1);
    expect(payload.totalTasks).toBe(1);

    expect(notifyAsyncMock).toHaveBeenCalledTimes(1);
    expect(notifyAsyncMock.mock.calls[0]?.[0]).toBe('progress');
    expect(notifyAsyncMock.mock.calls[0]?.[1]).toBe('sprint-370');

    expect(stderrSpy).toHaveBeenCalled();
    expect((sprint as Sprint & { evaluateAborted?: string }).evaluateAborted).toContain('0 evaluations');
  });

  it('normal path: evaluations already populated — zero-effect no-op (no retry, no event)', async () => {
    const t1 = makeTask('370-c');
    const sprint = makeSprint([t1]);
    const results = [makeResult('370-c')];
    const evaluations = new Map<string, TaskEvaluation>([['370-c', TaskEvaluation.DONE]]);
    const deferred = new Set<string>();

    await retryEvaluateIfEmpty(root, sprint, results, evaluations, 90, deferred);

    expect(runEvaluatePhaseMock).not.toHaveBeenCalled();
    expect(evaluations.size).toBe(1);
    expect(capturedEvents).toHaveLength(0);
    expect(notifyAsyncMock).not.toHaveBeenCalled();
    expect((sprint as Sprint & { evaluateAborted?: string }).evaluateAborted).toBeUndefined();
  });

  it('no-results path: results empty — zero-effect no-op regardless of evaluations state', async () => {
    const t1 = makeTask('370-d');
    const sprint = makeSprint([t1]);
    const results: TaskResult[] = [];
    const evaluations = new Map<string, TaskEvaluation>();
    const deferred = new Set<string>();

    await retryEvaluateIfEmpty(root, sprint, results, evaluations, 90, deferred);

    expect(runEvaluatePhaseMock).not.toHaveBeenCalled();
    expect(evaluations.size).toBe(0);
    expect(capturedEvents).toHaveLength(0);
  });
});
