import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { DECKENT_DIR, TASKS_DIR } from './constants.js';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationAuthMode,
  type InvocationEvent,
  type InvocationExecutionBackend,
  type InvocationPreDispatchReasonCode,
  type InvocationReasonCode,
  type InvocationReceipt,
  type InvocationReceiptReconciliationLedger,
  type InvocationReceiptRef,
  type InvocationReceiptView,
  type InvocationScope,
  type StoredInvocationEvent,
  type InvocationTaskDisposition,
  type InvocationTransport,
} from './invocation-receipt.js';
import {
  InvocationReceiptStore,
  InvocationReceiptStoreError,
} from './invocation-receipt-store.js';
import {
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  canonicalTaskAttemptCustodyJson,
  parseTaskAttemptCustodyAdmissionV2,
  parseTaskAttemptCustodyIdentityV2,
  type Sha256Digest,
  type TaskAttemptCustodyAdmissionV2,
  type TaskAttemptCustodyArtifactReceiptV2,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyStore,
} from './task-attempt-custody-store.js';
import {
  taskResultV2Digest,
  validateProductionTaskResultV2,
  type TaskResultV2,
} from './task-result-schema.js';
import {
  dockerContainerNameForTask,
  inspectTaskResultSettlementAuthority,
  parseTaskResultSettlementV2,
  taskResultSettlementV2Digest,
  type TaskResultSettlementV2,
  type TaskResultSettlementAuthorityInspection,
} from './task-result-settlement.js';
import { validateTaskId } from './validators.js';

export type TaskSettlementDecision = 'eligible' | 'hold' | 'already-settled';
export type TaskSettlementEffectiveStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CLAIMED'
  | 'EXECUTING'
  | 'TESTING'
  | 'DOCUMENTING'
  | 'DONE'
  | 'NO_GO'
  | 'PAUSED'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'NOT_DISPATCHED'
  | 'UNKNOWN';
export type TaskSettlementAuthorityReasonCode =
  | 'receipt-dispatch-rejected'
  | 'receipt-ready-for-rejection'
  | 'legacy-attestation-verified'
  | 'already-settled'
  | 'receipt-missing'
  | 'receipt-ambiguous'
  | 'dispatch-started'
  | 'dispatch-abandoned'
  | 'dispatch-still-live'
  | 'terminal-conflict'
  | 'scope-mismatch'
  | 'unsupported-task-domain'
  | 'task-content-mismatch'
  | 'attestation-evidence-mismatch'
  | 'attestation-required'
  | 'pre-dispatch-reason-required'
  | 'absence-evidence-incomplete'
  | 'active-execution-evidence'
  | 'probe-unsupported';

export type TaskSettlementEvidenceKind =
  | 'heartbeat'
  | 'log'
  | 'result'
  | 'worker-process'
  | 'backend-attempt';

export type TaskSettlementEvidenceState =
  | 'absent'
  | 'present'
  | 'unknown'
  | 'unsupported';

export interface TaskSettlementEvidenceObservation {
  readonly kind: TaskSettlementEvidenceKind;
  readonly state: TaskSettlementEvidenceState;
  readonly evidenceRef: string;
}

export interface TaskSettlementProbeSnapshot {
  readonly platform: string;
  readonly observedAt: string;
  readonly observations: readonly TaskSettlementEvidenceObservation[];
}

export interface TaskSettlementProbeInput extends InvocationScope {
  readonly taskId: string;
  readonly runId: string;
  readonly executionBackend: InvocationExecutionBackend;
}

export interface TaskSettlementEvidenceProbe {
  inspect(input: TaskSettlementProbeInput): Promise<TaskSettlementProbeSnapshot>;
}

/**
 * Synchronous last-moment verification of the canonical task snapshot.
 *
 * Settlement performs no asynchronous work after this verifier succeeds and
 * before the receipt transaction begins. Platform entrypoints must additionally
 * hold the shared task execution fence so canonical dispatch cannot interleave
 * between the filesystem snapshot and the ledger mutation.
 */
interface TaskSettlementSnapshotVerifier {
  verify(input: InspectTaskSettlementInput): boolean;
}

export interface TaskSettlementExternalProbe {
  inspect(input: TaskSettlementProbeInput): Promise<TaskSettlementEvidenceObservation>;
}

/** @internal Exported for hermetic platform-adapter conformance tests. */
export interface LinuxProcWorkerInspectionAdapter {
  readonly platform: string;
  readonly currentPid: number;
  listProcessIds(): Promise<readonly string[]>;
  readCommandLine(pid: string): Promise<string>;
  nowMs(): number;
}

/** @internal Exported for hermetic platform-adapter conformance tests. */
export interface LinuxProcWorkerInspectionOptions {
  readonly adapter?: LinuxProcWorkerInspectionAdapter;
  readonly maxEntries?: number;
  readonly deadlineMs?: number;
}

export interface TaskSettlementInspection {
  readonly decision: TaskSettlementDecision;
  readonly rawStatus: string;
  readonly effectiveStatus: TaskSettlementEffectiveStatus;
  readonly evidenceRefs: readonly string[];
  readonly reasonCode: TaskSettlementAuthorityReasonCode;
  readonly receiptRef?: InvocationReceiptRef;
}

export interface TaskSettlementProjection {
  readonly rawStatus: string;
  readonly effectiveStatus: TaskSettlementEffectiveStatus;
  readonly evidenceRefs: readonly string[];
  readonly receiptRef?: InvocationReceiptRef;
  readonly reasonCode?:
    | 'projected'
    | 'no-terminal-receipt'
    | 'open-receipt'
    | 'ambiguous-receipts'
    | 'store-absent'
    | 'binding-absent';
}

export interface DeclareTaskExecutionInput extends InvocationScope {
  readonly taskId: string;
  readonly runId: string;
  readonly provider: string;
  readonly model: string;
  readonly executionBackend: InvocationExecutionBackend;
  readonly transport?: InvocationTransport;
  readonly authMode?: InvocationAuthMode;
  readonly accountRefHash?: string | null;
  readonly invocationId?: string;
  readonly idempotencyKey?: string;
  readonly callId?: string;
  readonly createdAt?: string;
}

export interface TaskExecutionDeclaration {
  readonly receiptRef: InvocationReceiptRef;
  readonly receipt: InvocationReceipt;
  readonly created: boolean;
}

export interface MarkTaskDispatchStartedInput extends InvocationScope {
  readonly invocationId: string;
  readonly attempt: number;
  readonly executionEvidenceRef: string;
  readonly calledProvider: string;
  readonly calledModel: string;
  readonly occurredAt?: string;
}

export interface SettleDispatchedTaskInput extends InvocationScope {
  readonly invocationId: string;
  readonly outcome: 'succeeded' | 'failed' | 'timeout' | 'unknown';
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly reasonCode: Exclude<InvocationPreDispatchReasonCode, 'legacy_operator_attestation'>
    | 'none'
    | 'nonzero_exit'
    | 'timeout'
    | 'empty_output'
    | 'parse_failed'
    | 'validation_failed'
    | 'abandoned_dispatch_reconciled';
  readonly durationMs: number;
  /**
   * 2026-08-28 (F5): exact dispatch-head hash the caller planned against. When set,
   * the atomic write is refused unless that event is still the receipt head INSIDE the
   * same transaction — closing the plan→apply TOCTOU window for recovery paths.
   */
  readonly requireDispatchHeadHash?: string;
  readonly consumerOutcome: 'accepted' | 'rejected' | 'unknown';
  readonly taskDisposition: Exclude<InvocationTaskDisposition, 'not_dispatched'>;
  readonly evidenceRefs?: readonly string[];
  readonly occurredAt?: string;
}

export interface TaskSettlementOperatorAttestationInput {
  /** Raw operator identity is hashed in memory and never persisted. */
  readonly operatorId: string;
  readonly attestedAt: string;
  /** Free-form statement is hashed in memory and never persisted. */
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
}

export interface InspectTaskSettlementInput extends TaskSettlementProbeInput {
  readonly rawStatus: string;
  readonly taskContent: string | Uint8Array;
  readonly taskCreatedAt: string;
  /**
   * Receipt-backed one-shot execution may reject before publishing a Task JSON.
   * Every reconciliation surface defaults to canonical-file and must prove the
   * exact on-disk bytes. ephemeral-memory is accepted only with an explicit
   * receipt ref and only while the canonical file is genuinely absent.
   */
  readonly taskSnapshotOrigin?: 'canonical-file' | 'ephemeral-memory';
  readonly receiptRef?: InvocationReceiptRef;
  readonly operatorAttestation?: TaskSettlementOperatorAttestationInput;
  readonly reasonCode?: InvocationPreDispatchReasonCode;
}

export interface SettleNotDispatchedInput extends InspectTaskSettlementInput {
  /** False by default. A caller must opt into the immutable receipt mutation. */
  readonly apply?: boolean;
  /** Caller-observed settlement time. Fresh receipt events share this exact instant. */
  readonly occurredAt?: string;
  /**
   * Opaque durable refs produced by the execution backend while proving zero
   * provider work. They augment — never replace — the host absence probes.
   */
  readonly authorityEvidenceRefs?: readonly string[];
}

/** 2026-08-28 (F5): a one-shot dispatch whose worker died without writing a result.
 *  `settleNotDispatched` correctly refuses these — dispatch DID start, so NOT_DISPATCHED
 *  would be a false disposition — and no operator surface could terminalize them, which
 *  left the receipt non-terminal and blocked the canonical `clean` → `build` path. */
export interface SettleAbandonedDispatchInput extends InspectTaskSettlementInput {
  readonly apply?: boolean;
  readonly occurredAt?: string;
}

interface TaskSettlementAuthorityAssemblyOptions {
  readonly ledger: InvocationReceiptReconciliationLedger;
  readonly probe: TaskSettlementEvidenceProbe;
  readonly taskSnapshotVerifier?: TaskSettlementSnapshotVerifier;
  /** Recovery paths need the real backend adapter, which is filesystem/daemon bound. */
  readonly projectRoot?: string;
  /** Recovery-only RUNTIME liveness probe. Injectable so the recovery path is testable
   *  and honours the same adapter override the ordinary probes accept. */
  readonly runtimeLivenessProbe?: TaskSettlementExternalProbe;
  readonly now?: () => string;
}

export interface OpenTaskSettlementAuthorityOptions {
  readonly processProbe?: TaskSettlementExternalProbe;
  readonly backendProbe?: TaskSettlementExternalProbe;
  readonly now?: () => string;
}

export interface TaskSettlementProjectionInput {
  readonly taskId: string;
  readonly rawStatus: string;
  readonly tenantId?: string;
}

export interface TaskSettlementAuthority {
  declareTaskExecution(input: DeclareTaskExecutionInput): TaskExecutionDeclaration;
  markDispatchStarted(input: MarkTaskDispatchStartedInput): InvocationReceiptRef;
  settleDispatched(input: SettleDispatchedTaskInput): TaskSettlementInspection;
  inspectTaskSettlement(input: InspectTaskSettlementInput): Promise<TaskSettlementInspection>;
  plan(input: InspectTaskSettlementInput): Promise<TaskSettlementInspection>;
  settleNotDispatched(input: SettleNotDispatchedInput): Promise<TaskSettlementInspection>;
  settleAbandonedDispatch(input: SettleAbandonedDispatchInput): Promise<TaskSettlementInspection>;
  settleDispatchedFromResult(input: SettleAbandonedDispatchInput): Promise<TaskSettlementInspection>;
  reprojectTaskStatusFromReceipt(input: SettleAbandonedDispatchInput): Promise<TaskSettlementInspection>;
  projectTaskExecutionState(
    taskId: string,
    rawStatus: string,
    scope?: InvocationScope,
  ): TaskSettlementProjection;
  projectTaskExecutionStates(
    inputs: readonly TaskSettlementProjectionInput[],
  ): readonly TaskSettlementProjection[];
}

export interface OpenTaskSettlementAuthorityResult {
  readonly authority: TaskSettlementAuthority;
  readonly projectId: string;
  close(): void;
}

export interface OpenTaskSettlementProjectionResult {
  readonly projectId: string | null;
  readonly diagnostic: 'ready' | 'store-absent' | 'binding-absent';
  projectTaskExecutionState(
    taskId: string,
    rawStatus: string,
    tenantId?: string,
  ): TaskSettlementProjection;
  projectTaskExecutionStates(
    inputs: readonly TaskSettlementProjectionInput[],
  ): readonly TaskSettlementProjection[];
  close(): void;
}

/** Compact host-private reference to one immutable V2 settlement artifact. */
export interface ExactTaskResultSettlementRefV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-result-settlement-v2-ref';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
}

/** Exact pre-evaluation authority over one canonical accepted TaskResultV2 artifact. */
export interface ExactAcceptedTaskResultRefV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-accepted-result-v2-ref';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
}

export interface InspectExactAcceptedTaskResultAuthorityInput {
  readonly executionMode: 'normal-docker';
  readonly authorityKind: 'accepted-result';
  /** Diagnostic scope only. Exact inspection never reads public project artifacts. */
  readonly projectRoot: string;
  readonly taskId: string;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly expectedIdentity: TaskAttemptCustodyIdentityV2;
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly acceptedResultRef: ExactAcceptedTaskResultRefV2;
  readonly expectedAcceptedResultChainDigest: Sha256Digest;
}

export type ExactAcceptedTaskResultAuthorityHoldReason =
  | 'invalid-input'
  | 'identity-mismatch'
  | 'stale-attempt'
  | 'sibling-attempt'
  | 'admission-mismatch'
  | 'accepted-result-missing'
  | 'accepted-result-spoofed'
  | 'accepted-result-chain-mismatch'
  | 'custody-hold';

export type ExactAcceptedTaskResultAuthorityInspection =
  | {
      readonly state: 'accepted-result';
      readonly executionMode: 'normal-docker';
      readonly identity: TaskAttemptCustodyIdentityV2;
      readonly admissionReceiptDigest: Sha256Digest;
      readonly acceptedResultRef: ExactAcceptedTaskResultRefV2;
      readonly acceptedResultChainDigest: Sha256Digest;
      readonly resultDigest: Sha256Digest;
      readonly result: TaskResultV2;
    }
  | {
      readonly state: 'hold';
      readonly executionMode: 'normal-docker';
      readonly taskId: string;
      readonly reasonCode: ExactAcceptedTaskResultAuthorityHoldReason;
    };

export interface ExactTaskResultHostArtifactAuthorityV2 {
  readonly artifactReceiptDigest: Sha256Digest;
  readonly chainDigest: Sha256Digest;
  readonly artifactSha256: Sha256Digest;
  readonly byteLength: number;
}

/**
 * Host-produced pre-dispatch truth. The null fields are intentional: a task
 * that never dispatched cannot acquire an attempt, settlement ref, or digest.
 */
export interface ExactTaskNotDispatchedAuthorityV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'task-not-dispatched-v2';
  readonly state: 'NOT_DISPATCHED';
  readonly taskId: string;
  readonly attemptCount: 0;
  readonly reasonCode: string;
  readonly evidenceRef: string;
  readonly attemptIdentity: null;
  readonly settlementRef: null;
  readonly settlementDigest: null;
}

