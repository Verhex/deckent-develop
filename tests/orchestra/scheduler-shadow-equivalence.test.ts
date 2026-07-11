/**
 * born-634/635 SCHED4 (docs/analysis/scheduler-unify-design-2026-07-11.md,
 * Sprint-4 dilimi) — `reduceSchedulerTick` (scheduler-reducer.ts) is the full
 * pure reducer model; `scheduler-driver.ts`/`scheduler-journal.ts` wire it into
 * a SHADOW-only observation path (never drives spawn/kill).
 *
 * Coverage:
 *   1. Reducer purity: static source-scan (no fs/env/Date.now) + behavioral
 *      determinism (same snapshot in -> same decision out, repeatedly).
 *   2. Equivalent-class fixtures: `planDispatch` (the pinned legacy MODEL,
 *      result-collector.ts) vs `reduceSchedulerTick` on the SAME task data ->
 *      identical spawn-id sets, empty divergence.
 *   3. Expected-divergence class: the FIFO dep-hole the design doc names
 *      explicitly — legacy-fifo's `popEligibleFromQueue` has no dependency
 *      check and spawns a dep-blocked head; the reducer's index-scan leaves
 *      it Blocked. Pinned as an intentional, non-failing divergence.
 *   4. `captureShadowSchedulerSnapshot` queue/task-clone pin — never a live
 *      Task[] reference, mutation-safe.
 *   5. Flag-off contract: `config.scheduler.shadow_reducer` must be the
 *      literal `true` to enable — every other shape (absent, `{}`,
 *      `{shadow_reducer:false}`) is inert, and inert means literally no
 *      journal file is ever written.
 *   6. Journal fail-soft: a write failure never throws out of
 *      `finalizeShadowSchedulerTick`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';
import { planDispatch } from '../../src/orchestra/result-collector.js';
import type { DispatchState } from '../../src/orchestra/result-collector.js';
import {
  reduceSchedulerTick,
  toSchedulerTaskSnapshot,
} from '../../src/orchestra/scheduler-reducer.js';
import type { SchedulerSnapshot } from '../../src/orchestra/scheduler-reducer.js';
import { computeEffectiveDependencyState } from '../../src/orchestra/scheduler-state.js';
import {
  captureShadowSchedulerSnapshot,
  finalizeShadowSchedulerTick,
} from '../../src/orchestra/scheduler-driver.js';
import { schedulerShadowJournalPath } from '../../src/orchestra/scheduler-journal.js';

// ─── Fixtures ──────────────────────────────────────────────────────────

const NOW_MS = 1_752_000_000_000;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `sched4 ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched4-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/sched4-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched4',
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-sched4',
    number: 414,
    status: 'executing' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

/** Builds BOTH a `DispatchState` (for planDispatch) and a `SchedulerSnapshot`
 *  (for reduceSchedulerTick) from the SAME task/queue data — the equivalence
 *  fixtures' whole point is that both inputs describe one identical tick. */
