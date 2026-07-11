// ═══ scheduler-truth — born-610 SINGLE-TRUTH predicates ══════════════════════
//
// Pre-610 the scheduler had THREE contradictory answers to "does an upstream
// with status X satisfy its dependents?" scattered across respawnEligibleTasks
// (DONE ∪ MRR), the dispatch-ready scans (DONE only) and cascadeSkipDeadBlocked
// (MRR = terminal failure) — the same MANUAL_REVIEW_REQUIRED task could spawn,
// starve, or kill its dependents depending on `dependency_pipeline_enabled` and
// a worker-slot race. This module is the ONE place that vocabulary lives now.
//
// Semantic decision (Alperen, 2026-07-10, born-610): MRR is UNVERIFIED partial
// work — a human must review it; nothing may be built on top of it. Therefore:
//   • it does NOT satisfy dependents (never a foundation), and
//   • it IS terminal for scheduling (no in-run resolver exists) — dependents
//     are cascade-skipped, exactly like a NO_GO upstream.
// Sprint-280's FIX-deadlock (the reason MRR was once counted as satisfying)
// stays solved: dependents no longer wait forever — they are skipped, the
// sprint completes, and the human reviews the MRR work afterwards.
//
// planDispatch (result-collector.ts) remains a pinned MODEL, not the live
// driver — the full reducer/journal unification is follow-up work (born-634).

import { TaskStatus } from '../core/types.js';

/**
 * The ONLY status that satisfies a dependent's `dependencies` entry.
 * (Fix-task aggregation — a DONE `x-fix` satisfying deps on `x` — is an
 * ID-mapping concern, not a status one, so it lives one layer up: see
 * `computeEffectiveDependencyState` in scheduler-state.ts, the single place
 * that computation now runs for selectEligibleForSpawn, respawnEligibleTasks,
 * and findReadyUndispatchedTasks. planDispatch/planContinuous still rolls its
 * own aggregate set inline — pending unification, tracked as SCHED-treni
 * dilim-4 in docs/analysis/scheduler-unify-design-2026-07-11.md.)
 */
export function isDependencySatisfying(status: TaskStatus): boolean {
  return status === TaskStatus.DONE;
}

/**
 * Statuses that are TERMINAL failures for scheduling: dependents of such a
 * task can never become eligible in this run and must be cascade-skipped.
 */
export function isSchedulingTerminalFailure(status: TaskStatus): boolean {
  return status === TaskStatus.NO_GO || status === TaskStatus.MANUAL_REVIEW_REQUIRED;
}

/**
 * Statuses that mean "this task's scheduling story is over" (settled) —
 * dispatched-and-finished or terminally classified. Used by EVALUATE-boundary
 * scans; NOT the same as `isDependencySatisfying` (a NO_GO/MRR is settled but
 * satisfies nothing).
 */
export function isSchedulingSettled(status: TaskStatus): boolean {
  return isDependencySatisfying(status) || isSchedulingTerminalFailure(status);
}
