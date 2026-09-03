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
import { types as nodeTypes } from 'node:util';

import { EVALUATIONS_DIR } from '../core/constants.js';
import { ErrorRegistry } from '../core/errors.js';
import { fromRubricDecision, type NormativeVerdict } from '../core/verdict-types.js';
import type { AcceptanceOutcome } from '../core/acceptance-matrix.js';
import {
  reduceAcceptanceSettlement,
  type AcceptanceSettlement,
} from '../core/acceptance-settlement.js';
import {
  canonicalTaskAttemptCustodyJson,
  taskAttemptCustodyDigest,
  type Sha256Digest,
  type TaskAttemptCustodyAdmissionV2,
  type TaskAttemptCustodyArtifactReceiptV2,
  type TaskAttemptCustodyChainReceiptV2,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyStore,
  type TaskAttemptCustodyVerifiedEffectLandingV2,
} from '../core/task-attempt-custody-store.js';
import {
  createTaskResultSettlementV2,
  parseTaskResultSettlementV2,
  taskResultSettlementV2Digest,
  type TaskResultSettlementV2ArchivePayload,
  type TaskResultSettlementV2,
} from '../core/task-result-settlement.js';
import type { EvaluationResult, EvaluationRubric } from '../core/task-types.js';
import type { TaskResultV2 } from '../core/task-result-schema.js';
import type { TaskResult } from '../core/types.js';
import { createExactTaskResultSettlementRefV2 } from '../core/task-settlement-authority.js';
import {
  applyExactAcceptanceEnforcement,
  type AcceptanceEnforcementResult,
  type AcceptanceRouteClaim,
  type ExactAcceptanceTaskAuthority,
} from './acceptance-enforcement.js';
import {
  hasExactAuthorityKeys,
  isBoundedExactAuthorityPlainData,
  isExactAcceptedResultTerminalAuthorityV2,
  type ExactAcceptedResultTerminalAuthorityV2,
  type SettleExactAcceptedResult,
} from './exact-accepted-result-terminal-authority.js';
import {
  projectExactTaskResultV2ForEvaluation,
  readExactAcceptedTaskResultV2,
  readExactSettledTaskResultV2,
  type ExactAcceptedTaskResultAuthorityMetadata,
  type ExactTaskResultAuthorityMetadata,
} from './task-result-authority.js';
import {
  evaluateExactAcceptedResultWithRubric,
  gateProductionWiringVerdict,
} from './result-evaluator.js';
import { resolveCanonicalTaskKind } from './rubric-registry.js';
import { parseExactDockerDispatchTaskSnapshotAuthority } from './exact-docker-dispatch-task-authority.js';
import { readExactAcceptedTaskProviderExitAuthority } from './exact-docker-provider-exit-authority.js';
import { evaluateExactGoNogoCriteria } from './criterion-evaluation.js';
import type { ExactTaskTerminalDecisionAuthorityV2 } from './task-settlement-projection.js';
import { readExactProductionWiringHostSettlement } from './production-wiring-host-observation.js';

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

// ─── Exact accepted-attempt terminal authority (T11) ──────────────────────

export interface ExactTaskEvaluationFailedCriterionV2 {
  readonly criterion: string;
  readonly score: number;
  readonly reason: string;
}

export interface ExactTaskEvaluationReceiptV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-task-evaluation-receipt-v2';
  readonly state: 'evaluated';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly evaluationPolicyDigest: Sha256Digest;
  readonly providerExitAuthorityDigest: Sha256Digest;
  readonly dispatchAdmissionRefDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly rubricEvaluationSnapshot: EvaluationResult;
  readonly rubricEvaluationSnapshotDigest: Sha256Digest;
  readonly evaluationSnapshot: EvaluationResult;
  readonly evaluationSnapshotDigest: Sha256Digest;
  readonly acceptanceDecision: ExactTaskAcceptanceDecisionSnapshotV2;
  readonly acceptanceDecisionDigest: Sha256Digest;
  readonly runPolicyEvidenceDigest: Sha256Digest | null;
  readonly criteriaEvidenceDigest: Sha256Digest;
  readonly testVerificationDigest: Sha256Digest | null;
  readonly productionWiringEvidenceDigest: Sha256Digest | null;
  readonly effectLandingBindingDigest: Sha256Digest;
  readonly effectLandingReceiptDigest: Sha256Digest;
  readonly finalManifestDigest: Sha256Digest;
  readonly criterionEvaluationAuthorityDigest: Sha256Digest;
  readonly productionWiringSettlementDigest: Sha256Digest | null;
  readonly productionWiringSettlementArtifactReceiptDigest: Sha256Digest | null;
  readonly verdict: AuditDecision;
  readonly totalScore: number;
  readonly failedCriteria: readonly ExactTaskEvaluationFailedCriterionV2[];
  readonly evaluatedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export interface ExactTaskAcceptanceDecisionSnapshotV2 {
  readonly outcome: AcceptanceOutcome;
  readonly settlement: AcceptanceSettlement;
  readonly enforced: boolean;
  readonly postRubricCause: string | null;
  readonly routeClaim: AcceptanceRouteClaim | null;
  readonly confirmationReceiptDigest: Sha256Digest | null;
}

export interface ExactTaskFinalizerReceiptV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-task-finalizer-receipt-v2';
  readonly state: 'terminal-ready';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly evaluationArtifactReceiptDigest: Sha256Digest;
  readonly evaluationChainDigest: Sha256Digest;
  readonly evaluationReceiptDigest: Sha256Digest;
  readonly verdict: AuditDecision;
  readonly finalizedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export type ExactAcceptedTaskTerminalAuthorityRead =
  | {
      readonly state: 'current';
      readonly terminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
      readonly terminalResultAuthority: ExactTaskResultAuthorityMetadata;
      readonly evaluationReceipt: ExactTaskEvaluationReceiptV2;
      readonly finalizerReceipt: ExactTaskFinalizerReceiptV2;
      readonly result: TaskResultV2;
      readonly projectedResult: TaskResult;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: string;
    };

/**
 * Consumer-side shape/binding guard for a Store-produced terminal reread.
 * This does not recreate T11's decision; it only prevents a foreign callback
 * from pairing a valid terminal wrapper with a sibling result or verdict.
 */
export function isCurrentExactAcceptedTaskTerminalAuthorityRead(
  taskId: string,
  expectedTerminalAuthority: ExactAcceptedResultTerminalAuthorityV2,
  value: ExactAcceptedTaskTerminalAuthorityRead,
): value is Extract<ExactAcceptedTaskTerminalAuthorityRead, { readonly state: 'current' }> {
  try {
    if (
      value.state !== 'current'
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || !hasExactAuthorityKeys(value, [
        'state', 'terminalAuthority', 'terminalResultAuthority',
        'evaluationReceipt', 'finalizerReceipt', 'result', 'projectedResult',
      ])
      || !isExactAcceptedResultTerminalAuthorityV2(
        expectedTerminalAuthority,
        expectedTerminalAuthority.acceptedAuthority,
      )
      || !isExactAcceptedResultTerminalAuthorityV2(
        value.terminalAuthority,
        expectedTerminalAuthority.acceptedAuthority,
      )
      || JSON.stringify(value.terminalAuthority) !== JSON.stringify(expectedTerminalAuthority)
      || JSON.stringify(value.terminalResultAuthority)
        !== JSON.stringify(expectedTerminalAuthority.terminalResultAuthority)
      || value.terminalAuthority.acceptedAuthority.identity.taskId !== taskId
      || value.result.taskId !== taskId
      || value.projectedResult.taskId !== taskId
      || value.evaluationReceipt.verdict
        !== expectedTerminalAuthority.terminalDecisionAuthority.evaluationReceipt.verdict
      || value.finalizerReceipt.verdict !== value.evaluationReceipt.verdict
    ) return false;
    const resultIdentity = value.result.attemptCustody.identity;
    return JSON.stringify(resultIdentity)
      === JSON.stringify(expectedTerminalAuthority.acceptedAuthority.identity);
  } catch {
    return false;
  }
}

export type SettleExactAcceptedTaskEvaluationResult =
  | {
      readonly state: 'settled';
      readonly authority: ExactAcceptedResultTerminalAuthorityV2;
      readonly enforcement: AcceptanceEnforcementResult;
      readonly settlementRef: ExactTaskResultAuthorityMetadata['settlementRef'];
      readonly settlementDigest: Sha256Digest;
    }
  | {
      readonly state: 'route-required';
      readonly enforcement: AcceptanceEnforcementResult & Required<Pick<
        AcceptanceEnforcementResult,
        'routeClaim' | 'pendingConfirmation'
      >>;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: string;
    };

export interface SettleExactAcceptedTaskEvaluationInput {
  readonly projectRoot: string;
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
}

function hasExactTerminalInputFields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) return false;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every(key => keys.includes(key))
    || keys.some(key => typeof key !== 'string' || !allowed.has(key))
  ) return false;
  for (const key of keys) {
    if (typeof key !== 'string') return false;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return false;
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
    if (descriptor.value === undefined) return false;
  }
  return true;
}

function exactTerminalSameIdentity(
  left: TaskAttemptCustodyIdentityV2,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

function exactTerminalTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Number.isFinite(Date.parse(value));
}

function exactTerminalDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isExactTerminalCanonicalData(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): boolean {
  try {
    canonicalTaskAttemptCustodyJson(value, policy.jsonBounds);
    return true;
  } catch {
    return false;
  }
}