export interface InspectExactTaskResultAttemptSettlementInput {
  readonly executionMode: 'normal-docker';
  readonly authorityKind: 'attempt-settlement';
  /** Diagnostic scope only. Normal Docker inspection never reads public project artifacts. */
  readonly projectRoot: string;
  readonly taskId: string;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly expectedIdentity: TaskAttemptCustodyIdentityV2;
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly settlementRef: ExactTaskResultSettlementRefV2;
  readonly expectedSettlementDigest: Sha256Digest;
}

export interface InspectExactTaskNotDispatchedInput {
  readonly executionMode: 'normal-docker';
  readonly authorityKind: 'not-dispatched';
  readonly projectRoot: string;
  readonly taskId: string;
  readonly authority: ExactTaskNotDispatchedAuthorityV2;
}

export interface InspectLegacyNonDockerTaskResultInput {
  readonly executionMode: 'legacy-non-docker';
  readonly projectRoot: string;
  readonly taskId: string;
}

export type InspectExactTaskResultSettlementAuthorityInput =
  | InspectExactTaskResultAttemptSettlementInput
  | InspectExactTaskNotDispatchedInput
  | InspectLegacyNonDockerTaskResultInput;

export type ExactTaskResultSettlementHoldReason =
  | 'invalid-input'
  | 'identity-mismatch'
  | 'stale-attempt'
  | 'sibling-attempt'
  | 'admission-mismatch'
  | 'settlement-missing'
  | 'spoofed-settlement'
  | 'settlement-chain-mismatch'
  | 'evaluation-authority-invalid'
  | 'finalizer-authority-invalid'
  | 'custody-hold'
  | 'not-dispatched-attempt-conflict';

export type ExactTaskResultSettlementInspection =
  | {
      readonly state: 'accepted';
      readonly executionMode: 'normal-docker';
      readonly identity: TaskAttemptCustodyIdentityV2;
      readonly admissionReceiptDigest: Sha256Digest;
      readonly settlementRef: ExactTaskResultSettlementRefV2;
      readonly settlementDigest: Sha256Digest;
      readonly result: TaskResultV2;
      readonly settlement: TaskResultSettlementV2;
      readonly evaluationArtifact: ExactTaskResultHostArtifactAuthorityV2;
      readonly finalizerArtifact: ExactTaskResultHostArtifactAuthorityV2;
    }
  | {
      readonly state: 'not-dispatched';
      readonly executionMode: 'normal-docker';
      readonly taskId: string;
      readonly attemptCount: 0;
      readonly reasonCode: string;
      readonly evidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly executionMode: 'normal-docker';
      readonly taskId: string;
      readonly reasonCode: ExactTaskResultSettlementHoldReason;
    }
  | {
      readonly state: 'legacy';
      readonly executionMode: 'legacy-non-docker';
      readonly result: unknown | null;
      readonly rawResultPath: string;
    };

export class TaskSettlementProjectionError extends Error {
  constructor(
    readonly code: 'STORE_UNREADABLE' | 'STORE_CORRUPT',
    message: string,
  ) {
    super(message);
    this.name = 'TaskSettlementProjectionError';
  }
}

const REQUIRED_ABSENCE_KINDS = Object.freeze([
  'heartbeat',
  'log',
  'result',
  'worker-process',
  'backend-attempt',
] as const satisfies readonly TaskSettlementEvidenceKind[]);

const MAX_EVIDENCE_REFS = 32;
const SHA256_RE = /^[a-f0-9]{64}$/u;

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function eventId(prefix: string, values: readonly string[]): string {
  return `${prefix}:${sha256(values.join('\u0000'))}`;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

const RAW_TASK_STATUSES = new Set<TaskSettlementEffectiveStatus>([
  'DRAFT',
  'PENDING',
  'CLAIMED',
  'EXECUTING',
  'TESTING',
  'DOCUMENTING',
  'DONE',
  'NO_GO',
  'PAUSED',
  'MANUAL_REVIEW_REQUIRED',
  'NOT_DISPATCHED',
]);

function canonicalRawStatus(value: string): TaskSettlementEffectiveStatus {
  return RAW_TASK_STATUSES.has(value as TaskSettlementEffectiveStatus)
    ? value as TaskSettlementEffectiveStatus
    : 'UNKNOWN';
}

interface NormalizedTaskSettlementProjectionInput {
  readonly taskId: string;
  readonly rawStatus: string;
  readonly tenantId: string;
}

function normalizeProjectionInputs(
  inputs: readonly TaskSettlementProjectionInput[],
): readonly NormalizedTaskSettlementProjectionInput[] {
  if (
    !Array.isArray(inputs)
    || Object.keys(inputs).length !== inputs.length
  ) {
    throw new TypeError('TASK_SETTLEMENT_INVALID_PROJECTION_INPUTS');
  }
  return Object.freeze(inputs.map((input, index) => {
    if (
      !input
      || typeof input !== 'object'
      || (
        !exactOwnKeys(input, ['taskId', 'rawStatus'])
        && !exactOwnKeys(input, ['taskId', 'rawStatus', 'tenantId'])
      )
      || typeof input.taskId !== 'string'
      || typeof input.rawStatus !== 'string'
      || (input.tenantId !== undefined && typeof input.tenantId !== 'string')
    ) {
      throw new TypeError(`TASK_SETTLEMENT_INVALID_PROJECTION_INPUT:${index}`);
    }
    validateTaskId(input.taskId);
    const tenantId = input.tenantId ?? 'local';
    if (!tenantId.trim() || tenantId !== tenantId.trim()) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_SCOPE');
    }
    return Object.freeze({ taskId: input.taskId, rawStatus: input.rawStatus, tenantId });
  }));
}

function receiptRef(view: InvocationReceiptView): InvocationReceiptRef {
  return {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: view.receipt.invocationId,
    tenantId: view.receipt.tenantId,
    projectId: view.receipt.projectId,
  };
}

function settledNotDispatched(view: InvocationReceiptView): boolean {
  if (
    view.receipt.purpose !== 'worker-execution'
    || view.receipt.taskId === null
    || view.transportOutcome !== 'not_dispatched'
    || view.consumerOutcome !== 'accepted'
  ) return false;
  const consumer = view.events.at(-1);
  return consumer?.type === 'consumer_settled'
    && (consumer.payload as Extract<InvocationEvent, { type: 'consumer_settled' }>['payload'])
      .taskDisposition === 'not_dispatched';
}

function effectiveTaskStatus(view: InvocationReceiptView): TaskSettlementEffectiveStatus | null {
  if (view.receipt.purpose !== 'worker-execution' || view.receipt.taskId === null) return null;
  if (view.taskDisposition === 'not_dispatched') {
    return view.transportOutcome === 'not_dispatched' && view.consumerOutcome === 'accepted'
      ? 'NOT_DISPATCHED'
      : null;
  }
  if (view.taskDisposition === 'done') {
    return view.transportOutcome === 'succeeded' && view.consumerOutcome === 'accepted'
      ? 'DONE'
      : null;
  }
  if (view.taskDisposition === 'no_go') {
    return view.events.some(event => event.type === 'transport_settled')
      && view.consumerOutcome === 'rejected'
      ? 'NO_GO'
      : null;
  }
  if (view.taskDisposition === 'manual_review_required') {
    return view.events.some(event => event.type === 'transport_settled')
      && view.consumerOutcome === 'unknown'
      ? 'MANUAL_REVIEW_REQUIRED'
      : null;
  }
  return null;
}

function dispatchRejected(view: InvocationReceiptView): boolean {
  return view.events.at(-1)?.type === 'dispatch_rejected';
}

function boundedEvidenceRefs(refs: readonly string[]): readonly string[] | null {
  if (refs.length < 1 || refs.length > MAX_EVIDENCE_REFS) return null;
  const unique = [...new Set(refs)].sort();
  if (
    unique.some(ref => (
      ref.trim().length === 0
      || ref !== ref.trim()
      || ref.length > 512
    ))
  ) return null;
  return Object.freeze(unique);
}

function exactOwnKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

const CUSTODY_SHA256_RE = /^sha256:[a-f0-9]{64}$/u;
const CUSTODY_ARTIFACT_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function sameCustodyIdentity(
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

function custodyIdentityHoldReason(
  expected: TaskAttemptCustodyIdentityV2,
  observed: TaskAttemptCustodyIdentityV2,
): 'identity-mismatch' | 'stale-attempt' | 'sibling-attempt' | null {
  if (
    expected.schemaVersion !== observed.schemaVersion
    || expected.backend !== observed.backend
    || expected.projectRootSha256 !== observed.projectRootSha256
    || expected.projectId !== observed.projectId
    || expected.taskId !== observed.taskId
  ) return 'identity-mismatch';
  if (expected.attemptId !== observed.attemptId) return 'sibling-attempt';
  if (expected.generation !== observed.generation) {
    return observed.generation < expected.generation ? 'stale-attempt' : 'sibling-attempt';
  }
  return null;
}

function parseExactTaskResultSettlementRefV2(
  value: unknown,
): ExactTaskResultSettlementRefV2 | null {
  if (!plainRecord(value) || !exactOwnKeys(value, [
    'schemaVersion',
    'kind',
    'identity',
    'artifactKey',
    'artifactReceiptDigest',
  ])) return null;
  const identity = parseTaskAttemptCustodyIdentityV2(value.identity);
  if (
    !identity
    || value.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || value.kind !== 'task-result-settlement-v2-ref'
    || typeof value.artifactKey !== 'string'
    || !CUSTODY_ARTIFACT_KEY_RE.test(value.artifactKey)
    || typeof value.artifactReceiptDigest !== 'string'
    || !CUSTODY_SHA256_RE.test(value.artifactReceiptDigest)
  ) return null;
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-result-settlement-v2-ref',
    identity: Object.freeze({ ...identity }),
    artifactKey: value.artifactKey,
    artifactReceiptDigest: value.artifactReceiptDigest as Sha256Digest,
  });
}

export function createExactTaskResultSettlementRefV2(
  settlementArtifact: TaskAttemptCustodyArtifactReceiptV2,
): ExactTaskResultSettlementRefV2 {
  if (
    !plainRecord(settlementArtifact)
    || settlementArtifact.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || settlementArtifact.artifactClass !== 'settlement-receipt'
    || settlementArtifact.captureMode !== 'host-authority-publication'
  ) throw new TypeError('TASK_RESULT_SETTLEMENT_EXACT_REF_INVALID_ARTIFACT');
  const ref = parseExactTaskResultSettlementRefV2({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-result-settlement-v2-ref',
    identity: settlementArtifact.identity,
    artifactKey: settlementArtifact.artifactKey,
    artifactReceiptDigest: settlementArtifact.receiptDigest,
  });
  if (!ref) throw new TypeError('TASK_RESULT_SETTLEMENT_EXACT_REF_INVALID_ARTIFACT');
  return ref;
}

function parseExactAcceptedTaskResultRefV2(
  value: unknown,
): ExactAcceptedTaskResultRefV2 | null {
  if (!plainRecord(value) || !exactOwnKeys(value, [
    'schemaVersion',
    'kind',
    'identity',
    'artifactKey',
    'artifactReceiptDigest',
  ])) return null;
  const identity = parseTaskAttemptCustodyIdentityV2(value.identity);
  if (
    !identity
    || value.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || value.kind !== 'task-accepted-result-v2-ref'
    || typeof value.artifactKey !== 'string'
    || !CUSTODY_ARTIFACT_KEY_RE.test(value.artifactKey)
    || typeof value.artifactReceiptDigest !== 'string'
    || !CUSTODY_SHA256_RE.test(value.artifactReceiptDigest)
  ) return null;
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-accepted-result-v2-ref',
    identity: Object.freeze({ ...identity }),
    artifactKey: value.artifactKey,
    artifactReceiptDigest: value.artifactReceiptDigest as Sha256Digest,
  });
}

export function createExactAcceptedTaskResultRefV2(
  acceptedResultArtifact: TaskAttemptCustodyArtifactReceiptV2,
): ExactAcceptedTaskResultRefV2 {
  if (
    !plainRecord(acceptedResultArtifact)
    || acceptedResultArtifact.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || acceptedResultArtifact.artifactClass !== 'canonical-accepted-result'
    || acceptedResultArtifact.captureMode !== 'host-authority-publication'
  ) throw new TypeError('TASK_ACCEPTED_RESULT_EXACT_REF_INVALID_ARTIFACT');
  const ref = parseExactAcceptedTaskResultRefV2({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-accepted-result-v2-ref',
    identity: acceptedResultArtifact.identity,
    artifactKey: acceptedResultArtifact.artifactKey,
    artifactReceiptDigest: acceptedResultArtifact.receiptDigest,
  });
  if (!ref) throw new TypeError('TASK_ACCEPTED_RESULT_EXACT_REF_INVALID_ARTIFACT');
  return ref;
}

function exactAcceptedTaskResultHold(
  taskId: string,
  reasonCode: ExactAcceptedTaskResultAuthorityHoldReason,
): ExactAcceptedTaskResultAuthorityInspection {
  return Object.freeze({
    state: 'hold',
    executionMode: 'normal-docker',
    taskId,
    reasonCode,
  });
}

function rawCustodySha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Exact pre-evaluation consumer boundary. It terminates at accepted-result and
 * deliberately cannot observe evaluation/finalizer/settlement stages.
 */
