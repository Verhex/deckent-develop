// ═══ scheduler-driver — SCHED4 shadow-runner ═══════════════════════════════
//
// docs/analysis/scheduler-unify-design-2026-07-11.md, Sprint-4 dilimi:
// "scheduler-driver.ts: shadow-koşucu — canlı tick'lerin yanında AYNI verinin
// immutable klonundan reducer'ı koşar." EXECUTION-ETKİSİ SIFIR: this module
// never spawns, kills, or mutates live sprint/queue/task state — it only
// reads (synchronously, at the pre-tick instant), clones, runs the pure
// reducer (scheduler-reducer.ts) on the clone, and journals a comparison
// against the live-observed outcome (scheduler-journal.ts, fail-soft).
//
// Two-phase API so the caller (result-collector.ts's waitForResults) can
// bracket the EXISTING, UNCHANGED live tick:
//   1. captureShadowSchedulerSnapshot() — BEFORE the live tick runs. Clones
//      the queue and every task into fresh literals (SchedulerTaskSnapshot),
//      never live Task references — this is the "queue MUST be cloned" risk
//      the design doc calls out explicitly (planDispatch itself mutates
//      remainingQueue via shift/splice; a shared reference would corrupt the
//      comparison and, worse, the live queue).
//   2. finalizeShadowSchedulerTick() — AFTER the live tick runs. Diffs the
//      caller-supplied before/after assignedTaskIds+collectedIds sets against
//      the reducer's own decision, and journals the comparison.
//
// Neither function calls planDispatch, spawn, kill, metric(), writeEvent(),
// or any checkpoint writer — "legacy" here means the ACTUAL live outcome,
// observed via set-diffing, not a second model invocation (that also avoids
// an import cycle with result-collector.ts, which is where planDispatch
// lives).

import type { Task, Sprint } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { computeEffectiveDependencyState } from './scheduler-state.js';
import { buildDependencyGraph } from './dependency-scheduler.js';
import {
  reduceSchedulerTick,
  toSchedulerTaskSnapshot,
} from './scheduler-reducer.js';
import type {
  SchedulerSnapshot,
  SchedulerTaskSnapshot,
  SchedulerTrigger,
  DispatchStrategy,
} from './scheduler-reducer.js';
import { appendSchedulerShadowRecord } from './scheduler-journal.js';
import type { SchedulerShadowDivergenceEntry } from './scheduler-journal.js';
import { debugLog } from '../core/utils.js';

// ─── Capture (pre-tick) ────────────────────────────────────────────────────

export interface CaptureShadowSchedulerSnapshotInput {
  readonly trigger: SchedulerTrigger;
  readonly strategy: DispatchStrategy;
  readonly nowMs: number;
  readonly costStop: boolean;
  readonly slotBudget: number;
  readonly dependencyPipelineEnabled: boolean;
  /** Live sprint — read synchronously at call time only, never stored by reference. */
  readonly sprint: Sprint;
  /** Live FIFO overflow queue — read synchronously at call time only, cloned immediately. */
  readonly remainingQueue: readonly Task[];
  readonly assignedTaskIds: ReadonlySet<string>;
  readonly collectedIds: ReadonlySet<string>;
  readonly completedTaskIds: readonly string[];
}

/**
 * Isolate scope-collision synthetic edges (dependency-scheduler.ts's
 * `buildDependencyGraph(..., includeCollisions=true)`) from a task's own
 * declared `dependencies` — the design doc's gap-matrix "Collision edges"
 * row, which `planDispatch` today has no notion of at all.
 */
function computeCollisionBlockedIds(tasks: readonly Task[], satisfyingIds: ReadonlySet<string>): Set<string> {
  const graph = buildDependencyGraph(tasks as Task[], true);
  const blocked = new Set<string>();
  for (const t of tasks) {
    if (t.status !== TaskStatus.PENDING) continue;
    const graphDeps = graph.dependencies.get(t.id);
    if (!graphDeps || graphDeps.size === 0) continue;
    const ownDeps = new Set(t.dependencies ?? []);
    for (const dep of graphDeps) {
      if (ownDeps.has(dep)) continue; // a real declared dependency edge, not a collision edge
      if (!satisfyingIds.has(dep)) {
        blocked.add(t.id);
        break;
      }
    }
  }
  return blocked;
}

function cloneTaskForSnapshot(task: Task): SchedulerTaskSnapshot {
  return toSchedulerTaskSnapshot({
    id: task.id,
    status: task.status,
    dependencies: task.dependencies,
    fixForTaskId: task.fixForTaskId,
    retryAfter: (task as Task & { retryAfter?: number }).retryAfter,
  });
}

/**
 * Build an immutable, fully-decoupled `SchedulerSnapshot` from the live
 * sprint/queue at THIS instant. Must be called BEFORE the live tick runs —
 * the returned snapshot is never updated afterward.
 */
export function captureShadowSchedulerSnapshot(input: CaptureShadowSchedulerSnapshotInput): SchedulerSnapshot {
  const effectiveDependencyState = computeEffectiveDependencyState(input.sprint.tasks, input.nowMs);
  const collisionBlockedIds = computeCollisionBlockedIds(input.sprint.tasks, effectiveDependencyState.satisfyingIds);

  return {
    trigger: input.trigger,
    strategy: input.strategy,
    nowMs: input.nowMs,
    costStop: input.costStop,
    slotBudget: input.slotBudget,
    dependencyPipelineEnabled: input.dependencyPipelineEnabled,
    // COPY — a fresh array of fresh literals, never the live Task[] references
    // (planDispatch-style shift/splice on the live array would otherwise leak
    // into this snapshot; see the design doc's "queue MUST be cloned" risk).
    orderedQueue: input.remainingQueue.map(cloneTaskForSnapshot),
    tasks: input.sprint.tasks.map(cloneTaskForSnapshot),
    assignedTaskIds: new Set(input.assignedTaskIds),
    collectedIds: new Set(input.collectedIds),
    completedTaskIds: [...input.completedTaskIds],
    effectiveDependencyState,
    collisionBlockedIds,
  };
}

