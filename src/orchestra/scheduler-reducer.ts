// ═══ scheduler-reducer — born-634/635 SCHED4: full reducer, SHADOW-only ═════
//
// docs/analysis/scheduler-unify-design-2026-07-11.md ("Net Öneri", Sprint-4
// dilimi). `reduceSchedulerTick` is the pure model this design proposes as the
// eventual single scheduling authority — TODAY it is wired ONLY into the
// shadow-observation path (scheduler-driver.ts): it never spawns, kills, or
// mutates anything live. That live-switch is dilim-5+ (Net Öneri table).
//
// PURITY CONTRACT (binding — a violation here breaks the goCriteria):
//   - NO 'node:fs' / 'fs' import.
//   - NO process environment variable / process.* read.
//   - NO wall-clock time read (the function that returns "now" in milliseconds,
//     or the constructor that returns "the current date").
// Every time-dependent or environment-dependent input (nowMs, costStop,
// strategy, slotBudget, the already-computed effective-dependency-state, the
// already-computed collision-blocked set) is threaded in through
// `SchedulerSnapshot` by the caller (scheduler-driver.ts). This mirrors the
// existing purity discipline of `computeEffectiveDependencyState`
// (scheduler-state.ts) and `isDependencySatisfying`/`isSchedulingTerminalFailure`
// (scheduler-truth.ts) — both consumed here.

import type { Task, TaskStatus as TaskStatusType } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import type { EffectiveDependencyState } from './scheduler-state.js';

// ─── Snapshot (input) ────────────────────────────────────────────────────

/**
 * Where in the live tick sequence this snapshot was captured. The design doc
 * (Sprint-6 dilimi) names a THIRD kind, `'restore'`
 * ("Restore trigger.kind='restore' ile aynı reducer'a girer") for the
 * checkpoint-restore entry point — deliberately NOT added to this union yet:
 * `scheduler-journal.ts`'s `SchedulerShadowRecord.trigger` (out of this
 * task's scope.filesWrite) is narrowly typed `'initial' | 'watcher'` and
 * would need to widen in lockstep, so introducing the literal is left to
 * SCHED6-CKPT (the task that actually wires a restore call site) to do
 * atomically with that journal-type update. This reducer does not need the
 * literal to satisfy a restore trigger correctly regardless — the cascade-skip
 * pass below is intentionally NOT kind-gated (see its doc comment): any
 * snapshot captured post-restore, whatever `trigger.kind` it is labeled with,
 * is decided by the exact same already-terminal/already-collected exclusion
 * that makes every other tick idempotent.
 */
export type SchedulerTriggerKind = 'initial' | 'watcher';

export interface SchedulerTrigger {
  readonly kind: SchedulerTriggerKind;
  /** Monotonic per-sprint-run counter — NOT wall-clock; assigned by the driver. */
  readonly sequence: number;
}

/** Mirrors `DECKENT_LEGACY_FIFO=1` vs the default — see planDispatch (result-collector.ts). */
export type DispatchStrategy = 'continuous' | 'legacy-fifo';

/**
 * Lightweight, decoupled copy of the one Task shape the reducer actually
 * needs. Deliberately NOT the full `Task` — a fresh literal per task, built
 * by the driver at capture time, so the reducer can never observe (or be
 * blamed for) a live-object mutation that happens later in the same tick.
 */
export interface SchedulerTaskSnapshot {
  readonly id: string;
  readonly status: TaskStatusType;
  readonly dependencies: readonly string[];
  readonly fixForTaskId?: string;
  readonly retryAfter?: number;
}

