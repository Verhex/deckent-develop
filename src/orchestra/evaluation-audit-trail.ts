// ═══ Evaluation Audit Trail — Sprint 157 T-001 ═════════════════════════
// Forensic record of every Brain evaluation. Each evaluation attempt
// produces a JSON file under <projectRoot>/<EVALUATIONS_DIR>/<sprintId>/
// <taskId>-attempt-<N>.json so that a post-mortem reader can reconstruct
// the decision: which rubric ran, which criteria passed/failed, the
// schema validation result, and the human-readable rationale.
//
// This module owns ONLY the write path and the path/schema vocabulary.
// Wire-up (calling writeEvaluationAudit from result-evaluator /
// sprint-phases) is intentionally out of scope for Task 1 — it lives in
// Sprint 157 T-004.

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { EVALUATIONS_DIR } from '../core/constants.js';

/**
 * Rule-set identifier mirroring rubric-registry TaskType but in the
 * audit-trail's screaming-snake vocabulary so the file format reads
 * uniformly to a forensic reviewer.
 */
export type AuditRuleSet = 'CODE' | 'AUDIT' | 'DOC_WRITE';

/**
 * Score record for a single rubric criterion.
 *
 * `threshold` and `weight` are captured at audit time so the file is
 * self-contained: future rubric-registry refactors cannot retroactively
 * change what a past evaluation "should have" scored.
 */
export interface AuditCriterionScore {
  name: string;
  score: number;
  threshold: number;
  weight: number;
  passed: boolean;
  reason: string;
}

/**
 * Snapshot of the schema-validation gate that result-evaluator runs
 * before scoring. `coverageRelaxed` is true when the task type allowed
 * coverage:null without flagging it as a missing field (audit /
 * doc-write tasks per Sprint 154 Bug B fix).
 */
export interface AuditSchemaValidation {
  valid: boolean;
  missingFields: string[];
  coverageRelaxed: boolean;
}

/** Decision enum mirrors EvaluationResult.decision. */
export type AuditDecision = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

/**
 * Persisted audit record. All fields are required: a partial record is
 * not useful for forensic replay.
 */
export interface EvaluationAuditRecord {
  timestamp: string;
  taskId: string;
  sprintId: string;
  attemptNum: number;
  evaluator: 'brain';
  ruleSet: AuditRuleSet;
  schemaValidation: AuditSchemaValidation;
  criterionScores: AuditCriterionScore[];
  totalScore: number;
  decision: AuditDecision;
  decisionRationale: string;
}

/**
 * Input contract for {@link writeEvaluationAudit}. Callers (Brain at
 * evaluate-phase time) supply the rubric-evaluation outcome; the audit
 * trail adds the timestamp + evaluator literal + canonical layout.
 */
export interface EvaluationAuditInput {
  ruleSet: AuditRuleSet;
  schemaValidation: AuditSchemaValidation;
  criterionScores: AuditCriterionScore[];
  totalScore: number;
  decision: AuditDecision;
  /** Optional override; default built via {@link buildDecisionRationale}. */
  decisionRationale?: string;
  /** Optional override (testing); defaults to `new Date().toISOString()`. */
  timestamp?: string;
}

/**
 * Compose the canonical audit-record file path for a given attempt.
 *
 * Layout: `<projectRoot>/<EVALUATIONS_DIR>/<sprintId>/<taskId>-attempt-<N>.json`
 */
export function evaluationAuditPath(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  attemptNum: number,
): string {
  return join(
    projectRoot,
    EVALUATIONS_DIR,
    sprintId,
    `${taskId}-attempt-${attemptNum}.json`,
  );
}

/**
 * Build a deterministic, human-readable one-line rationale summarising the
 * decision. Used as the default `decisionRationale` when the caller does
 * not supply one.
 *
 * Format:
 *   - schema invalid → "Schema invalid: missing [<fields>] (coverageRelaxed=<bool>)"
 *   - schema valid   → "decision=<D> score=<S>/100 (<N> criteria, <P> passed[. Top fails: <names>])"
 */
export function buildDecisionRationale(
  decision: AuditDecision,
  totalScore: number,
  criterionScores: AuditCriterionScore[],
  schemaValidation: AuditSchemaValidation,
): string {
  if (!schemaValidation.valid) {
    const missing = schemaValidation.missingFields.join(', ');
    return `Schema invalid: missing [${missing}] (coverageRelaxed=${schemaValidation.coverageRelaxed})`;
  }

  const total = criterionScores.length;
  const passed = criterionScores.filter(c => c.passed).length;
  const failedNames = criterionScores
    .filter(c => !c.passed)
    .map(c => c.name);

  const rounded = Math.round(totalScore * 100) / 100;
  const base = `decision=${decision} score=${rounded}/100 (${total} criteria, ${passed} passed)`;

  if (failedNames.length === 0) {
    return base;
  }
  return `${base}. Top fails: ${failedNames.join(', ')}`;
}

/**
 * Persist a {@link EvaluationAuditRecord} for a single Brain evaluation
 * attempt.
 *
 * The function is idempotent for a fixed (sprintId, taskId, attemptNum)
 * triple: re-invoking it overwrites the existing file with the new
 * content. Different `attemptNum` values produce sibling files so that
 * FIX-phase retries do not clobber the original EVAL record.
 *
 * @returns The persisted record (the in-memory copy, identical to the
 *          JSON written to disk except for indentation).
 */
export function writeEvaluationAudit(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  attemptNum: number,
  input: EvaluationAuditInput,
): EvaluationAuditRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const decisionRationale = input.decisionRationale ?? buildDecisionRationale(
    input.decision,
    input.totalScore,
    input.criterionScores,
    input.schemaValidation,
  );

  const record: EvaluationAuditRecord = {
    timestamp,
    taskId,
    sprintId,
    attemptNum,
    evaluator: 'brain',
    ruleSet: input.ruleSet,
    schemaValidation: input.schemaValidation,
    criterionScores: input.criterionScores,
    totalScore: input.totalScore,
    decision: input.decision,
    decisionRationale,
  };

  const filePath = evaluationAuditPath(projectRoot, sprintId, taskId, attemptNum);
  mkdirSync(dirname(filePath), { recursive: true });

  // Atomic write: tmp → rename (same pattern as sprint-checkpoint.ts::writeCheckpoint).
  // A crash mid-write never leaves a half-serialized audit record for a post-mortem
  // reader to trip over — readers only ever see the prior file or the fully new one.
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch (renameErr) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
    throw renameErr;
  }

  return record;
}