export function inspectExactAcceptedTaskResultAuthority(
  input: InspectExactAcceptedTaskResultAuthorityInput,
): ExactAcceptedTaskResultAuthorityInspection {
  if (!plainRecord(input)) return exactAcceptedTaskResultHold('unknown', 'invalid-input');
  const taskId = typeof input.taskId === 'string' ? input.taskId : 'unknown';
  try {
    if (
      !exactOwnKeys(input, [
        'executionMode',
        'authorityKind',
        'projectRoot',
        'taskId',
        'custodyStore',
        'policy',
        'expectedIdentity',
        'admission',
        'acceptedResultRef',
        'expectedAcceptedResultChainDigest',
      ])
      || input.executionMode !== 'normal-docker'
      || input.authorityKind !== 'accepted-result'
      || typeof input.projectRoot !== 'string'
      || input.projectRoot.trim().length === 0
      || taskId === 'unknown'
    ) return exactAcceptedTaskResultHold(taskId, 'invalid-input');
    validateTaskId(taskId);
    const expectedIdentity = parseTaskAttemptCustodyIdentityV2(input.expectedIdentity);
    const acceptedResultRef = parseExactAcceptedTaskResultRefV2(input.acceptedResultRef);
    if (
      !expectedIdentity
      || expectedIdentity.backend !== 'docker'
      || expectedIdentity.taskId !== taskId
      || !acceptedResultRef
      || typeof input.expectedAcceptedResultChainDigest !== 'string'
      || !CUSTODY_SHA256_RE.test(input.expectedAcceptedResultChainDigest)
      || !input.custodyStore
      || typeof input.custodyStore !== 'object'
      || typeof input.custodyStore.readAdmission !== 'function'
      || typeof input.custodyStore.readVerifiedArtifact !== 'function'
      || typeof input.custodyStore.readChain !== 'function'
      || typeof input.policy !== 'object'
      || input.policy === null
    ) return exactAcceptedTaskResultHold(taskId, 'invalid-input');
    const refIdentityReason = custodyIdentityHoldReason(
      expectedIdentity,
      acceptedResultRef.identity,
    );
    if (refIdentityReason) return exactAcceptedTaskResultHold(taskId, refIdentityReason);
    const admission = parseTaskAttemptCustodyAdmissionV2(input.admission, input.policy);
    if (!admission) return exactAcceptedTaskResultHold(taskId, 'admission-mismatch');
    const admissionIdentityReason = custodyIdentityHoldReason(
      expectedIdentity,
      admission.identity,
    );
    if (admissionIdentityReason) {
      return exactAcceptedTaskResultHold(taskId, admissionIdentityReason);
    }
    const persistedAdmission = input.custodyStore.readAdmission(
      expectedIdentity,
      input.policy,
    );
    if (
      persistedAdmission === null
      || persistedAdmission.receiptDigest !== admission.receiptDigest
      || !Buffer.from(canonicalTaskAttemptCustodyJson(
        persistedAdmission,
        input.policy.jsonBounds,
      )).equals(Buffer.from(canonicalTaskAttemptCustodyJson(
        admission,
        input.policy.jsonBounds,
      )))
    ) return exactAcceptedTaskResultHold(taskId, 'admission-mismatch');

    const acceptedArtifact = input.custodyStore.readVerifiedArtifact({
      identity: expectedIdentity,
      policy: input.policy,
      artifactClass: 'canonical-accepted-result',
      artifactKey: acceptedResultRef.artifactKey,
      receiptDigest: acceptedResultRef.artifactReceiptDigest,
    });
    if (acceptedArtifact === null) {
      return exactAcceptedTaskResultHold(taskId, 'accepted-result-missing');
    }
    if (
      acceptedArtifact.receipt.receiptDigest !== acceptedResultRef.artifactReceiptDigest
      || acceptedArtifact.receipt.admissionReceiptDigest !== admission.receiptDigest
      || acceptedArtifact.receipt.policyDigest !== input.policy.policyDigest
      || !sameCustodyIdentity(acceptedArtifact.receipt.identity, expectedIdentity)
      || acceptedArtifact.receipt.artifact.sha256 !== rawCustodySha256(acceptedArtifact.bytes)
      || acceptedArtifact.receipt.artifact.byteLength !== acceptedArtifact.bytes.byteLength
    ) return exactAcceptedTaskResultHold(taskId, 'accepted-result-spoofed');
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(acceptedArtifact.bytes).toString('utf8'));
    } catch {
      return exactAcceptedTaskResultHold(taskId, 'accepted-result-spoofed');
    }
    const result = validateProductionTaskResultV2(decoded, input.policy.jsonBounds);
    if (!result.ok) return exactAcceptedTaskResultHold(taskId, 'accepted-result-spoofed');
    if (
      !sameCustodyIdentity(result.value.attemptCustody.identity, expectedIdentity)
      || result.value.attemptCustody.policyDigest !== input.policy.policyDigest
      || result.value.attemptCustody.admissionReceiptDigest !== admission.receiptDigest
      || !Buffer.from(canonicalTaskAttemptCustodyJson(
        result.value,
        input.policy.jsonBounds,
      )).equals(Buffer.from(acceptedArtifact.bytes))
    ) return exactAcceptedTaskResultHold(taskId, 'accepted-result-spoofed');
    const sourceBinding = result.value.attemptCustody.sourceResult;
    const sourceArtifact = input.custodyStore.readVerifiedArtifact({
      identity: expectedIdentity,
      policy: input.policy,
      artifactClass: 'worker-result',
      artifactKey: sourceBinding.artifactKey,
      receiptDigest: sourceBinding.artifactReceiptDigest as Sha256Digest,
    });
    if (
      sourceArtifact === null
      || sourceArtifact.receipt.admissionReceiptDigest !== admission.receiptDigest
      || sourceArtifact.receipt.policyDigest !== input.policy.policyDigest
      || !sameCustodyIdentity(sourceArtifact.receipt.identity, expectedIdentity)
      || sourceArtifact.receipt.artifact.sha256 !== sourceBinding.artifactSha256
      || sourceArtifact.receipt.artifact.byteLength !== sourceBinding.byteLength
      || Date.parse(sourceArtifact.receipt.capturedAt)
        > Date.parse(acceptedArtifact.receipt.capturedAt)
    ) return exactAcceptedTaskResultHold(taskId, 'accepted-result-spoofed');
    const acceptedChain = input.custodyStore.readChain(
      expectedIdentity,
      input.policy,
      'accepted-result',
    );
    if (
      acceptedChain === null
      || acceptedChain.receiptDigest !== input.expectedAcceptedResultChainDigest
      || acceptedChain.predecessorDigest
        !== result.value.attemptCustody.effectLanding.effectLandingChainDigest
      || acceptedChain.artifactKey !== acceptedResultRef.artifactKey
      || acceptedChain.artifactReceiptDigest !== acceptedResultRef.artifactReceiptDigest
    ) return exactAcceptedTaskResultHold(taskId, 'accepted-result-chain-mismatch');
    return Object.freeze({
      state: 'accepted-result',
      executionMode: 'normal-docker',
      identity: Object.freeze({ ...expectedIdentity }),
      admissionReceiptDigest: admission.receiptDigest,
      acceptedResultRef,
      acceptedResultChainDigest: acceptedChain.receiptDigest,
      resultDigest: taskResultV2Digest(result.value, input.policy.jsonBounds),
      result: result.value,
    });
  } catch (error) {
    if (error instanceof TaskAttemptCustodyHold) {
      const reason = custodyHoldReason(error);
      return exactAcceptedTaskResultHold(
        taskId,
        reason === 'admission-mismatch'
          ? reason
          : reason === 'settlement-chain-mismatch'
            ? 'accepted-result-chain-mismatch'
            : reason === 'spoofed-settlement'
              ? 'accepted-result-spoofed'
              : 'custody-hold',
      );
    }
    return exactAcceptedTaskResultHold(taskId, 'invalid-input');
  }
}

function exactTaskResultSettlementHold(
  taskId: string,
  reasonCode: ExactTaskResultSettlementHoldReason,
): ExactTaskResultSettlementInspection {
  return Object.freeze({
    state: 'hold',
    executionMode: 'normal-docker',
    taskId,
    reasonCode,
  });
}

function custodyHoldReason(error: TaskAttemptCustodyHold): ExactTaskResultSettlementHoldReason {
  if (error.code === 'ADMISSION_REQUIRED' || error.code === 'ADMISSION_MISMATCH') {
    return 'admission-mismatch';
  }
  if (
    error.code === 'CHAIN_PREDECESSOR_MISMATCH'
    || error.code === 'INCOMPLETE_PUBLICATION'
  ) return 'settlement-chain-mismatch';
  if (
    error.code === 'ARTIFACT_REPLAY_MISMATCH'
    || error.code === 'ARTIFACT_CHANGED'
    || error.code === 'CORRUPT_CUSTODY_RECORD'
    || error.code === 'FIRST_WRITER_COLLISION'
  ) return 'spoofed-settlement';
  return 'custody-hold';
}

function inspectExactNotDispatched(
  input: Record<string, unknown>,
  taskId: string,
): ExactTaskResultSettlementInspection {
  if (!exactOwnKeys(input, [
    'executionMode',
    'authorityKind',
    'projectRoot',
    'taskId',
    'authority',
  ])) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  const authority = input.authority;
  if (!plainRecord(authority) || !exactOwnKeys(authority, [
    'schemaVersion',
    'kind',
    'state',
    'taskId',
    'attemptCount',
    'reasonCode',
    'evidenceRef',
    'attemptIdentity',
    'settlementRef',
    'settlementDigest',
  ])) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  if (
    authority.attemptCount !== 0
    || authority.attemptIdentity !== null
    || authority.settlementRef !== null
    || authority.settlementDigest !== null
  ) return exactTaskResultSettlementHold(taskId, 'not-dispatched-attempt-conflict');
  if (
    authority.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || authority.kind !== 'task-not-dispatched-v2'
    || authority.state !== 'NOT_DISPATCHED'
    || authority.taskId !== taskId
    || typeof authority.reasonCode !== 'string'
    || authority.reasonCode.trim().length === 0
    || authority.reasonCode !== authority.reasonCode.trim()
    || typeof authority.evidenceRef !== 'string'
    || authority.evidenceRef.trim().length === 0
    || authority.evidenceRef !== authority.evidenceRef.trim()
    || authority.evidenceRef.length > 512
  ) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  return Object.freeze({
    state: 'not-dispatched',
    executionMode: 'normal-docker',
    taskId,
    attemptCount: 0,
    reasonCode: authority.reasonCode,
    evidenceRef: authority.evidenceRef,
  });
}

function readExactHostArtifactAuthority(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly artifactClass: 'evaluation-receipt' | 'finalizer-receipt';
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
  readonly chainDigest: Sha256Digest;
}): ExactTaskResultHostArtifactAuthorityV2 | null {
  const artifact = input.store.readVerifiedArtifact({
    identity: input.identity,
    policy: input.policy,
    artifactClass: input.artifactClass,
    artifactKey: input.artifactKey,
    receiptDigest: input.artifactReceiptDigest,
  });
  if (
    artifact === null
    || artifact.receipt.receiptDigest !== input.artifactReceiptDigest
    || artifact.receipt.admissionReceiptDigest !== input.admissionReceiptDigest
    || artifact.receipt.policyDigest !== input.policy.policyDigest
    || !sameCustodyIdentity(artifact.receipt.identity, input.identity)
    || artifact.receipt.artifact.sha256 !== rawCustodySha256(artifact.bytes)
    || artifact.receipt.artifact.byteLength !== artifact.bytes.byteLength
  ) return null;
  return Object.freeze({
    artifactReceiptDigest: artifact.receipt.receiptDigest,
    chainDigest: input.chainDigest,
    artifactSha256: artifact.receipt.artifact.sha256,
    byteLength: artifact.receipt.artifact.byteLength,
  });
}

function inspectExactAttemptSettlement(
  input: Record<string, unknown>,
  taskId: string,
): ExactTaskResultSettlementInspection {
  if (!exactOwnKeys(input, [
    'executionMode',
    'authorityKind',
    'projectRoot',
    'taskId',
    'custodyStore',
    'policy',
    'expectedIdentity',
    'admission',
    'settlementRef',
    'expectedSettlementDigest',
  ])) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  const expectedIdentity = parseTaskAttemptCustodyIdentityV2(input.expectedIdentity);
  const settlementRef = parseExactTaskResultSettlementRefV2(input.settlementRef);
  if (
    !expectedIdentity
    || expectedIdentity.backend !== 'docker'
    || expectedIdentity.taskId !== taskId
    || !settlementRef
    || typeof input.projectRoot !== 'string'
    || input.projectRoot.trim().length === 0
    || typeof input.expectedSettlementDigest !== 'string'
    || !CUSTODY_SHA256_RE.test(input.expectedSettlementDigest)
    || !input.custodyStore
    || typeof input.custodyStore !== 'object'
    || typeof (input.custodyStore as TaskAttemptCustodyStore).readAdmission !== 'function'
    || typeof input.policy !== 'object'
    || input.policy === null
  ) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  const projectRoot = input.projectRoot;
  const refIdentityReason = custodyIdentityHoldReason(expectedIdentity, settlementRef.identity);
  if (refIdentityReason) return exactTaskResultSettlementHold(taskId, refIdentityReason);

  const store = input.custodyStore as TaskAttemptCustodyStore;
  const policy = input.policy as TaskAttemptCustodyPolicyV2;
  const admission = parseTaskAttemptCustodyAdmissionV2(input.admission, policy);
  if (!admission) return exactTaskResultSettlementHold(taskId, 'admission-mismatch');
  const admissionIdentityReason = custodyIdentityHoldReason(
    expectedIdentity,
    admission.identity,
  );
  if (admissionIdentityReason) {
    return exactTaskResultSettlementHold(taskId, admissionIdentityReason);
  }
  try {
    const persistedAdmission = store.readAdmission(expectedIdentity, policy);
    if (
      persistedAdmission === null
      || persistedAdmission.receiptDigest !== admission.receiptDigest
      || !Buffer.from(canonicalTaskAttemptCustodyJson(
        persistedAdmission,
        policy.jsonBounds,
      )).equals(Buffer.from(canonicalTaskAttemptCustodyJson(admission, policy.jsonBounds)))
    ) return exactTaskResultSettlementHold(taskId, 'admission-mismatch');

    const artifact = store.readVerifiedArtifact({
      identity: expectedIdentity,
      policy,
      artifactClass: 'settlement-receipt',
      artifactKey: settlementRef.artifactKey,
      receiptDigest: settlementRef.artifactReceiptDigest,
    });
    if (artifact === null) return exactTaskResultSettlementHold(taskId, 'settlement-missing');
    if (
      artifact.receipt.receiptDigest !== settlementRef.artifactReceiptDigest
      || artifact.receipt.admissionReceiptDigest !== admission.receiptDigest
      || artifact.receipt.policyDigest !== policy.policyDigest
      || !sameCustodyIdentity(artifact.receipt.identity, expectedIdentity)
    ) return exactTaskResultSettlementHold(taskId, 'spoofed-settlement');

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(artifact.bytes).toString('utf8'));
    } catch {
      return exactTaskResultSettlementHold(taskId, 'spoofed-settlement');
    }
    const settlement = parseTaskResultSettlementV2(decoded, policy.jsonBounds);
    if (!settlement) return exactTaskResultSettlementHold(taskId, 'spoofed-settlement');
    const settlementIdentityReason = custodyIdentityHoldReason(
      expectedIdentity,
      settlement.identity,
    );
    if (settlementIdentityReason) {
      return exactTaskResultSettlementHold(taskId, settlementIdentityReason);
    }
    const settlementDigest = taskResultSettlementV2Digest(settlement, policy.jsonBounds);
    if (
      settlementDigest !== input.expectedSettlementDigest
      || settlement.admissionReceiptDigest !== admission.receiptDigest
      || settlement.policyDigest !== policy.policyDigest
    ) return exactTaskResultSettlementHold(taskId, 'spoofed-settlement');

    const acceptedChain = store.readChain(expectedIdentity, policy, 'accepted-result');
    const evaluationChain = store.readChain(expectedIdentity, policy, 'evaluation');
    const finalizerChain = store.readChain(expectedIdentity, policy, 'finalizer');
    const settlementChain = store.readChain(expectedIdentity, policy, 'settlement');
    if (
      acceptedChain === null
      || evaluationChain === null
      || finalizerChain === null
      || settlementChain === null
      || settlement.chain.acceptedResultChainDigest !== acceptedChain.receiptDigest
      || settlement.chain.evaluationChainDigest !== evaluationChain.receiptDigest
      || settlement.chain.finalizerChainDigest !== finalizerChain.receiptDigest
      || settlementChain.predecessorDigest !== finalizerChain.receiptDigest
      || settlementChain.artifactKey !== settlementRef.artifactKey
      || settlementChain.artifactReceiptDigest !== settlementRef.artifactReceiptDigest
      || Date.parse(settlement.settledAt) > Date.parse(artifact.receipt.capturedAt)
      || Date.parse(artifact.receipt.capturedAt) > Date.parse(settlementChain.occurredAt)
    ) return exactTaskResultSettlementHold(taskId, 'settlement-chain-mismatch');

    let acceptedArtifact;
    try {
      acceptedArtifact = store.readVerifiedArtifact({
        identity: expectedIdentity,
        policy,
        artifactClass: 'canonical-accepted-result',
        artifactKey: acceptedChain.artifactKey,
        receiptDigest: acceptedChain.artifactReceiptDigest,
      });
    } catch {
      return exactTaskResultSettlementHold(taskId, 'settlement-chain-mismatch');
    }
    if (!acceptedArtifact) {
      return exactTaskResultSettlementHold(taskId, 'settlement-chain-mismatch');
    }
    const acceptedAuthority = inspectExactAcceptedTaskResultAuthority({
      executionMode: 'normal-docker',
      authorityKind: 'accepted-result',
      projectRoot,
      taskId,
      custodyStore: store,
      policy,
      expectedIdentity,
      admission,
      acceptedResultRef: createExactAcceptedTaskResultRefV2(acceptedArtifact.receipt),
      expectedAcceptedResultChainDigest: acceptedChain.receiptDigest,
    });
    if (
      acceptedAuthority.state !== 'accepted-result'
      || settlement.resultDigest !== acceptedAuthority.resultDigest
      || !Buffer.from(canonicalTaskAttemptCustodyJson(
        settlement.result,
        policy.jsonBounds,
      )).equals(Buffer.from(canonicalTaskAttemptCustodyJson(
        acceptedAuthority.result,
        policy.jsonBounds,
      )))
    ) return exactTaskResultSettlementHold(taskId, 'spoofed-settlement');

    let evaluationArtifact: ExactTaskResultHostArtifactAuthorityV2 | null;
    try {
      evaluationArtifact = readExactHostArtifactAuthority({
        store,
        policy,
        identity: expectedIdentity,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass: 'evaluation-receipt',
        artifactKey: evaluationChain.artifactKey,
        artifactReceiptDigest: evaluationChain.artifactReceiptDigest,
        chainDigest: evaluationChain.receiptDigest,
      });
    } catch {
      return exactTaskResultSettlementHold(taskId, 'evaluation-authority-invalid');
    }
    if (!evaluationArtifact) {
      return exactTaskResultSettlementHold(taskId, 'evaluation-authority-invalid');
    }
    let finalizerArtifact: ExactTaskResultHostArtifactAuthorityV2 | null;
    try {
      finalizerArtifact = readExactHostArtifactAuthority({
        store,
        policy,
        identity: expectedIdentity,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass: 'finalizer-receipt',
        artifactKey: finalizerChain.artifactKey,
        artifactReceiptDigest: finalizerChain.artifactReceiptDigest,
        chainDigest: finalizerChain.receiptDigest,
      });
    } catch {
      return exactTaskResultSettlementHold(taskId, 'finalizer-authority-invalid');
    }
    if (!finalizerArtifact) {
      return exactTaskResultSettlementHold(taskId, 'finalizer-authority-invalid');
    }

    return Object.freeze({
      state: 'accepted',
      executionMode: 'normal-docker',
      identity: Object.freeze({ ...expectedIdentity }),
      admissionReceiptDigest: admission.receiptDigest,
      settlementRef,
      settlementDigest,
      result: settlement.result,
      settlement,
      evaluationArtifact,
      finalizerArtifact,
    });
  } catch (error) {
    if (error instanceof TaskAttemptCustodyHold) {
      return exactTaskResultSettlementHold(taskId, custodyHoldReason(error));
    }
    return exactTaskResultSettlementHold(taskId, 'invalid-input');
  }
}