function buildDualInputs(opts: {
  tasks: Task[];
  queue?: Task[];
  maxWorkers: number;
  dependencyPipelineEnabled: boolean;
  assignedTaskIds?: Set<string>;
  collectedIds?: Set<string>;
  completedTaskIds?: string[];
  strategy?: 'continuous' | 'legacy-fifo';
}): { dispatchState: DispatchState; snapshot: SchedulerSnapshot; env: NodeJS.ProcessEnv } {
  const sprint = makeSprint(opts.tasks);
  const queue = opts.queue ?? [];
  const assignedTaskIds = opts.assignedTaskIds ?? new Set<string>();
  const collectedIds = opts.collectedIds ?? new Set<string>();
  const completedTaskIds = opts.completedTaskIds ?? [];
  const strategy = opts.strategy ?? 'continuous';

  const currentlyExecuting = sprint.tasks.filter(t =>
    t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotBudget = Math.max(0, opts.maxWorkers - currentlyExecuting);

  const dispatchState: DispatchState = {
    sprint,
    config: { dependency_pipeline_enabled: opts.dependencyPipelineEnabled },
    maxWorkers: opts.maxWorkers,
    assignedTaskIds,
    collectedIds,
    remainingQueue: [...queue],
    completedTaskIds,
  };

  const effectiveDependencyState = computeEffectiveDependencyState(sprint.tasks, NOW_MS);

  const snapshot: SchedulerSnapshot = {
    trigger: { kind: 'watcher', sequence: 1 },
    strategy,
    nowMs: NOW_MS,
    costStop: false,
    slotBudget,
    dependencyPipelineEnabled: opts.dependencyPipelineEnabled,
    orderedQueue: queue.map(toSchedulerTaskSnapshot),
    tasks: sprint.tasks.map(toSchedulerTaskSnapshot),
    assignedTaskIds,
    collectedIds,
    completedTaskIds,
    effectiveDependencyState,
    collisionBlockedIds: new Set(), // no colliding scope.filesWrite in these fixtures
  };

  const env: NodeJS.ProcessEnv = strategy === 'legacy-fifo' ? { DECKENT_LEGACY_FIFO: '1' } : {};

  return { dispatchState, snapshot, env };
}

function spawnedIds(decision: ReturnType<typeof reduceSchedulerTick>): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'SpawnTask' }> => e.kind === 'SpawnTask')
    .map(e => e.taskId)
    .sort();
}

function blockedIds(decision: ReturnType<typeof reduceSchedulerTick>): string[] {
  return decision.orderedEffects
    .filter((e): e is Extract<typeof e, { kind: 'Blocked' }> => e.kind === 'Blocked')
    .map(e => e.taskId)
    .sort();
}

// ─── 1. Reducer purity ──────────────────────────────────────────────────

