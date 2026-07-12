/**
 * 427-010 SCHED6-COMP — cascade composition-testi + debt tek-yol.
 *
 * docs/analysis/scheduler-unify-design-2026-07-11.md Sprint-6 row: "Reducer→atomic disk
 * result→evaluate zincirinde -fix ve -xfix oluşmaz; crash/replay duplicate skip üretmez."
 *
 * Tasks 427-007 (scheduler-reducer.ts), 427-008 (scheduler-effects.ts) and 427-009
 * (sprint-checkpoint.ts) each independently proved that a `cascadeSkipped:true` NO_GO
 * `.result` lands on disk correctly and idempotently. None of their suites — nor
 * tests/orchestra/debt-manager.test.ts (which fully mocks `node:fs` and
 * `agents/worker.js`) — ever calls `handleEvaluation`/`handleCrossDependencies` on the
 * result. This file closes that gap: the full chain (reducer/restore decision → atomic
 * disk persist → debt-manager evaluation gates) exercised end-to-end, with REAL fs (a
 * tmpdir fixture) and REAL functions — no mocks — per this task's own noGoCriteria
 * ("fixture sentetik-değil-canlıysa NO_GO").
 *
 * Fixture shape (shared by the live-tick and restore sections): a cascade-skipped task
 * (`dep1`) carries a SECOND, healthy (DONE) co-dependency (`done1`) alongside its failed
 * one (`root`) — this is what makes `handleCrossDependencies`' exemption load-bearing:
 * without it, a cascade-skipped task with a healthy co-dependency would wrongly mint an
 * `-xfix` blaming that healthy dependency. A genuine (non-cascade) `sibling` NO_GO task,
 * also depending on `done1`, is the contrast/regression case: it MUST still produce a
 * normal `-fix` and a normal `-xfix` for `done1` — proving the gate suppresses only true
 * cascade skips, not every NO_GO-with-a-DONE-dependency shape.
 */
import { describe, it, expect } from 'vitest';
import {
  mkdirSync, rmSync, existsSync, writeFileSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  reduceSchedulerTick, toSchedulerTaskSnapshot,
} from '../../src/orchestra/scheduler-reducer.js';
import type { SchedulerSnapshot } from '../../src/orchestra/scheduler-reducer.js';
import { executeSchedulerDecision } from '../../src/orchestra/scheduler-effects.js';
import type { SchedulerDecisionExecutionDeps } from '../../src/orchestra/scheduler-effects.js';
import { computeEffectiveDependencyState } from '../../src/orchestra/scheduler-state.js';
import { writeCheckpoint, restoreSprintFromCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { handleEvaluation, handleCrossDependencies } from '../../src/orchestra/debt-manager.js';
import { TaskStatus, TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, TaskResult, Sprint } from '../../src/core/types.js';

// ─── Helpers (mirrors checkpoint-cascade-restore.test.ts / scheduler-effects-cascade.test.ts) ──

function makeTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function makeTask(id: string, sprintId: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId,
    assignedWorker: `w-${id}`,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(sprintId: string, tasks: Task[], phase = SprintPhase.EVALUATE): Sprint {
  const m = /sprint-(\d+)/.exec(sprintId);
  return {
    id: sprintId,
    number: m ? parseInt(m[1]!, 10) : 0,
    status: SprintStatus.ACTIVE,
    phase,
    tasks,
    workers: [],
  };
}

function writeTaskFile(root: string, task: Task): void {
  writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
}

function readTaskFile(root: string, id: string): Task {
  return JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.json`), 'utf-8')) as Task;
}

function readResultFile(root: string, id: string): TaskResult {
  return JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.result`), 'utf-8')) as TaskResult;
}

function writeResultFile(root: string, result: TaskResult): void {
  writeFileSync(join(root, '.tasks', `task-${result.taskId}.result`), JSON.stringify(result, null, 2), 'utf-8');
}

function fixPath(root: string, id: string): string {
  return join(root, '.tasks', `task-${id}-fix.json`);
}

function xfixPath(root: string, id: string): string {
  return join(root, '.tasks', `task-${id}-xfix.json`);
}

