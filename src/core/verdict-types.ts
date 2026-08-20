// ─── Normative Verdict Vocabulary (ADR-G-040, owner decision 2026-08-20) ────
//
// One single-word verdict vocabulary for EVERY evaluation surface — the
// task evaluator, the criterion kernel, cross-verify and the future
// code/llm/human confirmation adapters — equally legible to an ERP process
// evaluation and a solo assistant task:
//
//   CONFIRMED    proven to pass
//   QUALIFIED    passes WITH a typed reservation (audit sense: a
//                "qualified opinion"); the reservation itself travels in
//                TaskResult.residualDebt, never in prose
//   UNDECIDABLE  honestly undecidable on present evidence — the routing
//                signal toward a custom-confirmation adapter, NEVER a penalty
//   FAILED       proven to fail
//   HOLD         procedural: authority/evidence chain incomplete; no verdict
//                was produced and HOLD is never a closure
//
// This module is the SSOT for the vocabulary (KANUN 10: no verdict string
// literals on other code paths). Legacy vocabularies (TaskEvaluation, worker
// selfAssessment, criterion statuses, cross-verify verdicts) map through the
// converters below; the lossy directions return null instead of guessing —
// a silent substitution would be a fabricated verdict.

import { TaskEvaluation } from './task-types.js';

export const NORMATIVE_VERDICTS = Object.freeze([
  'CONFIRMED',
  'QUALIFIED',
  'UNDECIDABLE',
  'FAILED',
  'HOLD',
] as const);

export type NormativeVerdict = (typeof NORMATIVE_VERDICTS)[number];

export function isNormativeVerdict(value: string): value is NormativeVerdict {
  return (NORMATIVE_VERDICTS as readonly string[]).includes(value);
}

/**
 * Host evaluation → normative. Total: every TaskEvaluation member has a
 * normative home. DEFERRED and NOT_DISPATCHED are procedural non-verdicts —
 * both are HOLD; the distinction stays in the record's rationale/reason.
 */
export function fromTaskEvaluation(evaluation: TaskEvaluation): NormativeVerdict {
  switch (evaluation) {
    case TaskEvaluation.DONE: return 'CONFIRMED';
    case TaskEvaluation.GO_WITH_TECH_DEBT: return 'QUALIFIED';
    case TaskEvaluation.NO_GO: return 'FAILED';
    case TaskEvaluation.DEFERRED: return 'HOLD';
    case TaskEvaluation.NOT_DISPATCHED: return 'HOLD';
  }
}

/** Rubric decision literal → normative (the 3-value evaluator surface). */
export function fromRubricDecision(
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
): NormativeVerdict {
  return fromTaskEvaluation(decision as TaskEvaluation);
}

/**
 * Worker selfAssessment → normative. Workers self-report on the 3-value
 * vocabulary; anything else (including the historical TIMEOUT_WITH_WORK
 * marker) is not a verdict claim → null, the caller decides.
 */
export function fromSelfAssessment(selfAssessment: string): NormativeVerdict | null {
  switch (selfAssessment) {
    case 'DONE': return 'CONFIRMED';
    case 'GO_WITH_TECH_DEBT': return 'QUALIFIED';
    case 'NO_GO': return 'FAILED';
    default: return null;
  }
}

/** Criterion kernel status → normative (EVALUATION-001 deterministic core). */
export function fromCriterionStatus(
  status: 'satisfied' | 'unsatisfied' | 'undecidable',
): NormativeVerdict {
  switch (status) {
    case 'satisfied': return 'CONFIRMED';
    case 'unsatisfied': return 'FAILED';
    case 'undecidable': return 'UNDECIDABLE';
  }
}

/**
 * Cross-verify adjudication verdict → normative. REFUTED is a proven
 * failure of the CLAIM; UNCLEAR is honest undecidability; unavailable is a
 * missing second-provider authority (procedural HOLD). Unknown → null.
 */
export function fromCrossVerifyVerdict(verdict: string): NormativeVerdict | null {
  switch (verdict.toUpperCase()) {
    case 'CONFIRMED': return 'CONFIRMED';
    case 'REFUTED': return 'FAILED';
    case 'UNCLEAR': return 'UNDECIDABLE';
    case 'HOLD': return 'HOLD';
    case 'UNAVAILABLE': return 'HOLD';
    default: return null;
  }
}

/**
 * Normative → legacy TaskEvaluation. PARTIAL by design: UNDECIDABLE and
 * HOLD have no honest 3-value projection — returning null forces the caller
 * to route them (adapter dispatch, typed hold) instead of silently coercing
 * a non-verdict into a pass or a failure.
 */
export function toTaskEvaluation(verdict: NormativeVerdict): TaskEvaluation | null {
  switch (verdict) {
    case 'CONFIRMED': return TaskEvaluation.DONE;
    case 'QUALIFIED': return TaskEvaluation.GO_WITH_TECH_DEBT;
    case 'FAILED': return TaskEvaluation.NO_GO;
    case 'UNDECIDABLE': return null;
    case 'HOLD': return null;
  }
}