function exactTerminalIdentity(value: unknown): value is TaskAttemptCustodyIdentityV2 {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && hasExactAuthorityKeys(value, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId', 'attemptId',
      'generation',
    ])
    && isBoundedExactAuthorityPlainData(value)
    && (value as Record<string, unknown>).schemaVersion === 2
    && (value as Record<string, unknown>).backend === 'docker'
    && typeof (value as Record<string, unknown>).projectRootSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test((value as Record<string, unknown>).projectRootSha256 as string)
    && typeof (value as Record<string, unknown>).projectId === 'string'
    && ((value as Record<string, unknown>).projectId as string).length > 0
    && typeof (value as Record<string, unknown>).taskId === 'string'
    && ((value as Record<string, unknown>).taskId as string).length > 0
    && typeof (value as Record<string, unknown>).attemptId === 'string'
    && ((value as Record<string, unknown>).attemptId as string).length > 0
    && Number.isSafeInteger((value as Record<string, unknown>).generation)
    && Number((value as Record<string, unknown>).generation) > 0;
}

function exactFailedCriteria(
  evaluation: EvaluationResult,
): readonly ExactTaskEvaluationFailedCriterionV2[] {
  return Object.freeze(evaluation.rubricScores
    .filter(score => !score.passed)
    .map(score => Object.freeze({
      criterion: score.criterion,
      score: score.score,
      reason: score.reason,
    })));
}

function exactCanonicalSnapshot<T>(
  value: T,
  policy: TaskAttemptCustodyPolicyV2,
): T {
  return JSON.parse(
    Buffer.from(canonicalTaskAttemptCustodyJson(value, policy.jsonBounds)).toString('utf8'),
  ) as T;
}

function exactOptionalDigest(
  domain: string,
  value: unknown | undefined,
  policy: TaskAttemptCustodyPolicyV2,
): Sha256Digest | null {
  return value === undefined
    ? null
    : taskAttemptCustodyDigest(domain, value, policy.jsonBounds);
}

function exactCanonicalEqual(
  left: unknown,
  right: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): boolean {
  try {
    return Buffer.from(canonicalTaskAttemptCustodyJson(left, policy.jsonBounds))
      .equals(Buffer.from(canonicalTaskAttemptCustodyJson(right, policy.jsonBounds)));
  } catch {
    return false;
  }
}

function exactTerminalArtifactKey(
  identity: TaskAttemptCustodyIdentityV2,
  policy: TaskAttemptCustodyPolicyV2,
): string {
  return `terminal-${taskAttemptCustodyDigest(
    'exact-task-terminal-artifact-key',
    identity,
    policy.jsonBounds,
  ).slice('sha256:'.length)}`;
}

function createExactTaskResultArchivePayload(
  identity: TaskAttemptCustodyIdentityV2,
  settlementChainDigest: Sha256Digest,
  settlementDigest: Sha256Digest,
): TaskResultSettlementV2ArchivePayload {
  return Object.freeze({
    schemaVersion: 2,
    kind: 'task-result-settlement-v2-archive',
    state: 'archived',
    identity: Object.freeze({ ...identity }),
    predecessorDigest: settlementChainDigest,
    externalAuthorityRefs: Object.freeze([Object.freeze({
      authorityType: 'task-result-settlement-v2',
      digest: settlementDigest,
    })]) as TaskResultSettlementV2ArchivePayload['externalAuthorityRefs'],
  });
}

function readExactAcceptanceTaskAuthority(input: {
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly admission: TaskAttemptCustodyAdmissionV2;
}): ExactAcceptanceTaskAuthority | null {
  const snapshot = input.custodyStore.readTaskSnapshot({
    identity: input.admission.identity,
    policy: input.policy,
    admissionReceiptDigest: input.admission.receiptDigest,
  });
  if (snapshot === null || snapshot.proof.sha256 !== input.admission.taskSnapshot.sha256) {
    return null;
  }
  const authority = parseExactDockerDispatchTaskSnapshotAuthority(
    snapshot.bytes,
    input.policy,
  );
  if (
    authority === null
    || authority.snapshotSha256 !== snapshot.proof.sha256
    || authority.projectId !== input.admission.identity.projectId
    || authority.taskId !== input.admission.identity.taskId
  ) return null;
  return Object.freeze({
    task: authority.task,
    taskSnapshotSha256: snapshot.proof.sha256,
    dispatchTaskMaterialDigest: authority.taskDigest,
    sprintId: authority.sprintId,
    evaluationPolicy: authority.evaluationPolicy,
  });
}

function exactEvaluationRubric(taskAuthority: ExactAcceptanceTaskAuthority): EvaluationRubric {
  return Object.freeze({
    criteria: Object.freeze(taskAuthority.evaluationPolicy.rubric.criteria.map(criterion => (
      Object.freeze({ ...criterion })
    ))) as unknown as EvaluationRubric['criteria'],
    passingScore: taskAuthority.evaluationPolicy.rubric.passingScore,
    maxRetries: taskAuthority.evaluationPolicy.rubric.maxRetries,
  });
}

type ExactEffectLandingRead =
  | {
      readonly state: 'current';
      readonly landing: TaskAttemptCustodyVerifiedEffectLandingV2;
      readonly chain: TaskAttemptCustodyChainReceiptV2;
    }
  | { readonly state: 'hold'; readonly reasonCode: string };

function readExactEffectLandingAuthority(input: {
  readonly result: TaskResultV2;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactEffectLandingRead {
  try {
    const binding = input.result.attemptCustody.effectLanding;
    const identity = input.result.attemptCustody.identity;
    const landing = input.custodyStore.readVerifiedEffectLanding({
      identity,
      policy: input.policy,
      artifactKey: binding.landingArtifactKey,
    });
    const chain = input.custodyStore.readChain(identity, input.policy, 'effect-landing');
    if (
      landing === null
      || chain === null
      || !exactTerminalSameIdentity(landing.landing.identity, identity)
      || landing.landing.admissionReceiptDigest
        !== input.result.attemptCustody.admissionReceiptDigest
      || landing.landing.policyDigest !== input.result.attemptCustody.policyDigest
      || landing.landing.receiptDigest !== binding.landingReceiptDigest
      || landing.landing.disposition !== binding.disposition
      || landing.landing.effectDecisionDigest !== binding.effectDecisionDigest
      || landing.landing.transactionDigest !== binding.transactionDigest
      || chain.artifactKey !== binding.landingArtifactKey
      || chain.artifactReceiptDigest !== binding.landingArtifactReceiptDigest
      || chain.receiptDigest !== binding.effectLandingChainDigest
      || chain.occurredAt !== landing.landing.releasedAt
    ) return { state: 'hold', reasonCode: 'effect-landing-authority-mismatch' };
    return Object.freeze({ state: 'current' as const, landing, chain });
  } catch {
    return { state: 'hold', reasonCode: 'effect-landing-authority-unavailable' };
  }
}

function createExactTaskEvaluationReceipt(input: {
  readonly authority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly taskAuthority: ExactAcceptanceTaskAuthority;
  readonly result: TaskResultV2;
  readonly rubricEvaluation: EvaluationResult;
  readonly enforcement: AcceptanceEnforcementResult;
  readonly providerExitAuthorityDigest: Sha256Digest;
  readonly dispatchAdmissionRefDigest: Sha256Digest;
  readonly effectLandingReceiptDigest: Sha256Digest;
  readonly finalManifestDigest: Sha256Digest;
  readonly criterionEvaluationAuthorityDigest: Sha256Digest;
  readonly productionWiringSettlementDigest: Sha256Digest | null;
  readonly productionWiringSettlementArtifactReceiptDigest: Sha256Digest | null;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly evaluatedAt: string;
}): ExactTaskEvaluationReceiptV2 {
  const rubricEvaluationSnapshot = exactCanonicalSnapshot(
    input.rubricEvaluation,
    input.policy,
  );
  const evaluationSnapshot = exactCanonicalSnapshot(
    input.enforcement.evaluation,
    input.policy,
  );
  const acceptanceDecision = exactCanonicalSnapshot<ExactTaskAcceptanceDecisionSnapshotV2>({
    outcome: input.enforcement.outcome,
    settlement: input.enforcement.settlement,
    enforced: input.enforcement.enforced,
    postRubricCause: input.enforcement.postRubricCause ?? null,
    routeClaim: input.enforcement.routeClaim ?? null,
    confirmationReceiptDigest: null,
  }, input.policy);
  const body = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'exact-task-evaluation-receipt-v2' as const,
    state: 'evaluated' as const,
    identity: Object.freeze({ ...input.authority.identity }),
    admissionReceiptDigest: input.authority.admissionReceiptDigest,
    acceptedResultArtifactReceiptDigest:
      input.authority.acceptedResultRef.artifactReceiptDigest,
    acceptedResultChainDigest: input.authority.acceptedResultChainDigest,
    taskSnapshotSha256: input.taskAuthority.taskSnapshotSha256,
    dispatchTaskMaterialDigest: input.taskAuthority.dispatchTaskMaterialDigest,
    evaluationPolicyDigest: input.taskAuthority.evaluationPolicy.policyDigest,
    providerExitAuthorityDigest: input.providerExitAuthorityDigest,
    dispatchAdmissionRefDigest: input.dispatchAdmissionRefDigest,
    resultDigest: input.authority.resultDigest,
    rubricEvaluationSnapshot,
    rubricEvaluationSnapshotDigest: taskAttemptCustodyDigest(
      'exact-task-rubric-evaluation-snapshot',
      rubricEvaluationSnapshot,
      input.policy.jsonBounds,
    ),
    evaluationSnapshot,
    evaluationSnapshotDigest: taskAttemptCustodyDigest(
      'exact-task-evaluation-snapshot',
      evaluationSnapshot,
      input.policy.jsonBounds,
    ),
    acceptanceDecision,
    acceptanceDecisionDigest: taskAttemptCustodyDigest(
      'exact-task-acceptance-decision',
      acceptanceDecision,
      input.policy.jsonBounds,
    ),
    runPolicyEvidenceDigest: exactOptionalDigest(
      'exact-task-run-policy-evidence',
      input.result.runPolicyEvidence,
      input.policy,
    ),
    criteriaEvidenceDigest: taskAttemptCustodyDigest(
      'exact-task-criteria-evidence',
      input.result.criteriaEvidence,
      input.policy.jsonBounds,
    ),
    testVerificationDigest: exactOptionalDigest(
      'exact-task-test-verification',
      input.result.testVerification,
      input.policy,
    ),
    productionWiringEvidenceDigest: exactOptionalDigest(
      'exact-task-production-wiring-evidence',
      input.result.productionWiringEvidence,
      input.policy,
    ),
    effectLandingBindingDigest:
      input.result.attemptCustody.effectLanding.bindingDigest as Sha256Digest,
    effectLandingReceiptDigest: input.effectLandingReceiptDigest,
    finalManifestDigest: input.finalManifestDigest,
    criterionEvaluationAuthorityDigest: input.criterionEvaluationAuthorityDigest,
    productionWiringSettlementDigest: input.productionWiringSettlementDigest,
    productionWiringSettlementArtifactReceiptDigest:
      input.productionWiringSettlementArtifactReceiptDigest,
    verdict: input.enforcement.evaluation.decision,
    totalScore: input.enforcement.evaluation.totalScore,
    failedCriteria: exactFailedCriteria(input.enforcement.evaluation),
    evaluatedAt: input.evaluatedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: taskAttemptCustodyDigest(
      'exact-task-evaluation-receipt',
      body,
      input.policy.jsonBounds,
    ),
  });
}

function hasOnlyExactAuthorityKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => typeof key === 'string' && allowed.has(key));
}

function parseExactEvaluationSnapshot(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): EvaluationResult | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !isExactTerminalCanonicalData(value, policy)
    || !hasOnlyExactAuthorityKeys(value, [
      'decision', 'totalScore', 'rubricScores', 'retryCount',
    ], [
      'noGoCategory', 'filesInScope', 'filesOutOfScope', 'isPartialPromotable',
      'contractSummary',
    ])
  ) return null;
  const record = value as Record<string, unknown>;
  if (
    (record.decision !== 'DONE'
      && record.decision !== 'GO_WITH_TECH_DEBT'
      && record.decision !== 'NO_GO')
    || typeof record.totalScore !== 'number'
    || !Number.isFinite(record.totalScore)
    || record.totalScore < 0
    || record.totalScore > 100
    || !Number.isSafeInteger(record.retryCount)
    || Number(record.retryCount) < 0
    || !Array.isArray(record.rubricScores)
  ) return null;
  for (const score of record.rubricScores) {
    if (
      score === null
      || typeof score !== 'object'
      || Array.isArray(score)
      || !hasExactAuthorityKeys(score, ['criterion', 'score', 'passed', 'reason'])
      || typeof (score as Record<string, unknown>).criterion !== 'string'
      || ((score as Record<string, unknown>).criterion as string).length === 0
      || typeof (score as Record<string, unknown>).score !== 'number'
      || !Number.isFinite((score as Record<string, unknown>).score)
      || typeof (score as Record<string, unknown>).passed !== 'boolean'
      || typeof (score as Record<string, unknown>).reason !== 'string'
    ) return null;
  }
  for (const key of ['filesInScope', 'filesOutOfScope'] as const) {
    if (record[key] !== undefined && (
      !Array.isArray(record[key])
      || !(record[key] as unknown[]).every(item => typeof item === 'string')
    )) return null;
  }
  if (record.isPartialPromotable !== undefined && typeof record.isPartialPromotable !== 'boolean') {
    return null;
  }
  if (record.noGoCategory !== undefined && typeof record.noGoCategory !== 'string') return null;
  if (record.contractSummary !== undefined) {
    const summary = record.contractSummary;
    if (
      summary === null
      || typeof summary !== 'object'
      || Array.isArray(summary)
      || !hasExactAuthorityKeys(summary, ['decided', 'total', 'undecidableItems'])
      || !Number.isSafeInteger((summary as Record<string, unknown>).decided)
      || !Number.isSafeInteger((summary as Record<string, unknown>).total)
      || !Array.isArray((summary as Record<string, unknown>).undecidableItems)
    ) return null;
    for (const item of (summary as Record<string, unknown>).undecidableItems as unknown[]) {
      if (
        item === null
        || typeof item !== 'object'
        || Array.isArray(item)
        || !hasExactAuthorityKeys(item, ['itemId', 'statement'])
        || typeof (item as Record<string, unknown>).itemId !== 'string'
        || typeof (item as Record<string, unknown>).statement !== 'string'
      ) return null;
    }
  }
  return value as EvaluationResult;
}

function parseExactAcceptanceDecisionSnapshot(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): ExactTaskAcceptanceDecisionSnapshotV2 | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !isExactTerminalCanonicalData(value, policy)
    || !hasExactAuthorityKeys(value, [
      'outcome', 'settlement', 'enforced', 'postRubricCause', 'routeClaim',
      'confirmationReceiptDigest',
    ])
  ) return null;
  const record = value as Record<string, unknown>;
  const outcome = record.outcome;
  const settlement = record.settlement;
  if (
    typeof record.enforced !== 'boolean'
    || (record.postRubricCause !== null && typeof record.postRubricCause !== 'string')
    || record.routeClaim !== null
    || record.confirmationReceiptDigest !== null
    || outcome === null
    || typeof outcome !== 'object'
    || Array.isArray(outcome)
    || !hasOnlyExactAuthorityKeys(outcome, ['kind', 'verdict', 'action', 'source'], ['adapter'])
    || typeof (outcome as Record<string, unknown>).kind !== 'string'
    || !['CONFIRMED', 'QUALIFIED', 'UNDECIDABLE', 'FAILED'].includes(
      String((outcome as Record<string, unknown>).verdict),
    )
    || !['ACCEPT', 'ROUTE', 'REJECT'].includes(String((outcome as Record<string, unknown>).action))
    || !['default', 'override'].includes(String((outcome as Record<string, unknown>).source))
    || ((outcome as Record<string, unknown>).adapter !== undefined
      && !['deterministic', 'code', 'llm', 'human'].includes(
        String((outcome as Record<string, unknown>).adapter),
      ))
    || settlement === null
    || typeof settlement !== 'object'
    || Array.isArray(settlement)
    || !hasOnlyExactAuthorityKeys(settlement, [
      'sourceVerdict', 'acceptanceDisposition', 'debtDisposition', 'receiptDisposition',
      'reasonCode',
    ], ['confirmationConflictReasonCode'])
  ) return null;
  return value as ExactTaskAcceptanceDecisionSnapshotV2;
}

