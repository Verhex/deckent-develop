/**
 * sprint-428 S7A (task 428-010) — docs/analysis/scheduler-unify-design-2026-07-11.md
 * "Net Öneri" 8-sprint table, row 7 ("FIFO safety/config migration"):
 *   Composition kanıtı: "Blocked head korunur; sonraki eligible task seçilir;
 *   MRR/NO_GO dependency spawn değil cascade üretir."
 *   Geri dönüş: "Engine legacy olabilir; dependency bypass geri açılmaz."
 *
 * This is the evidence-inventory file scheduler-shadow-equivalence.test.ts's
 * "EXPECTED divergence" describe block forward-references ("this is what
 * dilim-7 will consume as evidence") — the legacy imperative `popEligibleFromQueue`
 * (result-collector.ts) destructively shifts a dependency-blocked FIFO head with
 * no dependency check at all; `reduceSchedulerTick`'s legacy-fifo path closes
 * that hole by design. .analysis/born-backlog.json (born-610 kalanlari, item 2)
 * names the exact pre-existing gap this locks down: "dependency_pipeline_enabled
 * =false FIFO'da dep-check yok -> MRR-bagimlisi spawn edilebilir" — the decision
 * or (SCHED-7) is "dependency_policy=strict iki stratejide de degismez": the
 * terminal-failure (NO_GO/MANUAL_REVIEW_REQUIRED) safety net must hold in BOTH
 * strategies and BOTH pipeline-flag settings; only the "wait for a still-PENDING
 * dependency" behavior is legitimately flag-gated.
 *
 * Coverage:
 *   1. Blocked-head preserved + next-eligible selected — legacy-fifo (index-scan,
 *      non-destructive shift, FIFO order preserved, "no kill when no work").
 *   2. Same property — continuous strategy (Step-1 queue-drain + Step-2 fill).
 *   3. MRR/NO_GO dependency -> CascadeSkip, never SpawnTask — pipeline-on AND
 *      pipeline-off (the core regression lock for the pre-existing hole).
 *   4. Bypass-never-reopens — idempotent across repeated ticks, and stays closed
 *      even if a caller flips dependencyPipelineEnabled between ticks.
 *   5. Legacy-fifo cadence shape — one KillWorker+SpawnTask pair per eligible
 *      completedTaskId, in input order (cadence contract unchanged by the fix).
 */
import { describe, it, expect } from 'vitest';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint } from '../../src/core/types.js';
import {
  reduceSchedulerTick,
  toSchedulerTaskSnapshot,
} from '../../src/orchestra/scheduler-reducer.js';
import type {
  SchedulerSnapshot,
  SchedulerTaskSnapshot,
  DispatchStrategy,
  SchedulerDecision,
} from '../../src/orchestra/scheduler-reducer.js';
import { computeEffectiveDependencyState } from '../../src/orchestra/scheduler-state.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