/**
 * One result-consumer boundary for exact normal Docker truth and explicit
 * historical non-Docker compatibility. Normal Docker never opens `.tasks`.
 */
export function inspectExactTaskResultSettlementAuthority(
  input: InspectExactTaskResultSettlementAuthorityInput,
): ExactTaskResultSettlementInspection {
  if (!plainRecord(input)) {
    return exactTaskResultSettlementHold('unknown', 'invalid-input');
  }
  const taskId = typeof input.taskId === 'string' ? input.taskId : 'unknown';
  if (
    typeof input.projectRoot !== 'string'
    || input.projectRoot.trim().length === 0
    || taskId === 'unknown'
  ) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  try {
    validateTaskId(taskId);
  } catch {
    return exactTaskResultSettlementHold(taskId, 'invalid-input');
  }
  try {
    if (input.executionMode === 'normal-docker') {
      if (input.authorityKind === 'not-dispatched') {
        return inspectExactNotDispatched(input, taskId);
      }
      if (input.authorityKind === 'attempt-settlement') {
        return inspectExactAttemptSettlement(input, taskId);
      }
      return exactTaskResultSettlementHold(taskId, 'invalid-input');
    }
  } catch (error) {
    return exactTaskResultSettlementHold(
      taskId,
      error instanceof TaskAttemptCustodyHold ? custodyHoldReason(error) : 'invalid-input',
    );
  }
  if (
    input.executionMode !== 'legacy-non-docker'
    || !exactOwnKeys(input, ['executionMode', 'projectRoot', 'taskId'])
  ) return exactTaskResultSettlementHold(taskId, 'invalid-input');
  const rawResultPath = join(input.projectRoot, TASKS_DIR, `task-${taskId}.result`);
  let result: unknown | null = null;
  try {
    result = JSON.parse(readFileSync(rawResultPath, 'utf8')) as unknown;
  } catch {
    result = null;
  }
  return Object.freeze({
    state: 'legacy',
    executionMode: 'legacy-non-docker',
    result,
    rawResultPath,
  });
}

function evaluateProbe(snapshot: TaskSettlementProbeSnapshot): {
  readonly eligible: boolean;
  readonly reasonCode: TaskSettlementAuthorityReasonCode;
  readonly evidenceRefs: readonly string[];
} {
  if (!validTimestamp(snapshot.observedAt) || snapshot.observations.length > MAX_EVIDENCE_REFS) {
    return { eligible: false, reasonCode: 'absence-evidence-incomplete', evidenceRefs: [] };
  }
  const byKind = new Map<TaskSettlementEvidenceKind, TaskSettlementEvidenceObservation>();
  for (const observation of snapshot.observations) {
    if (byKind.has(observation.kind) || !observation.evidenceRef.trim()) {
      return { eligible: false, reasonCode: 'absence-evidence-incomplete', evidenceRefs: [] };
    }
    byKind.set(observation.kind, observation);
  }
  const required = REQUIRED_ABSENCE_KINDS.map(kind => byKind.get(kind));
  if (required.some(observation => !observation)) {
    return { eligible: false, reasonCode: 'absence-evidence-incomplete', evidenceRefs: [] };
  }
  const refs = boundedEvidenceRefs(required.map(observation => observation!.evidenceRef));
  if (!refs) {
    return { eligible: false, reasonCode: 'absence-evidence-incomplete', evidenceRefs: [] };
  }
  if (required.some(observation => observation!.state === 'present')) {
    return { eligible: false, reasonCode: 'active-execution-evidence', evidenceRefs: refs };
  }
  if (required.some(observation => observation!.state === 'unsupported')) {
    return { eligible: false, reasonCode: 'probe-unsupported', evidenceRefs: refs };
  }
  if (required.some(observation => observation!.state !== 'absent')) {
    return { eligible: false, reasonCode: 'absence-evidence-incomplete', evidenceRefs: refs };
  }
  return { eligible: true, reasonCode: 'receipt-dispatch-rejected', evidenceRefs: refs };
}

class TaskSettlementAuthorityService implements TaskSettlementAuthority {
  private readonly ledger: InvocationReceiptReconciliationLedger;
  private readonly probe: TaskSettlementEvidenceProbe;
  private readonly taskSnapshotVerifier?: TaskSettlementSnapshotVerifier;
  private readonly projectRoot?: string;
  private readonly runtimeLivenessProbe?: TaskSettlementExternalProbe;
  private readonly now: () => string;