function parseExactTaskEvaluationReceipt(
  value: unknown,
  expectedIdentity: TaskAttemptCustodyIdentityV2,
  policy: TaskAttemptCustodyPolicyV2,
): ExactTaskEvaluationReceiptV2 | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !hasExactAuthorityKeys(value, [
      'schemaVersion', 'kind', 'state', 'identity', 'admissionReceiptDigest',
      'acceptedResultArtifactReceiptDigest', 'acceptedResultChainDigest', 'taskSnapshotSha256',
      'dispatchTaskMaterialDigest', 'evaluationPolicyDigest', 'providerExitAuthorityDigest',
      'dispatchAdmissionRefDigest', 'resultDigest', 'rubricEvaluationSnapshot',
      'rubricEvaluationSnapshotDigest', 'evaluationSnapshot',
      'evaluationSnapshotDigest', 'acceptanceDecision', 'acceptanceDecisionDigest',
      'runPolicyEvidenceDigest', 'criteriaEvidenceDigest',
      'testVerificationDigest', 'productionWiringEvidenceDigest', 'effectLandingBindingDigest',
      'effectLandingReceiptDigest', 'finalManifestDigest',
      'criterionEvaluationAuthorityDigest', 'productionWiringSettlementDigest',
      'productionWiringSettlementArtifactReceiptDigest',
      'verdict', 'totalScore', 'failedCriteria', 'evaluatedAt', 'receiptDigest',
    ])
    || !isExactTerminalCanonicalData(value, policy)
  ) return null;
  const record = value as Record<string, unknown>;
  const identity = record.identity;
  const rubricEvaluationSnapshot = parseExactEvaluationSnapshot(
    record.rubricEvaluationSnapshot,
    policy,
  );
  const evaluationSnapshot = parseExactEvaluationSnapshot(record.evaluationSnapshot, policy);
  const acceptanceDecision = parseExactAcceptanceDecisionSnapshot(
    record.acceptanceDecision,
    policy,
  );
  if (
    record.schemaVersion !== 2
    || record.kind !== 'exact-task-evaluation-receipt-v2'
    || record.state !== 'evaluated'
    || !exactTerminalIdentity(identity)
    || !exactTerminalSameIdentity(identity, expectedIdentity)
    || !exactTerminalDigest(record.admissionReceiptDigest)
    || !exactTerminalDigest(record.acceptedResultArtifactReceiptDigest)
    || !exactTerminalDigest(record.acceptedResultChainDigest)
    || !exactTerminalDigest(record.taskSnapshotSha256)
    || !exactTerminalDigest(record.dispatchTaskMaterialDigest)
    || !exactTerminalDigest(record.evaluationPolicyDigest)
    || !exactTerminalDigest(record.providerExitAuthorityDigest)
    || !exactTerminalDigest(record.dispatchAdmissionRefDigest)
    || !exactTerminalDigest(record.resultDigest)
    || rubricEvaluationSnapshot === null
    || !exactTerminalDigest(record.rubricEvaluationSnapshotDigest)
    || evaluationSnapshot === null
    || !exactTerminalDigest(record.evaluationSnapshotDigest)
    || acceptanceDecision === null
    || !exactTerminalDigest(record.acceptanceDecisionDigest)
    || (record.runPolicyEvidenceDigest !== null
      && !exactTerminalDigest(record.runPolicyEvidenceDigest))
    || !exactTerminalDigest(record.criteriaEvidenceDigest)
    || (record.testVerificationDigest !== null
      && !exactTerminalDigest(record.testVerificationDigest))
    || (record.productionWiringEvidenceDigest !== null
      && !exactTerminalDigest(record.productionWiringEvidenceDigest))
    || !exactTerminalDigest(record.effectLandingBindingDigest)
    || !exactTerminalDigest(record.effectLandingReceiptDigest)
    || !exactTerminalDigest(record.finalManifestDigest)
    || !exactTerminalDigest(record.criterionEvaluationAuthorityDigest)
    || (record.productionWiringSettlementDigest !== null
      && !exactTerminalDigest(record.productionWiringSettlementDigest))
    || (record.productionWiringSettlementArtifactReceiptDigest !== null
      && !exactTerminalDigest(record.productionWiringSettlementArtifactReceiptDigest))
    || ((record.productionWiringSettlementDigest === null)
      !== (record.productionWiringSettlementArtifactReceiptDigest === null))
    || (record.verdict !== 'DONE'
      && record.verdict !== 'GO_WITH_TECH_DEBT'
      && record.verdict !== 'NO_GO')
    || typeof record.totalScore !== 'number'
    || !Number.isFinite(record.totalScore)
    || record.totalScore < 0
    || record.totalScore > 100
    || !Array.isArray(record.failedCriteria)
    || !exactTerminalTimestamp(record.evaluatedAt)
    || !exactTerminalDigest(record.receiptDigest)
    || record.rubricEvaluationSnapshotDigest !== taskAttemptCustodyDigest(
      'exact-task-rubric-evaluation-snapshot',
      rubricEvaluationSnapshot,
      policy.jsonBounds,
    )
    || record.evaluationSnapshotDigest !== taskAttemptCustodyDigest(
      'exact-task-evaluation-snapshot',
      evaluationSnapshot,
      policy.jsonBounds,
    )
    || record.acceptanceDecisionDigest !== taskAttemptCustodyDigest(
      'exact-task-acceptance-decision',
      acceptanceDecision,
      policy.jsonBounds,
    )
  ) return null;
  for (const criterion of record.failedCriteria) {
    if (
      criterion === null
      || typeof criterion !== 'object'
      || Array.isArray(criterion)
      || !hasExactAuthorityKeys(criterion, ['criterion', 'score', 'reason'])
      || typeof (criterion as Record<string, unknown>).criterion !== 'string'
      || ((criterion as Record<string, unknown>).criterion as string).length === 0
      || typeof (criterion as Record<string, unknown>).score !== 'number'
      || !Number.isFinite((criterion as Record<string, unknown>).score)
      || typeof (criterion as Record<string, unknown>).reason !== 'string'
    ) return null;
  }
  const { receiptDigest, ...body } = record;
  if (
    receiptDigest !== taskAttemptCustodyDigest(
      'exact-task-evaluation-receipt',
      body,
      policy.jsonBounds,
    )
  ) return null;
  return Object.freeze({
    ...(record as unknown as ExactTaskEvaluationReceiptV2),
    identity: Object.freeze({ ...(identity as TaskAttemptCustodyIdentityV2) }),
    rubricEvaluationSnapshot: Object.freeze({ ...rubricEvaluationSnapshot }),
    evaluationSnapshot: Object.freeze({ ...evaluationSnapshot }),
    acceptanceDecision: Object.freeze({ ...acceptanceDecision }),
    failedCriteria: Object.freeze((record.failedCriteria as ExactTaskEvaluationFailedCriterionV2[])
      .map(criterion => Object.freeze({ ...criterion }))),
  });
}

function createExactTaskFinalizerReceipt(input: {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly evaluationArtifact: TaskAttemptCustodyArtifactReceiptV2;
  readonly evaluationChainDigest: Sha256Digest;
  readonly evaluationReceipt: ExactTaskEvaluationReceiptV2;
  readonly finalizedAt: string;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactTaskFinalizerReceiptV2 {
  const body = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'exact-task-finalizer-receipt-v2' as const,
    state: 'terminal-ready' as const,
    identity: Object.freeze({ ...input.identity }),
    admissionReceiptDigest: input.admissionReceiptDigest,
    resultDigest: input.resultDigest,
    evaluationArtifactReceiptDigest: input.evaluationArtifact.receiptDigest,
    evaluationChainDigest: input.evaluationChainDigest,
    evaluationReceiptDigest: input.evaluationReceipt.receiptDigest,
    verdict: input.evaluationReceipt.verdict,
    finalizedAt: input.finalizedAt,
  });
  return Object.freeze({
    ...body,
    receiptDigest: taskAttemptCustodyDigest(
      'exact-task-finalizer-receipt',
      body,
      input.policy.jsonBounds,
    ),
  });
}

function parseExactTaskFinalizerReceipt(
  value: unknown,
  expectedIdentity: TaskAttemptCustodyIdentityV2,
  policy: TaskAttemptCustodyPolicyV2,
): ExactTaskFinalizerReceiptV2 | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !hasExactAuthorityKeys(value, [
      'schemaVersion', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'resultDigest',
      'evaluationArtifactReceiptDigest', 'evaluationChainDigest', 'evaluationReceiptDigest',
      'verdict', 'finalizedAt', 'receiptDigest',
    ])
    || !isBoundedExactAuthorityPlainData(value)
  ) return null;
  const record = value as Record<string, unknown>;
  const identity = record.identity;
  if (
    record.schemaVersion !== 2
    || record.kind !== 'exact-task-finalizer-receipt-v2'
    || record.state !== 'terminal-ready'
    || !exactTerminalIdentity(identity)
    || !exactTerminalSameIdentity(identity, expectedIdentity)
    || !exactTerminalDigest(record.admissionReceiptDigest)
    || !exactTerminalDigest(record.resultDigest)
    || !exactTerminalDigest(record.evaluationArtifactReceiptDigest)
    || !exactTerminalDigest(record.evaluationChainDigest)
    || !exactTerminalDigest(record.evaluationReceiptDigest)
    || (record.verdict !== 'DONE'
      && record.verdict !== 'GO_WITH_TECH_DEBT'
      && record.verdict !== 'NO_GO')
    || !exactTerminalTimestamp(record.finalizedAt)
    || !exactTerminalDigest(record.receiptDigest)
  ) return null;
  const { receiptDigest, ...body } = record;
  if (
    receiptDigest !== taskAttemptCustodyDigest(
      'exact-task-finalizer-receipt',
      body,
      policy.jsonBounds,
    )
  ) return null;
  return Object.freeze({
    ...(record as unknown as ExactTaskFinalizerReceiptV2),
    identity: Object.freeze({ ...(identity as TaskAttemptCustodyIdentityV2) }),
  });
}

function exactVerifiedArtifactJson(
  store: TaskAttemptCustodyStore,
  policy: TaskAttemptCustodyPolicyV2,
  identity: TaskAttemptCustodyIdentityV2,
  artifactClass: 'evaluation-receipt' | 'finalizer-receipt',
  artifactKey: string,
  receiptDigest: Sha256Digest,
): Readonly<{ readonly value: unknown; readonly receipt: TaskAttemptCustodyArtifactReceiptV2 }>
  | null {
  const verified = store.readVerifiedArtifact({
    identity,
    policy,
    artifactClass,
    artifactKey,
    receiptDigest,
  });
  if (verified === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(verified.bytes).toString('utf8'));
  } catch {
    return null;
  }
  try {
    if (!Buffer.from(canonicalTaskAttemptCustodyJson(value, policy.jsonBounds))
      .equals(Buffer.from(verified.bytes))) return null;
  } catch {
    return null;
  }
  return Object.freeze({ value, receipt: verified.receipt });
}

