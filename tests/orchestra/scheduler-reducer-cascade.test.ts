/**
 * sprint-427 SCHED6-RED (task 427-007) — docs/analysis/scheduler-unify-design-2026-07-11.md
 * Sprint-6 dilimi ("Cascade ve restore live") + "Riskler" (persist-before-commit).
 *
 * Coverage:
 *   1. Direct cascade-skip from a NO_GO / MANUAL_REVIEW_REQUIRED root — typed `CascadeSkip`
 *      effect, `cascade-skip` disposition, never a `SpawnTask` for the skipped id.
 *   2. Transitive closure — a multi-hop chain AND a re-converging diamond are fully skipped
 *      in one tick, each id skipped exactly once.
 *   3. Never-spawn invariant holds in both `continuous` and `legacy-fifo` strategy.
 *   4. Determinism — the same snapshot fed twice yields byte-identical decisions, including
 *      the same `idempotencyKey`.
 *   5. Restore-trigger idempotency (the task's explicit ask): a snapshot representing a
 *      post-restore tick where some descendants are ALREADY terminal+collected (a prior
 *      tick's executor already durably applied their cascade-skip) produces NO new
 *      `CascadeSkip` effect for them; a sibling descendant still PENDING/uncollected (the
 *      crash happened before its persist completed) IS re-decided, with the identical
 *      `idempotencyKey` it would have received pre-crash. NOTE: `SchedulerTriggerKind`
 *      (scheduler-reducer.ts) intentionally does NOT add a `'restore'` literal yet —
 *      `scheduler-journal.ts`'s `SchedulerShadowRecord.trigger` union is narrower
 *      (`'initial' | 'watcher'`) and out of this task's scope.filesWrite; see the doc
 *      comment on `SchedulerTriggerKind`. The cascade-skip pass is NOT kind-gated (by
 *      design), so a `'watcher'` tick below stands in for "the tick right after restore" —
 *      the property under test is behavioral idempotency, not the trigger label.
 */
import { describe, it, expect } from 'vitest';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint } from '../../src/core/types.js';
import {
  reduceSchedulerTick,
  toSchedulerTaskSnapshot,
} from '../../src/orchestra/scheduler-reducer.js';
import type { SchedulerSnapshot, SchedulerTriggerKind, DispatchStrategy } from '../../src/orchestra/scheduler-reducer.js';
import { computeEffectiveDependencyState } from '../../src/orchestra/scheduler-state.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