  constructor(options: TaskSettlementAuthorityAssemblyOptions) {
    this.ledger = options.ledger;
    this.probe = options.probe;
    this.taskSnapshotVerifier = options.taskSnapshotVerifier;
    this.projectRoot = options.projectRoot;
    this.runtimeLivenessProbe = options.runtimeLivenessProbe;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  declareTaskExecution(input: DeclareTaskExecutionInput): TaskExecutionDeclaration {
    this.assertScope(input);
    validateTaskId(input.taskId);
    const createdAt = input.createdAt ?? this.now();
    if (!validTimestamp(createdAt)) throw new TypeError('TASK_SETTLEMENT_INVALID_TIMESTAMP');
    const callId = input.callId ?? `worker-execution:${input.runId}:${input.taskId}`;
    const logicalExecutionDigest = sha256(JSON.stringify({
      domain: 'deckent.worker-execution.v1',
      tenantId: input.tenantId,
      projectId: input.projectId,
      runId: input.runId,
      taskId: input.taskId,
      callId,
    }));
    const invocationId = input.invocationId ?? `worker-execution:${logicalExecutionDigest}`;
    if (!invocationId.trim() || !callId.trim()) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_IDENTITY');
    }
    const receipt: InvocationReceipt = {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      invocationId,
      idempotencyKey: input.idempotencyKey ?? `worker-execution:${logicalExecutionDigest}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      runId: input.runId,
      taskId: input.taskId,
      callId,
      role: 'worker',
      purpose: 'worker-execution',
      configured: { provider: input.provider, model: input.model, source: 'config', reasonCode: 'none' },
      requested: { provider: input.provider, model: input.model, source: 'directive', reasonCode: 'none' },
      resolved: { provider: input.provider, model: input.model, source: 'router', reasonCode: 'none' },
      called: { provider: null, model: null, source: 'none', reasonCode: 'none' },
      backend: {
        transport: input.transport ?? 'cli',
        executionBackend: input.executionBackend,
      },
      auth: {
        mode: input.authMode ?? 'unknown',
        accountRefHash: input.accountRefHash ?? null,
      },
      fallbackChain: [],
      reachability: { state: 'unknown', evidenceRef: null },
      limits: { state: 'unknown', evidenceRefs: [] },
      createdAt,
    };
    const declaration = this.ledger.declareTaskReceiptAtomic(receipt);
    const persisted = this.ledger.get(declaration.ref, declaration.ref.invocationId);
    if (!persisted) throw new TypeError('TASK_SETTLEMENT_RECEIPT_NOT_FOUND');
    return {
      receiptRef: declaration.ref,
      receipt: persisted.receipt,
      created: declaration.created,
    };
  }

  markDispatchStarted(input: MarkTaskDispatchStartedInput): InvocationReceiptRef {
    this.assertScope(input);
    if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_ATTEMPT');
    }
    const view = this.requireView(input, input.invocationId);
    const ref = receiptRef(view);
    this.ledger.writeAtomic({
      receipt: view.receipt,
      events: [{
        eventId: eventId('dispatch-started', [
          input.invocationId,
          String(input.attempt),
          input.executionEvidenceRef,
        ]),
        type: 'dispatch_started',
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        payload: {
          attempt: input.attempt,
          executionEvidenceRef: input.executionEvidenceRef,
          calledProvider: input.calledProvider,
          calledModel: input.calledModel,
        },
      }],
    });
    return ref;
  }

  settleDispatched(input: SettleDispatchedTaskInput): TaskSettlementInspection {
    this.assertScope(input);
    const expectedConsumerOutcome = input.taskDisposition === 'done'
      ? 'accepted'
      : input.taskDisposition === 'no_go'
        ? 'rejected'
        : 'unknown';
    if (input.consumerOutcome !== expectedConsumerOutcome) {
      throw new TypeError('TASK_SETTLEMENT_DISPOSITION_OUTCOME_MISMATCH');
    }
    const evidenceRefs = boundedEvidenceRefs(input.evidenceRefs ?? [
      `invocation:${input.invocationId}:transport`,
    ]);
    if (!evidenceRefs) throw new TypeError('TASK_SETTLEMENT_INVALID_EVIDENCE');
    if (
      !Number.isSafeInteger(input.durationMs)
      || input.durationMs < 0
      || (input.occurredAt !== undefined && !validTimestamp(input.occurredAt))
    ) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_TERMINAL_INPUT');
    }
    if (
      (input.taskDisposition === 'done'
        && (input.outcome !== 'succeeded' || input.reasonCode !== 'none'))
      || (input.taskDisposition === 'no_go'
        && (input.outcome === 'unknown' || input.reasonCode === 'none'))
      || (input.taskDisposition === 'manual_review_required'
        && (input.outcome !== 'unknown' || input.reasonCode === 'none'))
    ) {
      throw new TypeError('TASK_SETTLEMENT_DISPOSITION_OUTCOME_MISMATCH');
    }
    const view = this.requireView(input, input.invocationId);
    const head = view.events.at(-1);
    if (head?.type === 'consumer_settled') {
      if (this.matchesDispatchedSettlement(view, input, evidenceRefs)) {
        return this.inspectionFromView(view, 'PENDING', evidenceRefs);
      }
      throw new TypeError('TASK_SETTLEMENT_TERMINAL_CONFLICT');
    }
    if (head?.type !== 'dispatch_started' && head?.type !== 'transport_settled') {
      throw new TypeError('TASK_SETTLEMENT_DISPATCH_NOT_STARTED');
    }
    const occurredAt = input.occurredAt ?? this.now();
    const transportEvent: InvocationEvent = {
      eventId: eventId('transport-settled', [
        input.invocationId,
        input.outcome,
        input.reasonCode,
        ...evidenceRefs,
      ]),
      type: 'transport_settled',
      occurredAt,
      payload: {
        outcome: input.outcome,
        exitCode: input.exitCode,
        signal: input.signal,
        reasonCode: input.reasonCode,
        durationMs: input.durationMs,
      },
    };
    if (
      head.type === 'transport_settled'
      && !this.matchesTransportSettlement(head, input)
    ) {
      throw new TypeError('TASK_SETTLEMENT_TERMINAL_CONFLICT');
    }
    const consumerOccurredAt = head.type === 'transport_settled'
      ? head.occurredAt
      : occurredAt;
    if (input.occurredAt !== undefined && consumerOccurredAt !== input.occurredAt) {
      throw new TypeError('TASK_SETTLEMENT_TIMESTAMP_CONFLICT');
    }
    const consumerEvent: InvocationEvent = {
      eventId: eventId('consumer-settled', [
        input.invocationId,
        input.consumerOutcome,
        input.reasonCode,
        ...evidenceRefs,
      ]),
      type: 'consumer_settled',
      occurredAt: consumerOccurredAt,
      payload: {
        outcome: input.consumerOutcome,
        reasonCode: input.reasonCode,
        taskDisposition: input.taskDisposition,
        evidenceRefs,
      },
    };
    const events: readonly InvocationEvent[] = head.type === 'transport_settled'
      ? [consumerEvent]
      : [transportEvent, consumerEvent];
    const expectedHead = input.requireDispatchHeadHash;
    const result = this.ledger.writeAtomic({
      receipt: view.receipt,
      events,
      ...(expectedHead
        ? {
            requireSynchronousPrecondition: (): boolean => {
              const fresh = this.ledger.get(input, input.invocationId);
              return fresh?.events.at(-1)?.hash === expectedHead;
            },
          }
        : {}),
    });
    return this.inspectionFromView(result.view, 'PENDING', evidenceRefs);
  }

  async inspectTaskSettlement(input: InspectTaskSettlementInput): Promise<TaskSettlementInspection> {
    this.assertScope(input);
    validateTaskId(input.taskId);
    if (!this.taskContentMatches(input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch');
    }
    if (
      input.receiptRef
      && (
        input.receiptRef.schemaVersion !== INVOCATION_RECEIPT_SCHEMA_VERSION
        || input.receiptRef.tenantId !== input.tenantId
        || input.receiptRef.projectId !== input.projectId
      )
    ) return this.hold(input.rawStatus, 'scope-mismatch');
    const views = this.resolveViews(input);
    if (input.receiptRef && views.length === 0) {
      return this.hold(input.rawStatus, 'receipt-missing');
    }
    if (views.length > 1) return this.hold(input.rawStatus, 'receipt-ambiguous');
    if (views.some(view => !this.viewMatchesSettlementInput(view, input))) {
      return this.hold(input.rawStatus, 'scope-mismatch');
    }
    const settled = views.filter(settledNotDispatched);
    if (settled.length === 1) {
      return {
        decision: 'already-settled',
        rawStatus: input.rawStatus,
        effectiveStatus: 'NOT_DISPATCHED',
        evidenceRefs: this.viewEvidenceRefs(settled[0]!),
        reasonCode: 'already-settled',
        receiptRef: receiptRef(settled[0]!),
      };
    }
    if (views.some(view => view.events.some(event => event.type === 'dispatch_started'))) {
      return this.hold(input.rawStatus, 'dispatch-started');
    }
    if (views.some(view => view.events.some(event => event.type === 'transport_settled'))) {
      return this.hold(input.rawStatus, 'terminal-conflict');
    }
    const rejected = views.filter(dispatchRejected);
    if (rejected.length > 1 || views.length > 1) {
      return this.hold(input.rawStatus, 'receipt-ambiguous');
    }
    const probe = evaluateProbe(await this.probe.inspect(input));
    if (!probe.eligible) {
      return this.hold(input.rawStatus, probe.reasonCode, probe.evidenceRefs);
    }
    if (rejected.length === 1) {
      const evidenceRefs = boundedEvidenceRefs([
        ...probe.evidenceRefs,
        `invocation-event:${rejected[0]!.events.at(-1)!.hash}`,
      ]);
      if (!evidenceRefs) {
        return this.hold(input.rawStatus, 'absence-evidence-incomplete');
      }
      return {
        decision: 'eligible',
        rawStatus: input.rawStatus,
        effectiveStatus: canonicalRawStatus(input.rawStatus),
        evidenceRefs,
        reasonCode: 'receipt-dispatch-rejected',
        receiptRef: receiptRef(rejected[0]!),
      };
    }
    if (views.length === 1 && views[0]!.events.length === 0) {
      if (!input.reasonCode || input.reasonCode === 'legacy_operator_attestation') {
        return this.hold(
          input.rawStatus,
          'pre-dispatch-reason-required',
          probe.evidenceRefs,
        );
      }
      return {
        decision: 'eligible',
        rawStatus: input.rawStatus,
        effectiveStatus: canonicalRawStatus(input.rawStatus),
        evidenceRefs: probe.evidenceRefs,
        reasonCode: 'receipt-ready-for-rejection',
        receiptRef: receiptRef(views[0]!),
      };
    }
    if (!input.operatorAttestation) {
      return this.hold(input.rawStatus, 'attestation-required', probe.evidenceRefs);
    }
    if (!this.validAttestation(input.operatorAttestation, input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch', probe.evidenceRefs);
    }
    const attestedEvidence = boundedEvidenceRefs(input.operatorAttestation.evidenceRefs);
    if (
      !attestedEvidence
      || JSON.stringify(attestedEvidence) !== JSON.stringify(probe.evidenceRefs)
    ) {
      return this.hold(
        input.rawStatus,
        'attestation-evidence-mismatch',
        probe.evidenceRefs,
      );
    }
    return {
      decision: 'eligible',
      rawStatus: input.rawStatus,
      effectiveStatus: canonicalRawStatus(input.rawStatus),
      evidenceRefs: probe.evidenceRefs,
      reasonCode: 'legacy-attestation-verified',
    };
  }

  plan(input: InspectTaskSettlementInput): Promise<TaskSettlementInspection> {
    return this.inspectTaskSettlement(input);
  }

  /**
   * Terminalize a dispatch that started and then died without a result.
   *
   * The disposition is NOT chosen by the caller: it is derived from the same absence
   * probe `settleNotDispatched` uses. Only when every required liveness signal is
   * provably absent does this settle, and it settles as `manual_review_required` —
   * never `done` or `no_go`, because an abandoned dispatch produced no verdict to
   * report. If any liveness evidence remains, it returns a typed hold instead: an
   * append-only ledger cannot be corrected later, so a false cause must never be written.
   */
  async settleAbandonedDispatch(
    input: SettleAbandonedDispatchInput,
  ): Promise<TaskSettlementInspection> {
    if (input.occurredAt !== undefined && !validTimestamp(input.occurredAt)) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_TIMESTAMP');
    }
    if (!this.projectRoot) return this.hold(input.rawStatus, 'probe-unsupported');
    const views = this.resolveViews(input);
    if (views.length === 0) return this.hold(input.rawStatus, 'receipt-missing');
    if (views.length > 1) return this.hold(input.rawStatus, 'receipt-ambiguous');
    const view = views[0]!;
    if (!this.viewMatchesSettlementInput(view, input)) {
      return this.hold(input.rawStatus, 'scope-mismatch');
    }
    const head = view.events.at(-1);
    // Idempotent replay: an already-reconciled receipt returns its terminal inspection
    // instead of attempting a second append.
    if (head?.type === 'consumer_settled') {
      return this.inspectionFromView(view, input.rawStatus, this.viewEvidenceRefs(view));
    }
    if (head?.type !== 'dispatch_started') {
      return this.hold(input.rawStatus, 'terminal-conflict');
    }

    // ONE recovery evidence snapshot; dry-run and apply bind to exactly this.
    const snapshot = await this.probe.inspect(input);
    const byKind = new Map<TaskSettlementEvidenceKind, TaskSettlementEvidenceObservation>();
    for (const observation of snapshot.observations) byKind.set(observation.kind, observation);
    const ordinary = ['heartbeat', 'log', 'result', 'worker-process'] as const;
    const ordinaryObservations = ordinary.map(kind => byKind.get(kind));
    if (ordinaryObservations.some(observation => !observation)) {
      return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    }
    // Control-plane attempt authority. A pending/prepared/dispatched record attests that
    // THIS exact dispatch attempt was minted — it is self-referential evidence about the
    // very receipt being reconciled, never proof that a process is running. 'corrupt'
    // is not interpretable and holds.
    const controlAttempt = inspectTaskResultSettlementAuthority(this.projectRoot, input.taskId);
    if (controlAttempt.state === 'corrupt') {
      return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    }
    // Real backend RUNTIME liveness, asked independently and required to be absent.
    const runtime = this.runtimeLivenessProbe
      ? await this.runtimeLivenessProbe.inspect(input)
      : await inspectAbandonedDispatchRuntimeLiveness(this.projectRoot, input);
    const evidenceRefs = boundedEvidenceRefs([
      ...ordinaryObservations.map(observation => observation!.evidenceRef),
      `control-attempt:${controlAttempt.state}:${sha256(controlAttempt.evidenceRef)}`,
      `backend-runtime:${runtime.state}:${sha256(runtime.evidenceRef)}`,
      `invocation-event:${head.hash}`,
    ]);
    if (!evidenceRefs) return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    if (ordinaryObservations.some(observation => observation!.state === 'present')
      || runtime.state === 'present') {
      return this.hold(input.rawStatus, 'dispatch-still-live', evidenceRefs);
    }
    if (runtime.state === 'unsupported'
      || ordinaryObservations.some(observation => observation!.state === 'unsupported')) {
      return this.hold(input.rawStatus, 'probe-unsupported', evidenceRefs);
    }
    if (runtime.state !== 'absent'
      || ordinaryObservations.some(observation => observation!.state !== 'absent')) {
      return this.hold(input.rawStatus, 'absence-evidence-incomplete', evidenceRefs);
    }
    if (!input.operatorAttestation) {
      return this.hold(input.rawStatus, 'attestation-required', evidenceRefs);
    }
    if (!this.validAttestation(input.operatorAttestation, input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch', evidenceRefs);
    }
    const eligible: TaskSettlementInspection = {
      decision: 'eligible',
      rawStatus: input.rawStatus,
      effectiveStatus: canonicalRawStatus(input.rawStatus),
      evidenceRefs,
      reasonCode: 'dispatch-abandoned',
      receiptRef: receiptRef(view),
    };
    if (input.apply !== true) return eligible;
    if (!this.verifyCurrentTaskSnapshot(input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch', evidenceRefs);
    }
    return this.settleDispatched({
      tenantId: input.tenantId,
      projectId: input.projectId,
      invocationId: view.receipt.invocationId,
      outcome: 'unknown',
      exitCode: null,
      signal: null,
      reasonCode: 'abandoned_dispatch_reconciled',
      durationMs: Math.max(0, Date.parse(snapshot.observedAt) - Date.parse(head.occurredAt)),
      consumerOutcome: 'unknown',
      taskDisposition: 'manual_review_required',
      evidenceRefs,
      requireDispatchHeadHash: head.hash,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    });
  }

  /**
   * Terminalize a dispatch whose worker DID finish and persist a result, but whose caller
   * stopped waiting (the CLI timeout window closed first). The receipt is then stuck on a
   * dispatch_started head with a real `.result` on disk.
   *
   * This is deliberately NOT the abandoned path: abandonment asserts "no verdict exists",
   * while here a verdict exists and must be reported as authored. The disposition is read
   * from the worker's own selfAssessment using the same rule the live run path applies —
   * it is never chosen by the operator.
   */
  async settleDispatchedFromResult(
    input: SettleAbandonedDispatchInput,
  ): Promise<TaskSettlementInspection> {
    if (!this.projectRoot) return this.hold(input.rawStatus, 'probe-unsupported');
    // Historical public-result recovery is an explicit non-Docker compatibility
    // boundary. Normal Docker must enter through exact attempt custody V2 above;
    // a worker-writable `.tasks/*.result` can never be promoted here.
    if (
      input.executionBackend !== 'host-subprocess'
      && input.executionBackend !== 'tmux'
    ) {
      return this.hold(input.rawStatus, 'unsupported-task-domain');
    }
    const views = this.resolveViews(input);
    if (views.length === 0) return this.hold(input.rawStatus, 'receipt-missing');
    if (views.length > 1) return this.hold(input.rawStatus, 'receipt-ambiguous');
    const view = views[0]!;
    if (!this.viewMatchesSettlementInput(view, input)) {
      return this.hold(input.rawStatus, 'scope-mismatch');
    }
    const head = view.events.at(-1);
    if (head?.type === 'consumer_settled') {
      return this.inspectionFromView(view, input.rawStatus, this.viewEvidenceRefs(view));
    }
    if (head?.type !== 'dispatch_started') {
      return this.hold(input.rawStatus, 'terminal-conflict');
    }
    let selfAssessment: string;
    let resultBytes: string;
    try {
      resultBytes = readFileSync(
        join(this.projectRoot, TASKS_DIR, `task-${input.taskId}.result`),
        'utf-8',
      );
      const parsed = JSON.parse(resultBytes) as { selfAssessment?: unknown };
      if (typeof parsed.selfAssessment !== 'string') {
        return this.hold(input.rawStatus, 'absence-evidence-incomplete');
      }
      selfAssessment = parsed.selfAssessment;
    } catch {
      // No parsable result: this receipt is not the shape this path settles.
      return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    }
    const accepted = selfAssessment === 'DONE' || selfAssessment === 'GO_WITH_TECH_DEBT';
    const evidenceRefs = boundedEvidenceRefs([
      `task-artifact:result:present:${sha256(resultBytes)}`,
      `worker-self-assessment:${selfAssessment}`,
      `invocation-event:${head.hash}`,
    ]);
    if (!evidenceRefs) return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    if (!input.operatorAttestation) {
      return this.hold(input.rawStatus, 'attestation-required', evidenceRefs);
    }
    if (!this.validAttestation(input.operatorAttestation, input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch', evidenceRefs);
    }
    const eligible: TaskSettlementInspection = {
      decision: 'eligible',
      rawStatus: input.rawStatus,
      effectiveStatus: canonicalRawStatus(input.rawStatus),
      evidenceRefs,
      reasonCode: 'dispatch-abandoned',
      receiptRef: receiptRef(view),
    };
    if (input.apply !== true) return eligible;
    if (!this.verifyCurrentTaskSnapshot(input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch', evidenceRefs);
    }
    return this.settleDispatched({
      tenantId: input.tenantId,
      projectId: input.projectId,
      invocationId: view.receipt.invocationId,
      outcome: 'succeeded',
      exitCode: null,
      signal: null,
      reasonCode: accepted ? 'none' : 'validation_failed',
      durationMs: 0,
      consumerOutcome: accepted ? 'accepted' : 'rejected',
      taskDisposition: accepted ? 'done' : 'no_go',
      evidenceRefs,
      requireDispatchHeadHash: head.hash,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    });
  }

  /**
   * Re-project a task file's `status` from its own TERMINAL invocation receipt.
   *
   * The receipt is the authority; this writes nothing new, it only makes the task
   * surface agree with a settlement that already happened. It exists because a run
   * whose caller stopped waiting leaves the receipt terminal while the task JSON is
   * still PENDING — a disagreement the clean gate reports as WORKER_TASK_CONFLICT,
   * with no surface able to resolve it.
   *
   * Only a terminal disposition that HAS a task-status counterpart is projected.
   * `not_dispatched` has none (the task never ran) and holds instead of inventing one.
   */
  async reprojectTaskStatusFromReceipt(
    input: SettleAbandonedDispatchInput,
  ): Promise<TaskSettlementInspection> {
    if (!this.projectRoot) return this.hold(input.rawStatus, 'probe-unsupported');
    const views = this.resolveViews(input);
    if (views.length === 0) return this.hold(input.rawStatus, 'receipt-missing');
    if (views.length > 1) return this.hold(input.rawStatus, 'receipt-ambiguous');
    const view = views[0]!;
    if (!this.viewMatchesSettlementInput(view, input)) {
      return this.hold(input.rawStatus, 'scope-mismatch');
    }
    const head = view.events.at(-1);
    if (head?.type !== 'consumer_settled') {
      // Nothing settled yet — there is no authority to project from.
      return this.hold(input.rawStatus, 'dispatch-started');
    }
    // head.type is narrowed to 'consumer_settled' above; the payload union still needs
    // the explicit extract for TypeScript to see taskDisposition.
    const settledPayload = head.payload as Extract<
      InvocationEvent,
      { type: 'consumer_settled' }
    >['payload'];
    const disposition = String(settledPayload.taskDisposition);
    const projected = disposition === 'done'
      ? 'DONE'
      : disposition === 'no_go'
        ? 'NO_GO'
        : disposition === 'manual_review_required'
          ? 'MANUAL_REVIEW_REQUIRED'
          : null;
    if (!projected) return this.hold(input.rawStatus, 'terminal-conflict');
    const taskPath = join(this.projectRoot, TASKS_DIR, `task-${input.taskId}.json`);
    let parsed: Record<string, unknown>;
    let bytes: string;
    try {
      bytes = readFileSync(taskPath, 'utf-8');
      parsed = JSON.parse(bytes) as Record<string, unknown>;
    } catch {
      return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    }
    const evidenceRefs = boundedEvidenceRefs([
      `invocation-event:${head.hash}`,
      `task-disposition:${disposition}`,
      `task-artifact:json:present:${sha256(bytes)}`,
    ]);
    if (!evidenceRefs) return this.hold(input.rawStatus, 'absence-evidence-incomplete');
    // Idempotent: an already-agreeing task surface is a no-op, not a rewrite.
    if (parsed['status'] === projected) {
      return {
        decision: 'already-settled',
        rawStatus: input.rawStatus,
        effectiveStatus: projected,
        evidenceRefs,
        reasonCode: 'already-settled',
        receiptRef: receiptRef(view),
      };
    }
    if (!input.operatorAttestation) {
      return this.hold(input.rawStatus, 'attestation-required', evidenceRefs);
    }
    if (!this.validAttestation(input.operatorAttestation, input)) {
      return this.hold(input.rawStatus, 'task-content-mismatch', evidenceRefs);
    }
    const eligible: TaskSettlementInspection = {
      decision: 'eligible',
      rawStatus: input.rawStatus,
      effectiveStatus: projected,
      evidenceRefs,
      reasonCode: 'dispatch-abandoned',
      receiptRef: receiptRef(view),
    };
    if (input.apply !== true) return eligible;
    parsed['status'] = projected;
    writeFileSync(taskPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
    return {
      decision: 'already-settled',
      rawStatus: input.rawStatus,
      effectiveStatus: projected,
      evidenceRefs,
      reasonCode: 'already-settled',
      receiptRef: receiptRef(view),
    };
  }

  async settleNotDispatched(input: SettleNotDispatchedInput): Promise<TaskSettlementInspection> {
    if (input.occurredAt !== undefined && !validTimestamp(input.occurredAt)) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_TIMESTAMP');
    }
    const authorityEvidenceRefs = input.authorityEvidenceRefs === undefined
      ? Object.freeze([] as string[])
      : boundedEvidenceRefs(input.authorityEvidenceRefs);
    if (!authorityEvidenceRefs) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_EVIDENCE');
    }
    const inspection = await this.inspectTaskSettlement(input);
    if (inspection.decision !== 'eligible' || input.apply !== true) {
      if (
        inspection.decision === 'already-settled'
        && authorityEvidenceRefs.some(ref => !inspection.evidenceRefs.includes(ref))
      ) {
        throw new TypeError('TASK_SETTLEMENT_EVIDENCE_CONFLICT');
      }
      return inspection;
    }
    const settlementEvidenceRefs = boundedEvidenceRefs([
      ...inspection.evidenceRefs,
      ...authorityEvidenceRefs,
    ]);
    if (!settlementEvidenceRefs) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_EVIDENCE');
    }
    if (!this.verifyCurrentTaskSnapshot(input)) {
      return this.hold(
        input.rawStatus,
        'task-content-mismatch',
        settlementEvidenceRefs,
      );
    }
    try {
      if (inspection.receiptRef) {
        const view = this.requireView(inspection.receiptRef, inspection.receiptRef.invocationId);
        const rejection = view.events.at(-1);
        if (view.events.length === 0) {
          if (!input.reasonCode || input.reasonCode === 'legacy_operator_attestation') {
            return this.hold(
              input.rawStatus,
              'pre-dispatch-reason-required',
              settlementEvidenceRefs,
            );
          }
          const occurredAt = input.occurredAt ?? this.now();
          if (!validTimestamp(occurredAt)) {
            throw new TypeError('TASK_SETTLEMENT_INVALID_TIMESTAMP');
          }
          const rejectedEvent: InvocationEvent = {
            eventId: eventId('dispatch-rejected', [
              view.receipt.invocationId,
              input.reasonCode,
              ...settlementEvidenceRefs,
            ]),
            type: 'dispatch_rejected',
            occurredAt,
            payload: {
              reasonCode: input.reasonCode,
              evidenceRefs: settlementEvidenceRefs,
            },
          };
          const result = this.ledger.writeAtomic({
            receipt: view.receipt,
            requireSynchronousPrecondition: () => this.verifyCurrentTaskSnapshot(input),
            events: [
              rejectedEvent,
              this.notDispatchedConsumerEvent(
                view.receipt,
                rejectedEvent.eventId,
                settlementEvidenceRefs,
                input.reasonCode,
                occurredAt,
              ),
            ],
          });
          return this.inspectionFromView(
            result.view,
            input.rawStatus,
            this.viewEvidenceRefs(result.view),
          );
        }
        if (!rejection || rejection.type !== 'dispatch_rejected') {
          return this.hold(input.rawStatus, 'receipt-ambiguous', settlementEvidenceRefs);
        }
        const rejectionPayload = rejection.payload as Extract<
          InvocationEvent,
          { type: 'dispatch_rejected' }
        >['payload'];
        if (
          input.reasonCode !== undefined
          && input.reasonCode !== rejectionPayload.reasonCode
        ) {
          throw new TypeError('TASK_SETTLEMENT_REASON_CONFLICT');
        }
        if (input.occurredAt !== undefined && input.occurredAt !== rejection.occurredAt) {
          throw new TypeError('TASK_SETTLEMENT_TIMESTAMP_CONFLICT');
        }
        const rejectionEvidence = boundedEvidenceRefs(rejectionPayload.evidenceRefs ?? []);
        if (!rejectionEvidence) {
          return this.hold(
            input.rawStatus,
            'absence-evidence-incomplete',
            settlementEvidenceRefs,
          );
        }
        if (
          authorityEvidenceRefs.some(ref => !rejectionEvidence.includes(ref))
        ) {
          throw new TypeError('TASK_SETTLEMENT_EVIDENCE_CONFLICT');
        }
        const result = this.ledger.writeAtomic({
          receipt: view.receipt,
          requireSynchronousPrecondition: () => this.verifyCurrentTaskSnapshot(input),
          events: [this.notDispatchedConsumerEvent(
            view.receipt,
            rejection.hash,
            rejectionEvidence,
            rejectionPayload.reasonCode,
            rejection.occurredAt,
          )],
        });
        return this.inspectionFromView(
          result.view,
          input.rawStatus,
          this.viewEvidenceRefs(result.view),
        );
      }
      return this.settleLegacy(input, inspection);
    } catch (error) {
      if (
        error instanceof InvocationReceiptStoreError
        && error.code === 'RECONCILIATION_CONFLICT'
      ) {
        if (!this.verifyCurrentTaskSnapshot(input)) {
          return this.hold(
            input.rawStatus,
            'task-content-mismatch',
            settlementEvidenceRefs,
          );
        }
        return this.inspectTaskSettlement(input);
      }
      throw error;
    }
  }