/** Re-read every immutable T11 artifact; a caller echo is never freshness authority. */
export function readExactAcceptedTaskTerminalAuthority(input: {
  readonly projectRoot: string;
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly settlementRef: ExactTaskResultAuthorityMetadata['settlementRef'];
  readonly expectedSettlementDigest: Sha256Digest;
}): ExactAcceptedTaskTerminalAuthorityRead {
  try {
    const admission = input.custodyStore.readAdmission(
      input.acceptedAuthority.identity,
      input.policy,
    );
    if (
      admission === null
      || !exactTerminalSameIdentity(admission.identity, input.acceptedAuthority.identity)
      || admission.receiptDigest !== input.acceptedAuthority.admissionReceiptDigest
    ) return { state: 'hold', reasonCode: 'admission-authority-mismatch' };
    const settled = readExactSettledTaskResultV2({
      executionMode: 'normal-docker',
      authorityKind: 'attempt-settlement',
      projectRoot: input.projectRoot,
      taskId: input.acceptedAuthority.identity.taskId,
      custodyStore: input.custodyStore,
      policy: input.policy,
      expectedIdentity: input.acceptedAuthority.identity,
      admission,
      settlementRef: input.settlementRef,
      expectedSettlementDigest: input.expectedSettlementDigest,
    });
    if (settled.state !== 'exact-settled' || settled.exactAuthority === undefined) {
      return { state: 'hold', reasonCode: settled.holdReason ?? 'terminal-settlement-unavailable' };
    }
    const taskAuthority = readExactAcceptanceTaskAuthority({
      custodyStore: input.custodyStore,
      policy: input.policy,
      admission,
    });
    if (taskAuthority === null) {
      return { state: 'hold', reasonCode: 'admitted-task-authority-unavailable' };
    }
    const terminal = settled.exactAuthority;
    if (
      !exactTerminalSameIdentity(terminal.identity, input.acceptedAuthority.identity)
      || terminal.admissionReceiptDigest !== input.acceptedAuthority.admissionReceiptDigest
      || terminal.resultDigest !== input.acceptedAuthority.resultDigest
      || terminal.acceptedResultChainDigest !== input.acceptedAuthority.acceptedResultChainDigest
    ) return { state: 'hold', reasonCode: 'terminal-accepted-authority-mismatch' };
    if (settled.result === null) {
      return { state: 'hold', reasonCode: 'terminal-result-unavailable' };
    }
    const evaluationChain = input.custodyStore.readChain(
      terminal.identity,
      input.policy,
      'evaluation',
    );
    const finalizerChain = input.custodyStore.readChain(
      terminal.identity,
      input.policy,
      'finalizer',
    );
    if (
      evaluationChain === null
      || finalizerChain === null
      || evaluationChain.receiptDigest !== terminal.evaluationChainDigest
      || finalizerChain.receiptDigest !== terminal.finalizerChainDigest
    ) return { state: 'hold', reasonCode: 'terminal-chain-mismatch' };
    const settlementChain = input.custodyStore.readChain(
      terminal.identity,
      input.policy,
      'settlement',
    );
    const archiveChain = input.custodyStore.readChain(
      terminal.identity,
      input.policy,
      'archive',
    );
    if (
      settlementChain === null
      || archiveChain === null
      || settlementChain.artifactReceiptDigest !== input.settlementRef.artifactReceiptDigest
      || settlementChain.predecessorDigest !== terminal.finalizerChainDigest
      || archiveChain.predecessorDigest !== settlementChain.receiptDigest
    ) return { state: 'hold', reasonCode: 'terminal-archive-chain-mismatch' };
    const archiveReceipt = input.custodyStore.readArtifactReceipt({
      identity: terminal.identity,
      policy: input.policy,
      artifactClass: 'archive-receipt',
      artifactKey: archiveChain.artifactKey,
    });
    const archiveArtifact = archiveReceipt === null ? null : input.custodyStore.readVerifiedArtifact({
      identity: terminal.identity,
      policy: input.policy,
      artifactClass: 'archive-receipt',
      artifactKey: archiveChain.artifactKey,
      receiptDigest: archiveReceipt.receiptDigest,
    });
    let archivePayload: unknown = null;
    if (archiveArtifact !== null) {
      try {
        archivePayload = JSON.parse(Buffer.from(archiveArtifact.bytes).toString('utf8')) as unknown;
      } catch {
        archivePayload = null;
      }
    }
    const expectedArchivePayload = createExactTaskResultArchivePayload(
      terminal.identity,
      settlementChain.receiptDigest,
      terminal.settlementDigest,
    );
    if (
      archiveReceipt === null
      || archiveArtifact === null
      || archiveChain.artifactReceiptDigest !== archiveReceipt.receiptDigest
      || archiveChain.occurredAt !== archiveReceipt.capturedAt
      || archiveChain.artifactKey !== exactTerminalArtifactKey(terminal.identity, input.policy)
      || !exactCanonicalEqual(archivePayload, expectedArchivePayload, input.policy)
    ) return { state: 'hold', reasonCode: 'terminal-archive-receipt-mismatch' };
    const evaluationArtifact = exactVerifiedArtifactJson(
      input.custodyStore,
      input.policy,
      terminal.identity,
      'evaluation-receipt',
      evaluationChain.artifactKey,
      terminal.evaluationArtifact.artifactReceiptDigest,
    );
    const finalizerArtifact = exactVerifiedArtifactJson(
      input.custodyStore,
      input.policy,
      terminal.identity,
      'finalizer-receipt',
      finalizerChain.artifactKey,
      terminal.finalizerArtifact.artifactReceiptDigest,
    );
    if (evaluationArtifact === null || finalizerArtifact === null) {
      return { state: 'hold', reasonCode: 'terminal-artifact-unavailable' };
    }
    const evaluationReceipt = parseExactTaskEvaluationReceipt(
      evaluationArtifact.value,
      terminal.identity,
      input.policy,
    );
    const finalizerReceipt = parseExactTaskFinalizerReceipt(
      finalizerArtifact.value,
      terminal.identity,
      input.policy,
    );
    if (evaluationReceipt === null || finalizerReceipt === null) {
      return { state: 'hold', reasonCode: 'terminal-receipt-invalid' };
    }
    if (
      evaluationReceipt.admissionReceiptDigest !== terminal.admissionReceiptDigest
      || evaluationReceipt.acceptedResultArtifactReceiptDigest
        !== input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest
      || evaluationReceipt.acceptedResultChainDigest !== terminal.acceptedResultChainDigest
      || evaluationReceipt.taskSnapshotSha256 !== taskAuthority.taskSnapshotSha256
      || evaluationReceipt.dispatchTaskMaterialDigest
        !== taskAuthority.dispatchTaskMaterialDigest
      || evaluationReceipt.evaluationPolicyDigest
        !== taskAuthority.evaluationPolicy.policyDigest
      || evaluationReceipt.resultDigest !== terminal.resultDigest
      || evaluationReceipt.effectLandingBindingDigest
        !== settled.result?.attemptCustody.effectLanding.bindingDigest
      || evaluationArtifact.receipt.capturedAt !== evaluationReceipt.evaluatedAt
      || finalizerReceipt.admissionReceiptDigest !== terminal.admissionReceiptDigest
      || finalizerReceipt.resultDigest !== terminal.resultDigest
      || finalizerReceipt.evaluationArtifactReceiptDigest
        !== terminal.evaluationArtifact.artifactReceiptDigest
      || finalizerReceipt.evaluationChainDigest !== terminal.evaluationChainDigest
      || finalizerReceipt.evaluationReceiptDigest !== evaluationReceipt.receiptDigest
      || finalizerReceipt.verdict !== evaluationReceipt.verdict
      || finalizerArtifact.receipt.capturedAt !== finalizerReceipt.finalizedAt
    ) return { state: 'hold', reasonCode: 'terminal-receipt-binding-mismatch' };
    const settledResult = settled.result;
    const providerExit = readExactAcceptedTaskProviderExitAuthority({
      acceptedAuthority: input.acceptedAuthority,
      custodyStore: input.custodyStore,
      policy: input.policy,
    });
    if (providerExit.state !== 'current') {
      return { state: 'hold', reasonCode: providerExit.reasonCode };
    }
    const effectLanding = readExactEffectLandingAuthority({
      result: settledResult,
      custodyStore: input.custodyStore,
      policy: input.policy,
    });
    if (effectLanding.state !== 'current') return effectLanding;
    const criterion = evaluateExactGoNogoCriteria({
      task: taskAuthority.task,
      result: settledResult,
      effectLanding: effectLanding.landing,
      policy: input.policy,
    });
    if (criterion.state !== 'evaluated') {
      return { state: 'hold', reasonCode: `criterion-${criterion.reasonCode}` };
    }
    const productionWiring = readExactProductionWiringHostSettlement({
      acceptedAuthority: input.acceptedAuthority,
      task: taskAuthority.task,
      result: settledResult,
      custodyStore: input.custodyStore,
      policy: input.policy,
    });
    if (productionWiring.state === 'hold') {
      return {
        state: 'hold',
        reasonCode: `production-wiring-${productionWiring.reasonCode}`,
      };
    }
    const reevaluated = evaluateExactAcceptedResultWithRubric({
      result: settledResult,
      acceptedAuthority: input.acceptedAuthority,
      task: taskAuthority.task,
      jsonBounds: input.policy.jsonBounds,
      rubric: exactEvaluationRubric(taskAuthority),
      criterionAuthority: criterion.authority,
    });
    if (reevaluated.state !== 'evaluated') {
      return { state: 'hold', reasonCode: `evaluation-${reevaluated.reasonCode}` };
    }
    const revalidatedEvaluation = gateProductionWiringVerdict(
      reevaluated.evaluation,
      taskAuthority.task,
      productionWiring.state === 'current' ? productionWiring.decision : null,
    );
    const reenforced = applyExactAcceptanceEnforcement({
      evaluation: revalidatedEvaluation,
      taskAuthority,
      result: settledResult,
      acceptedAuthority: input.acceptedAuthority,
      jsonBounds: input.policy.jsonBounds,
    });
    if (
      reenforced.state !== 'applied'
      || reenforced.enforcement.pendingConfirmation !== undefined
      || reenforced.enforcement.routeClaim !== undefined
    ) return { state: 'hold', reasonCode: 'terminal-acceptance-revalidation-mismatch' };
    const rubricEvaluation = evaluationReceipt.rubricEvaluationSnapshot;
    const terminalEvaluation = evaluationReceipt.evaluationSnapshot;
    const acceptanceDecision = evaluationReceipt.acceptanceDecision;
    const sourceVerdict = (rubricEvaluation.contractSummary?.undecidableItems.length ?? 0) > 0
      ? 'UNDECIDABLE'
      : fromRubricDecision(rubricEvaluation.decision);
    if (
      sourceVerdict === 'HOLD'
      || evaluationReceipt.providerExitAuthorityDigest
        !== providerExit.authority.authorityDigest
      || evaluationReceipt.dispatchAdmissionRefDigest
        !== providerExit.authority.dispatchAdmissionRefDigest
      || evaluationReceipt.effectLandingReceiptDigest
        !== effectLanding.landing.landing.receiptDigest
      || evaluationReceipt.finalManifestDigest
        !== effectLanding.landing.verifiedBundle.final.digest
      || evaluationReceipt.criterionEvaluationAuthorityDigest
        !== criterion.authority.authorityDigest
      || evaluationReceipt.productionWiringSettlementDigest
        !== (productionWiring.state === 'current'
          ? productionWiring.receipt.settlementDigest
          : null)
      || evaluationReceipt.productionWiringSettlementArtifactReceiptDigest
        !== (productionWiring.state === 'current'
          ? productionWiring.artifactReceipt.receiptDigest
          : null)
      || !exactCanonicalEqual(rubricEvaluation, revalidatedEvaluation, input.policy)
      || !exactCanonicalEqual(
        terminalEvaluation,
        reenforced.enforcement.evaluation,
        input.policy,
      )
      || !exactCanonicalEqual(acceptanceDecision, {
        outcome: reenforced.enforcement.outcome,
        settlement: reenforced.enforcement.settlement,
        enforced: reenforced.enforcement.enforced,
        postRubricCause: reenforced.enforcement.postRubricCause ?? null,
        routeClaim: null,
        confirmationReceiptDigest: null,
      }, input.policy)
      || acceptanceDecision.outcome.kind !== resolveCanonicalTaskKind(taskAuthority.task)
      || acceptanceDecision.outcome.verdict !== sourceVerdict
      || !exactCanonicalEqual(
        acceptanceDecision.settlement,
        reduceAcceptanceSettlement({
          sourceVerdict,
          matrixDecision: acceptanceDecision.outcome,
          confirmation: { status: 'MISSING' },
        }),
        input.policy,
      )
      || (acceptanceDecision.enforced === false && (
        acceptanceDecision.postRubricCause !== null
        || !exactCanonicalEqual(rubricEvaluation, terminalEvaluation, input.policy)
      ))
      || (acceptanceDecision.enforced === true && (
        acceptanceDecision.outcome.action !== 'REJECT'
        || terminalEvaluation.decision !== 'NO_GO'
        || acceptanceDecision.postRubricCause === null
      ))
      || evaluationReceipt.verdict !== terminalEvaluation.decision
      || evaluationReceipt.totalScore !== terminalEvaluation.totalScore
      || !exactCanonicalEqual(
        evaluationReceipt.failedCriteria,
        exactFailedCriteria(terminalEvaluation),
        input.policy,
      )
      || evaluationReceipt.runPolicyEvidenceDigest !== exactOptionalDigest(
        'exact-task-run-policy-evidence',
        settledResult.runPolicyEvidence,
        input.policy,
      )
      || evaluationReceipt.criteriaEvidenceDigest !== taskAttemptCustodyDigest(
        'exact-task-criteria-evidence',
        settledResult.criteriaEvidence,
        input.policy.jsonBounds,
      )
      || evaluationReceipt.testVerificationDigest !== exactOptionalDigest(
        'exact-task-test-verification',
        settledResult.testVerification,
        input.policy,
      )
      || evaluationReceipt.productionWiringEvidenceDigest !== exactOptionalDigest(
        'exact-task-production-wiring-evidence',
        settledResult.productionWiringEvidence,
        input.policy,
      )
      || evaluationReceipt.effectLandingBindingDigest
        !== settledResult.attemptCustody.effectLanding.bindingDigest
    ) return { state: 'hold', reasonCode: 'terminal-evidence-revalidation-mismatch' };
    const decisionAuthority: ExactTaskTerminalDecisionAuthorityV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-task-terminal-decision-authority-v2',
      identity: Object.freeze({ ...terminal.identity }),
      evaluationReceipt: Object.freeze({
        verdict: evaluationReceipt.verdict,
        artifactReceiptDigest: terminal.evaluationArtifact.artifactReceiptDigest,
        artifactSha256: terminal.evaluationArtifact.artifactSha256,
        byteLength: terminal.evaluationArtifact.byteLength,
        chainDigest: terminal.evaluationChainDigest,
      }),
      finalizerReceipt: Object.freeze({
        state: 'terminal-ready',
        artifactReceiptDigest: terminal.finalizerArtifact.artifactReceiptDigest,
        artifactSha256: terminal.finalizerArtifact.artifactSha256,
        byteLength: terminal.finalizerArtifact.byteLength,
        chainDigest: terminal.finalizerChainDigest,
      }),
    });
    const terminalAuthority: ExactAcceptedResultTerminalAuthorityV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-accepted-result-terminal-authority-v2',
      acceptedAuthority: input.acceptedAuthority,
      terminalResultAuthority: terminal,
      terminalDecisionAuthority: decisionAuthority,
    });
    if (!isExactAcceptedResultTerminalAuthorityV2(terminalAuthority, input.acceptedAuthority)) {
      return { state: 'hold', reasonCode: 'terminal-authority-invalid' };
    }
    const projectedResult = projectExactTaskResultV2ForEvaluation({
      result: settledResult,
      acceptedAuthority: input.acceptedAuthority,
      jsonBounds: input.policy.jsonBounds,
    });
    if (projectedResult === null) {
      return { state: 'hold', reasonCode: 'terminal-result-projection-invalid' };
    }
    return Object.freeze({
      state: 'current',
      terminalAuthority,
      terminalResultAuthority: terminal,
      evaluationReceipt,
      finalizerReceipt,
      result: settledResult,
      projectedResult,
    });
  } catch {
    return { state: 'hold', reasonCode: 'custody-hold' };
  }
}