export interface SchedulerSnapshot {
  readonly trigger: SchedulerTrigger;
  readonly strategy: DispatchStrategy;
  /** Threaded in by the caller — the reducer never reads wall-clock time itself. */
  readonly nowMs: number;
  /** Mid-sprint cost guard tripped this tick (born-562) — suppresses new spawn/kill only. */
  readonly costStop: boolean;
  /** Free worker slots this tick (maxWorkers - currentlyExecuting), precomputed by the driver. */
  readonly slotBudget: number;
  /** COPY of the live FIFO overflow queue, in order. Mutating this must never
   *  affect the live `remainingQueue` array — the driver guarantees the copy. */
  readonly orderedQueue: readonly SchedulerTaskSnapshot[];
  /** COPY of every task in the sprint (not just the queue) — needed for the
   *  continuous Step-2 PENDING scan, the cascade-skip scan, and ClearBlocked. */
  readonly tasks: readonly SchedulerTaskSnapshot[];
  readonly assignedTaskIds: ReadonlySet<string>;
  readonly collectedIds: ReadonlySet<string>;
  /** Newly-collected task IDs this tick — drives legacy-fifo's one-pop-per-completion. */
  readonly completedTaskIds: readonly string[];
  readonly dependencyPipelineEnabled: boolean;
  /**
   * Keep descendants of a repairable failed dependency non-terminal so the
   * lifecycle can enter EVALUATE/FIX and reopen them after lineage repair.
   * False preserves terminal cascade semantics for runs with no FIX budget.
   */
  readonly deferTerminalDependencyFailure?: boolean;
  /** From `computeEffectiveDependencyState` (scheduler-state.ts, sprint-411 helper) —
   *  the driver computes this once per tick and passes the result in as data. */
  readonly effectiveDependencyState: EffectiveDependencyState;
  /** Task IDs currently blocked by a scope-collision synthetic edge (design-doc gap
   *  matrix row "Collision edges") — precomputed by the driver via buildDependencyGraph,
   *  isolated from real `dependencies` edges. */
  readonly collisionBlockedIds: ReadonlySet<string>;
  /** Exact approved synthetic edge for each collision-blocked writer. Optional
   *  for backward-compatible snapshots; the set remains the blocking authority. */
  readonly collisionBlockingIds?: ReadonlyMap<string, string>;
}

// ─── Decision (output) ───────────────────────────────────────────────────

export type SchedulerEffect =
  | { readonly kind: 'SpawnTask'; readonly taskId: string; readonly reason: 'queue-drain' | 'pending-slot-fill' }
  | { readonly kind: 'KillWorker'; readonly taskId: string; readonly reason: 'legacy-fifo-replace' }
  | {
      readonly kind: 'CascadeSkip';
      readonly taskId: string;
      readonly failedDependencyId: string;
      /**
       * Deterministic — derived ONLY from `taskId` + `failedDependencyId`,
       * never from `snapshot.trigger.sequence`/`nowMs`. The design doc's
       * "Riskler" persist-before-commit gap requires the eventual executor
       * (SCHED6-EFF) to be able to recognize "this exact cascade-skip
       * decision was already durably applied" across a crash/replay/restore
       * boundary — recomputing the same (taskId, failedDependencyId) pair
       * MUST always yield this same key, so a re-decided tick (e.g. a
       * restore-trigger snapshot where the persist step never completed)
       * stays idempotent at the executor layer, not just at this reducer's
       * own already-terminal/already-collected exclusion below.
       */
      readonly idempotencyKey: string;
    }
  | {
      readonly kind: 'Blocked';
      readonly taskId: string;
      readonly reason: 'dependency-pending' | 'scope-collision' | 'retry-backoff';
      readonly blockingId?: string;
    }
  | { readonly kind: 'ClearBlocked'; readonly taskId: string }
  | { readonly kind: 'EmitMetric'; readonly name: string; readonly value: number; readonly tags?: Readonly<Record<string, string>> }
  | { readonly kind: 'WriteCheckpoint'; readonly reason: string };

export type SchedulerDisposition =
  | 'spawn'
  | 'blocked-dependency'
  | 'blocked-collision'
  | 'blocked-retry'
  | 'cascade-skip';

export interface SchedulerDecision {
  /** `orderedQueue` after this tick's drain — a NEW array, snapshot.orderedQueue untouched. */
  readonly nextQueue: readonly SchedulerTaskSnapshot[];
  /** taskId -> disposition assigned THIS tick (a task with no entry was untouched). */
  readonly dispositions: ReadonlyMap<string, SchedulerDisposition>;
  readonly orderedEffects: readonly SchedulerEffect[];
}