  projectTaskExecutionState(
    taskId: string,
    rawStatus: string,
    scope: InvocationScope = { tenantId: 'local', projectId: this.ledger.projectId },
  ): TaskSettlementProjection {
    validateTaskId(taskId);
    const views = this.ledger.scanTaskReceipts({
      ...scope,
      taskId,
      purpose: 'worker-execution',
      limit: 32,
    });
    return this.projectTaskExecutionViews(rawStatus, views);
  }

  projectTaskExecutionStates(
    inputs: readonly TaskSettlementProjectionInput[],
  ): readonly TaskSettlementProjection[] {
    const requests = normalizeProjectionInputs(inputs);
    const viewsByTenantAndTask = new Map<
      string,
      Map<string, readonly InvocationReceiptView[]>
    >();
    const groups = this.ledger.scanProjectTaskReceiptsBulk({
      projectId: this.ledger.projectId,
      requests: requests.map(request => ({
        tenantId: request.tenantId,
        taskId: request.taskId,
      })),
      purpose: 'worker-execution',
    });
    for (const group of groups) {
      const byTask = viewsByTenantAndTask.get(group.tenantId);
      if (byTask) {
        byTask.set(group.taskId, group.receipts);
      } else {
        viewsByTenantAndTask.set(
          group.tenantId,
          new Map([[group.taskId, group.receipts]]),
        );
      }
    }
    return Object.freeze(requests.map(request => this.projectTaskExecutionViews(
      request.rawStatus,
      viewsByTenantAndTask.get(request.tenantId)?.get(request.taskId) ?? Object.freeze([]),
    )));
  }

  private projectTaskExecutionViews(
    rawStatus: string,
    views: readonly InvocationReceiptView[],
  ): TaskSettlementProjection {
    const settled = views
      .map(view => ({ view, status: effectiveTaskStatus(view) }))
      .filter((entry): entry is {
        view: InvocationReceiptView;
        status: TaskSettlementEffectiveStatus;
      } => entry.status !== null);
    if (settled.length !== 1 || views.length !== 1) {
      const evidenceRefs = boundedEvidenceRefs(views.map(view => (
        `invocation-receipt:${view.receipt.invocationId}:${
          view.events.at(-1)?.hash ?? 'open'
        }`
      ))) ?? Object.freeze([]);
      return {
        rawStatus,
        effectiveStatus: canonicalRawStatus(rawStatus),
        evidenceRefs,
        ...(views.length === 1 ? { receiptRef: receiptRef(views[0]!) } : {}),
        reasonCode: views.length === 0
          ? 'no-terminal-receipt'
          : views.length > 1
            ? 'ambiguous-receipts'
            : settled.length === 0
              ? 'open-receipt'
              : 'ambiguous-receipts',
      };
    }
    return {
      rawStatus,
      effectiveStatus: settled[0]!.status,
      evidenceRefs: this.viewEvidenceRefs(settled[0]!.view),
      receiptRef: receiptRef(settled[0]!.view),
      reasonCode: 'projected',
    };
  }