// ─── Finalize (post-tick) ───────────────────────────────────────────────────

export interface ShadowTickObservedOutcome {
  /** `assignedTaskIds` read AFTER the live tick completed. */
  readonly assignedTaskIdsAfter: ReadonlySet<string>;
  /** `collected` read AFTER the live tick completed. */
  readonly collectedIdsAfter: ReadonlySet<string>;
}

function diffSpawned(before: ReadonlySet<string>, after: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of after) if (!before.has(id)) out.push(id);
  return out.sort();
}

/**
 * A task collected THIS tick that was never assigned (before OR after) can
 * only be a synthetic cascade-skip result — the only path that writes a
 * `.result` for a task that was never spawned. Precise without touching
 * `cascadeSkipDeadBlocked`'s signature.
 */
function diffCascadeSkipped(
  collectedBefore: ReadonlySet<string>,
  collectedAfter: ReadonlySet<string>,
  assignedAfter: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const id of collectedAfter) {
    if (collectedBefore.has(id)) continue;
    if (assignedAfter.has(id)) continue;
    out.push(id);
  }
  return out.sort();
}

function computeDivergence(
  legacySpawned: readonly string[],
  reducerSpawned: readonly string[],
  legacyCascadeSkipped: readonly string[],
  reducerCascadeSkipped: readonly string[],
): SchedulerShadowDivergenceEntry[] {
  const entries: SchedulerShadowDivergenceEntry[] = [];
  const legacySpawnedSet = new Set(legacySpawned);
  const reducerSpawnedSet = new Set(reducerSpawned);
  const legacyCascadeSet = new Set(legacyCascadeSkipped);
  const reducerCascadeSet = new Set(reducerCascadeSkipped);

  for (const id of legacySpawned) if (!reducerSpawnedSet.has(id)) entries.push({ kind: 'spawn-only-in-legacy', taskId: id });
  for (const id of reducerSpawned) if (!legacySpawnedSet.has(id)) entries.push({ kind: 'spawn-only-in-reducer', taskId: id });
  for (const id of legacyCascadeSkipped) if (!reducerCascadeSet.has(id)) entries.push({ kind: 'cascade-skip-only-in-legacy', taskId: id });
  for (const id of reducerCascadeSkipped) if (!legacyCascadeSet.has(id)) entries.push({ kind: 'cascade-skip-only-in-reducer', taskId: id });

  return entries;
}

/**
 * Run the reducer against a previously-captured snapshot, diff it against
 * the live-observed outcome, and append one journal record. Fail-soft: never
 * throws — a journal or reducer failure here must never surface into
 * `waitForResults`'s tick loop.
 */
export async function finalizeShadowSchedulerTick(
  projectRoot: string,
  sprintId: string,
  snapshot: SchedulerSnapshot,
  observed: ShadowTickObservedOutcome,
): Promise<void> {
  try {
    const decision = reduceSchedulerTick(snapshot);

    const legacySpawnedTaskIds = diffSpawned(snapshot.assignedTaskIds, observed.assignedTaskIdsAfter);
    const legacyCascadeSkippedTaskIds = diffCascadeSkipped(
      snapshot.collectedIds,
      observed.collectedIdsAfter,
      observed.assignedTaskIdsAfter,
    );

    const reducerSpawnedTaskIds = decision.orderedEffects
      .filter((e): e is Extract<typeof e, { kind: 'SpawnTask' }> => e.kind === 'SpawnTask')
      .map(e => e.taskId)
      .sort();
    const reducerCascadeSkippedTaskIds = decision.orderedEffects
      .filter((e): e is Extract<typeof e, { kind: 'CascadeSkip' }> => e.kind === 'CascadeSkip')
      .map(e => e.taskId)
      .sort();
    const reducerBlockedTaskIds = decision.orderedEffects
      .filter((e): e is Extract<typeof e, { kind: 'Blocked' }> => e.kind === 'Blocked')
      .map(e => e.taskId)
      .sort();

    const divergence = computeDivergence(
      legacySpawnedTaskIds,
      reducerSpawnedTaskIds,
      legacyCascadeSkippedTaskIds,
      reducerCascadeSkippedTaskIds,
    );

    appendSchedulerShadowRecord(projectRoot, sprintId, {
      seq: snapshot.trigger.sequence,
      trigger: snapshot.trigger.kind,
      ts: new Date().toISOString(),
      legacyDecision: {
        mode: snapshot.strategy,
        spawnedTaskIds: legacySpawnedTaskIds,
        cascadeSkippedTaskIds: legacyCascadeSkippedTaskIds,
      },
      reducerDecision: {
        mode: snapshot.strategy,
        spawnedTaskIds: reducerSpawnedTaskIds,
        cascadeSkippedTaskIds: reducerCascadeSkippedTaskIds,
        blockedTaskIds: reducerBlockedTaskIds,
      },
      divergence,
    });
  } catch (err) {
    debugLog('scheduler-driver:finalizeShadowSchedulerTick', err);
  }
}