describe('reduceSchedulerTick — purity', () => {
  it('scheduler-reducer.ts source imports no fs/env and calls no Date.now()', () => {
    const here = fileURLToPath(import.meta.url);
    const reducerPath = join(here, '..', '..', '..', 'src', 'orchestra', 'scheduler-reducer.ts');
    const src = readFileSync(reducerPath, 'utf-8');
    expect(src).not.toMatch(/from\s+['"]node:fs['"]/);
    expect(src).not.toMatch(/from\s+['"]fs['"]/);
    expect(src).not.toMatch(/require\(['"]fs['"]\)/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/new Date\(\)/);
  });

  it('is deterministic — the same snapshot object yields byte-identical decisions across repeated calls', () => {
    const { snapshot } = buildDualInputs({
      tasks: [makeTask('p1'), makeTask('p2', { dependencies: ['p1'] })],
      maxWorkers: 5,
      dependencyPipelineEnabled: true,
    });
    const d1 = reduceSchedulerTick(snapshot);
    const d2 = reduceSchedulerTick(snapshot);
    expect(spawnedIds(d1)).toEqual(spawnedIds(d2));
    expect(d1.orderedEffects).toEqual(d2.orderedEffects);
  });
});

// ─── 2. Equivalent-class fixtures ───────────────────────────────────────

describe('reduceSchedulerTick vs planDispatch — equivalent class (empty divergence)', () => {
  it('continuous mode: dep-satisfied + dep-blocked + no-dep PENDING tasks agree on spawn set', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { dependencies: ['t1'] }), // satisfied -> eligible
      makeTask('t3'), // no deps -> eligible
      makeTask('t4', { dependencies: ['t5'] }), // t5 not DONE -> blocked in both
      makeTask('t5'), // PENDING, no deps -> eligible
    ];
    const { dispatchState, snapshot, env } = buildDualInputs({
      tasks, maxWorkers: 10, dependencyPipelineEnabled: true,
    });

    const legacyPlan = planDispatch(dispatchState, env);
    const decision = reduceSchedulerTick(snapshot);

    const legacySpawned = legacyPlan.toSpawn.map(t => t.id).sort();
    const reducerSpawned = spawnedIds(decision);

    expect(legacySpawned).toEqual(['t2', 't3', 't5']);
    expect(reducerSpawned).toEqual(['t2', 't3', 't5']);
    expect(reducerSpawned).toEqual(legacySpawned); // divergence: none
    expect(blockedIds(decision)).toEqual(['t4']);
  });

  it('continuous mode: slot budget caps both identically', () => {
    const tasks = [makeTask('s1'), makeTask('s2'), makeTask('s3')];
    const { dispatchState, snapshot, env } = buildDualInputs({
      tasks, maxWorkers: 2, dependencyPipelineEnabled: false,
    });

    const legacyPlan = planDispatch(dispatchState, env);
    const decision = reduceSchedulerTick(snapshot);

    expect(legacyPlan.toSpawn.length).toBe(2);
    expect(spawnedIds(decision).length).toBe(2);
    expect(spawnedIds(decision)).toEqual(legacyPlan.toSpawn.map(t => t.id).sort());
  });

  it('legacy-fifo mode: an UNBLOCKED queue head is drained identically by both', () => {
    const q1 = makeTask('q1');
    const q2 = makeTask('q2');
    const tasks = [q1, q2];
    const { dispatchState, snapshot, env } = buildDualInputs({
      tasks, queue: [q1, q2], maxWorkers: 5, dependencyPipelineEnabled: false,
      completedTaskIds: ['done-worker-1'], strategy: 'legacy-fifo',
    });

    const legacyPlan = planDispatch(dispatchState, env);
    const decision = reduceSchedulerTick(snapshot);

    expect(legacyPlan.toSpawn.map(t => t.id)).toEqual(['q1']);
    expect(legacyPlan.toKill).toEqual(['done-worker-1']);
    expect(spawnedIds(decision)).toEqual(['q1']);
    const killed = decision.orderedEffects
      .filter((e): e is Extract<typeof e, { kind: 'KillWorker' }> => e.kind === 'KillWorker')
      .map(e => e.taskId);
    expect(killed).toEqual(['done-worker-1']);
  });

  it('cascade-skip: a PENDING dependent of a NO_GO upstream is skipped, never spawned, by both engines\' overall effect', () => {
    // planDispatch itself has no cascade-skip notion (that's cascadeSkipDeadBlocked,
    // a separate live closure) — the equivalence claim here is narrower: the reducer's
    // cascade-skip must NOT ALSO appear in its own spawn set (internal consistency),
    // and planDispatch (which has no cascade concept) simply never spawns a task whose
    // dependency isn't DONE either -- so neither engine spawns the dependent.
    const tasks = [
      makeTask('u1', { status: TaskStatus.NO_GO }),
      makeTask('dep1', { dependencies: ['u1'] }),
    ];
    const { dispatchState, snapshot, env } = buildDualInputs({
      tasks, maxWorkers: 5, dependencyPipelineEnabled: true,
    });

    const legacyPlan = planDispatch(dispatchState, env);
    const decision = reduceSchedulerTick(snapshot);

    expect(legacyPlan.toSpawn.map(t => t.id)).not.toContain('dep1');
    expect(spawnedIds(decision)).not.toContain('dep1');
    const cascadeSkipped = decision.orderedEffects
      .filter((e): e is Extract<typeof e, { kind: 'CascadeSkip' }> => e.kind === 'CascadeSkip')
      .map(e => e.taskId);
    expect(cascadeSkipped).toEqual(['dep1']);
  });
});

// ─── 3. Expected-divergence class ───────────────────────────────────────

describe('reduceSchedulerTick vs planDispatch — EXPECTED divergence (pinned, not a failure)', () => {
  it('FIFO dep-hole: legacy-fifo spawns a dependency-blocked queue head; the reducer marks it Blocked instead', () => {
    // docs/analysis/scheduler-unify-design-2026-07-11.md: "FIFO head blocked ise
    // destructive shift yapılmamalı" — planLegacyFifo's popEligibleFromQueue has NO
    // dependency check at all (result-collector.ts:451-460), so it spawns the head
    // unconditionally. The reducer's legacy-fifo path is dependency-aware BY DESIGN
    // (an intentional gap-closure, not a bug to reconcile) — this is dilim-7's
    // evidence-inventory case, pinned here as a non-failing, EXPECTED divergence.
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const freeSecond = makeTask('qfree');
    const upstream = makeTask('upstream'); // PENDING — never satisfies qb's dependency
    const tasks = [blockedHead, freeSecond, upstream];

    const { dispatchState, snapshot, env } = buildDualInputs({
      tasks, queue: [blockedHead, freeSecond], maxWorkers: 5,
      dependencyPipelineEnabled: true, completedTaskIds: ['done-worker-1'],
      strategy: 'legacy-fifo',
    });

    const legacyPlan = planDispatch(dispatchState, env);
    const decision = reduceSchedulerTick(snapshot);

    const legacySpawned = legacyPlan.toSpawn.map(t => t.id);
    const reducerSpawned = spawnedIds(decision);

    // The divergence itself, pinned exactly:
    expect(legacySpawned).toEqual(['qb']); // legacy: spawns the blocked head anyway
    expect(reducerSpawned).not.toContain('qb'); // reducer: never spawns a dep-blocked task
    expect(blockedIds(decision)).toContain('qb'); // reducer: explicitly marks it Blocked

    // Class-2 (expected-divergence) shape check — this is what dilim-7 will consume
    // as evidence: spawn-set membership differs on EXACTLY the blocked-head id.
    const divergingIds = legacySpawned.filter(id => !reducerSpawned.includes(id));
    expect(divergingIds).toEqual(['qb']);
  });
});

// ─── 4. captureShadowSchedulerSnapshot — queue/task clone pin ───────────

describe('captureShadowSchedulerSnapshot — clone pin (SCHED4 risk: live queue mutation)', () => {
  it('orderedQueue is a different array reference than the live remainingQueue, and is never mutated by later live changes', () => {
    const liveTask = makeTask('clone-me');
    const remainingQueue: Task[] = [liveTask];
    const sprint = makeSprint([liveTask]);

    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 1 },
      strategy: 'continuous',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: false,
      sprint,
      remainingQueue,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
    });

    expect(snapshot.orderedQueue).not.toBe(remainingQueue);
    expect(snapshot.tasks).not.toBe(sprint.tasks);

    // Mutate the LIVE queue/task AFTER capture — mirrors planDispatch's shift/splice
    // and applyStatusMutation's in-place status write happening later in the same tick.
    remainingQueue.pop();
    liveTask.status = TaskStatus.DONE;

    expect(snapshot.orderedQueue).toHaveLength(1);
    expect(snapshot.orderedQueue[0]!.id).toBe('clone-me');
    expect(snapshot.tasks[0]!.status).toBe(TaskStatus.PENDING); // NOT DONE — decoupled clone
  });
});

// ─── 5. Flag default-off contract ───────────────────────────────────────

describe('scheduler.shadow_reducer — default-off contract', () => {
  const isShadowReducerEnabled = (config: Pick<ResolvedConfig, 'scheduler'> | undefined): boolean =>
    config?.scheduler?.shadow_reducer === true;

  it('is false for every shape except an explicit {shadow_reducer: true}', () => {
    expect(isShadowReducerEnabled(undefined)).toBe(false);
    expect(isShadowReducerEnabled({} as Pick<ResolvedConfig, 'scheduler'>)).toBe(false);
    expect(isShadowReducerEnabled({ scheduler: {} })).toBe(false);
    expect(isShadowReducerEnabled({ scheduler: { shadow_reducer: false } })).toBe(false);
    expect(isShadowReducerEnabled({ scheduler: { shadow_reducer: true } })).toBe(true);
  });

  describe('zero-behavior-when-off (mkdtemp root)', () => {
    let root: string;
    beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'sched4-shadow-')); });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    it('when disabled, the caller never calls the driver at all -> no journal file appears', async () => {
      const configs: Array<Pick<ResolvedConfig, 'scheduler'>> = [
        {} as Pick<ResolvedConfig, 'scheduler'>,
        { scheduler: {} },
        { scheduler: { shadow_reducer: false } },
      ];
      const task = makeTask('off-1');
      const sprint = makeSprint([task]);

      for (const config of configs) {
        // Mirrors the exact guard installed in result-collector.ts's
        // captureShadowTick closure: `if (!shadowReducerEnabled || !config) return null`.
        if (isShadowReducerEnabled(config)) {
          await finalizeShadowSchedulerTick(root, sprint.id, captureShadowSchedulerSnapshot({
            trigger: { kind: 'watcher', sequence: 1 },
            strategy: 'continuous',
            nowMs: NOW_MS,
            costStop: false,
            slotBudget: 5,
            dependencyPipelineEnabled: false,
            sprint,
            remainingQueue: [],
            assignedTaskIds: new Set(),
            collectedIds: new Set(),
            completedTaskIds: [],
          }), { assignedTaskIdsAfter: new Set(), collectedIdsAfter: new Set() });
        }
      }

      expect(existsSync(schedulerShadowJournalPath(root, sprint.id))).toBe(false);
    });

    it('when enabled, a journal record IS appended (proves the flag actually wires through)', async () => {
      const task = makeTask('on-1');
      const sprint = makeSprint([task]);
      const config: Pick<ResolvedConfig, 'scheduler'> = { scheduler: { shadow_reducer: true } };

      expect(isShadowReducerEnabled(config)).toBe(true);
      const snapshot = captureShadowSchedulerSnapshot({
        trigger: { kind: 'initial', sequence: 1 },
        strategy: 'continuous',
        nowMs: NOW_MS,
        costStop: false,
        slotBudget: 5,
        dependencyPipelineEnabled: false,
        sprint,
        remainingQueue: [],
        assignedTaskIds: new Set(),
        collectedIds: new Set(),
        completedTaskIds: [],
      });
      await finalizeShadowSchedulerTick(root, sprint.id, snapshot, {
        assignedTaskIdsAfter: new Set(['on-1']),
        collectedIdsAfter: new Set(),
      });

      const journalPath = schedulerShadowJournalPath(root, sprint.id);
      expect(existsSync(journalPath)).toBe(true);
      const lines = readFileSync(journalPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const record = JSON.parse(lines[0]!);
      expect(record.legacyDecision.spawnedTaskIds).toEqual(['on-1']);
      expect(record.divergence).toEqual([]); // reducer agrees: it would also have spawned on-1
    });
  });
});

// ─── 6. Journal fail-soft ────────────────────────────────────────────────

describe('finalizeShadowSchedulerTick — fail-soft journal writes', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'sched4-failsoft-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('never throws even when the journal directory path is unwritable (a file sits where a dir is expected)', async () => {
    // .deckent/runtime/scheduler-shadow is the journal dir — pre-create
    // ".deckent/runtime" as a FILE so mkdirSync(..., {recursive:true}) for the
    // shadow subdir fails with ENOTDIR.
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'runtime'), 'not a directory');

    const task = makeTask('fs-1');
    const sprint = makeSprint([task]);
    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 1 },
      strategy: 'continuous',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: false,
      sprint,
      remainingQueue: [],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
    });

    await expect(
      finalizeShadowSchedulerTick(root, sprint.id, snapshot, {
        assignedTaskIdsAfter: new Set(),
        collectedIdsAfter: new Set(),
      }),
    ).resolves.toBeUndefined();
    expect(existsSync(schedulerShadowJournalPath(root, sprint.id))).toBe(false);
  });
});