// ─── Reducer ──────────────────────────────────────────────────────────────

/**
 * Pure model of one scheduler tick — SHADOW-only today (scheduler-driver.ts
 * never executes `orderedEffects`, it only journals them for comparison).
 *
 * Two INTENTIONAL divergences from the live imperative closures, both called
 * out in the design doc as the gap this dilim closes and pinned as
 * expected-divergence fixtures in scheduler-shadow-equivalence.test.ts:
 *   1. Collision-aware + retry-aware blocking in BOTH strategies (the live
 *      `planDispatch` model has neither — design-doc gap-matrix rows
 *      "Collision edges" / "Retry backoff").
 *   2. legacy-fifo mode here does a dependency-aware index-scan (an entry
 *      whose deps aren't satisfying stays queued, not destructively shifted
 *      off) instead of the live `popEligibleFromQueue` shift-and-drop. This
 *      is the FIFO dep-hole the design doc names explicitly ("FIFO head
 *      blocked ise destructive shift yapılmamalı").
 */
export function reduceSchedulerTick(snapshot: SchedulerSnapshot): SchedulerDecision {
  const orderedEffects: SchedulerEffect[] = [];
  const dispositions = new Map<string, SchedulerDisposition>();

  // ─── ClearBlocked — mirrors maybeRespawn's per-tick DEPENDENCY_BLOCKED
  // dedupe-clear loop (result-collector.ts), gated identically: continuous +
  // dependency-pipeline-enabled only (maybeRespawn no-ops in legacy-fifo mode
  // and when the flag is off).
  if (snapshot.strategy === 'continuous' && snapshot.dependencyPipelineEnabled) {
    for (const t of snapshot.tasks) {
      if (t.status !== TaskStatus.PENDING) {
        orderedEffects.push({ kind: 'ClearBlocked', taskId: t.id });
      }
    }
  }

  // ─── Cascade-skip pass — mirrors cascadeSkipDeadBlocked, runs regardless of
  // costStop (the live main loop calls it unconditionally, even under a
  // tripped cost guard) AND regardless of trigger.kind — including 'restore'.
  // Idempotent-by-construction, not by a kind check: `collectedIds.has(t.id)`
  // excludes a task whose cascade-skip result was already durably written
  // (the common restore case — the crash happened AFTER persist), and
  // `t.status !== TaskStatus.PENDING` excludes one whose status was already
  // flipped terminal by a prior tick's executor. A task that is STILL PENDING
  // and uncollected on a restore snapshot (the crash happened BEFORE persist
  // completed — the design doc's persist-before-commit risk) is correctly
  // RE-decided here, with the same deterministic `idempotencyKey` it would
  // have received pre-crash, so the executor layer can recognize a retry.
  const failedIds = new Set<string>(snapshot.effectiveDependencyState.terminalFailureIds);
  const cascadeSkippedIds = new Set<string>();
  let changed = !snapshot.deferTerminalDependencyFailure;
  while (changed) {
    changed = false;
    for (const t of snapshot.tasks) {
      if (snapshot.collectedIds.has(t.id) || cascadeSkippedIds.has(t.id)) continue;
      if (t.status !== TaskStatus.PENDING) continue;
      if (snapshot.assignedTaskIds.has(t.id)) continue;
      const failedDep = t.dependencies.find(d => failedIds.has(d));
      if (!failedDep) continue;
      orderedEffects.push({
        kind: 'CascadeSkip',
        taskId: t.id,
        failedDependencyId: failedDep,
        idempotencyKey: `cascade-skip:${t.id}:${failedDep}`,
      });
      dispositions.set(t.id, 'cascade-skip');
      cascadeSkippedIds.add(t.id);
      failedIds.add(t.id); // transitive: a freshly-skipped task is terminal for ITS dependents too
      changed = true;
    }
  }
  if (cascadeSkippedIds.size > 0) {
    orderedEffects.push({ kind: 'EmitMetric', name: 'scheduler.cascade_skip', value: cascadeSkippedIds.size });
  }

  if (snapshot.costStop) {
    // Mirrors the main-loop cost-guard gate: no new SpawnTask/KillWorker this
    // tick. Cascade-skip above still ran (matches live behavior — cascade-skip
    // is unconditional). The queue is returned untouched.
    if (cascadeSkippedIds.size > 0) {
      orderedEffects.push({ kind: 'WriteCheckpoint', reason: 'cascade-skip-under-cost-stop' });
    }
    return { nextQueue: snapshot.orderedQueue, dispositions, orderedEffects };
  }

  const nextQueue =
    snapshot.strategy === 'legacy-fifo'
      ? reduceLegacyFifo(snapshot, orderedEffects, dispositions, cascadeSkippedIds)
      : reduceContinuous(snapshot, orderedEffects, dispositions, cascadeSkippedIds);

  const spawnedThisTick = orderedEffects.some(e => e.kind === 'SpawnTask');
  if (spawnedThisTick || cascadeSkippedIds.size > 0) {
    orderedEffects.push({ kind: 'WriteCheckpoint', reason: 'tick-progressed' });
  }

  return { nextQueue, dispositions, orderedEffects };
}

