import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
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
  dockerContainerNameForTask,
  inspectTaskResultSettlementAuthority,
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
    | 'validation_failed';
  readonly durationMs: number;
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
}

interface TaskSettlementAuthorityAssemblyOptions {
  readonly ledger: InvocationReceiptReconciliationLedger;
  readonly probe: TaskSettlementEvidenceProbe;
  readonly taskSnapshotVerifier?: TaskSettlementSnapshotVerifier;
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
  private readonly now: () => string;

  constructor(options: TaskSettlementAuthorityAssemblyOptions) {
    this.ledger = options.ledger;
    this.probe = options.probe;
    this.taskSnapshotVerifier = options.taskSnapshotVerifier;
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
    const result = this.ledger.writeAtomic({ receipt: view.receipt, events });
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

  async settleNotDispatched(input: SettleNotDispatchedInput): Promise<TaskSettlementInspection> {
    if (input.occurredAt !== undefined && !validTimestamp(input.occurredAt)) {
      throw new TypeError('TASK_SETTLEMENT_INVALID_TIMESTAMP');
    }
    const inspection = await this.inspectTaskSettlement(input);
    if (inspection.decision !== 'eligible' || input.apply !== true) return inspection;
    if (!this.verifyCurrentTaskSnapshot(input)) {
      return this.hold(
        input.rawStatus,
        'task-content-mismatch',
        inspection.evidenceRefs,
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
              inspection.evidenceRefs,
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
              ...inspection.evidenceRefs,
            ]),
            type: 'dispatch_rejected',
            occurredAt,
            payload: {
              reasonCode: input.reasonCode,
              evidenceRefs: inspection.evidenceRefs,
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
                inspection.evidenceRefs,
                input.reasonCode,
                occurredAt,
              ),
            ],
          });
          return this.inspectionFromView(result.view, input.rawStatus, inspection.evidenceRefs);
        }
        if (!rejection || rejection.type !== 'dispatch_rejected') {
          return this.hold(input.rawStatus, 'receipt-ambiguous', inspection.evidenceRefs);
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
            inspection.evidenceRefs,
          );
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
        return this.inspectionFromView(result.view, input.rawStatus, inspection.evidenceRefs);
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
            inspection.evidenceRefs,
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
