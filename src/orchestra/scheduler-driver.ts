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

import type { Task, Sprint, ResolvedConfig } from '../core/types.js';
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
  SchedulerTriggerKind,
  DispatchStrategy,
} from './scheduler-reducer.js';
import { appendSchedulerShadowRecord } from './scheduler-journal.js';
import type { SchedulerShadowDivergenceEntry } from './scheduler-journal.js';
import { executeSchedulerDecision } from './scheduler-effects.js';
import type { SpawnTaskDeps } from './scheduler-effects.js';
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
  /**
   * born-676 (SCHED-8 önkoşulu): which engine's decision was actually EXECUTED
   * this tick — `legacyDecision`/`reducerDecision` below are always BOTH
   * present (compare-and-journal), so on their own a reader cannot tell which
   * of the two corresponds to real, executed effects vs. a shadow simulation.
   * Additive + optional: the current call site doesn't pass it yet (that
   * live-wiring, from `resolveSchedulerEngine`/`createSchedulerDriver`'s
   * already-resolved engine, is SCHED-8's job) — omitting it here keeps every
   * existing 4-arg call compiling unchanged and produces the same journal
   * byte-shape as before this field existed.
   */
  executedEngine?: SchedulerEngine,
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
      executedEngine,
      divergence,
    });
  } catch (err) {
    debugLog('scheduler-driver:finalizeShadowSchedulerTick', err);
  }
}

// ═══ SCHED5 — Injected Runtime Driver (dilim-5, docs/analysis/ ════════════
// scheduler-unify-design-2026-07-11.md, "Continuous live switch") ══════════
//
// SCHED4 above wires `reduceSchedulerTick` into a SHADOW-only observation
// path (capture/finalize never spawn, kill, or mutate anything live). This
// section adds the LIVE counterpart: `createSchedulerDriver` returns ONE
// function that BOTH the "initial" tick and every "watcher" tick in
// result-collector.ts's `waitForResults` call — closing the design doc's
// dilim-5 risk verbatim ("Initial spawn reducer'a alınmazsa 'tek truth'
// iddiası eksik kalır"): there is exactly one call-site SHAPE (`driver(...)`)
// for both triggers, never a bypassed initial pass.
//
// Config gate: `scheduler.engine` — 'legacy' (default) | 'reducer'.
//   - 'legacy' (default, or config/engine absent): the driver is a pure
//     passthrough — it awaits the caller-supplied `runLegacyTick()` and does
//     nothing else. This IS the entire legacy contract: the exact pre-SCHED5
//     closure sequence (processQueue+maybeRespawn[+forceRescanIfIdle]+
//     dispatchReadyTasks) runs unmodified, so behavior is byte-identical to
//     before this dilim — pinned by scheduler-driver-composition.test.ts.
//   - 'reducer': the driver captures a live snapshot (same shape as the
//     SCHED4 shadow capture above), runs `reduceSchedulerTick`, and executes
//     the resulting SpawnTask/KillWorker effects through
//     `executeSchedulerDecision` (scheduler-effects.ts) — the SAME canonical
//     `executeSpawnTask` every other trigger has routed through since SCHED3.
//     `runLegacyTick` is never invoked. CascadeSkip/Blocked/checkpoint
//     effects are intentionally NOT executed here (dilim-6/7 scope, see
//     scheduler-effects.ts's doc comment) — the pre-existing
//     cascadeSkipDeadBlocked/DEPENDENCY_BLOCKED/checkpoint mechanisms keep
//     running unconditionally in result-collector.ts, independent of engine.

export type SchedulerEngine = 'legacy' | 'reducer';

/**
 * Local cast — `scheduler.engine` is not yet promoted to `SchedulerConfig`
 * (config-types.ts, out of this slice's write scope). Mirrors the
 * `token_throttle_ms` / `dependency_pipeline_enabled` local-cast idiom
 * already used elsewhere in this codebase (e.g. sprint-spawner.ts's
 * readTokenThrottleMs). Every shape except the literal `{engine:'reducer'}`
 * resolves to 'legacy' — same fail-safe default-off contract as
 * `scheduler.shadow_reducer`.
 */
export function resolveSchedulerEngine(scheduler: unknown): SchedulerEngine {
  const engine = (scheduler as { engine?: unknown } | undefined)?.engine;
  return engine === 'reducer' ? 'reducer' : 'legacy';
}

export interface SchedulerDriverTickInput {
  readonly trigger: SchedulerTriggerKind;
  /** Task IDs newly collected THIS tick — mirrors captureShadowTick's own
   *  `completedTaskIds` argument; drives legacy-fifo's one-pop-per-completion. */
  readonly completedTaskIds: readonly string[];
  /** The EXACT pre-SCHED5 closure sequence for this trigger. Invoked verbatim
   *  when the driver's engine is 'legacy'; never invoked when 'reducer'. */
  readonly runLegacyTick: () => Promise<void>;
}