  private settleLegacy(
    input: SettleNotDispatchedInput,
    inspection: TaskSettlementInspection,
  ): TaskSettlementInspection {
    const attestation = input.operatorAttestation;
    if (!attestation) return this.hold(input.rawStatus, 'attestation-required');
    const legacyReason = input.reasonCode ?? 'legacy_operator_attestation';
    const taskContentDigest = sha256(input.taskContent);
    const invocationId = eventId('legacy-settlement', [
      input.tenantId,
      input.projectId,
      input.runId,
      input.taskId,
      taskContentDigest,
    ]);
    const receipt: InvocationReceipt = {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      invocationId,
      idempotencyKey: `legacy-not-dispatched:${input.runId}:${input.taskId}:${taskContentDigest}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      runId: input.runId,
      taskId: input.taskId,
      callId: invocationId,
      role: 'worker',
      purpose: 'worker-execution',
      configured: { provider: null, model: null, source: 'none', reasonCode: 'legacy_operator_attestation' },
      requested: { provider: null, model: null, source: 'none', reasonCode: 'legacy_operator_attestation' },
      resolved: { provider: null, model: null, source: 'none', reasonCode: 'legacy_operator_attestation' },
      called: { provider: null, model: null, source: 'none', reasonCode: 'legacy_operator_attestation' },
      backend: { transport: 'local-runtime', executionBackend: 'unknown' },
      auth: { mode: 'unknown', accountRefHash: null },
      fallbackChain: [],
      reachability: { state: 'unknown', evidenceRef: null },
      limits: { state: 'unknown', evidenceRefs: inspection.evidenceRefs },
      createdAt: attestation.attestedAt,
    };
    const rejection: InvocationEvent = {
      eventId: eventId('dispatch-rejected', [invocationId, taskContentDigest]),
      type: 'dispatch_rejected',
      occurredAt: attestation.attestedAt,
      payload: {
        reasonCode: legacyReason,
        evidenceRefs: inspection.evidenceRefs,
        attestation: {
          attestationKind: 'legacy-reconciliation',
          operatorRefHash: sha256(attestation.operatorId),
          attestedAt: attestation.attestedAt,
          reasonCode: legacyReason,
          statementDigest: sha256(attestation.reason),
          taskContentDigest,
          taskCreatedAt: input.taskCreatedAt,
          observedAbsenceEvidenceRefs: inspection.evidenceRefs,
        },
      },
    };
    const result = this.ledger.writeAtomic({
      receipt,
      requireSynchronousPrecondition: () => this.verifyCurrentTaskSnapshot(input),
      requireTaskReceiptAbsence: {
        tenantId: input.tenantId,
        projectId: input.projectId,
        taskId: input.taskId,
        purpose: 'worker-execution',
      },
      events: [
        rejection,
        this.notDispatchedConsumerEvent(
          receipt,
          rejection.eventId,
          inspection.evidenceRefs,
          legacyReason,
          attestation.attestedAt,
        ),
      ],
    });
    return this.inspectionFromView(result.view, input.rawStatus, inspection.evidenceRefs);
  }

  private notDispatchedConsumerEvent(
    receipt: InvocationReceipt,
    rejectionHash: string,
    evidenceRefs: readonly string[],
    reasonCode: InvocationReasonCode,
    occurredAt?: string,
  ): InvocationEvent {
    return {
      eventId: eventId('not-dispatched-settled', [
        receipt.invocationId,
        rejectionHash,
        ...evidenceRefs,
      ]),
      type: 'consumer_settled',
      ...(occurredAt ? { occurredAt } : {}),
      payload: {
        outcome: 'accepted',
        reasonCode: reasonCode === 'none' ? 'not_dispatched_settled' : reasonCode,
        taskDisposition: 'not_dispatched',
        evidenceRefs,
      },
    };
  }

  private resolveViews(input: InspectTaskSettlementInput): readonly InvocationReceiptView[] {
    if (input.receiptRef) {
      if (
        input.receiptRef.tenantId !== input.tenantId
        || input.receiptRef.projectId !== input.projectId
      ) return [];
      const view = this.ledger.get(input, input.receiptRef.invocationId);
      return view ? [view] : [];
    }
    return this.ledger.scanTaskReceipts({
      tenantId: input.tenantId,
      projectId: input.projectId,
      taskId: input.taskId,
      purpose: 'worker-execution',
      limit: 32,
    });
  }

  private viewMatchesSettlementInput(
    view: InvocationReceiptView,
    input: InspectTaskSettlementInput,
  ): boolean {
    return view.receipt.purpose === 'worker-execution'
      && view.receipt.taskId === input.taskId
      && view.receipt.runId === input.runId
      && view.receipt.backend.executionBackend === input.executionBackend;
  }

  private matchesTransportSettlement(
    event: StoredInvocationEvent,
    input: SettleDispatchedTaskInput,
  ): boolean {
    if (
      event.type !== 'transport_settled'
      || !exactOwnKeys(event.payload, [
        'outcome',
        'exitCode',
        'signal',
        'reasonCode',
        'durationMs',
      ])
    ) return false;
    const payload = event.payload as Extract<
      InvocationEvent,
      { type: 'transport_settled' }
    >['payload'];
    return payload.outcome === input.outcome
      && payload.exitCode === input.exitCode
      && payload.signal === input.signal
      && payload.reasonCode === input.reasonCode
      && payload.durationMs === input.durationMs
      && (input.occurredAt === undefined || event.occurredAt === input.occurredAt);
  }

  private matchesDispatchedSettlement(
    view: InvocationReceiptView,
    input: SettleDispatchedTaskInput,
    evidenceRefs: readonly string[],
  ): boolean {
    if (view.events.length !== 3) return false;
    const transport = view.events[1];
    const consumer = view.events[2];
    if (
      !transport
      || !consumer
      || !this.matchesTransportSettlement(transport, input)
      || consumer.type !== 'consumer_settled'
      || !exactOwnKeys(consumer.payload, [
        'outcome',
        'reasonCode',
        'taskDisposition',
        'evidenceRefs',
      ])
    ) return false;
    const payload = consumer.payload as Extract<
      InvocationEvent,
      { type: 'consumer_settled' }
    >['payload'];
    return payload.outcome === input.consumerOutcome
      && payload.reasonCode === input.reasonCode
      && payload.taskDisposition === input.taskDisposition
      && JSON.stringify(payload.evidenceRefs) === JSON.stringify(evidenceRefs)
      && consumer.occurredAt === transport.occurredAt
      && (input.occurredAt === undefined || consumer.occurredAt === input.occurredAt);
  }

  private requireView(scope: InvocationScope, invocationId: string): InvocationReceiptView {
    this.assertScope(scope);
    const view = this.ledger.get(scope, invocationId);
    if (!view) throw new TypeError('TASK_SETTLEMENT_RECEIPT_NOT_FOUND');
    return view;
  }

  private assertScope(scope: InvocationScope): void {
    if (
      !scope.tenantId.trim()
      || !scope.projectId.trim()
      || scope.projectId !== this.ledger.projectId
    ) throw new TypeError('TASK_SETTLEMENT_SCOPE_MISMATCH');
  }

  private validAttestation(
    attestation: TaskSettlementOperatorAttestationInput,
    input: InspectTaskSettlementInput,
  ): boolean {
    return attestation.operatorId.trim().length > 0
      && attestation.reason.trim().length > 0
      && validTimestamp(attestation.attestedAt)
      && validTimestamp(input.taskCreatedAt)
      && boundedEvidenceRefs(attestation.evidenceRefs) !== null
      && SHA256_RE.test(sha256(input.taskContent))
      && this.taskContentMatches(input);
  }

  private taskContentMatches(input: InspectTaskSettlementInput): boolean {
    try {
      const bytes = typeof input.taskContent === 'string'
        ? input.taskContent
        : Buffer.from(input.taskContent).toString('utf8');
      const parsed = JSON.parse(bytes) as {
        id?: unknown;
        status?: unknown;
        createdAt?: unknown;
      };
      return input.rawStatus === 'PENDING'
        && parsed.id === input.taskId
        && parsed.status === input.rawStatus
        && parsed.createdAt === input.taskCreatedAt;
    } catch {
      return false;
    }
  }

  private verifyCurrentTaskSnapshot(input: InspectTaskSettlementInput): boolean {
    if (!this.taskSnapshotVerifier) return false;
    try {
      return this.taskSnapshotVerifier.verify(input) === true;
    } catch {
      return false;
    }
  }

  private hold(
    rawStatus: string,
    reasonCode: TaskSettlementAuthorityReasonCode,
    evidenceRefs: readonly string[] = [],
  ): TaskSettlementInspection {
    const canonicalEvidence = evidenceRefs.length === 0
      ? Object.freeze([] as string[])
      : boundedEvidenceRefs(evidenceRefs) ?? Object.freeze([] as string[]);
    return {
      decision: 'hold',
      rawStatus,
      effectiveStatus: canonicalRawStatus(rawStatus),
      evidenceRefs: canonicalEvidence,
      reasonCode,
    };
  }

  private inspectionFromView(
    view: InvocationReceiptView,
    rawStatus: string,
    evidenceRefs: readonly string[],
  ): TaskSettlementInspection {
    const effectiveStatus = effectiveTaskStatus(view);
    if (!effectiveStatus) {
      return this.hold(rawStatus, 'terminal-conflict', evidenceRefs);
    }
    return {
      decision: 'already-settled',
      rawStatus,
      effectiveStatus,
      evidenceRefs: boundedEvidenceRefs(evidenceRefs) ?? Object.freeze([]),
      reasonCode: 'already-settled',
      receiptRef: receiptRef(view),
    };
  }

  private viewEvidenceRefs(view: InvocationReceiptView): readonly string[] {
    const refs = new Set<string>();
    for (const event of view.events) {
      refs.add(`invocation-event:${event.hash}`);
      const payload = event.payload as { evidenceRefs?: readonly string[] };
      for (const ref of payload.evidenceRefs ?? []) refs.add(ref);
    }
    return boundedEvidenceRefs([...refs]) ?? Object.freeze([]);
  }
}

interface BoundedCommandResult {
  readonly state: 'ok' | 'failed' | 'timeout' | 'overflow' | 'unsupported';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runBoundedCommand(
  command: string,
  args: readonly string[],
  timeoutMs = 3_000,
  maxBytes = 1024 * 1024,
): Promise<BoundedCommandResult> {
  return new Promise(resolveResult => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let timer: NodeJS.Timeout | undefined;
    const child = spawn(command, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (result: BoundedCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveResult(result);
    };
    const collect = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        child.kill('SIGKILL');
        finish({ state: 'overflow', exitCode: null, stdout: '', stderr: '' });
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
    child.once('error', error => {
      const state = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'unsupported' as const
        : 'failed' as const;
      finish({ state, exitCode: null, stdout: '', stderr: '' });
    });
    child.once('close', code => {
      finish({
        state: code === 0 ? 'ok' : 'failed',
        exitCode: code,
        stdout,
        stderr,
      });
    });
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ state: 'timeout', exitCode: null, stdout: '', stderr: '' });
    }, timeoutMs);
    timer.unref();
  });
}

const WORKER_COMMAND_MARKERS = Object.freeze([
  'agentic-worker-entry',
  'http-agentic-worker',
  'sprint-runner-entry',
  'deckent-worker',
  'dist/agents/worker',
] as const);

const LINUX_PROC_WORKER_SCHEMA_VERSION = 1;
const LINUX_PROC_WORKER_ADAPTER_ID = 'linux-proc-worker';
const LINUX_PROC_WORKER_ADAPTER_VERSION = 1;
const LINUX_PROC_WORKER_MAX_ENTRIES = 8_192;
const LINUX_PROC_WORKER_DEADLINE_MS = 1_500;

function commandLooksLikeWorker(command: string, taskId: string): boolean {
  return command.includes(taskId)
    && WORKER_COMMAND_MARKERS.some(marker => command.includes(marker));
}

function linuxProcTaskDigest(input: TaskSettlementProbeInput): string {
  return sha256(JSON.stringify({
    tenantId: input.tenantId,
    projectId: input.projectId,
    runId: input.runId,
    taskId: input.taskId,
  }));
}

function linuxProcEvidence(
  input: TaskSettlementProbeInput,
  platform: string,
  state: TaskSettlementEvidenceState,
  matches: readonly string[],
  reasonCode: string,
): TaskSettlementEvidenceObservation {
  return {
    kind: 'worker-process',
    state,
    evidenceRef: `task-process:linux-proc:${state}:sha256:${sha256(JSON.stringify({
      schemaVersion: LINUX_PROC_WORKER_SCHEMA_VERSION,
      adapterId: LINUX_PROC_WORKER_ADAPTER_ID,
      adapterVersion: LINUX_PROC_WORKER_ADAPTER_VERSION,
      platform,
      taskDigest: linuxProcTaskDigest(input),
      state,
      reasonCode,
      matches: [...matches].sort(),
    }))}`,
  };
}

function linuxProcErrorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  return typeof code === 'string' && code.length > 0 ? code : 'UNKNOWN';
}

function defaultLinuxProcWorkerAdapter(): LinuxProcWorkerInspectionAdapter {
  return {
    platform: process.platform,
    currentPid: process.pid,
    async listProcessIds(): Promise<readonly string[]> {
      return (await readdir('/proc', { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && /^\d+$/u.test(entry.name))
        .map(entry => entry.name);
    },
    async readCommandLine(pid: string): Promise<string> {
      return readFile(`/proc/${pid}/cmdline`, 'utf8');
    },
    nowMs: () => Date.now(),
  };
}

/**
 * Linux worker-process authority. Absence evidence deliberately binds only the
 * adapter contract and task-relevant matches: unrelated process churn cannot
 * invalidate an otherwise complete scan. Any incomplete scan remains fail-closed.
 *
 * @internal Exported for hermetic platform-adapter conformance tests.
 */
export async function inspectLinuxProcWorker(
  input: TaskSettlementProbeInput,
  options: LinuxProcWorkerInspectionOptions = {},
): Promise<TaskSettlementEvidenceObservation> {
  const adapter = options.adapter ?? defaultLinuxProcWorkerAdapter();
  const maxEntries = options.maxEntries ?? LINUX_PROC_WORKER_MAX_ENTRIES;
  const deadlineMs = options.deadlineMs ?? LINUX_PROC_WORKER_DEADLINE_MS;
  if (
    !Number.isSafeInteger(maxEntries)
    || maxEntries < 1
    || maxEntries > LINUX_PROC_WORKER_MAX_ENTRIES
    || !Number.isFinite(deadlineMs)
    || deadlineMs <= 0
    || deadlineMs > LINUX_PROC_WORKER_DEADLINE_MS
  ) {
    throw new TypeError('TASK_SETTLEMENT_INVALID_LINUX_PROC_LIMITS');
  }
  try {
    const processIds = [...await adapter.listProcessIds()];
    if (
      processIds.some(pid => !/^[1-9]\d*$/u.test(pid) || !Number.isSafeInteger(Number(pid)))
      || new Set(processIds).size !== processIds.length
    ) {
      return linuxProcEvidence(input, adapter.platform, 'unknown', [], 'invalid-process-index');
    }
    if (processIds.length > maxEntries) {
      return linuxProcEvidence(input, adapter.platform, 'unknown', [], 'bounded-overflow');
    }
    const matches: string[] = [];
    let unreadable = 0;
    const deadline = adapter.nowMs() + deadlineMs;
    const orderedProcessIds = processIds.sort((left, right) => Number(left) - Number(right));
    for (let offset = 0; offset < orderedProcessIds.length; offset += 64) {
      if (adapter.nowMs() > deadline) {
        return matches.length > 0
          ? linuxProcEvidence(input, adapter.platform, 'present', matches, 'task-match')
          : linuxProcEvidence(input, adapter.platform, 'unknown', [], 'deadline');
      }
      const batch = orderedProcessIds.slice(offset, offset + 64);
      const observations = await Promise.all(batch.map(async pid => {
        if (Number(pid) === adapter.currentPid) return { state: 'self' as const };
        try {
          const command = (await adapter.readCommandLine(pid))
            .replace(/\u0000/gu, ' ');
          return { state: 'read' as const, pid, command };
        } catch (error) {
          const code = linuxProcErrorCode(error);
          return code === 'ENOENT' || code === 'ESRCH'
            ? { state: 'race' as const }
            : { state: 'unreadable' as const };
        }
      }));
      for (const observation of observations) {
        if (observation.state === 'read') {
          if (commandLooksLikeWorker(observation.command, input.taskId)) {
            matches.push(`${observation.pid}:${sha256(observation.command)}`);
          }
        } else if (observation.state === 'unreadable') {
          unreadable++;
        }
      }
    }
    const state = matches.length > 0
      ? 'present'
      : unreadable > 0
        ? 'unknown'
        : 'absent';
    return linuxProcEvidence(
      input,
      adapter.platform,
      state,
      matches,
      state === 'present' ? 'task-match' : state === 'unknown' ? 'unreadable' : 'complete-absence',
    );
  } catch (error) {
    const code = linuxProcErrorCode(error);
    const state = code === 'ENOENT' || code === 'ENOTDIR' ? 'unsupported' : 'unknown';
    return linuxProcEvidence(input, adapter.platform, state, [], `process-index-${code}`);
  }
}

async function inspectPsWorker(
  input: TaskSettlementProbeInput,
): Promise<TaskSettlementEvidenceObservation> {
  const ps = existsSync('/bin/ps') ? '/bin/ps' : '/usr/bin/ps';
  const result = await runBoundedCommand(ps, ['-axo', 'pid=,command=']);
  if (result.state !== 'ok') {
    return {
      kind: 'worker-process',
      state: result.state === 'unsupported' ? 'unsupported' : 'unknown',
      evidenceRef: `task-process:ps:${result.state}:${result.exitCode ?? 'none'}`,
    };
  }
  const matches = result.stdout.split(/\r?\n/u)
    .filter(line => commandLooksLikeWorker(line, input.taskId))
    .map(line => sha256(line))
    .sort();
  const state = matches.length > 0 ? 'present' : 'absent';
  return {
    kind: 'worker-process',
    state,
    evidenceRef: `task-process:ps:${state}:sha256:${sha256(JSON.stringify(matches))}`,
  };
}

async function inspectWindowsWorker(
  input: TaskSettlementProbeInput,
): Promise<TaskSettlementEvidenceObservation> {
  const script = [
    '$ErrorActionPreference="Stop"',
    'Get-CimInstance Win32_Process',
    'Select-Object ProcessId,CommandLine',
    'ConvertTo-Json -Compress',
  ].join(';');
  const result = await runBoundedCommand(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    5_000,
  );
  if (result.state !== 'ok') {
    return {
      kind: 'worker-process',
      state: result.state === 'unsupported' ? 'unsupported' : 'unknown',
      evidenceRef: `task-process:windows-cim:${result.state}:${result.exitCode ?? 'none'}`,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as
      | { ProcessId?: number; CommandLine?: string | null }
      | Array<{ ProcessId?: number; CommandLine?: string | null }>;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const matches = rows.filter(row => (
      row.ProcessId !== process.pid
      && typeof row.CommandLine === 'string'
      && commandLooksLikeWorker(row.CommandLine, input.taskId)
    )).map(row => sha256(`${row.ProcessId}:${row.CommandLine}`)).sort();
    const state = matches.length > 0 ? 'present' : 'absent';
    return {
      kind: 'worker-process',
      state,
      evidenceRef: `task-process:windows-cim:${state}:sha256:${sha256(JSON.stringify(matches))}`,
    };
  } catch {
    return {
      kind: 'worker-process',
      state: 'unknown',
      evidenceRef: 'task-process:windows-cim:parse-failed',
    };
  }
}

async function inspectNativeWorkerProcess(
  input: TaskSettlementProbeInput,
): Promise<TaskSettlementEvidenceObservation> {
  if (process.platform === 'linux') {
    return inspectLinuxProcWorker(input);
  }
  if (process.platform === 'darwin' || process.platform === 'freebsd') {
    return inspectPsWorker(input);
  }
  if (process.platform === 'win32') return inspectWindowsWorker(input);
  return {
    kind: 'worker-process',
    state: 'unsupported',
    evidenceRef: `task-process:unsupported:${process.platform}`,
  };
}

async function inspectDockerBackend(
  projectRoot: string,
  input: TaskSettlementProbeInput,
  hostInspection: TaskResultSettlementAuthorityInspection,
): Promise<TaskSettlementEvidenceObservation> {
  if (hostInspection.state !== 'absent') {
    return {
      kind: 'backend-attempt',
      state: 'present',
      evidenceRef: hostInspection.evidenceRef,
    };
  }
  const containerName = dockerContainerNameForTask(projectRoot, input.taskId);
  const result = await runBoundedCommand(
    'docker',
    ['inspect', '--type', 'container', '--format', '{{json .State}}', containerName],
    5_000,
  );
  if (result.state === 'ok') {
    return {
      kind: 'backend-attempt',
      state: 'present',
      evidenceRef: `docker-inspect:present:sha256:${sha256(result.stdout)}`,
    };
  }
  if (
    result.state === 'failed'
    && result.exitCode === 1
    && /no such (?:object|container)/iu.test(result.stderr)
  ) {
    return {
      kind: 'backend-attempt',
      state: 'absent',
      evidenceRef: `docker-inspect:absent:sha256:${sha256(containerName)}`,
    };
  }
  return {
    kind: 'backend-attempt',
    state: result.state === 'unsupported' ? 'unsupported' : 'unknown',
    evidenceRef: `docker-inspect:${result.state}:${result.exitCode ?? 'none'}`,
  };
}

async function inspectTmuxBackend(
  input: TaskSettlementProbeInput,
  processObservation: TaskSettlementEvidenceObservation,
): Promise<TaskSettlementEvidenceObservation> {
  if (processObservation.state === 'present') {
    return {
      kind: 'backend-attempt',
      state: 'present',
      evidenceRef: `tmux-process:present:${sha256(processObservation.evidenceRef)}`,
    };
  }
  const result = await runBoundedCommand(
    'tmux',
    ['list-panes', '-a', '-F', '#{pane_pid}\t#{pane_start_command}\t#{pane_current_command}'],
  );
  if (
    result.state === 'failed'
    && /(?:no server running|failed to connect)/iu.test(result.stderr)
  ) {
    return {
      kind: 'backend-attempt',
      state: 'absent',
      evidenceRef: 'tmux-list-panes:server-absent',
    };
  }
  if (result.state !== 'ok') {
    return {
      kind: 'backend-attempt',
      state: result.state === 'unsupported' ? 'unsupported' : 'unknown',
      evidenceRef: `tmux-list-panes:${result.state}:${result.exitCode ?? 'none'}`,
    };
  }
  const matches = result.stdout.split(/\r?\n/u)
    .filter(line => line.includes(input.taskId))
    .map(line => sha256(line))
    .sort();
  const state = matches.length > 0 ? 'present' : 'absent';
  return {
    kind: 'backend-attempt',
    state,
    evidenceRef: `tmux-list-panes:${state}:sha256:${sha256(JSON.stringify(matches))}`,
  };
}

async function inspectNativeBackend(
  projectRoot: string,
  input: TaskSettlementProbeInput,
  processObservation: TaskSettlementEvidenceObservation,
): Promise<TaskSettlementEvidenceObservation> {
  const hostInspection = inspectTaskResultSettlementAuthority(projectRoot, input.taskId);
  if (input.executionBackend === 'docker') {
    return inspectDockerBackend(projectRoot, input, hostInspection);
  }
  if (hostInspection.state !== 'absent') {
    return {
      kind: 'backend-attempt',
      state: 'present',
      evidenceRef: hostInspection.evidenceRef,
    };
  }
  if (input.executionBackend === 'tmux') {
    return inspectTmuxBackend(input, processObservation);
  }
  if (input.executionBackend === 'host-subprocess') {
    return {
      kind: 'backend-attempt',
      state: processObservation.state,
      evidenceRef: `host-subprocess:${processObservation.state}:sha256:${sha256(
        processObservation.evidenceRef,
      )}`,
    };
  }
  return {
    kind: 'backend-attempt',
    state: 'unsupported',
    evidenceRef: `backend-probe:unsupported:${input.executionBackend}`,
  };
}

export function createTaskSettlementProbe(
  projectRoot: string,
  options: {
    readonly processProbe?: TaskSettlementExternalProbe;
    readonly backendProbe?: TaskSettlementExternalProbe;
    readonly now?: () => string;
  } = {},
): TaskSettlementEvidenceProbe {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async inspect(input): Promise<TaskSettlementProbeSnapshot> {
      validateTaskId(input.taskId);
      const tasksDir = join(projectRoot, TASKS_DIR);
      const artifact = async (
        kind: 'heartbeat' | 'log' | 'result',
        extension: string,
      ): Promise<TaskSettlementEvidenceObservation> => {
        const path = join(tasksDir, `task-${input.taskId}.${extension}`);
        let state: TaskSettlementEvidenceState;
        try {
          await lstat(path);
          state = 'present';
        } catch (error) {
          state = (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'absent'
            : 'unknown';
        }
        return {
          kind,
          state,
          evidenceRef: `task-artifact:${kind}:${state}:${sha256(path)}`,
        };
      };
      const processObservation = options.processProbe
        ? await options.processProbe.inspect(input)
        : await inspectNativeWorkerProcess(input);
      const backendObservation = options.backendProbe
        ? await options.backendProbe.inspect(input)
        : await inspectNativeBackend(projectRoot, input, processObservation);
      const artifacts = await Promise.all([
        artifact('heartbeat', 'hb'),
        artifact('log', 'log'),
        artifact('result', 'result'),
      ]);
      return Object.freeze({
        platform: process.platform,
        observedAt: now(),
        observations: Object.freeze([
          ...artifacts,
          processObservation,
          backendObservation,
        ]),
      });
    },
  };
}

/**
 * Recovery-only backend RUNTIME liveness probe (owner decision, 2026-08-28).
 *
 * `inspectNativeBackend` deliberately short-circuits to `present` whenever the host
 * result-settlement authority is non-absent, and that is correct for the NOT_DISPATCHED
 * path: you cannot claim a task never dispatched while an attempt record is open.
 *
 * For an ABANDONED dispatch the same short-circuit is self-referential — the pending
 * settlement being reconciled is exactly the record that makes the probe ineligible, so
 * the reconciliation can never run. The separation the owner mandated: a pending
 * settlement is CONTROL-PLANE attempt authority (it attests that this exact dispatch
 * attempt was minted), never evidence that a backend process is running. This probe
 * therefore asks the real backend adapter directly, with no short-circuit, and its
 * result is required to be `absent` on top of the ordinary absence set.
 *
 * Neither the global probe nor the settlement inspection semantics are changed.
 */
export async function inspectAbandonedDispatchRuntimeLiveness(
  projectRoot: string,
  input: TaskSettlementProbeInput,
): Promise<TaskSettlementEvidenceObservation> {
  const processObservation = await inspectNativeWorkerProcess(input);
  if (input.executionBackend === 'docker') {
    // Ask docker itself; pass an 'absent' control state so the host-authority
    // short-circuit inside inspectDockerBackend cannot pre-empt the real probe.
    return inspectDockerBackend(projectRoot, input, {
      state: 'absent',
      evidenceRef: 'control-attempt:excluded-from-runtime-liveness',
    });
  }
  if (input.executionBackend === 'tmux') {
    return inspectTmuxBackend(input, processObservation);
  }
  if (input.executionBackend === 'host-subprocess') {
    return {
      kind: 'backend-attempt',
      state: processObservation.state,
      evidenceRef: `host-subprocess:${processObservation.state}:sha256:${sha256(
        processObservation.evidenceRef,
      )}`,
    };
  }
  return {
    kind: 'backend-attempt',
    state: 'unsupported',
    evidenceRef: `backend-probe:unsupported:${input.executionBackend}`,
  };
}

function createTaskSettlementSnapshotVerifier(
  projectRoot: string,
): TaskSettlementSnapshotVerifier {
  return {
    verify(input): boolean {
      const path = join(projectRoot, TASKS_DIR, `task-${input.taskId}.json`);
      let stat: ReturnType<typeof lstatSync>;
      try {
        validateTaskId(input.taskId);
        stat = lstatSync(path);
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
          && input.taskSnapshotOrigin === 'ephemeral-memory'
          && input.receiptRef !== undefined;
      }
      try {
        if (!stat.isFile() || stat.isSymbolicLink()) return false;
        const currentBytes = readFileSync(path);
        const expectedBytes = typeof input.taskContent === 'string'
          ? Buffer.from(input.taskContent, 'utf8')
          : Buffer.from(input.taskContent);
        if (!currentBytes.equals(expectedBytes)) return false;
        const parsed = JSON.parse(currentBytes.toString('utf8')) as {
          id?: unknown;
          status?: unknown;
          createdAt?: unknown;
        };
        return parsed.id === input.taskId
          && input.rawStatus === 'PENDING'
          && parsed.status === input.rawStatus
          && parsed.createdAt === input.taskCreatedAt;
      } catch {
        return false;
      }
    },
  };
}

function taskSettlementAuthorityFacade(
  service: TaskSettlementAuthorityService,
): TaskSettlementAuthority {
  const facade: TaskSettlementAuthority = {
    declareTaskExecution: input => service.declareTaskExecution(input),
    markDispatchStarted: input => service.markDispatchStarted(input),
    settleDispatched: input => service.settleDispatched(input),
    inspectTaskSettlement: input => service.inspectTaskSettlement(input),
    plan: input => service.plan(input),
    settleNotDispatched: input => service.settleNotDispatched(input),
    settleAbandonedDispatch: input => service.settleAbandonedDispatch(input),
    settleDispatchedFromResult: input => service.settleDispatchedFromResult(input),
    reprojectTaskStatusFromReceipt: input => service.reprojectTaskStatusFromReceipt(input),
    projectTaskExecutionState: (taskId, rawStatus, scope) => (
      service.projectTaskExecutionState(taskId, rawStatus, scope)
    ),
    projectTaskExecutionStates: inputs => service.projectTaskExecutionStates(inputs),
  };
  return Object.freeze(facade);
}

export function openTaskSettlementAuthority(
  projectRoot: string,
  options: OpenTaskSettlementAuthorityOptions = {},
): OpenTaskSettlementAuthorityResult {
  const ledger = new InvocationReceiptStore(projectRoot, {
    ...(options.now ? { now: options.now } : {}),
  });
  const service = new TaskSettlementAuthorityService({
    ledger,
    probe: createTaskSettlementProbe(projectRoot, {
      ...(options.processProbe ? { processProbe: options.processProbe } : {}),
      ...(options.backendProbe ? { backendProbe: options.backendProbe } : {}),
      ...(options.now ? { now: options.now } : {}),
    }),
    taskSnapshotVerifier: createTaskSettlementSnapshotVerifier(projectRoot),
    projectRoot,
    // The recovery path asks the backend adapter directly; an injected backendProbe is the
    // caller's adapter override and must govern it too, or tests and hosts diverge.
    ...(options.backendProbe ? { runtimeLivenessProbe: options.backendProbe } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const authority = taskSettlementAuthorityFacade(service);
  let closed = false;
  return {
    authority,
    projectId: ledger.projectId,
    close(): void {
      if (closed) return;
      closed = true;
      ledger.close();
    },
  };
}

/**
 * Open a strictly read-only status/output projection. Missing historical state
 * returns the raw task status and never bootstraps a DB or project binding.
 * Existing-but-corrupt state fails explicitly instead of masquerading as empty.
 */
export function openTaskSettlementProjection(
  projectRoot: string,
): OpenTaskSettlementProjectionResult {
  const dbPath = join(projectRoot, DECKENT_DIR, 'runtime', 'invocations.db');
  const rawOnly = (
    diagnostic: 'store-absent' | 'binding-absent',
  ): OpenTaskSettlementProjectionResult => ({
    projectId: null,
    diagnostic,
    projectTaskExecutionState(taskId, rawStatus): TaskSettlementProjection {
      validateTaskId(taskId);
      return {
        rawStatus,
        effectiveStatus: canonicalRawStatus(rawStatus),
        evidenceRefs: [],
        reasonCode: diagnostic,
      };
    },
    projectTaskExecutionStates(inputs): readonly TaskSettlementProjection[] {
      return Object.freeze(normalizeProjectionInputs(inputs).map(input => {
        return {
          rawStatus: input.rawStatus,
          effectiveStatus: canonicalRawStatus(input.rawStatus),
          evidenceRefs: [],
          reasonCode: diagnostic,
        };
      }));
    },
    close(): void { /* no resource was opened */ },
  });

  try {
    lstatSync(dbPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return rawOnly('store-absent');
    throw new TaskSettlementProjectionError(
      'STORE_UNREADABLE',
      'TASK_SETTLEMENT_PROJECTION_STORE_UNREADABLE',
    );
  }

  let ledger: InvocationReceiptStore;
  try {
    ledger = new InvocationReceiptStore(projectRoot, { dbPath, readOnly: true });
  } catch (error) {
    if (error instanceof InvocationReceiptStoreError && error.code === 'READ_ONLY') {
      return rawOnly('binding-absent');
    }
    throw new TaskSettlementProjectionError(
      'STORE_CORRUPT',
      'TASK_SETTLEMENT_PROJECTION_STORE_CORRUPT',
    );
  }
  const authority = new TaskSettlementAuthorityService({
    ledger,
    probe: {
      async inspect(): Promise<TaskSettlementProbeSnapshot> {
        throw new TaskSettlementProjectionError(
          'STORE_UNREADABLE',
          'TASK_SETTLEMENT_PROJECTION_PROBE_FORBIDDEN',
        );
      },
    },
  });
  let closed = false;
  return {
    projectId: ledger.projectId,
    diagnostic: 'ready',
    projectTaskExecutionState(taskId, rawStatus, tenantId = 'local'): TaskSettlementProjection {
      try {
        return authority.projectTaskExecutionState(taskId, rawStatus, {
          tenantId,
          projectId: ledger.projectId,
        });
      } catch {
        throw new TaskSettlementProjectionError(
          'STORE_CORRUPT',
          'TASK_SETTLEMENT_PROJECTION_STORE_CORRUPT',
        );
      }
    },
    projectTaskExecutionStates(inputs): readonly TaskSettlementProjection[] {
      try {
        return authority.projectTaskExecutionStates(inputs);
      } catch {
        throw new TaskSettlementProjectionError(
          'STORE_CORRUPT',
          'TASK_SETTLEMENT_PROJECTION_STORE_CORRUPT',
        );
      }
    },
    close(): void {
      if (closed) return;
      closed = true;
      ledger.close();
    },
  };
}
