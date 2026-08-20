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

import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { EVALUATIONS_DIR } from '../core/constants.js';
import { ErrorRegistry } from '../core/errors.js';
import { fromRubricDecision, type NormativeVerdict } from '../core/verdict-types.js';
import type { AcceptanceOutcome } from '../core/acceptance-matrix.js';

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
  /**
   * ADR-G-040 normative projection of `decision` (single-word vocabulary
   * shared by every evaluation surface). Derived here at write time — the
   * legacy 3-value decision stays authoritative for this record's readers
   * until their surfaces migrate.
   */
  normativeVerdict: NormativeVerdict;
  /**
   * Acceptance-matrix OBSERVE stamp (task-kind × verdict policy outcome).
   * Present when the caller could classify the task and the verdict is
   * decidable (procedural HOLDs carry none — they are outside the policy).
   * Observation only in this slice: the action never changes the decision.
   */
  acceptance?: AcceptanceOutcome;
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
  /** Acceptance-matrix OBSERVE stamp — see {@link EvaluationAuditRecord.acceptance}. */
  acceptance?: AcceptanceOutcome;
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
    normativeVerdict: fromRubricDecision(input.decision),
    ...(input.acceptance !== undefined ? { acceptance: input.acceptance } : {}),
    decisionRationale,
  };

  const filePath = evaluationAuditPath(projectRoot, sprintId, taskId, attemptNum);
  mkdirSync(dirname(filePath), { recursive: true });

  // RECEIPT-BEFORE-DONE (2026-08-16): conflict-fail-closed. A receipt for a fixed
  // (sprintId, taskId, attemptNum) is immutable once its decision is recorded.
  // Re-writing the SAME decision is idempotent (crash/replay safe); a DIFFERENT
  // decision for the same attempt is a forensic conflict and is REFUSED — a
  // dependent must never be admitted on a receipt that was silently rewritten.
  if (existsSync(filePath)) {
    try {
      const prior = JSON.parse(readFileSync(filePath, 'utf-8')) as { decision?: unknown };
      if (prior.decision !== undefined && prior.decision !== record.decision) {
        throw ErrorRegistry.createError('DECKENT_E094', {
          message: `EVALUATION_AUDIT_CONFLICT: ${sprintId}/${taskId}/attempt-${attemptNum} already recorded `
            + `decision=${String(prior.decision)}; refusing to overwrite with ${record.decision}`,
        });
      }
    } catch (priorErr) {
      if (priorErr instanceof Error && priorErr.message.startsWith('EVALUATION_AUDIT_CONFLICT')) throw priorErr;
      throw ErrorRegistry.createError('DECKENT_E094', {
        message: `EVALUATION_AUDIT_CONFLICT: ${sprintId}/${taskId}/attempt-${attemptNum} `
          + `has unreadable existing receipt; refusing to overwrite immutable evidence`,
      });
    }
  }

  // Atomic + DURABLE write: tmp → fsync(tmp) → rename → fsync(dir). The receipt is
  // flushed to stable storage BEFORE its dependent task's status can flip to DONE,
  // so a crash after the receipt / before the status leaves the receipt recoverable
  // and the RECEIPT-BEFORE-DONE invariant intact. Readers only ever see the prior
  // file or the fully-new one.
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  fsyncFilePath(tmpPath);
  try {
    renameSync(tmpPath, filePath);
  } catch (renameErr) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
    throw renameErr;
  }
  fsyncDirectoryPath(dirname(filePath));

  return record;
}

/** A receipt is not publishable unless its file bytes reach the filesystem. */
function fsyncFilePath(p: string): void {
  const fd = openSync(p, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Directory fsync is unavailable on some supported filesystems; the file fsync above remains mandatory. */
function fsyncDirectoryPath(p: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(p, 'r');
    fsyncSync(fd);
  } catch {
    /* Platform adapter limitation: atomic rename still prevents partial JSON visibility. */
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* already closed */ }
  }
}

/**
 * RECEIPT-BEFORE-DONE (2026-08-16): true iff the durable settlement receipt for
 * `(sprintId, taskId)` at ANY attempt is already persisted and readable. The
 * canonical DONE transition and the disk-aware dispatch chokepoint consult this
 * so a dependent is never admitted on a status whose receipt has not yet landed.
 */
export function hasSettlementReceipt(projectRoot: string, sprintId: string, taskId: string): boolean {
  if (!sprintId) return false;
  const dir = join(projectRoot, EVALUATIONS_DIR, sprintId);
  if (!existsSync(dir)) return false;
  const prefix = `${taskId}-attempt-`;
  try {
    return readdirSync(dir).some((n) => n.startsWith(prefix) && n.endsWith('.json'));
  } catch {
    return false;
  }
}