export interface SchedulerDriverTickResult {
  readonly engine: SchedulerEngine;
  readonly spawnedTaskIds: readonly string[];
  readonly killedWorkerIds: readonly string[];
}

export interface SchedulerDriverDeps {
  readonly sprint: Sprint;
  /** Optional — mirrors `SpawnTaskDeps.config`. The reducer engine is only
   *  reachable via `resolveSchedulerEngine(config?.scheduler)` returning
   *  'reducer', which itself requires a `config` to exist; this stays
   *  optional so a caller that somehow requests 'reducer' without a config
   *  falls back to `runLegacyTick` (defense-in-depth) instead of throwing. */
  readonly config: ResolvedConfig | undefined;
  /** Live, mutable FIFO overflow queue — spliced in place to mirror the
   *  reducer's `nextQueue` (never reassigned; callers hold a `const` reference,
   *  same contract as `captureShadowSchedulerSnapshot`'s clone-only read). */
  readonly remainingQueue: Task[];
  /** Live, mutable — SpawnTask effects add to it before spawning and roll
   *  back on failure, mirroring result-collector.ts's spawnIfNotAssigned
   *  Bug-F idempotency guard. */
  readonly assignedTaskIds: Set<string>;
  readonly collectedIds: ReadonlySet<string>;
  readonly getSlotBudget: () => number;
  readonly getCostStop: () => boolean;
  readonly spawnDeps: SpawnTaskDeps;
  readonly killWorker: (taskId: string) => void;
}

/**
 * Build the single injected driver function — call it identically from both
 * the initial tick and every watcher tick in `waitForResults`.
 */
export function createSchedulerDriver(
  engine: SchedulerEngine,
  deps: SchedulerDriverDeps,
): (input: SchedulerDriverTickInput) => Promise<SchedulerDriverTickResult> {
  let sequence = 0;

  // born-676 (SCHED-8 önkoşulu): loud, one-line, sprint-start announcement of
  // which engine this scheduling round actually executes — today this was
  // only provable INDIRECTLY (config + composition-test + 0-divergence, per
  // sprint-428's disk-verify). Fires exactly once per driver construction
  // (once per waitForResults call), never per tick. Mirrors the closure's own
  // fallback-to-legacy guard below so the log never claims 'reducer' when
  // deps.config is absent and every tick would silently run legacy anyway.
  const effectiveEngine: SchedulerEngine = engine === 'reducer' && deps.config ? 'reducer' : 'legacy';
  console.log(`[deckent] scheduler engine: ${effectiveEngine}`);

  return async (input: SchedulerDriverTickInput): Promise<SchedulerDriverTickResult> => {
    if (engine !== 'reducer' || !deps.config) {
      await input.runLegacyTick();
      return { engine: 'legacy', spawnedTaskIds: [], killedWorkerIds: [] };
    }

    sequence++;
    const strategy: DispatchStrategy = process.env.DECKENT_LEGACY_FIFO === '1' ? 'legacy-fifo' : 'continuous';
    let snapshot: SchedulerSnapshot;
    try {
      snapshot = captureShadowSchedulerSnapshot({
        trigger: { kind: input.trigger, sequence },
        strategy,
        nowMs: Date.now(),
        costStop: deps.getCostStop(),
        slotBudget: deps.getSlotBudget(),
        dependencyPipelineEnabled: deps.config.dependency_pipeline_enabled === true,
        sprint: deps.sprint,
        remainingQueue: deps.remainingQueue,
        assignedTaskIds: deps.assignedTaskIds,
        collectedIds: deps.collectedIds,
        completedTaskIds: input.completedTaskIds,
      });
    } catch (e) {
      debugLog('createSchedulerDriver:capture', e);
      return { engine: 'reducer', spawnedTaskIds: [], killedWorkerIds: [] };
    }

    const decision = reduceSchedulerTick(snapshot);
    const taskMap = new Map(deps.sprint.tasks.map(t => [t.id, t]));
    const execResult = await executeSchedulerDecision(decision, {
      ...deps.spawnDeps,
      taskMap,
      assignedTaskIds: deps.assignedTaskIds,
      killWorker: deps.killWorker,
    });

    // Mirror the reducer's nextQueue back onto the live queue — splice in
    // place, never reassign (the caller holds a `const remainingQueue`).
    const survivingIds = new Set(decision.nextQueue.map(t => t.id));
    const survivors = deps.remainingQueue.filter(t => survivingIds.has(t.id));
    deps.remainingQueue.splice(0, deps.remainingQueue.length, ...survivors);

    return {
      engine: 'reducer',
      spawnedTaskIds: execResult.spawnedTaskIds,
      killedWorkerIds: execResult.killedWorkerIds,
    };
  };
}
