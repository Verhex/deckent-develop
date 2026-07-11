// ═══ scheduler-state — born-634/635 SCHED1: effective-dependency-state tekleme ══
//
// scheduler-truth.ts (born-610) tied the STATUS vocabulary down (does DONE/NO_GO/
// MRR satisfy or terminally-fail a dependent) but left fix-task aggregation as
// "the caller's responsibility" (scheduler-truth.ts:26-27). Three live call sites
// each rebuilt an aggregate-aware id-set independently and inconsistently:
//   - planContinuous / findReadyUndispatchedTasks (result-collector.ts) already
//     rolled a DONE `<id>-fix` up onto its `fixForTaskId` original.
//   - selectEligibleForSpawn (sprint-spawner.ts) and respawnEligibleTasks'
//     doneTasks set did NOT — a hardcoded/direct status check with no
//     aggregation (docs/analysis/scheduler-unify-design-2026-07-11.md, overlap
//     matrix row "Fix aggregation").
// This module is the ONE place that computation lives now (SCHED-treni dilim-1;
// see the design doc for the full 8-sprint migration this slice belongs to).
//
// PURE — no disk, no process.env, no Date.now(): `nowMs` is threaded in by the
// caller so this module is trivially unit-testable and replay-safe.

import type { Task } from '../core/types.js';
import { isDependencySatisfying, isSchedulingTerminalFailure } from './scheduler-truth.js';

export interface EffectiveDependencyState {
  /**
   * Task IDs that satisfy a dependent's `dependencies` entry: DONE tasks,
   * PLUS — one-level fix aggregation — the `fixForTaskId` a DONE `<id>-fix`
   * task points at. The original task's OWN status is irrelevant to this
   * aggregation (mirrors the pre-existing planContinuous /
   * findReadyUndispatchedTasks semantics verbatim — a DONE fix rescues its
   * original for dependents regardless of what the original's status is).
   */
  satisfyingIds: ReadonlySet<string>;
  /**
   * Task IDs whose dependents can never become eligible in this run
   * (NO_GO / MANUAL_REVIEW_REQUIRED), through the same one-level
   * fix-aggregation lens.
   */
  terminalFailureIds: ReadonlySet<string>;
  /**
   * Task IDs NOT currently blocked by a transient-retry backoff window —
   * `retryAfter` is undefined, or `retryAfter <= nowMs`.
   */
  retryEligibleIds: ReadonlySet<string>;
}

/**
 * Compute the effective dependency-scheduling state for one tick: the single
 * source for "does upstream X satisfy/terminally-fail its dependents" and
 * "is this task past its retry backoff", fix-aggregation-aware in both
 * directions. Callers combine these sets with their own dispatch policy
 * (dependency_pipeline_enabled gating, slot budget, assigned/collected
 * idempotency) — this function only classifies task IDs.
 */
export function computeEffectiveDependencyState(
  tasks: readonly Task[],
  nowMs: number,
): EffectiveDependencyState {
  const satisfyingIds = new Set<string>();
  const terminalFailureIds = new Set<string>();
  const retryEligibleIds = new Set<string>();

  for (const t of tasks) {
    if (isDependencySatisfying(t.status)) {
      satisfyingIds.add(t.id);
      if (t.fixForTaskId) satisfyingIds.add(t.fixForTaskId);
    }
    if (isSchedulingTerminalFailure(t.status)) {
      terminalFailureIds.add(t.id);
      if (t.fixForTaskId) terminalFailureIds.add(t.fixForTaskId);
    }

    const retryAfter = (t as Task & { retryAfter?: number }).retryAfter;
    if (retryAfter === undefined || retryAfter <= nowMs) {
      retryEligibleIds.add(t.id);
    }
  }

  return { satisfyingIds, terminalFailureIds, retryEligibleIds };
}