/**
 * T11's sole exact terminal producer. It starts only from a host-inspected
 * accepted result, persists evaluation -> finalizer -> settlement in the
 * Store chain, then re-reads the complete authority before returning it.
 */
export function settleExactAcceptedTaskEvaluation(
  input: SettleExactAcceptedTaskEvaluationInput,
): SettleExactAcceptedTaskEvaluationResult {
  try {
    const requiredInputKeys = [
      'projectRoot', 'acceptedAuthority', 'custodyStore', 'policy',
    ];
    if (!hasExactTerminalInputFields(input, requiredInputKeys, [])) {
      return { state: 'hold', reasonCode: 'invalid-terminal-input' };
    }
    const admission = input.custodyStore.readAdmission(
      input.acceptedAuthority.identity,
      input.policy,
    );
    if (
      admission === null
      || !exactTerminalSameIdentity(admission.identity, input.acceptedAuthority.identity)
      || admission.receiptDigest !== input.acceptedAuthority.admissionReceiptDigest
    ) return { state: 'hold', reasonCode: 'admission-authority-unavailable' };
    const acceptedRead = readExactAcceptedTaskResultV2({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot: input.projectRoot,
      taskId: input.acceptedAuthority.identity.taskId,
      custodyStore: input.custodyStore,
      policy: input.policy,
      expectedIdentity: input.acceptedAuthority.identity,
      admission,
      acceptedResultRef: input.acceptedAuthority.acceptedResultRef,
      expectedAcceptedResultChainDigest: input.acceptedAuthority.acceptedResultChainDigest,
    });
    if (
      acceptedRead.state !== 'exact-accepted'
      || acceptedRead.result === null
      || acceptedRead.exactAcceptedAuthority === undefined
    ) return {
      state: 'hold',
      reasonCode: acceptedRead.holdReason ?? 'accepted-result-authority-unavailable',
    };
    const acceptedAuthority = acceptedRead.exactAcceptedAuthority;
    const result = acceptedRead.result;
    const taskAuthority = readExactAcceptanceTaskAuthority({
      custodyStore: input.custodyStore,
      policy: input.policy,
      admission,
    });
    if (taskAuthority === null) {
      return { state: 'hold', reasonCode: 'admitted-task-authority-unavailable' };
    }
    if (
      taskAuthority.task.sprintId !== undefined
      && taskAuthority.task.sprintId !== taskAuthority.sprintId
    ) return { state: 'hold', reasonCode: 'admitted-task-sprint-mismatch' };
    const providerExit = readExactAcceptedTaskProviderExitAuthority({
      acceptedAuthority,
      custodyStore: input.custodyStore,
      policy: input.policy,
    });
    if (providerExit.state !== 'current') {
      return { state: 'hold', reasonCode: providerExit.reasonCode };
    }
    const effectLanding = readExactEffectLandingAuthority({
      result,
      custodyStore: input.custodyStore,
      policy: input.policy,
    });
    if (effectLanding.state !== 'current') return effectLanding;
    const criterion = evaluateExactGoNogoCriteria({
      task: taskAuthority.task,
      result,
      effectLanding: effectLanding.landing,
      policy: input.policy,
    });
    if (criterion.state !== 'evaluated') {
      return { state: 'hold', reasonCode: `criterion-${criterion.reasonCode}` };
    }
    const productionWiring = readExactProductionWiringHostSettlement({
      acceptedAuthority,
      task: taskAuthority.task,
      result,
      custodyStore: input.custodyStore,
      policy: input.policy,
    });
    if (productionWiring.state === 'hold') {
      return {
        state: 'hold',
        reasonCode: `production-wiring-${productionWiring.reasonCode}`,
      };
    }
    const evaluated = evaluateExactAcceptedResultWithRubric({
      result,
      acceptedAuthority,
      task: taskAuthority.task,
      jsonBounds: input.policy.jsonBounds,
      rubric: exactEvaluationRubric(taskAuthority),
      criterionAuthority: criterion.authority,
    });
    if (evaluated.state === 'hold') {
      return { state: 'hold', reasonCode: `evaluation-${evaluated.reasonCode}` };
    }
    const settledEvaluation = gateProductionWiringVerdict(
      evaluated.evaluation,
      taskAuthority.task,
      productionWiring.state === 'current' ? productionWiring.decision : null,
    );
    const acceptance = applyExactAcceptanceEnforcement({
      evaluation: settledEvaluation,
      taskAuthority,
      result,
      acceptedAuthority,
      jsonBounds: input.policy.jsonBounds,
    });
    if (acceptance.state === 'hold') {
      return { state: 'hold', reasonCode: `acceptance-${acceptance.reasonCode}` };
    }
    if (
      acceptance.enforcement.pendingConfirmation !== undefined
      && acceptance.enforcement.routeClaim !== undefined
    ) {
      return Object.freeze({
        state: 'route-required',
        enforcement: acceptance.enforcement as AcceptanceEnforcementResult & Required<Pick<
          AcceptanceEnforcementResult,
          'routeClaim' | 'pendingConfirmation'
        >>,
      });
    }
    if (
      acceptance.enforcement.pendingConfirmation !== undefined
      || acceptance.enforcement.routeClaim !== undefined
    ) return { state: 'hold', reasonCode: 'acceptance-route-authority-incomplete' };
    const artifactKey = exactTerminalArtifactKey(acceptedAuthority.identity, input.policy);
    const acceptedArtifact = input.custodyStore.readArtifactReceipt({
      identity: acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'canonical-accepted-result',
      artifactKey: acceptedAuthority.acceptedResultRef.artifactKey,
    });
    const acceptedChain = input.custodyStore.readChain(
      acceptedAuthority.identity,
      input.policy,
      'accepted-result',
    );
    const sourceBinding = result.attemptCustody.sourceResult;
    const sourceResultArtifact = input.custodyStore.readArtifactReceipt({
      identity: acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'worker-result',
      artifactKey: sourceBinding.artifactKey,
    });
    if (
      acceptedArtifact === null
      || acceptedArtifact.receiptDigest
        !== acceptedAuthority.acceptedResultRef.artifactReceiptDigest
      || acceptedChain === null
      || acceptedChain.receiptDigest !== acceptedAuthority.acceptedResultChainDigest
      || sourceResultArtifact === null
      || sourceResultArtifact.receiptDigest !== sourceBinding.artifactReceiptDigest
    ) return { state: 'hold', reasonCode: 'accepted-result-authority-unavailable' };

    let evaluationArtifact: TaskAttemptCustodyArtifactReceiptV2;
    let evaluationChain: TaskAttemptCustodyChainReceiptV2;
    let evaluationReceipt: ExactTaskEvaluationReceiptV2;
    const persistedEvaluationArtifact = input.custodyStore.readArtifactReceipt({
      identity: acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'evaluation-receipt',
      artifactKey,
    });
    const persistedEvaluationChain = input.custodyStore.readChain(
      acceptedAuthority.identity,
      input.policy,
      'evaluation',
    );
    if (persistedEvaluationArtifact !== null) {
      const verified = exactVerifiedArtifactJson(
        input.custodyStore,
        input.policy,
        acceptedAuthority.identity,
        'evaluation-receipt',
        artifactKey,
        persistedEvaluationArtifact.receiptDigest,
      );
      const parsed = verified === null ? null : parseExactTaskEvaluationReceipt(
        verified.value,
        acceptedAuthority.identity,
        input.policy,
      );
      const expected = parsed === null ? null : createExactTaskEvaluationReceipt({
        authority: acceptedAuthority,
        taskAuthority,
        result,
        rubricEvaluation: settledEvaluation,
        enforcement: acceptance.enforcement,
        providerExitAuthorityDigest: providerExit.authority.authorityDigest,
        dispatchAdmissionRefDigest: providerExit.authority.dispatchAdmissionRefDigest,
        effectLandingReceiptDigest: effectLanding.landing.landing.receiptDigest,
        finalManifestDigest: effectLanding.landing.verifiedBundle.final.digest as Sha256Digest,
        criterionEvaluationAuthorityDigest: criterion.authority.authorityDigest,
        productionWiringSettlementDigest: productionWiring.state === 'current'
          ? productionWiring.receipt.settlementDigest
          : null,
        productionWiringSettlementArtifactReceiptDigest:
          productionWiring.state === 'current'
            ? productionWiring.artifactReceipt.receiptDigest
            : null,
        policy: input.policy,
        evaluatedAt: parsed.evaluatedAt,
      });
      if (
        verified === null
        || parsed === null
        || expected === null
        || verified.receipt.capturedAt !== parsed.evaluatedAt
        || !exactCanonicalEqual(parsed, expected, input.policy)
      ) return { state: 'hold', reasonCode: 'evaluation-replay-mismatch' };
      evaluationArtifact = persistedEvaluationArtifact;
      evaluationReceipt = parsed;
      if (persistedEvaluationChain === null) {
        evaluationChain = input.custodyStore.appendChain({
          identity: acceptedAuthority.identity,
          policy: input.policy,
          admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
          stage: 'evaluation',
          occurredAt: parsed.evaluatedAt,
          predecessorDigest: acceptedChain.receiptDigest,
          artifactReceipt: persistedEvaluationArtifact,
        });
      } else {
        if (
          persistedEvaluationChain.artifactKey !== artifactKey
          || persistedEvaluationChain.artifactReceiptDigest
            !== persistedEvaluationArtifact.receiptDigest
          || persistedEvaluationChain.predecessorDigest !== acceptedChain.receiptDigest
        ) return { state: 'hold', reasonCode: 'evaluation-chain-replay-mismatch' };
        evaluationChain = persistedEvaluationChain;
      }
    } else {
      if (persistedEvaluationChain !== null) {
        return { state: 'hold', reasonCode: 'evaluation-chain-without-artifact' };
      }
      const evaluatedAt = new Date().toISOString();
      evaluationReceipt = createExactTaskEvaluationReceipt({
        authority: acceptedAuthority,
        taskAuthority,
        result,
        rubricEvaluation: settledEvaluation,
        enforcement: acceptance.enforcement,
        providerExitAuthorityDigest: providerExit.authority.authorityDigest,
        dispatchAdmissionRefDigest: providerExit.authority.dispatchAdmissionRefDigest,
        effectLandingReceiptDigest: effectLanding.landing.landing.receiptDigest,
        finalManifestDigest: effectLanding.landing.verifiedBundle.final.digest as Sha256Digest,
        criterionEvaluationAuthorityDigest: criterion.authority.authorityDigest,
        productionWiringSettlementDigest: productionWiring.state === 'current'
          ? productionWiring.receipt.settlementDigest
          : null,
        productionWiringSettlementArtifactReceiptDigest:
          productionWiring.state === 'current'
            ? productionWiring.artifactReceipt.receiptDigest
            : null,
        policy: input.policy,
        evaluatedAt,
      });
      evaluationArtifact = input.custodyStore.publishHostArtifact({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        artifactClass: 'evaluation-receipt',
        artifactKey,
        capturedAt: evaluatedAt,
        bytes: canonicalTaskAttemptCustodyJson(evaluationReceipt, input.policy.jsonBounds),
      });
      evaluationChain = input.custodyStore.appendChain({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        stage: 'evaluation',
        occurredAt: evaluatedAt,
        predecessorDigest: acceptedChain.receiptDigest,
        artifactReceipt: evaluationArtifact,
      });
    }

    let finalizerArtifact: TaskAttemptCustodyArtifactReceiptV2;
    let finalizerChain: TaskAttemptCustodyChainReceiptV2;
    const persistedFinalizerArtifact = input.custodyStore.readArtifactReceipt({
      identity: acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'finalizer-receipt',
      artifactKey,
    });
    const persistedFinalizerChain = input.custodyStore.readChain(
      acceptedAuthority.identity,
      input.policy,
      'finalizer',
    );
    if (persistedFinalizerArtifact !== null) {
      const verified = exactVerifiedArtifactJson(
        input.custodyStore,
        input.policy,
        acceptedAuthority.identity,
        'finalizer-receipt',
        artifactKey,
        persistedFinalizerArtifact.receiptDigest,
      );
      const parsed = verified === null ? null : parseExactTaskFinalizerReceipt(
        verified.value,
        acceptedAuthority.identity,
        input.policy,
      );
      const expected = parsed === null ? null : createExactTaskFinalizerReceipt({
        identity: acceptedAuthority.identity,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        resultDigest: acceptedAuthority.resultDigest,
        evaluationArtifact,
        evaluationChainDigest: evaluationChain.receiptDigest,
        evaluationReceipt,
        finalizedAt: parsed.finalizedAt,
        policy: input.policy,
      });
      if (
        verified === null
        || parsed === null
        || expected === null
        || verified.receipt.capturedAt !== parsed.finalizedAt
        || !exactCanonicalEqual(parsed, expected, input.policy)
      ) return { state: 'hold', reasonCode: 'finalizer-replay-mismatch' };
      finalizerArtifact = persistedFinalizerArtifact;
      if (persistedFinalizerChain === null) {
        finalizerChain = input.custodyStore.appendChain({
          identity: acceptedAuthority.identity,
          policy: input.policy,
          admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
          stage: 'finalizer',
          occurredAt: parsed.finalizedAt,
          predecessorDigest: evaluationChain.receiptDigest,
          artifactReceipt: persistedFinalizerArtifact,
        });
      } else {
        if (
          persistedFinalizerChain.artifactKey !== artifactKey
          || persistedFinalizerChain.artifactReceiptDigest
            !== persistedFinalizerArtifact.receiptDigest
          || persistedFinalizerChain.predecessorDigest !== evaluationChain.receiptDigest
        ) return { state: 'hold', reasonCode: 'finalizer-chain-replay-mismatch' };
        finalizerChain = persistedFinalizerChain;
      }
    } else {
      if (persistedFinalizerChain !== null) {
        return { state: 'hold', reasonCode: 'finalizer-chain-without-artifact' };
      }
      const finalizedAt = new Date().toISOString();
      const finalizerReceipt = createExactTaskFinalizerReceipt({
        identity: acceptedAuthority.identity,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        resultDigest: acceptedAuthority.resultDigest,
        evaluationArtifact,
        evaluationChainDigest: evaluationChain.receiptDigest,
        evaluationReceipt,
        finalizedAt,
        policy: input.policy,
      });
      finalizerArtifact = input.custodyStore.publishHostArtifact({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        artifactClass: 'finalizer-receipt',
        artifactKey,
        capturedAt: finalizedAt,
        bytes: canonicalTaskAttemptCustodyJson(finalizerReceipt, input.policy.jsonBounds),
      });
      finalizerChain = input.custodyStore.appendChain({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        stage: 'finalizer',
        occurredAt: finalizedAt,
        predecessorDigest: evaluationChain.receiptDigest,
        artifactReceipt: finalizerArtifact,
      });
    }

    let settlement: TaskResultSettlementV2;
    let settlementArtifact: TaskAttemptCustodyArtifactReceiptV2;
    let settlementChain: TaskAttemptCustodyChainReceiptV2;
    const persistedSettlementArtifact = input.custodyStore.readArtifactReceipt({
      identity: acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'settlement-receipt',
      artifactKey,
    });
    const persistedSettlementChain = input.custodyStore.readChain(
      acceptedAuthority.identity,
      input.policy,
      'settlement',
    );
    if (persistedSettlementArtifact !== null) {
      const verified = input.custodyStore.readVerifiedArtifact({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        artifactClass: 'settlement-receipt',
        artifactKey,
        receiptDigest: persistedSettlementArtifact.receiptDigest,
      });
      let parsed: TaskResultSettlementV2 | null = null;
      if (verified !== null) {
        try {
          parsed = parseTaskResultSettlementV2(
            JSON.parse(Buffer.from(verified.bytes).toString('utf8')) as unknown,
            input.policy.jsonBounds,
          );
        } catch {
          parsed = null;
        }
      }
      const expected = parsed === null ? null : createTaskResultSettlementV2({
        custodyStore: input.custodyStore,
        policy: input.policy,
        admission,
        sourceResultArtifact,
        acceptedResultArtifact: acceptedArtifact,
        acceptedResultChain: acceptedChain,
        evaluationArtifact,
        evaluationChain,
        finalizerArtifact,
        finalizerChain,
        settledAt: parsed.settledAt,
        exitCode: providerExit.authority.exitCode,
        result,
      });
      if (
        verified === null
        || parsed === null
        || expected === null
        || verified.receipt.capturedAt !== parsed.settledAt
        || !exactCanonicalEqual(parsed, expected, input.policy)
      ) return { state: 'hold', reasonCode: 'settlement-replay-mismatch' };
      settlement = parsed;
      settlementArtifact = persistedSettlementArtifact;
      if (persistedSettlementChain === null) {
        settlementChain = input.custodyStore.appendChain({
          identity: acceptedAuthority.identity,
          policy: input.policy,
          admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
          stage: 'settlement',
          occurredAt: parsed.settledAt,
          predecessorDigest: finalizerChain.receiptDigest,
          artifactReceipt: persistedSettlementArtifact,
        });
      } else {
        if (
          persistedSettlementChain.artifactKey !== artifactKey
          || persistedSettlementChain.artifactReceiptDigest
            !== persistedSettlementArtifact.receiptDigest
          || persistedSettlementChain.predecessorDigest !== finalizerChain.receiptDigest
        ) return { state: 'hold', reasonCode: 'settlement-chain-replay-mismatch' };
        settlementChain = persistedSettlementChain;
      }
    } else {
      if (persistedSettlementChain !== null) {
        return { state: 'hold', reasonCode: 'settlement-chain-without-artifact' };
      }
      const settledAt = new Date().toISOString();
      settlement = createTaskResultSettlementV2({
        custodyStore: input.custodyStore,
        policy: input.policy,
        admission,
        sourceResultArtifact,
        acceptedResultArtifact: acceptedArtifact,
        acceptedResultChain: acceptedChain,
        evaluationArtifact,
        evaluationChain,
        finalizerArtifact,
        finalizerChain,
        settledAt,
        exitCode: providerExit.authority.exitCode,
        result,
      });
      settlementArtifact = input.custodyStore.publishHostArtifact({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        artifactClass: 'settlement-receipt',
        artifactKey,
        capturedAt: settledAt,
        bytes: canonicalTaskAttemptCustodyJson(settlement, input.policy.jsonBounds),
      });
      settlementChain = input.custodyStore.appendChain({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        stage: 'settlement',
        occurredAt: settledAt,
        predecessorDigest: finalizerChain.receiptDigest,
        artifactReceipt: settlementArtifact,
      });
    }
    if (settlementChain.artifactReceiptDigest !== settlementArtifact.receiptDigest) {
      return { state: 'hold', reasonCode: 'settlement-chain-artifact-mismatch' };
    }
    const settlementDigest = taskResultSettlementV2Digest(
      settlement,
      input.policy.jsonBounds,
    );
    const archivePayload = createExactTaskResultArchivePayload(
      settlement.identity,
      settlementChain.receiptDigest,
      settlementDigest,
    );
    const persistedArchiveArtifact = input.custodyStore.readArtifactReceipt({
      identity: acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'archive-receipt',
      artifactKey,
    });
    const persistedArchiveChain = input.custodyStore.readChain(
      acceptedAuthority.identity,
      input.policy,
      'archive',
    );
    let archiveArtifact: TaskAttemptCustodyArtifactReceiptV2;
    let archiveChain: TaskAttemptCustodyChainReceiptV2;
    if (persistedArchiveArtifact !== null) {
      const verified = input.custodyStore.readVerifiedArtifact({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        artifactClass: 'archive-receipt',
        artifactKey,
        receiptDigest: persistedArchiveArtifact.receiptDigest,
      });
      let parsed: unknown = null;
      if (verified !== null) {
        try {
          parsed = JSON.parse(Buffer.from(verified.bytes).toString('utf8')) as unknown;
        } catch {
          parsed = null;
        }
      }
      if (
        verified === null
        || !exactCanonicalEqual(parsed, archivePayload, input.policy)
      ) return { state: 'hold', reasonCode: 'archive-replay-mismatch' };
      archiveArtifact = persistedArchiveArtifact;
      if (persistedArchiveChain === null) {
        archiveChain = input.custodyStore.appendChain({
          identity: acceptedAuthority.identity,
          policy: input.policy,
          admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
          stage: 'archive',
          occurredAt: persistedArchiveArtifact.capturedAt,
          predecessorDigest: settlementChain.receiptDigest,
          artifactReceipt: persistedArchiveArtifact,
        });
      } else {
        if (
          persistedArchiveChain.artifactKey !== artifactKey
          || persistedArchiveChain.artifactReceiptDigest !== persistedArchiveArtifact.receiptDigest
          || persistedArchiveChain.predecessorDigest !== settlementChain.receiptDigest
          || persistedArchiveChain.occurredAt !== persistedArchiveArtifact.capturedAt
        ) return { state: 'hold', reasonCode: 'archive-chain-replay-mismatch' };
        archiveChain = persistedArchiveChain;
      }
    } else {
      if (persistedArchiveChain !== null) {
        return { state: 'hold', reasonCode: 'archive-chain-without-artifact' };
      }
      const archivedAt = new Date().toISOString();
      archiveArtifact = input.custodyStore.publishHostArtifact({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        artifactClass: 'archive-receipt',
        artifactKey,
        capturedAt: archivedAt,
        bytes: canonicalTaskAttemptCustodyJson(archivePayload, input.policy.jsonBounds),
      });
      archiveChain = input.custodyStore.appendChain({
        identity: acceptedAuthority.identity,
        policy: input.policy,
        admissionReceiptDigest: acceptedAuthority.admissionReceiptDigest,
        stage: 'archive',
        occurredAt: archivedAt,
        predecessorDigest: settlementChain.receiptDigest,
        artifactReceipt: archiveArtifact,
      });
    }
    if (
      archiveChain.artifactReceiptDigest !== archiveArtifact.receiptDigest
      || archiveChain.predecessorDigest !== settlementChain.receiptDigest
    ) return { state: 'hold', reasonCode: 'archive-chain-artifact-mismatch' };
    const settlementRef = createExactTaskResultSettlementRefV2(settlementArtifact);
    const current = readExactAcceptedTaskTerminalAuthority({
      projectRoot: input.projectRoot,
      acceptedAuthority,
      custodyStore: input.custodyStore,
      policy: input.policy,
      settlementRef,
      expectedSettlementDigest: settlementDigest,
    });
    if (current.state !== 'current') return current;
    return Object.freeze({
      state: 'settled',
      authority: current.terminalAuthority,
      enforcement: acceptance.enforcement,
      settlementRef,
      settlementDigest,
    });
  } catch {
    return { state: 'hold', reasonCode: 'custody-hold' };
  }
}

/** Bind stable host context once; collector callers can provide only accepted authority. */
export function createExactAcceptedTaskEvaluationSettler(context: {
  readonly projectRoot: string;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): SettleExactAcceptedResult {
  if (!hasExactTerminalInputFields(
    context,
    ['projectRoot', 'custodyStore', 'policy'],
    [],
  )) throw new TypeError('invalid exact evaluation settler context');
  return ({ acceptedAuthority }) => {
    const result = settleExactAcceptedTaskEvaluation({
      projectRoot: context.projectRoot,
      acceptedAuthority,
      custodyStore: context.custodyStore,
      policy: context.policy,
    });
    if (result.state === 'settled') {
      return Object.freeze({ state: 'settled' as const, authority: result.authority });
    }
    if (result.state === 'route-required') {
      return Object.freeze({
        state: 'route-required' as const,
        reasonCode: 'acceptance-confirmation-required',
      });
    }
    return Object.freeze({ state: 'hold' as const, reasonCode: result.reasonCode });
  };
}