// ─── Block classification (shared by both strategies) ────────────────────

interface BlockClassification {
  readonly reason: 'dependency-pending' | 'scope-collision' | 'retry-backoff';
  readonly disposition: 'blocked-dependency' | 'blocked-collision' | 'blocked-retry';
  readonly blockingId?: string;
}

function classifyBlock(task: SchedulerTaskSnapshot, snapshot: SchedulerSnapshot): BlockClassification | null {
  if (snapshot.collisionBlockedIds.has(task.id)) {
    return {
      reason: 'scope-collision',
      disposition: 'blocked-collision',
      blockingId: snapshot.collisionBlockingIds?.get(task.id),
    };
  }
  if (!snapshot.effectiveDependencyState.retryEligibleIds.has(task.id)) {
    return { reason: 'retry-backoff', disposition: 'blocked-retry' };
  }
  if (snapshot.dependencyPipelineEnabled && task.dependencies.length > 0) {
    const blockingId = task.dependencies.find(d => !snapshot.effectiveDependencyState.satisfyingIds.has(d));
    if (blockingId) {
      return { reason: 'dependency-pending', disposition: 'blocked-dependency', blockingId };
    }
  }
  return null;
}

// ─── Continuous strategy ───────────────────────────────────────────────────

function reduceContinuous(
  snapshot: SchedulerSnapshot,
  effects: SchedulerEffect[],
  dispositions: Map<string, SchedulerDisposition>,
  cascadeSkippedIds: ReadonlySet<string>,
): readonly SchedulerTaskSnapshot[] {
  const queue = snapshot.orderedQueue.slice();
  let slots = snapshot.slotBudget;
  const chosen = new Set<string>();

  // Step 1 — drain the FIFO overflow queue. Index-scan (born-452-style): a
  // dep/collision/retry-blocked entry is left in place, not destructively
  // shifted off (matches planContinuous's own born-452 fix already).
  let i = 0;
  while (slots > 0 && i < queue.length) {
    const candidate = queue[i]!;
    if (snapshot.assignedTaskIds.has(candidate.id)) {
      queue.splice(i, 1); // already spawned elsewhere — drop, no requeue needed
      continue;
    }
    if (cascadeSkippedIds.has(candidate.id)) {
      queue.splice(i, 1); // just cascade-skipped this tick — never spawn
      continue;
    }
    const block = classifyBlock(candidate, snapshot);
    if (block) {
      effects.push({ kind: 'Blocked', taskId: candidate.id, reason: block.reason, ...(block.blockingId ? { blockingId: block.blockingId } : {}) });
      dispositions.set(candidate.id, block.disposition);
      i++;
      continue;
    }
    queue.splice(i, 1);
    effects.push({ kind: 'SpawnTask', taskId: candidate.id, reason: 'queue-drain' });
    dispositions.set(candidate.id, 'spawn');
    chosen.add(candidate.id);
    slots--;
  }

  // Step 2 — fill remaining slots from ALL PENDING sprint tasks not already
  // queued/chosen/cascade-skipped this tick.
  if (slots > 0) {
    const stillQueuedIds = new Set(queue.map(t => t.id));
    for (const t of snapshot.tasks) {
      if (slots <= 0) break;
      if (t.status !== TaskStatus.PENDING) continue;
      if (snapshot.assignedTaskIds.has(t.id)) continue;
      if (snapshot.collectedIds.has(t.id)) continue;
      if (chosen.has(t.id)) continue;
      if (cascadeSkippedIds.has(t.id)) continue;
      if (stillQueuedIds.has(t.id)) continue; // already evaluated (and left blocked) in Step 1
      const block = classifyBlock(t, snapshot);
      if (block) {
        effects.push({ kind: 'Blocked', taskId: t.id, reason: block.reason, ...(block.blockingId ? { blockingId: block.blockingId } : {}) });
        dispositions.set(t.id, block.disposition);
        continue;
      }
      effects.push({ kind: 'SpawnTask', taskId: t.id, reason: 'pending-slot-fill' });
      dispositions.set(t.id, 'spawn');
      chosen.add(t.id);
      slots--;
    }
  }

  return queue;
}