const NOW_MS = 1_752_000_000_000;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `sched6-red ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched6-red-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/sched6-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched6',
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-sched6',
    number: 427,
    status: 'executing' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

function buildSnapshot(opts: {
  tasks: Task[];
  trigger?: { kind: SchedulerTriggerKind; sequence: number };
  strategy?: DispatchStrategy;
  maxWorkers: number;
  dependencyPipelineEnabled: boolean;
  assignedTaskIds?: Set<string>;
  collectedIds?: Set<string>;
  completedTaskIds?: string[];
  deferTerminalDependencyFailure?: boolean;
}): SchedulerSnapshot {
  const sprint = makeSprint(opts.tasks);
  const assignedTaskIds = opts.assignedTaskIds ?? new Set<string>();
  const collectedIds = opts.collectedIds ?? new Set<string>();
  const currentlyExecuting = sprint.tasks.filter(t =>
    t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotBudget = Math.max(0, opts.maxWorkers - currentlyExecuting);
  const effectiveDependencyState = computeEffectiveDependencyState(sprint.tasks, NOW_MS);

  return {
    trigger: opts.trigger ?? { kind: 'watcher', sequence: 1 },
    strategy: opts.strategy ?? 'continuous',
    nowMs: NOW_MS,
    costStop: false,
    slotBudget,
    dependencyPipelineEnabled: opts.dependencyPipelineEnabled,
    deferTerminalDependencyFailure: opts.deferTerminalDependencyFailure,
    orderedQueue: [],
    tasks: sprint.tasks.map(toSchedulerTaskSnapshot),
    assignedTaskIds,
    collectedIds,
    completedTaskIds: opts.completedTaskIds ?? [],
    effectiveDependencyState,
    collisionBlockedIds: new Set(),
  };
}

function cascadeSkipEffects(decision: ReturnType<typeof reduceSchedulerTick>) {
  return decision.orderedEffects.filter(
    (e): e is Extract<typeof e, { kind: 'CascadeSkip' }> => e.kind === 'CascadeSkip',
  );
}

function spawnedIds(decision: ReturnType<typeof reduceSchedulerTick>): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'SpawnTask' }> => e.kind === 'SpawnTask')
    .map(e => e.taskId)
    .sort();
}

// ─── 1. Direct cascade-skip ────────────────────────────────────────────────

describe('reduceSchedulerTick — direct cascade-skip', () => {
  it('NO_GO root produces a typed CascadeSkip effect + cascade-skip disposition for its PENDING dependent', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('dep', { dependencies: ['root'] }),
    ];
    const snapshot = buildSnapshot({ tasks, maxWorkers: 5, dependencyPipelineEnabled: true });
    const decision = reduceSchedulerTick(snapshot);

    const skips = cascadeSkipEffects(decision);
    expect(skips).toEqual([
      { kind: 'CascadeSkip', taskId: 'dep', failedDependencyId: 'root', idempotencyKey: 'cascade-skip:dep:root' },
    ]);
    expect(decision.dispositions.get('dep')).toBe('cascade-skip');
    expect(spawnedIds(decision)).not.toContain('dep');
  });

  it('MANUAL_REVIEW_REQUIRED root ALSO cascades (not only NO_GO — born-610 semantics)', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.MANUAL_REVIEW_REQUIRED }),
      makeTask('dep', { dependencies: ['root'] }),
    ];
    const snapshot = buildSnapshot({ tasks, maxWorkers: 5, dependencyPipelineEnabled: true });
    const decision = reduceSchedulerTick(snapshot);

    expect(cascadeSkipEffects(decision).map(e => e.taskId)).toEqual(['dep']);
    expect(decision.dispositions.get('dep')).toBe('cascade-skip');
  });

  it('parks repairable dependency failures for FIX instead of terminal cascade', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('dep', { dependencies: ['root'] }),
    ];
    const snapshot = buildSnapshot({
      tasks,
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      deferTerminalDependencyFailure: true,
    });

    const decision = reduceSchedulerTick(snapshot);

    expect(cascadeSkipEffects(decision)).toEqual([]);
    expect(spawnedIds(decision)).not.toContain('dep');
  });

  it('a healthy (DONE) upstream never produces a CascadeSkip for its dependent', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.DONE }),
      makeTask('dep', { dependencies: ['root'] }),
    ];
    const snapshot = buildSnapshot({ tasks, maxWorkers: 5, dependencyPipelineEnabled: true });
    const decision = reduceSchedulerTick(snapshot);

    expect(cascadeSkipEffects(decision)).toEqual([]);
    expect(spawnedIds(decision)).toContain('dep');
  });
});

// ─── 2. Transitive closure ──────────────────────────────────────────────────

describe('reduceSchedulerTick — transitive cascade-skip closure', () => {
  it('a 3-hop chain rooted in NO_GO is fully skipped in one tick, each id exactly once', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('hop1', { dependencies: ['root'] }),
      makeTask('hop2', { dependencies: ['hop1'] }),
      makeTask('hop3', { dependencies: ['hop2'] }),
    ];
    const snapshot = buildSnapshot({ tasks, maxWorkers: 5, dependencyPipelineEnabled: true });
    const decision = reduceSchedulerTick(snapshot);

    const skips = cascadeSkipEffects(decision);
    expect(skips.map(e => e.taskId).sort()).toEqual(['hop1', 'hop2', 'hop3']);
    // exactly one CascadeSkip per id — no duplicate re-emission within the same tick
    const counts = new Map<string, number>();
    for (const s of skips) counts.set(s.taskId, (counts.get(s.taskId) ?? 0) + 1);
    for (const [, count] of counts) expect(count).toBe(1);
    // chain order: an id can only be skipped after the id it points at was itself resolved
    expect(skips.find(e => e.taskId === 'hop1')!.failedDependencyId).toBe('root');
    expect(skips.find(e => e.taskId === 'hop2')!.failedDependencyId).toBe('hop1');
    expect(skips.find(e => e.taskId === 'hop3')!.failedDependencyId).toBe('hop2');
    expect(spawnedIds(decision)).toEqual([]);
  });

  it('a re-converging diamond (two branches from one NO_GO root) skips every PENDING descendant exactly once', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('left', { dependencies: ['root'] }),
      makeTask('right', { dependencies: ['root'] }),
      makeTask('join', { dependencies: ['left', 'right'] }),
      makeTask('unrelated'), // no dependency on the failing tree — must NOT be skipped
    ];
    const snapshot = buildSnapshot({ tasks, maxWorkers: 5, dependencyPipelineEnabled: true });
    const decision = reduceSchedulerTick(snapshot);

    const skippedIds = cascadeSkipEffects(decision).map(e => e.taskId).sort();
    expect(skippedIds).toEqual(['join', 'left', 'right']);
    expect(decision.dispositions.get('unrelated')).not.toBe('cascade-skip');
    expect(spawnedIds(decision)).toContain('unrelated');
    expect(spawnedIds(decision)).not.toEqual(expect.arrayContaining(['left', 'right', 'join']));
  });
});

// ─── 3. Never-spawn invariant across both strategies ────────────────────────

describe('reduceSchedulerTick — cascade-skipped ids are never spawned, in either strategy', () => {
  it.each<DispatchStrategy>(['continuous', 'legacy-fifo'])('%s strategy: cascade-skipped id absent from SpawnTask effects and nextQueue', (strategy) => {
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('dep', { dependencies: ['root'] }),
      makeTask('other'),
    ];
    const snapshot = buildSnapshot({
      tasks,
      strategy,
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: strategy === 'legacy-fifo' ? ['done-worker'] : [],
    });
    const decision = reduceSchedulerTick(snapshot);

    expect(spawnedIds(decision)).not.toContain('dep');
    expect(decision.nextQueue.some(t => t.id === 'dep')).toBe(false);
    expect(cascadeSkipEffects(decision).map(e => e.taskId)).toEqual(['dep']);
  });
});

// ─── 4. Determinism ──────────────────────────────────────────────────────────

describe('reduceSchedulerTick — cascade-skip decision determinism', () => {
  it('the same snapshot fed twice yields byte-identical decisions, including the same idempotencyKey', () => {
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('hop1', { dependencies: ['root'] }),
      makeTask('hop2', { dependencies: ['hop1'] }),
    ];
    const snapshot = buildSnapshot({ tasks, maxWorkers: 5, dependencyPipelineEnabled: true });

    const d1 = reduceSchedulerTick(snapshot);
    const d2 = reduceSchedulerTick(snapshot);

    expect(cascadeSkipEffects(d1)).toEqual(cascadeSkipEffects(d2));
    expect(d1.orderedEffects).toEqual(d2.orderedEffects);
    for (const skip of cascadeSkipEffects(d1)) {
      expect(skip.idempotencyKey).toBe(`cascade-skip:${skip.taskId}:${skip.failedDependencyId}`);
    }
  });
});

// ─── 5. Restore-trigger idempotency ──────────────────────────────────────────
// `SchedulerTriggerKind` deliberately has no `'restore'` literal yet (see its doc
// comment in scheduler-reducer.ts) — a `'watcher'`-kind snapshot below stands in for
// "the tick immediately after a checkpoint restore"; the cascade-skip pass is NOT
// kind-gated, so this is a faithful stand-in for the property under test.

describe('reduceSchedulerTick — post-restore cascade-skip idempotency (SCHED6-RED)', () => {
  it('a descendant already terminal+collected (prior tick already persisted its cascade-skip) produces NO new CascadeSkip', () => {
    // Simulates: pre-crash tick already decided+executed CascadeSkip for `hop1`
    // (SCHED6-EFF's persist-before-commit executor flips status to NO_GO and
    // writes a collected .result BEFORE the crash) — `hop2` was still PENDING
    // and uncollected when the crash happened (persist never completed for it).
    const tasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('hop1', { status: TaskStatus.NO_GO, dependencies: ['root'] }), // already applied pre-crash
      makeTask('hop2', { dependencies: ['hop1'] }), // still PENDING — not yet applied
    ];
    const postRestoreSnapshot = buildSnapshot({
      tasks,
      trigger: { kind: 'watcher', sequence: 1 }, // fresh sequence — a new run after restart
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      collectedIds: new Set(['hop1']), // hop1's synthetic NO_GO result already durably written
    });

    const decision = reduceSchedulerTick(postRestoreSnapshot);
    const skippedIds = cascadeSkipEffects(decision).map(e => e.taskId);

    // hop1 is NOT re-decided — already-skip is not reproduced.
    expect(skippedIds).not.toContain('hop1');
    // hop2 (never persisted pre-crash) IS re-decided — retry-safety.
    expect(skippedIds).toEqual(['hop2']);
    expect(spawnedIds(decision)).toEqual([]);
  });

  it('the re-decided idempotencyKey after restore is identical to what the original (pre-crash) tick would have produced', () => {
    const preCrashTasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('hop2', { dependencies: ['root'] }),
    ];
    const preCrashSnapshot = buildSnapshot({
      tasks: preCrashTasks,
      trigger: { kind: 'watcher', sequence: 7 },
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
    });
    const preCrashDecision = reduceSchedulerTick(preCrashSnapshot);
    const preCrashKey = cascadeSkipEffects(preCrashDecision).find(e => e.taskId === 'hop2')!.idempotencyKey;

    // Post-restore snapshot: same logical state (hop2 still PENDING/uncollected —
    // the persist for it never completed), fresh trigger sequence (a new run).
    const restoreTasks = [
      makeTask('root', { status: TaskStatus.NO_GO }),
      makeTask('hop2', { dependencies: ['root'] }),
    ];
    const postRestoreSnapshot = buildSnapshot({
      tasks: restoreTasks,
      trigger: { kind: 'initial', sequence: 1 },
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
    });
    const postRestoreDecision = reduceSchedulerTick(postRestoreSnapshot);
    const postRestoreKey = cascadeSkipEffects(postRestoreDecision).find(e => e.taskId === 'hop2')!.idempotencyKey;

    expect(postRestoreKey).toBe(preCrashKey);
    expect(postRestoreKey).toBe('cascade-skip:hop2:root');
  });

  it('both trigger kinds already live (initial/watcher) process an identical cascade-skip set', () => {
    const tasks = [makeTask('root', { status: TaskStatus.NO_GO }), makeTask('dep', { dependencies: ['root'] })];
    const kinds: SchedulerTriggerKind[] = ['initial', 'watcher'];
    const results = kinds.map(kind =>
      cascadeSkipEffects(
        reduceSchedulerTick(buildSnapshot({ tasks, trigger: { kind, sequence: 1 }, maxWorkers: 5, dependencyPipelineEnabled: true })),
      ).map(e => e.taskId),
    );
    expect(results).toEqual([['dep'], ['dep']]);
  });
});
