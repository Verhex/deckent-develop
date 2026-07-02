// src/core/trace-labels.ts
// ═══ TRN-LABEL (MASTER-PLAN Sıra-79, §3.5) — run-outcome label taxonomy ═════
// Pure taxonomy + two mappers for training/memory consumers that need a
// normalized, small run-outcome vocabulary instead of the raw worker/
// evaluation strings. No I/O, no trace-recorder/pipeline wiring here — that
// is explicitly a follow-up task; this module only defines the shape and the
// mapping logic so callers (present or future) share one source of truth.
//
// D-004 disk-verify (2026-07-02): `TaskEvaluation` lives in
// `src/core/task-types.ts` (core layer), not orchestra — so a direct
// core→core import would not violate the ADR-D-004 C1 layer-boundary rule.
// This module still avoids importing it: `mapTaskEvaluationToLabel` takes a
// structural string-union (`TaskEvaluationLike`) instead of the enum type,
// so trace-labels.ts stays fully decoupled from task-types.ts and keeps
// working unchanged if TaskEvaluation is ever relocated (e.g. to orchestra/).

import { z } from 'zod';

// ─── RunOutcomeLabel ─────────────────────────────────────────────────────────

/** The five-value run-outcome vocabulary training/memory consumers key off. */
export const RunOutcomeLabelSchema = z.enum(['success', 'partial', 'cancelled', 'failed', 'not_dispatched']);

export type RunOutcomeLabel = z.infer<typeof RunOutcomeLabelSchema>;

export const RUN_OUTCOME_LABELS: readonly RunOutcomeLabel[] = RunOutcomeLabelSchema.options;

// ─── Mapper 1: task-evaluation → label ──────────────────────────────────────

/**
 * Structural mirror of `TaskEvaluation` (src/core/task-types.ts) — a plain
 * 5-value string-union, not an import of the enum. See module header for why.
 */
export type TaskEvaluationLike = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | 'DEFERRED' | 'NOT_DISPATCHED';

/**
 * Map one worker/Brain task evaluation to its run-outcome label.
 * DONE -> success, GO_WITH_TECH_DEBT -> partial, NO_GO -> failed,
 * NOT_DISPATCHED -> not_dispatched (all four per the task spec), and
 * DEFERRED -> cancelled: DEFERRED means dispatcher saturation kept the task
 * from ever reaching EXECUTE (see task-types.ts TaskEvaluation doc) — a
 * dispatcher-side non-execution, distinct from NOT_DISPATCHED's disk-evidence
 * gap, and the one RunOutcomeLabel the other four mappings don't already
 * claim. Completes a clean 5<->5 bijection instead of leaving a silent gap.
 */
export function mapTaskEvaluationToLabel(evaluation: TaskEvaluationLike): RunOutcomeLabel {
  switch (evaluation) {
    case 'DONE': return 'success';
    case 'GO_WITH_TECH_DEBT': return 'partial';
    case 'NO_GO': return 'failed';
    case 'DEFERRED': return 'cancelled';
    case 'NOT_DISPATCHED': return 'not_dispatched';
    default: {
      // Exhaustiveness guard: TaskEvaluationLike is a closed union — unreachable.
      const _exhaustive: never = evaluation;
      return _exhaustive;
    }
  }
}

// ─── Mapper 2: sprint-summary → label (ratio-threshold) ─────────────────────

/** Ratio thresholds `mapSprintSummaryToLabel` applies to a sprint's label counts. */
export interface SprintLabelThresholds {
  /**
   * Minimum cancelled-rate (cancelled / total) at or above which the whole
   * sprint is labeled 'cancelled'. Checked before `majorityFailedRate` — a
   * deliberate dispatcher/human stop is a more operationally distinct signal
   * than an ordinary failure rate.
   */
  readonly majorityCancelledRate: number;
  /**
   * Minimum failed-rate (failed / total) at or above which the whole sprint
   * is labeled 'failed'. Mirrors the existing `noGoRate > 0.5` "majority
   * failed" convention (src/orchestra/sprint-metrics.ts generateSuggestions).
   */
  readonly majorityFailedRate: number;
}

export const DEFAULT_SPRINT_LABEL_THRESHOLDS: SprintLabelThresholds = {
  majorityCancelledRate: 0.5,
  majorityFailedRate: 0.5,
};

/**
 * Roll a sprint's per-task run-outcome label counts up into one sprint-level
 * label. Input is a `RunOutcomeLabel -> count` record (e.g. produced by
 * running every task's evaluation through `mapTaskEvaluationToLabel` and
 * tallying) rather than `SprintMetrics`/`Sprint` — keeps this module free of
 * any orchestra/sprint-types.ts dependency.
 *
 * Precedence: no tasks at all, or every task not_dispatched -> not_dispatched;
 * cancelled-rate at/over threshold -> cancelled; failed-rate at/over threshold
 * -> failed; every task succeeded -> success; otherwise -> partial (mixed
 * outcome — the natural "some of this sprint worked" reading).
 */
export function mapSprintSummaryToLabel(
  counts: Readonly<Record<RunOutcomeLabel, number>>,
  thresholds: SprintLabelThresholds = DEFAULT_SPRINT_LABEL_THRESHOLDS,
): RunOutcomeLabel {
  const total = counts.success + counts.partial + counts.failed + counts.cancelled + counts.not_dispatched;
  if (total === 0) return 'not_dispatched';
  if (counts.not_dispatched === total) return 'not_dispatched';
  if (counts.cancelled / total >= thresholds.majorityCancelledRate) return 'cancelled';
  if (counts.failed / total >= thresholds.majorityFailedRate) return 'failed';
  if (counts.success === total) return 'success';
  return 'partial';
}

// ─── Runtime validation ──────────────────────────────────────────────────────

/** Runtime-validatable shape for a `RunOutcomeLabel -> count` tally (nonnegative integers). */
export const RunOutcomeLabelCountsSchema = z.record(RunOutcomeLabelSchema, z.number().int().nonnegative());

export type RunOutcomeLabelCounts = z.infer<typeof RunOutcomeLabelCountsSchema>;