// ─── Legacy-FIFO strategy ───────────────────────────────────────────────────

function reduceLegacyFifo(
  snapshot: SchedulerSnapshot,
  effects: SchedulerEffect[],
  dispositions: Map<string, SchedulerDisposition>,
  cascadeSkippedIds: ReadonlySet<string>,
): readonly SchedulerTaskSnapshot[] {
  const queue = snapshot.orderedQueue.slice();

  for (const completedId of snapshot.completedTaskIds) {
    // INTENTIONAL divergence vs the live `popEligibleFromQueue` (destructive
    // shift, no dependency check) — see reduceSchedulerTick's doc comment and
    // scheduler-shadow-equivalence.test.ts's "expected-divergence: FIFO dep-hole".
    let pickedIndex = -1;
    for (let idx = 0; idx < queue.length; idx++) {
      const candidate = queue[idx]!;
      if (snapshot.assignedTaskIds.has(candidate.id)) {
        queue.splice(idx, 1);
        idx--;
        continue;
      }
      if (cascadeSkippedIds.has(candidate.id)) {
        queue.splice(idx, 1);
        idx--;
        continue;
      }
      const block = classifyBlock(candidate, snapshot);
      if (block) {
        effects.push({ kind: 'Blocked', taskId: candidate.id, reason: block.reason, ...(block.blockingId ? { blockingId: block.blockingId } : {}) });
        dispositions.set(candidate.id, block.disposition);
        continue; // stays queued — try the next entry
      }
      pickedIndex = idx;
      break;
    }
    if (pickedIndex === -1) break; // queue exhausted of eligible entries — "no kill when no work"
    const next = queue.splice(pickedIndex, 1)[0]!;
    effects.push({ kind: 'KillWorker', taskId: completedId, reason: 'legacy-fifo-replace' });
    effects.push({ kind: 'SpawnTask', taskId: next.id, reason: 'queue-drain' });
    dispositions.set(next.id, 'spawn');
  }

  return queue;
}

// Re-exported so callers/tests can build a snapshot task list from a live
// `Task[]` without duplicating the field-selection logic in multiple places.
export function toSchedulerTaskSnapshot(task: Pick<Task, 'id' | 'status' | 'dependencies' | 'fixForTaskId'> & { retryAfter?: number }): SchedulerTaskSnapshot {
  return {
    id: task.id,
    status: task.status,
    dependencies: [...(task.dependencies ?? [])],
    ...(task.fixForTaskId !== undefined ? { fixForTaskId: task.fixForTaskId } : {}),
    ...(task.retryAfter !== undefined ? { retryAfter: task.retryAfter } : {}),
  };
}