const NOW_MS = 1_752_000_000_000;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `sched7-s7a ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched7-s7a-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/sched7-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched7',
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-sched7',
    number: 428,
    status: 'executing' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

interface BuildOpts {
  tasks: Task[];
  /** FIFO overflow queue, in order — a SUBSET of `tasks` (or all of them). Defaults to []. */
  queue?: Task[];
  strategy?: DispatchStrategy;
  maxWorkers: number;
  dependencyPipelineEnabled: boolean;
  assignedTaskIds?: Set<string>;
  collectedIds?: Set<string>;
  completedTaskIds?: string[];
  collisionBlockedIds?: Set<string>;
}

function buildSnapshot(opts: BuildOpts): SchedulerSnapshot {
  const sprint = makeSprint(opts.tasks);
  const assignedTaskIds = opts.assignedTaskIds ?? new Set<string>();
  const collectedIds = opts.collectedIds ?? new Set<string>();
  const currentlyExecuting = sprint.tasks.filter(t =>
    t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotBudget = Math.max(0, opts.maxWorkers - currentlyExecuting);
  const effectiveDependencyState = computeEffectiveDependencyState(sprint.tasks, NOW_MS);

  return {
    trigger: { kind: 'watcher', sequence: 1 },
    strategy: opts.strategy ?? 'legacy-fifo',
    nowMs: NOW_MS,
    costStop: false,
    slotBudget,
    dependencyPipelineEnabled: opts.dependencyPipelineEnabled,
    orderedQueue: (opts.queue ?? []).map(toSchedulerTaskSnapshot),
    tasks: sprint.tasks.map(toSchedulerTaskSnapshot),
    assignedTaskIds,
    collectedIds,
    completedTaskIds: opts.completedTaskIds ?? [],
    effectiveDependencyState,
    collisionBlockedIds: opts.collisionBlockedIds ?? new Set(),
  };
}

function spawnedIds(decision: SchedulerDecision): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'SpawnTask' }> => e.kind === 'SpawnTask')
    .map(e => e.taskId);
}

function killedIds(decision: SchedulerDecision): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'KillWorker' }> => e.kind === 'KillWorker')
    .map(e => e.taskId);
}

function blockedIds(decision: SchedulerDecision): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'Blocked' }> => e.kind === 'Blocked')
    .map(e => e.taskId);
}

function cascadeSkippedIds(decision: SchedulerDecision): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'CascadeSkip' }> => e.kind === 'CascadeSkip')
    .map(e => e.taskId);
}

function queueIds(queue: readonly SchedulerTaskSnapshot[]): string[] {
  return queue.map(t => t.id);
}

// ─── 1. Blocked-head preserved + next-eligible — legacy-fifo ──────────────

describe('reduceSchedulerTick (legacy-fifo) — blocked-head preserved, next-eligible selected, no stall', () => {
  it('a dependency-pending head stays queued in place; the next eligible entry is spawned instead', () => {
    const upstream = makeTask('upstream'); // still PENDING — never satisfies qb's dependency
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const freeSecond = makeTask('qfree');
    const tasks = [upstream, blockedHead, freeSecond];

    const snapshot = buildSnapshot({
      tasks,
      queue: [blockedHead, freeSecond],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-worker-1'],
    });
    const decision = reduceSchedulerTick(snapshot);

    // blocked head: never spawned, explicitly marked Blocked, stays in nextQueue
    expect(spawnedIds(decision)).not.toContain('qb');
    expect(blockedIds(decision)).toContain('qb');
    expect(decision.dispositions.get('qb')).toBe('blocked-dependency');
    // next eligible (freeSecond) IS spawned via a Kill+Spawn replace pair
    expect(spawnedIds(decision)).toEqual(['qfree']);
    expect(killedIds(decision)).toEqual(['done-worker-1']);
    // FIFO order preserved: qb remains at the head (index 0), not destructively shifted
    expect(queueIds(decision.nextQueue)).toEqual(['qb']);
  });

  it('two completions in one tick both find the next eligible entry past the blocked head — no stall', () => {
    const upstream = makeTask('upstream');
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const eligibleA = makeTask('qa');
    const eligibleB = makeTask('qc');
    const tasks = [upstream, blockedHead, eligibleA, eligibleB];

    const snapshot = buildSnapshot({
      tasks,
      queue: [blockedHead, eligibleA, eligibleB],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1', 'done-2'],
    });
    const decision = reduceSchedulerTick(snapshot);

    expect(spawnedIds(decision)).toEqual(['qa', 'qc']);
    expect(killedIds(decision)).toEqual(['done-1', 'done-2']);
    // blocked head is still the sole survivor, still at the head
    expect(queueIds(decision.nextQueue)).toEqual(['qb']);
  });

  it('queue exhausted of eligible entries: no forced kill/spawn ("no kill when no work") — not a stall, a clean no-op', () => {
    const upstream = makeTask('upstream');
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const tasks = [upstream, blockedHead];

    const snapshot = buildSnapshot({
      tasks,
      queue: [blockedHead],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1', 'done-2'],
    });
    const decision = reduceSchedulerTick(snapshot);

    expect(spawnedIds(decision)).toEqual([]);
    expect(killedIds(decision)).toEqual([]);
    expect(queueIds(decision.nextQueue)).toEqual(['qb']);
  });

  it('once the blocking dependency resolves (DONE) on a later tick, the same head becomes eligible — the earlier block was not a permanent stall', () => {
    const blockedHeadPending = makeTask('qb', { dependencies: ['upstream'] });
    const tickOneSnapshot = buildSnapshot({
      tasks: [makeTask('upstream'), blockedHeadPending],
      queue: [blockedHeadPending],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1'],
    });
    const tickOne = reduceSchedulerTick(tickOneSnapshot);
    expect(spawnedIds(tickOne)).toEqual([]);
    expect(queueIds(tickOne.nextQueue)).toEqual(['qb']);

    // Next tick: upstream is now DONE — qb (still in nextQueue from tick 1) is eligible.
    const tickTwoSnapshot = buildSnapshot({
      tasks: [makeTask('upstream', { status: TaskStatus.DONE }), blockedHeadPending],
      queue: [blockedHeadPending],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-2'],
    });
    const tickTwo = reduceSchedulerTick(tickTwoSnapshot);
    expect(spawnedIds(tickTwo)).toEqual(['qb']);
  });
});

// ─── 2. Blocked-head preserved + next-eligible — continuous strategy ──────

describe('reduceSchedulerTick (continuous) — blocked-head preserved, next-eligible selected, no stall', () => {
  it('Step-1 queue-drain: blocked head is left in place (index-scan), next eligible entry fills the slot', () => {
    // upstream is still in-flight (EXECUTING) — not DONE, so qb stays blocked;
    // EXECUTING also correctly excludes it from Step-2's PENDING slot-fill scan.
    const upstream = makeTask('upstream', { status: TaskStatus.EXECUTING });
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const eligible = makeTask('qfree');
    const tasks = [upstream, blockedHead, eligible];

    const snapshot = buildSnapshot({
      tasks,
      queue: [blockedHead, eligible],
      strategy: 'continuous',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
    });
    const decision = reduceSchedulerTick(snapshot);

    expect(spawnedIds(decision)).toEqual(['qfree']);
    expect(blockedIds(decision)).toContain('qb');
    expect(queueIds(decision.nextQueue)).toEqual(['qb']);
  });

  it('Step-2 pending-slot-fill does not re-evaluate (or double-block) a head already classified in Step-1', () => {
    // upstream is still in-flight (EXECUTING) — not DONE, so qb stays blocked;
    // EXECUTING also correctly excludes it from Step-2's PENDING slot-fill scan.
    const upstream = makeTask('upstream', { status: TaskStatus.EXECUTING });
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const extraPending = makeTask('extra');
    const tasks = [upstream, blockedHead, extraPending];

    const snapshot = buildSnapshot({
      tasks,
      queue: [blockedHead],
      strategy: 'continuous',
      maxWorkers: 5, // 5 slots, only 1 queue entry (blocked) + 1 extra PENDING task
      dependencyPipelineEnabled: true,
    });
    const decision = reduceSchedulerTick(snapshot);

    // extra is picked up via Step-2 (pending-slot-fill), qb stays blocked exactly once
    expect(spawnedIds(decision)).toEqual(['extra']);
    const blockedEffectsForHead = decision.orderedEffects.filter(
      e => e.kind === 'Blocked' && e.taskId === 'qb',
    );
    expect(blockedEffectsForHead).toHaveLength(1);
    expect(queueIds(decision.nextQueue)).toEqual(['qb']);
  });
});

// ─── 3. MRR/NO_GO dependency -> cascade, never spawn (pipeline-on AND off) ─

describe('reduceSchedulerTick — MRR/NO_GO dependency produces CascadeSkip, never SpawnTask', () => {
  it.each<[TaskStatus, boolean, DispatchStrategy]>([
    [TaskStatus.NO_GO, true, 'legacy-fifo'],
    [TaskStatus.NO_GO, false, 'legacy-fifo'],
    [TaskStatus.MANUAL_REVIEW_REQUIRED, true, 'legacy-fifo'],
    [TaskStatus.MANUAL_REVIEW_REQUIRED, false, 'legacy-fifo'],
    [TaskStatus.NO_GO, true, 'continuous'],
    [TaskStatus.NO_GO, false, 'continuous'],
    [TaskStatus.MANUAL_REVIEW_REQUIRED, true, 'continuous'],
    [TaskStatus.MANUAL_REVIEW_REQUIRED, false, 'continuous'],
  ])(
    'root=%s, dependencyPipelineEnabled=%s, strategy=%s: dependent is cascade-skipped, never spawned, in either FIFO position',
    (rootStatus, dependencyPipelineEnabled, strategy) => {
      const root = makeTask('root', { status: rootStatus });
      const dep = makeTask('dep', { dependencies: ['root'] }); // FIFO head
      const other = makeTask('other'); // FIFO second entry — must still spawn
      const tasks = [root, dep, other];

      const snapshot = buildSnapshot({
        tasks,
        queue: [dep, other],
        strategy,
        maxWorkers: 5,
        dependencyPipelineEnabled,
        completedTaskIds: strategy === 'legacy-fifo' ? ['done-worker-1'] : [],
      });
      const decision = reduceSchedulerTick(snapshot);

      // The regression this locks down (born-backlog born-610 kalanlari item 2):
      // dependency_pipeline_enabled=false must NOT reopen the dependency bypass.
      expect(spawnedIds(decision)).not.toContain('dep');
      expect(cascadeSkippedIds(decision)).toEqual(['dep']);
      expect(decision.dispositions.get('dep')).toBe('cascade-skip');
      expect(queueIds(decision.nextQueue)).not.toContain('dep');
      // the sibling FIFO entry is unaffected and still gets dispatched
      expect(spawnedIds(decision)).toContain('other');
    },
  );

  it('legacy-fifo: a NO_GO-dependency head does not block a same-tick eligible successor (cascade removes it from the queue, not a destructive shift)', () => {
    const root = makeTask('root', { status: TaskStatus.NO_GO });
    const dep = makeTask('dep', { dependencies: ['root'] });
    const eligible = makeTask('eligible');

    const snapshot = buildSnapshot({
      tasks: [root, dep, eligible],
      queue: [dep, eligible],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: false, // pipeline-off — the historical hole
      completedTaskIds: ['done-1'],
    });
    const decision = reduceSchedulerTick(snapshot);

    expect(spawnedIds(decision)).toEqual(['eligible']);
    expect(cascadeSkippedIds(decision)).toEqual(['dep']);
    expect(queueIds(decision.nextQueue)).toEqual([]);
  });
});

// ─── 4. Bypass-never-reopens ────────────────────────────────────────────────

describe('reduceSchedulerTick — dependency bypass never reopens', () => {
  it('the same terminally-blocked snapshot fed repeatedly never spawns the dependent, across N ticks', () => {
    const root = makeTask('root', { status: TaskStatus.NO_GO });
    const dep = makeTask('dep', { dependencies: ['root'] });
    const snapshot = buildSnapshot({
      tasks: [root, dep],
      queue: [dep],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1'],
    });

    for (let tick = 0; tick < 5; tick++) {
      const decision = reduceSchedulerTick(snapshot);
      expect(spawnedIds(decision)).not.toContain('dep');
      expect(cascadeSkippedIds(decision)).toEqual(['dep']);
    }
  });

  it('flipping dependencyPipelineEnabled true -> false between ticks does not reopen a closed dependency bypass', () => {
    const root = makeTask('root', { status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    const dep = makeTask('dep', { dependencies: ['root'] });

    const tickOne = reduceSchedulerTick(buildSnapshot({
      tasks: [root, dep],
      queue: [dep],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1'],
    }));
    expect(spawnedIds(tickOne)).not.toContain('dep');

    // Simulated rollback: dependencyPipelineEnabled flips to false on the next tick.
    // "Engine legacy olabilir; dependency bypass geri açılmaz" — the cascade-skip
    // safety net is unconditional, so this must NOT reopen the spawn for `dep`.
    const tickTwo = reduceSchedulerTick(buildSnapshot({
      tasks: [root, dep],
      queue: [dep],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: false,
      completedTaskIds: ['done-2'],
    }));
    expect(spawnedIds(tickTwo)).not.toContain('dep');
    expect(cascadeSkippedIds(tickTwo)).toEqual(['dep']);
  });

  it('re-appending an already cascade-skipped id back onto a later orderedQueue (hypothetical executor replay bug) still never spawns it, in both strategies', () => {
    const root = makeTask('root', { status: TaskStatus.NO_GO });
    const dep = makeTask('dep', { dependencies: ['root'] }); // status still PENDING — never persisted terminal by the (out-of-scope) executor in this fixture

    for (const strategy of ['legacy-fifo', 'continuous'] as DispatchStrategy[]) {
      const snapshot = buildSnapshot({
        tasks: [root, dep],
        queue: [dep, dep], // duplicated head — simulates a replay/duplication bug upstream of the reducer
        strategy,
        maxWorkers: 5,
        dependencyPipelineEnabled: true,
        completedTaskIds: strategy === 'legacy-fifo' ? ['done-1', 'done-2'] : [],
      });
      const decision = reduceSchedulerTick(snapshot);
      expect(spawnedIds(decision)).not.toContain('dep');
      expect(queueIds(decision.nextQueue)).not.toContain('dep');
    }
  });
});

// ─── 5. Legacy-fifo cadence shape preserved (bit-eş) ───────────────────────

describe('reduceSchedulerTick (legacy-fifo) — cadence contract unchanged by the dependency-safety fix', () => {
  it('exactly one KillWorker+SpawnTask pair per eligible completedTaskId, in input order', () => {
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')];
    const snapshot = buildSnapshot({
      tasks,
      queue: [tasks[0]!, tasks[1]!, tasks[2]!],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1', 'done-2'],
    });
    const decision = reduceSchedulerTick(snapshot);

    const pairs = decision.orderedEffects.filter(e => e.kind === 'KillWorker' || e.kind === 'SpawnTask');
    expect(pairs.map(e => e.kind)).toEqual(['KillWorker', 'SpawnTask', 'KillWorker', 'SpawnTask']);
    expect(killedIds(decision)).toEqual(['done-1', 'done-2']);
    expect(spawnedIds(decision)).toEqual(['t1', 't2']);
    expect(queueIds(decision.nextQueue)).toEqual(['t3']);
  });

  it('a completedTaskId beyond the number of eligible entries produces no extra pair (no forced completion)', () => {
    const tasks = [makeTask('t1')];
    const snapshot = buildSnapshot({
      tasks,
      queue: [tasks[0]!],
      strategy: 'legacy-fifo',
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
      completedTaskIds: ['done-1', 'done-2', 'done-3'],
    });
    const decision = reduceSchedulerTick(snapshot);

    expect(killedIds(decision)).toEqual(['done-1']);
    expect(spawnedIds(decision)).toEqual(['t1']);
    expect(queueIds(decision.nextQueue)).toEqual([]);
  });
});