function makeRealFailureResult(taskId: string, notes: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/real-file.ts'],
    linesAdded: 12,
    linesRemoved: 3,
    testsPassed: false,
    coverage: 40,
    selfAssessment: 'NO_GO',
    notes,
  };
}

// ─── 1. Live chain (reducer + executor) → debt-manager gates, single fixture ────────────

describe('cascade composition — live tick chain (reducer → executor → debt-manager)', () => {
  it('cascade-skipped descendants mint zero -fix/-xfix; a genuine sibling NO_GO still mints both', async () => {
    const root = makeTempDir('cascade-comp-live');
    const sprintId = 'sprint-2000';

    const rootTask = makeTask('2000-root', sprintId, { status: TaskStatus.NO_GO });
    const done1 = makeTask('2000-done1', sprintId, { status: TaskStatus.DONE });
    // dep1 has TWO dependencies: the failed root AND the healthy done1. This is what
    // makes the handleCrossDependencies exemption load-bearing (see file header).
    const dep1 = makeTask('2000-dep1', sprintId, { status: TaskStatus.PENDING, dependencies: ['2000-root', '2000-done1'] });
    const dep2 = makeTask('2000-dep2', sprintId, { status: TaskStatus.PENDING, dependencies: ['2000-dep1'] });
    const sibling = makeTask('2000-sibling', sprintId, { status: TaskStatus.PENDING, dependencies: ['2000-done1'] });
    const allTasks = [rootTask, done1, dep1, dep2, sibling];
    allTasks.forEach(t => writeTaskFile(root, t));
    // root's own real (non-cascade) prior failure — read by handleCrossDependencies.
    writeResultFile(root, makeRealFailureResult('2000-root', 'genuine prior failure'));

    const nowMs = Date.now();
    const snapshot: SchedulerSnapshot = {
      trigger: { kind: 'watcher', sequence: 1 },
      strategy: 'continuous',
      nowMs,
      costStop: false,
      slotBudget: 0,
      orderedQueue: [],
      tasks: allTasks.map(toSchedulerTaskSnapshot),
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
      dependencyPipelineEnabled: true,
      effectiveDependencyState: computeEffectiveDependencyState(allTasks, nowMs),
      collisionBlockedIds: new Set(),
    };

    // ─ Task 7: reducer decides CascadeSkip for dep1 (direct) + dep2 (transitive) ─
    const decision = reduceSchedulerTick(snapshot);
    const cascadeEffects = decision.orderedEffects.filter(e => e.kind === 'CascadeSkip');
    expect(cascadeEffects.map(e => e.taskId).sort()).toEqual(['2000-dep1', '2000-dep2']);

    // ─ Task 8: executor atomically persists + commits ─
    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    const deps: SchedulerDecisionExecutionDeps = {
      projectRoot: root,
      sprintFallbackId: sprintId,
      config: undefined,
      resolveAgentPrompt: async () => undefined,
      resolveSkillPrompts: async () => [],
      buildWriteTargets: () => ['.tasks/'],
      taskMap,
      assignedTaskIds: new Set(),
      killWorker: () => {},
    };
    const execResult = await executeSchedulerDecision(decision, deps);
    expect(execResult.cascadeSkippedTaskIds.sort()).toEqual(['2000-dep1', '2000-dep2']);
    expect(readTaskFile(root, '2000-dep1').status).toBe(TaskStatus.NO_GO);
    expect(readTaskFile(root, '2000-dep2').status).toBe(TaskStatus.NO_GO);
    expect(readResultFile(root, '2000-dep1').cascadeSkipped).toBe(true);
    expect(readResultFile(root, '2000-dep2').cascadeSkipped).toBe(true);

    // sibling is a GENUINE (non-cascade) failure: worker really ran, tests really failed.
    writeResultFile(root, makeRealFailureResult('2000-sibling', 'real test failure, unrelated to cascade'));

    // ─ debt-manager direct gate (handleEvaluation) ─
    handleEvaluation(root, readTaskFile(root, '2000-dep1'), TaskEvaluation.NO_GO, readResultFile(root, '2000-dep1'));
    handleEvaluation(root, readTaskFile(root, '2000-dep2'), TaskEvaluation.NO_GO, readResultFile(root, '2000-dep2'));
    expect(existsSync(fixPath(root, '2000-dep1'))).toBe(false);
    expect(existsSync(fixPath(root, '2000-dep2'))).toBe(false);

    // Contrast: a genuine NO_GO still produces a normal -fix.
    handleEvaluation(root, readTaskFile(root, '2000-sibling'), TaskEvaluation.NO_GO, readResultFile(root, '2000-sibling'));
    expect(existsSync(fixPath(root, '2000-sibling'))).toBe(true);

    // ─ debt-manager cross-dependency gate (handleCrossDependencies) — whole sprint ─
    const evaluations = new Map<string, TaskEvaluation>([
      ['2000-root', TaskEvaluation.NO_GO],
      ['2000-done1', TaskEvaluation.DONE],
      ['2000-dep1', TaskEvaluation.NO_GO],
      ['2000-dep2', TaskEvaluation.NO_GO],
      ['2000-sibling', TaskEvaluation.NO_GO],
    ]);
    const sprint = makeSprint(sprintId, allTasks);
    const xfixTasks = handleCrossDependencies(root, sprint, evaluations);

    // dep1's healthy co-dependency (done1) is NEVER cross-blamed by the cascade chain.
    // sibling's real failure DOES correctly cross-blame done1 — proving the exemption is
    // scoped to the cascade-skipped task, not a blanket dep-on-done1 suppression.
    expect(existsSync(xfixPath(root, '2000-done1'))).toBe(true);
    const done1Xfix = xfixTasks.find(t => t.id === '2000-done1-xfix');
    expect(done1Xfix?.description).toContain('2000-sibling');
    expect(done1Xfix?.description).not.toContain('2000-dep1');
    // No -xfix ever created for root (dep1/dep2's failed dependency) — trivially true
    // since root's own evaluation is NO_GO, not DONE/GWTD, but asserted for completeness.
    expect(existsSync(xfixPath(root, '2000-root'))).toBe(false);
    // No -xfix for dep1 itself from dep2's blame chain.
    expect(existsSync(xfixPath(root, '2000-dep1'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── 2. Crash/replay idempotency — live tick chain ──────────────────────────────────────

describe('cascade composition — crash/replay idempotency (live tick chain)', () => {
  it('re-deciding + re-executing the same tick, then re-running debt-manager gates, is a total no-op', async () => {
    const root = makeTempDir('cascade-comp-replay');
    const sprintId = 'sprint-2001';

    const rootTask = makeTask('2001-root', sprintId, { status: TaskStatus.NO_GO });
    const dep1 = makeTask('2001-dep1', sprintId, { status: TaskStatus.PENDING, dependencies: ['2001-root'] });
    const dep2 = makeTask('2001-dep2', sprintId, { status: TaskStatus.PENDING, dependencies: ['2001-dep1'] });
    const allTasks = [rootTask, dep1, dep2];
    allTasks.forEach(t => writeTaskFile(root, t));

    const nowMs = Date.now();
    const buildSnapshot = (tasks: Task[]): SchedulerSnapshot => ({
      trigger: { kind: 'watcher', sequence: 1 },
      strategy: 'continuous',
      nowMs,
      costStop: false,
      slotBudget: 0,
      orderedQueue: [],
      tasks: tasks.map(toSchedulerTaskSnapshot),
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
      dependencyPipelineEnabled: true,
      effectiveDependencyState: computeEffectiveDependencyState(tasks, nowMs),
      collisionBlockedIds: new Set(),
    });

    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    const makeDeps = (): SchedulerDecisionExecutionDeps => ({
      projectRoot: root,
      sprintFallbackId: sprintId,
      config: undefined,
      resolveAgentPrompt: async () => undefined,
      resolveSkillPrompts: async () => [],
      buildWriteTargets: () => ['.tasks/'],
      taskMap,
      assignedTaskIds: new Set(),
      killWorker: () => {},
    });

    // First tick: cascade-skips both, commits to disk.
    const decision1 = reduceSchedulerTick(buildSnapshot(allTasks));
    const exec1 = await executeSchedulerDecision(decision1, makeDeps());
    expect(exec1.cascadeSkippedTaskIds.sort()).toEqual(['2001-dep1', '2001-dep2']);
    const result1Dep1 = readResultFile(root, '2001-dep1');
    const result1Dep2 = readResultFile(root, '2001-dep2');

    handleEvaluation(root, readTaskFile(root, '2001-dep1'), TaskEvaluation.NO_GO, result1Dep1);
    handleEvaluation(root, readTaskFile(root, '2001-dep2'), TaskEvaluation.NO_GO, result1Dep2);
    const sprint = makeSprint(sprintId, allTasks);
    const evaluations = new Map<string, TaskEvaluation>([
      ['2001-root', TaskEvaluation.NO_GO],
      ['2001-dep1', TaskEvaluation.NO_GO],
      ['2001-dep2', TaskEvaluation.NO_GO],
    ]);
    handleCrossDependencies(root, sprint, evaluations);

    // "Crash/replay": the tasks (now NO_GO on disk) are re-snapshotted and the SAME
    // decision is re-derived + re-executed, simulating a restart re-running the tick.
    const replayTasks = [readTaskFile(root, '2001-root'), readTaskFile(root, '2001-dep1'), readTaskFile(root, '2001-dep2')];
    const decision2 = reduceSchedulerTick(buildSnapshot(replayTasks));
    // Already-terminal (NO_GO) + not PENDING anymore → reducer's own exclusion means no
    // new CascadeSkip effect is even emitted for the replay.
    expect(decision2.orderedEffects.filter(e => e.kind === 'CascadeSkip')).toEqual([]);
    const exec2 = await executeSchedulerDecision(decision2, makeDeps());
    expect(exec2.cascadeSkippedTaskIds).toEqual([]);
    expect(readResultFile(root, '2001-dep1')).toEqual(result1Dep1);
    expect(readResultFile(root, '2001-dep2')).toEqual(result1Dep2);

    // Re-running the debt-manager gates a second time for the same tasks/results is a
    // total no-op — no -fix/-xfix ever appears ("çifte-kayıt ölür").
    handleEvaluation(root, readTaskFile(root, '2001-dep1'), TaskEvaluation.NO_GO, readResultFile(root, '2001-dep1'));
    handleEvaluation(root, readTaskFile(root, '2001-dep2'), TaskEvaluation.NO_GO, readResultFile(root, '2001-dep2'));
    handleCrossDependencies(root, sprint, evaluations);
    expect(existsSync(fixPath(root, '2001-dep1'))).toBe(false);
    expect(existsSync(fixPath(root, '2001-dep2'))).toBe(false);
    expect(existsSync(xfixPath(root, '2001-root'))).toBe(false);
    expect(existsSync(xfixPath(root, '2001-dep1'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── 3. Restore chain (Task 9) → debt-manager gates, same fixture shape ────────────────

describe('cascade composition — restore chain (checkpoint restore → debt-manager)', () => {
  it('restore-decided cascade skips mint zero -fix/-xfix, healthy co-dependency never cross-blamed', () => {
    const root = makeTempDir('cascade-comp-restore');
    const sprintId = 'sprint-2002';

    const rootTask = makeTask('2002-root', sprintId, { status: TaskStatus.NO_GO });
    const done1 = makeTask('2002-done1', sprintId, { status: TaskStatus.DONE });
    const dep1 = makeTask('2002-dep1', sprintId, { status: TaskStatus.PENDING, dependencies: ['2002-root', '2002-done1'] });
    const dep2 = makeTask('2002-dep2', sprintId, { status: TaskStatus.PENDING, dependencies: ['2002-dep1'] });
    const allTasks = [rootTask, done1, dep1, dep2];
    allTasks.forEach(t => writeTaskFile(root, t));
    writeResultFile(root, makeRealFailureResult('2002-root', 'genuine prior failure'));

    writeCheckpoint(root, makeSprint(sprintId, allTasks, SprintPhase.EXECUTE), 0);
    const restoreOut = restoreSprintFromCheckpoint(root, sprintId);
    expect(restoreOut.restored).toBe(true);
    expect(restoreOut.cascadeSkippedTasks.sort()).toEqual(['2002-dep1', '2002-dep2']);
    expect(readResultFile(root, '2002-dep1').cascadeSkipped).toBe(true);
    expect(readResultFile(root, '2002-dep2').cascadeSkipped).toBe(true);

    handleEvaluation(root, readTaskFile(root, '2002-dep1'), TaskEvaluation.NO_GO, readResultFile(root, '2002-dep1'));
    handleEvaluation(root, readTaskFile(root, '2002-dep2'), TaskEvaluation.NO_GO, readResultFile(root, '2002-dep2'));
    expect(existsSync(fixPath(root, '2002-dep1'))).toBe(false);
    expect(existsSync(fixPath(root, '2002-dep2'))).toBe(false);

    const restoredTasks = restoreOut.restoredSprint!.tasks;
    const evaluations = new Map<string, TaskEvaluation>([
      ['2002-root', TaskEvaluation.NO_GO],
      ['2002-done1', TaskEvaluation.DONE],
      ['2002-dep1', TaskEvaluation.NO_GO],
      ['2002-dep2', TaskEvaluation.NO_GO],
    ]);
    handleCrossDependencies(root, makeSprint(sprintId, restoredTasks), evaluations);
    // dep1's healthy co-dependency (done1) is never cross-blamed by the restore-decided
    // cascade chain either.
    expect(existsSync(xfixPath(root, '2002-done1'))).toBe(false);
    expect(existsSync(xfixPath(root, '2002-dep1'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── 4. Crash/replay idempotency — restore chain ───────────────────────────────────────

describe('cascade composition — crash/replay idempotency (restore chain)', () => {
  it('a second restore call is a no-op; re-running debt-manager gates mints nothing new', () => {
    const root = makeTempDir('cascade-comp-restore-replay');
    const sprintId = 'sprint-2003';

    const rootTask = makeTask('2003-root', sprintId, { status: TaskStatus.NO_GO });
    const dep1 = makeTask('2003-dep1', sprintId, { status: TaskStatus.PENDING, dependencies: ['2003-root'] });
    const allTasks = [rootTask, dep1];
    allTasks.forEach(t => writeTaskFile(root, t));

    writeCheckpoint(root, makeSprint(sprintId, allTasks, SprintPhase.EXECUTE), 0);
    const first = restoreSprintFromCheckpoint(root, sprintId);
    expect(first.cascadeSkippedTasks).toEqual(['2003-dep1']);
    const resultAfterFirst = readResultFile(root, '2003-dep1');

    handleEvaluation(root, readTaskFile(root, '2003-dep1'), TaskEvaluation.NO_GO, resultAfterFirst);
    expect(existsSync(fixPath(root, '2003-dep1'))).toBe(false);

    // "Crash/replay": restore runs again against the same on-disk state.
    const second = restoreSprintFromCheckpoint(root, sprintId);
    expect(second.cascadeSkippedTasks).toEqual([]);
    const resultAfterSecond = readResultFile(root, '2003-dep1');
    expect(resultAfterSecond).toEqual(resultAfterFirst);

    handleEvaluation(root, readTaskFile(root, '2003-dep1'), TaskEvaluation.NO_GO, resultAfterSecond);
    const sprint = makeSprint(sprintId, [readTaskFile(root, '2003-root'), readTaskFile(root, '2003-dep1')]);
    const evaluations = new Map<string, TaskEvaluation>([
      ['2003-root', TaskEvaluation.NO_GO],
      ['2003-dep1', TaskEvaluation.NO_GO],
    ]);
    handleCrossDependencies(root, sprint, evaluations);
    expect(existsSync(fixPath(root, '2003-dep1'))).toBe(false);
    expect(existsSync(xfixPath(root, '2003-root'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
