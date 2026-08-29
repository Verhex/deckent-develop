import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DECKENT_DIR } from './constants.js';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationAtomicWrite,
  type InvocationAtomicWriteResult,
  type InvocationDeclarationResult,
  type InvocationDispatchReconciliation,
  type InvocationEvent,
  type InvocationOpenDispatchCandidate,
  type InvocationOpenDispatchScan,
  type InvocationProjectTaskReceiptBulkScan,
  type InvocationReceipt,
  type InvocationReceiptReconciliationLedger,
  type InvocationReceiptRef,
  type InvocationReceiptView,
  type InvocationScopedTaskReceiptGroup,
  type InvocationScopedTaskReceiptRequest,
  type InvocationScope,
  type InvocationTaskReceiptBulkScan,
  type InvocationTaskReceiptGroup,
  type InvocationTaskReceiptScan,
  type StoredInvocationEvent,
} from './invocation-receipt.js';

interface InvocationRow {
  invocation_id: string;
  tenant_id: string;
  project_id: string;
  payload_json: string;
  payload_hash: string;
}

interface EventRow {
  event_id: string;
  invocation_id: string;
  sequence: number;
  event_type: string;
  occurred_at: string;
  payload_json: string;
  payload_hash: string;
  prev_hash: string | null;
  event_hash: string;
}

interface ScopedEventRow extends EventRow {
  tenant_id: string;
  project_id: string;
}

export interface InvocationReceiptStoreOptions {
  readonly dbPath?: string;
  readonly idFactory?: () => string;
  readonly now?: () => string;
  readonly readOnly?: boolean;
}

export class InvocationReceiptStoreError extends Error {
  constructor(
    readonly code:
      | 'SCOPE_MISMATCH'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INVOCATION_NOT_FOUND'
      | 'INTEGRITY_FAILURE'
      | 'INVALID_TRANSITION'
      | 'RECONCILIATION_CONFLICT'
      | 'READ_ONLY',
    message: string,
  ) {
    super(message);
    this.name = 'InvocationReceiptStoreError';
  }
}

const EVENT_TYPES = new Set<InvocationEvent['type']>([
  'dispatch_started', 'dispatch_rejected', 'transport_settled', 'consumer_settled',
]);
const INVOCATION_REASON_CODES: ReadonlySet<string> = new Set([
  'none',
  'no_provider',
  'budget_capability_unsupported',
  'provider_authority_rejected',
  'routing_authority_rejected',
  'execution_admission_rejected',
  'legacy_operator_attestation',
  'not_dispatched_settled',
  'command_build_failed',
  'spawn_error',
  'nonzero_exit',
  'timeout',
  'empty_output',
  'parse_failed',
  'validation_failed',
  'fallback_unreachable',
  'fallback_limit_hold',
  'fallback_exhausted',
  'provider_resolution_fallback',
  'abandoned_dispatch_reconciled', 'coordinator_restart_orphan',
  'duplicate_invocation',
] as const);
const PRE_DISPATCH_REASON_CODES: ReadonlySet<string> = new Set([
  'no_provider',
  'budget_capability_unsupported',
  'provider_authority_rejected',
  'routing_authority_rejected',
  'execution_admission_rejected',
  'legacy_operator_attestation',
  'command_build_failed',
  'fallback_unreachable',
  'fallback_limit_hold',
  'fallback_exhausted',
] as const);
const SHA256_RE = /^[a-f0-9]{64}$/u;
const MAX_EVENT_EVIDENCE_REFS = 32;
const MAX_EVENT_ID_LENGTH = 512;
const MAX_SIGNAL_LENGTH = 128;
const MAX_TIMESTAMP_LENGTH = 64;
const TRANSPORT_OUTCOMES: ReadonlySet<string> = new Set([
  'succeeded', 'failed', 'timeout', 'unknown',
]);
const CONSUMER_OUTCOMES: ReadonlySet<string> = new Set([
  'accepted', 'rejected', 'unknown',
]);
const TASK_DISPOSITIONS: ReadonlySet<string> = new Set([
  'not_dispatched', 'done', 'no_go', 'manual_review_required',
]);
/** Leaves ample headroom below SQLite's most conservative 999-variable limit. */
const TASK_RECEIPT_BULK_CHUNK_SIZE = 250;
/** Bounds one reader allocation; larger estates page through successive calls. */
const MAX_TASK_RECEIPT_BULK_INPUT = 1_000_000;

function hasBoundedCanonicalEvidenceRefs(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_EVENT_EVIDENCE_REFS) {
    return false;
  }
  if (value.some(ref => (
    typeof ref !== 'string'
    || ref !== ref.trim()
    || ref.length < 1
    || ref.length > 512
  ))) {
    return false;
  }
  const canonical = [...new Set(value)].sort();
  return canonical.length === value.length
    && canonical.every((ref, index) => ref === value[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOneExactKeySet(value: object, keySets: readonly (readonly string[])[]): boolean {
  return keySets.some(keys => exactKeys(value, keys));
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= MAX_TIMESTAMP_LENGTH
    && Number.isFinite(Date.parse(value));
}

function invalidEvent(message: string): never {
  throw new InvocationReceiptStoreError('INVALID_TRANSITION', message);
}

/**
 * Runtime authority for the complete InvocationEvent union. Callers are typed,
 * but persisted rows and JavaScript consumers are not; every accepted byte must
 * therefore pass the same exact-key and bounded-value validation.
 */
function assertEventPayload(
  receipt: InvocationReceipt,
  candidate: unknown,
  effectiveOccurredAt?: string,
): asserts candidate is InvocationEvent {
  if (!isRecord(candidate)) invalidEvent('Invocation event must be an object');
  if (!hasOneExactKeySet(candidate, [
    ['eventId', 'type', 'payload'],
    ['eventId', 'type', 'occurredAt', 'payload'],
  ])) {
    invalidEvent('Invocation event envelope has unknown or missing fields');
  }
  if (!boundedString(candidate.eventId, MAX_EVENT_ID_LENGTH)
    || candidate.eventId !== candidate.eventId.trim()) {
    invalidEvent('Invocation event id is invalid');
  }
  if (hasOwn(candidate, 'occurredAt') && !validTimestamp(candidate.occurredAt)) {
    invalidEvent('Invocation event timestamp is invalid');
  }
  if (typeof candidate.type !== 'string' || !EVENT_TYPES.has(candidate.type as InvocationEvent['type'])) {
    invalidEvent('Invocation event type is unknown');
  }
  if (!isRecord(candidate.payload)) invalidEvent('Invocation event payload must be an object');

  const payload = candidate.payload;
  if (candidate.type === 'dispatch_started') {
    if (!hasOneExactKeySet(payload, [
      ['attempt'],
      ['attempt', 'executionEvidenceRef'],
      ['attempt', 'calledProvider', 'calledModel'],
      ['attempt', 'executionEvidenceRef', 'calledProvider', 'calledModel'],
    ])) {
      invalidEvent('dispatch_started payload has unknown or missing fields');
    }
    if (
      !Number.isSafeInteger(payload.attempt)
      || (payload.attempt as number) < 1
      || (hasOwn(payload, 'executionEvidenceRef')
        && (!boundedString(payload.executionEvidenceRef, 512)
          || payload.executionEvidenceRef !== payload.executionEvidenceRef.trim()))
    ) {
      invalidEvent('Invalid dispatch_started payload');
    }
    const hasCalledIdentity = hasOwn(payload, 'calledProvider');
    if (hasCalledIdentity) {
      const expectedProvider = receipt.called.provider ?? receipt.resolved.provider;
      const expectedModel = receipt.called.model ?? receipt.resolved.model;
      if (
        !boundedString(payload.calledProvider, 128)
        || payload.calledProvider !== payload.calledProvider.trim()
        || !boundedString(payload.calledModel, 256)
        || payload.calledModel !== payload.calledModel.trim()
        || expectedProvider === null
        || expectedModel === null
        || payload.calledProvider !== expectedProvider
        || payload.calledModel !== expectedModel
      ) {
        invalidEvent('dispatch_started called identity does not match the receipt');
      }
    }
    return;
  }

  if (candidate.type === 'dispatch_rejected') {
    if (!hasOneExactKeySet(payload, [
      ['reasonCode'],
      ['reasonCode', 'evidenceRefs'],
      ['reasonCode', 'attestation'],
      ['reasonCode', 'evidenceRefs', 'attestation'],
    ])) {
      invalidEvent('dispatch_rejected payload has unknown or missing fields');
    }
    if (typeof payload.reasonCode !== 'string'
      || !PRE_DISPATCH_REASON_CODES.has(payload.reasonCode)) {
      invalidEvent('Dispatch rejection requires a known pre-dispatch reason');
    }
    if (
      hasOwn(payload, 'evidenceRefs')
      && !hasBoundedCanonicalEvidenceRefs(payload.evidenceRefs)
    ) {
      invalidEvent('Dispatch rejection evidence is not canonical');
    }
    const attestation = payload.attestation;
    if (!hasOwn(payload, 'attestation')) {
      if (payload.reasonCode === 'legacy_operator_attestation') {
        invalidEvent('Legacy dispatch rejection requires an operator attestation');
      }
      return;
    }
    if (!isRecord(attestation)
      || !exactKeys(attestation, [
        'attestationKind',
        'operatorRefHash',
        'attestedAt',
        'reasonCode',
        'statementDigest',
        'taskContentDigest',
        'taskCreatedAt',
        'observedAbsenceEvidenceRefs',
      ])) {
      invalidEvent('Legacy operator attestation has unknown or missing fields');
    }
    if (
      attestation.attestationKind !== 'legacy-reconciliation'
      || typeof attestation.operatorRefHash !== 'string'
      || !SHA256_RE.test(attestation.operatorRefHash)
      || typeof attestation.statementDigest !== 'string'
      || !SHA256_RE.test(attestation.statementDigest)
      || typeof attestation.taskContentDigest !== 'string'
      || !SHA256_RE.test(attestation.taskContentDigest)
      || !validTimestamp(attestation.attestedAt)
      || !validTimestamp(attestation.taskCreatedAt)
      || typeof attestation.reasonCode !== 'string'
      || !PRE_DISPATCH_REASON_CODES.has(attestation.reasonCode)
      || attestation.reasonCode !== payload.reasonCode
      || !hasBoundedCanonicalEvidenceRefs(attestation.observedAbsenceEvidenceRefs)
      || !hasBoundedCanonicalEvidenceRefs(payload.evidenceRefs)
      || canonicalJson(attestation.observedAbsenceEvidenceRefs)
        !== canonicalJson(payload.evidenceRefs)
      || Date.parse(attestation.taskCreatedAt) > Date.parse(attestation.attestedAt)
      || (effectiveOccurredAt !== undefined
        && Date.parse(attestation.attestedAt) !== Date.parse(effectiveOccurredAt))
      || receipt.purpose !== 'worker-execution'
      || receipt.taskId === null
    ) {
      invalidEvent('Invalid legacy operator attestation');
    }
    return;
  }

  if (candidate.type === 'transport_settled') {
    if (!hasOneExactKeySet(payload, [
      ['outcome', 'exitCode', 'signal', 'reasonCode', 'durationMs'],
      ['outcome', 'exitCode', 'signal', 'reasonCode', 'durationMs', 'reconciliation'],
    ])) {
      invalidEvent('transport_settled payload has unknown or missing fields');
    }
    const reconciliation = payload.reconciliation;
    if (hasOwn(payload, 'reconciliation')) {
      if (
        !isRecord(reconciliation)
        || !exactKeys(reconciliation, ['evidenceRef', 'dispatchEventHash'])
        || !boundedString(reconciliation.evidenceRef, 512)
        || reconciliation.evidenceRef !== reconciliation.evidenceRef.trim()
        || typeof reconciliation.dispatchEventHash !== 'string'
        || !SHA256_RE.test(reconciliation.dispatchEventHash)
        || payload.reasonCode !== 'coordinator_restart_orphan'
      ) {
        invalidEvent('Invalid transport reconciliation evidence');
      }
    }
    if (
      typeof payload.outcome !== 'string'
      || !TRANSPORT_OUTCOMES.has(payload.outcome)
      || (payload.exitCode !== null && !Number.isSafeInteger(payload.exitCode))
      || (payload.signal !== null
        && (!boundedString(payload.signal, MAX_SIGNAL_LENGTH)
          || payload.signal !== payload.signal.trim()))
      || typeof payload.reasonCode !== 'string'
      || !INVOCATION_REASON_CODES.has(payload.reasonCode)
      || !Number.isSafeInteger(payload.durationMs)
      || (payload.durationMs as number) < 0
      || payload.reasonCode === 'legacy_operator_attestation'
      || (payload.reasonCode === 'coordinator_restart_orphan'
        && !hasOwn(payload, 'reconciliation'))
    ) {
      invalidEvent('Invalid transport settlement payload');
    }
    return;
  }

  if (!hasOneExactKeySet(payload, [
    ['outcome', 'reasonCode'],
    ['outcome', 'reasonCode', 'evidenceRefs'],
    ['outcome', 'reasonCode', 'taskDisposition'],
    ['outcome', 'reasonCode', 'taskDisposition', 'evidenceRefs'],
  ])) {
    invalidEvent('consumer_settled payload has unknown or missing fields');
  }
  if (
    typeof payload.outcome !== 'string'
    || !CONSUMER_OUTCOMES.has(payload.outcome)
    || typeof payload.reasonCode !== 'string'
    || !INVOCATION_REASON_CODES.has(payload.reasonCode)
  ) {
    invalidEvent('Unknown consumer settlement outcome or reason');
  }
  if (
    hasOwn(payload, 'evidenceRefs')
    && !hasBoundedCanonicalEvidenceRefs(payload.evidenceRefs)
  ) {
    invalidEvent('Consumer settlement evidence is not canonical');
  }
  if (
    hasOwn(payload, 'taskDisposition')
    && (typeof payload.taskDisposition !== 'string'
      || !TASK_DISPOSITIONS.has(payload.taskDisposition))
  ) {
    invalidEvent('Consumer task disposition is unknown');
  }
  if (
    hasOwn(payload, 'taskDisposition')
    && (
      receipt.purpose !== 'worker-execution'
      || receipt.taskId === null
      || !hasOwn(payload, 'evidenceRefs')
    )
  ) {
    invalidEvent('Invalid task consumer settlement');
  }
  if (
    (payload.taskDisposition === 'not_dispatched' && payload.outcome !== 'accepted')
    || (payload.taskDisposition === 'done' && payload.outcome !== 'accepted')
    || (payload.taskDisposition === 'no_go' && payload.outcome !== 'rejected')
    || (payload.taskDisposition === 'manual_review_required' && payload.outcome !== 'unknown')
    || (payload.taskDisposition !== undefined
      && payload.taskDisposition !== 'done'
      && payload.reasonCode === 'none')
  ) {
    invalidEvent('Task disposition conflicts with consumer outcome');
  }
}

function assertEventTransition(
  previous: InvocationEvent['type'] | null,
  next: InvocationEvent['type'],
): void {
  const allowed = previous === null
    ? next === 'dispatch_started' || next === 'dispatch_rejected'
    : previous === 'dispatch_started'
      ? next === 'transport_settled'
      : previous === 'dispatch_rejected' || previous === 'transport_settled'
        ? next === 'consumer_settled'
        : false;
  if (!allowed) {
    throw new InvocationReceiptStoreError(
      'INVALID_TRANSITION',
      `Illegal invocation event transition ${previous ?? 'none'} -> ${next}`,
    );
  }
}

function assertEventAuthorityTransition(
  previous: StoredInvocationEvent | undefined,
  event: InvocationEvent,
): void {
  assertEventTransition(previous?.type ?? null, event.type);
  if (event.type === 'consumer_settled') {
    if (
      event.payload.taskDisposition === 'not_dispatched'
      && previous?.type !== 'dispatch_rejected'
    ) {
      invalidEvent('NOT_DISPATCHED settlement requires an exact dispatch rejection head');
    }
    if (
      event.payload.taskDisposition === 'not_dispatched'
      && previous?.type === 'dispatch_rejected'
    ) {
      const rejection = previous.payload as Extract<
        InvocationEvent,
        { type: 'dispatch_rejected' }
      >['payload'];
      if (
        event.occurredAt !== previous.occurredAt
        || event.payload.reasonCode !== rejection.reasonCode
        || !hasBoundedCanonicalEvidenceRefs(rejection.evidenceRefs)
        || !hasBoundedCanonicalEvidenceRefs(event.payload.evidenceRefs)
        || canonicalJson(event.payload.evidenceRefs) !== canonicalJson(rejection.evidenceRefs)
      ) {
        invalidEvent(
          'NOT_DISPATCHED settlement must bind the exact rejection cause, evidence, and timestamp',
        );
      }
    }
    if (
      event.payload.taskDisposition !== undefined
      && event.payload.taskDisposition !== 'not_dispatched'
      && previous?.type !== 'transport_settled'
    ) {
      invalidEvent('Dispatched task settlement requires an exact transport settlement head');
    }
  }
  if (event.type === 'transport_settled' && event.payload.reconciliation !== undefined) {
    if (
      previous?.type !== 'dispatch_started'
      || event.payload.reconciliation.dispatchEventHash !== previous.hash
    ) {
      invalidEvent('Transport reconciliation does not bind the exact dispatch head');
    }
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return current;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireIdentity(label: string, value: string): void {
  if (!boundedString(value) || value !== value.trim()) {
    throw new InvocationReceiptStoreError('SCOPE_MISMATCH', `${label} must be non-empty`);
  }
}

function requireTimestamp(label: string, value: string): void {
  if (!validTimestamp(value)) {
    throw new InvocationReceiptStoreError('SCOPE_MISMATCH', `${label} must be a valid timestamp`);
  }
}

function assertEventChronology(
  receiptCreatedAt: string,
  previousOccurredAt: string | null,
  occurredAt: string,
): void {
  const currentMs = Date.parse(occurredAt);
  if (
    currentMs < Date.parse(receiptCreatedAt)
    || (previousOccurredAt !== null && currentMs < Date.parse(previousOccurredAt))
  ) {
    throw new InvocationReceiptStoreError(
      'INVALID_TRANSITION',
      'Invocation event chronology predates its receipt or predecessor',
    );
  }
}

function hasKnownReceiptReasons(receipt: InvocationReceipt): boolean {
  return [
    receipt.configured.reasonCode,
    receipt.requested.reasonCode,
    receipt.resolved.reasonCode,
    receipt.called.reasonCode,
    ...receipt.fallbackChain.map(transition => transition.reasonCode),
  ].every(reasonCode => INVOCATION_REASON_CODES.has(reasonCode));
}

const RECEIPT_ROLES: ReadonlySet<string> = new Set(['brain', 'worker', 'auditor']);
const RECEIPT_PURPOSES: ReadonlySet<string> = new Set([
  'sprint-planning',
  'goal-authoring',
  'goal-acceptance',
  'reachability-probe',
  'worker-execution',
  'audit-evaluation',
]);
const SELECTION_SOURCES: ReadonlySet<string> = new Set([
  'config', 'directive', 'router', 'fallback', 'wire', 'none',
]);
const AUTH_MODES: ReadonlySet<string> = new Set([
  'subscription', 'api', 'hybrid', 'local', 'unknown',
]);
const TRANSPORTS: ReadonlySet<string> = new Set(['cli', 'api', 'http', 'local-runtime']);
const EXECUTION_BACKENDS: ReadonlySet<string> = new Set([
  'host-subprocess', 'docker', 'tmux', 'api', 'in-process', 'unknown',
]);
const EVIDENCE_STATES: ReadonlySet<string> = new Set([
  'known', 'unknown', 'stale', 'unavailable',
]);

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function boundedString(value: unknown, max = 512): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= max;
}

function nullableBoundedString(value: unknown, max = 512): boolean {
  return value === null || boundedString(value, max);
}

function boundedRefArray(value: unknown, allowEmpty = true): value is readonly string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.length <= 32
    && value.every(ref => boundedString(ref, 512))
    && new Set(value).size === value.length;
}

function validSelection(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const selection = value as Record<string, unknown>;
  return exactKeys(selection, ['provider', 'model', 'source', 'reasonCode'])
    && nullableBoundedString(selection.provider, 128)
    && nullableBoundedString(selection.model, 256)
    && ((selection.provider === null) === (selection.model === null))
    && typeof selection.source === 'string'
    && SELECTION_SOURCES.has(selection.source)
    && typeof selection.reasonCode === 'string'
    && INVOCATION_REASON_CODES.has(selection.reasonCode);
}

function validReceiptShape(value: unknown): value is InvocationReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  if (!exactKeys(receipt, [
    'schemaVersion', 'invocationId', 'idempotencyKey', 'tenantId', 'projectId',
    'runId', 'taskId', 'callId', 'role', 'purpose', 'configured', 'requested',
    'resolved', 'called', 'backend', 'auth', 'fallbackChain', 'reachability',
    'limits', 'createdAt',
  ])) return false;
  if (
    receipt.schemaVersion !== INVOCATION_RECEIPT_SCHEMA_VERSION
    || !boundedString(receipt.invocationId)
    || !boundedString(receipt.idempotencyKey)
    || !boundedString(receipt.tenantId)
    || !boundedString(receipt.projectId)
    || !boundedString(receipt.runId)
    || !nullableBoundedString(receipt.taskId)
    || !boundedString(receipt.callId)
    || typeof receipt.role !== 'string'
    || !RECEIPT_ROLES.has(receipt.role)
    || typeof receipt.purpose !== 'string'
    || !RECEIPT_PURPOSES.has(receipt.purpose)
    || !validSelection(receipt.configured)
    || !validSelection(receipt.requested)
    || !validSelection(receipt.resolved)
    || !validSelection(receipt.called)
    || !validTimestamp(receipt.createdAt)
  ) return false;
  if (!receipt.backend || typeof receipt.backend !== 'object' || Array.isArray(receipt.backend)) {
    return false;
  }
  const backendKeysValid = exactKeys(receipt.backend, ['transport', 'executionBackend'])
    || exactKeys(receipt.backend, ['transport', 'executionBackend', 'endpointRefHash']);
  if (!backendKeysValid) return false;
  const backend = receipt.backend as Record<string, unknown>;
  if (
    typeof backend.transport !== 'string'
    || !TRANSPORTS.has(backend.transport)
    || typeof backend.executionBackend !== 'string'
    || !EXECUTION_BACKENDS.has(backend.executionBackend)
    || (backend.endpointRefHash !== undefined
      && backend.endpointRefHash !== null
      && (typeof backend.endpointRefHash !== 'string'
        || !SHA256_RE.test(backend.endpointRefHash)))
  ) return false;
  if (!receipt.auth || typeof receipt.auth !== 'object' || Array.isArray(receipt.auth)
    || !exactKeys(receipt.auth, ['mode', 'accountRefHash'])) return false;
  const auth = receipt.auth as Record<string, unknown>;
  if (
    typeof auth.mode !== 'string'
    || !AUTH_MODES.has(auth.mode)
    || (auth.accountRefHash !== null
      && (typeof auth.accountRefHash !== 'string' || !SHA256_RE.test(auth.accountRefHash)))
  ) return false;
  if (!Array.isArray(receipt.fallbackChain) || receipt.fallbackChain.length > 16) return false;
  for (const [index, raw] of receipt.fallbackChain.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const transition = raw as Record<string, unknown>;
    if (
      !exactKeys(transition, [
        'sequence', 'fromProvider', 'fromModel', 'toProvider', 'toModel',
        'reasonCode', 'reachabilityRef', 'limitEvidenceRefs',
      ])
      || transition.sequence !== index + 1
      || !nullableBoundedString(transition.fromProvider, 128)
      || !nullableBoundedString(transition.fromModel, 256)
      || !boundedString(transition.toProvider, 128)
      || !boundedString(transition.toModel, 256)
      || typeof transition.reasonCode !== 'string'
      || !INVOCATION_REASON_CODES.has(transition.reasonCode)
      || !nullableBoundedString(transition.reachabilityRef)
      || !boundedRefArray(transition.limitEvidenceRefs)
    ) return false;
  }
  if (
    !receipt.reachability
    || typeof receipt.reachability !== 'object'
    || Array.isArray(receipt.reachability)
    || !exactKeys(receipt.reachability, ['state', 'evidenceRef'])
  ) return false;
  const reachability = receipt.reachability as Record<string, unknown>;
  if (
    typeof reachability.state !== 'string'
    || !EVIDENCE_STATES.has(reachability.state)
    || !nullableBoundedString(reachability.evidenceRef)
  ) return false;
  if (
    !receipt.limits
    || typeof receipt.limits !== 'object'
    || Array.isArray(receipt.limits)
    || !exactKeys(receipt.limits, ['state', 'evidenceRefs'])
  ) return false;
  const limits = receipt.limits as Record<string, unknown>;
  return typeof limits.state === 'string'
    && EVIDENCE_STATES.has(limits.state)
    && boundedRefArray(limits.evidenceRefs);
}

export class InvocationReceiptStore implements InvocationReceiptReconciliationLedger {
  readonly projectId: string;
  private readonly db: DatabaseType;
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly readOnly: boolean;
  private readonly selectInvocation: Statement;
  private readonly selectInvocationByKey: Statement;
  private readonly selectEvent: Statement;
  private readonly selectEvents: Statement;

  constructor(projectRoot: string, options: InvocationReceiptStoreOptions = {}) {
    const canonicalRoot = realpathSync.native(projectRoot);
    const rootDigest = sha256(canonicalRoot);
    const dbPath = options.dbPath ?? join(projectRoot, DECKENT_DIR, 'runtime', 'invocations.db');
    this.readOnly = options.readOnly === true;
    if (this.readOnly && !existsSync(dbPath)) {
      throw new InvocationReceiptStoreError('READ_ONLY', 'Invocation receipt store does not exist');
    }
    if (!this.readOnly) mkdirSync(dirname(dbPath), { recursive: true });
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.db = new Database(dbPath, this.readOnly
      ? { readonly: true, fileMustExist: true }
      : {});
    if (!this.readOnly) this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    if (!this.readOnly) this.db.pragma('synchronous = FULL');
    if (!this.readOnly) this.initSchema();
    this.projectId = this.readOnly
      ? this.readProjectBinding(rootDigest)
      : this.bindProject(rootDigest);
    this.selectInvocation = this.db.prepare(`
      SELECT invocation_id, tenant_id, project_id, payload_json, payload_hash
      FROM invocations
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND invocation_id = @invocation_id
    `);
    this.selectInvocationByKey = this.db.prepare(`
      SELECT invocation_id, tenant_id, project_id, payload_json, payload_hash
      FROM invocations
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND idempotency_key = @idempotency_key
    `);
    this.selectEvent = this.db.prepare(`
      SELECT event_id, invocation_id, sequence, event_type, occurred_at,
             payload_json, payload_hash, prev_hash, event_hash
      FROM invocation_events
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND event_id = @event_id
    `);
    this.selectEvents = this.db.prepare(`
      SELECT event_id, invocation_id, sequence, event_type, occurred_at,
             payload_json, payload_hash, prev_hash, event_hash
      FROM invocation_events
      WHERE tenant_id = @tenant_id AND project_id = @project_id AND invocation_id = @invocation_id
      ORDER BY sequence ASC
    `);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invocation_project_bindings (
        root_digest TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invocations (
        invocation_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (tenant_id, project_id, idempotency_key),
        UNIQUE (tenant_id, project_id, invocation_id)
      );

      CREATE TABLE IF NOT EXISTS invocation_events (
        event_id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        prev_hash TEXT,
        event_hash TEXT NOT NULL,
        UNIQUE (invocation_id, sequence),
        FOREIGN KEY (tenant_id, project_id, invocation_id)
          REFERENCES invocations (tenant_id, project_id, invocation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_invocations_scope_created
        ON invocations (tenant_id, project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_invocations_task_scope
        ON invocations (
          tenant_id,
          project_id,
          json_extract(payload_json, '$.taskId'),
          json_extract(payload_json, '$.purpose'),
          created_at
        );
      CREATE INDEX IF NOT EXISTS idx_invocation_events_scope_invocation
        ON invocation_events (tenant_id, project_id, invocation_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_invocation_events_open_scan
        ON invocation_events (project_id, event_type, julianday(occurred_at), invocation_id, sequence);

      CREATE TRIGGER IF NOT EXISTS invocations_no_update
        BEFORE UPDATE ON invocations BEGIN
          SELECT RAISE(ABORT, 'invocations are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS invocations_no_delete
        BEFORE DELETE ON invocations BEGIN
          SELECT RAISE(ABORT, 'invocations are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS invocation_events_no_update
        BEFORE UPDATE ON invocation_events BEGIN
          SELECT RAISE(ABORT, 'invocation events are immutable');
        END;
      CREATE TRIGGER IF NOT EXISTS invocation_events_no_delete
        BEFORE DELETE ON invocation_events BEGIN
          SELECT RAISE(ABORT, 'invocation events are immutable');
        END;
    `);
  }

  private bindProject(rootDigest: string): string {
    const projectId = this.idFactory();
    this.db.prepare(`
      INSERT INTO invocation_project_bindings (root_digest, project_id, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT (root_digest) DO NOTHING
    `).run(rootDigest, projectId, this.now());
    const binding = this.db.prepare(
      'SELECT project_id FROM invocation_project_bindings WHERE root_digest = ?',
    ).get(rootDigest) as { project_id: string } | undefined;
    if (!binding) {
      throw new InvocationReceiptStoreError('INVOCATION_NOT_FOUND', 'Project binding was not persisted');
    }
    return binding.project_id;
  }

  private readProjectBinding(rootDigest: string): string {
    try {
      const binding = this.db.prepare(
        'SELECT project_id FROM invocation_project_bindings WHERE root_digest = ?',
      ).get(rootDigest) as { project_id: string } | undefined;
      if (!binding) {
        throw new InvocationReceiptStoreError(
          'READ_ONLY',
          'Invocation receipt project binding does not exist',
        );
      }
      return binding.project_id;
    } catch (error) {
      if (error instanceof InvocationReceiptStoreError) throw error;
      throw new InvocationReceiptStoreError(
        'INTEGRITY_FAILURE',
        'Invocation receipt project binding is unreadable',
      );
    }
  }

  private assertScope(scope: InvocationScope): void {
    requireIdentity('tenantId', scope.tenantId);
    requireIdentity('projectId', scope.projectId);
    if (scope.projectId !== this.projectId) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Receipt project scope does not match this store binding',
      );
    }
  }

  declare(receipt: InvocationReceipt): InvocationDeclarationResult {
    if (this.readOnly) {
      throw new InvocationReceiptStoreError('READ_ONLY', 'Invocation receipt store is read-only');
    }
    const scope = { tenantId: receipt.tenantId, projectId: receipt.projectId };
    this.assertScope(scope);
    requireIdentity('invocationId', receipt.invocationId);
    requireIdentity('idempotencyKey', receipt.idempotencyKey);
    if (!validReceiptShape(receipt)) {
      throw new InvocationReceiptStoreError('IDEMPOTENCY_CONFLICT', 'Unsupported receipt schema version');
    }
    if (!hasKnownReceiptReasons(receipt)) {
      throw new InvocationReceiptStoreError('INVALID_TRANSITION', 'Unknown invocation receipt reason code');
    }
    const payloadJson = canonicalJson(receipt);
    const payloadHash = sha256(payloadJson);
    const declareTransaction = this.db.transaction((): InvocationDeclarationResult => {
      const existing = this.selectInvocationByKey.get({
        tenant_id: receipt.tenantId,
        project_id: receipt.projectId,
        idempotency_key: receipt.idempotencyKey,
      }) as InvocationRow | undefined;
      if (existing) {
        const persisted = this.verifyInvocationRow(existing);
        const retryPayloadHash = sha256(canonicalJson({ ...receipt, createdAt: persisted.createdAt }));
        if (existing.payload_hash !== retryPayloadHash || existing.invocation_id !== receipt.invocationId) {
          throw new InvocationReceiptStoreError(
            'IDEMPOTENCY_CONFLICT',
            'Invocation idempotency key already exists with different immutable content',
          );
        }
        return { ref: this.toRef(receipt), created: false };
      }
      this.db.prepare(`
        INSERT INTO invocations (
          invocation_id, tenant_id, project_id, idempotency_key, schema_version,
          payload_json, payload_hash, created_at
        ) VALUES (
          @invocation_id, @tenant_id, @project_id, @idempotency_key, @schema_version,
          @payload_json, @payload_hash, @created_at
        )
      `).run({
        invocation_id: receipt.invocationId,
        tenant_id: receipt.tenantId,
        project_id: receipt.projectId,
        idempotency_key: receipt.idempotencyKey,
        schema_version: receipt.schemaVersion,
        payload_json: payloadJson,
        payload_hash: payloadHash,
        created_at: receipt.createdAt,
      });
      return { ref: this.toRef(receipt), created: true };
    });
    return declareTransaction.immediate();
  }

  append(scope: InvocationScope, invocationId: string, event: InvocationEvent): StoredInvocationEvent {
    if (this.readOnly) {
      throw new InvocationReceiptStoreError('READ_ONLY', 'Invocation receipt store is read-only');
    }
    return this.appendGuarded(scope, invocationId, event);
  }

  declareTaskReceiptAtomic(receipt: InvocationReceipt): InvocationDeclarationResult {
    if (this.readOnly) {
      throw new InvocationReceiptStoreError('READ_ONLY', 'Invocation receipt store is read-only');
    }
    if (receipt.taskId === null || receipt.purpose !== 'worker-execution') {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Atomic task receipt ownership is limited to worker-execution receipts',
      );
    }
    const transaction = this.db.transaction((): InvocationDeclarationResult => {
      const conflict = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM invocations
        WHERE tenant_id = @tenant_id
          AND project_id = @project_id
          AND invocation_id <> @invocation_id
          AND json_extract(payload_json, '$.taskId') = @task_id
          AND json_extract(payload_json, '$.purpose') = 'worker-execution'
      `).get({
        tenant_id: receipt.tenantId,
        project_id: receipt.projectId,
        invocation_id: receipt.invocationId,
        task_id: receipt.taskId,
      }) as { count: number };
      if (!Number.isSafeInteger(conflict.count) || conflict.count !== 0) {
        throw new InvocationReceiptStoreError(
          'RECONCILIATION_CONFLICT',
          'Task execution receipt already has a durable authority owner',
        );
      }
      return this.declare(receipt);
    });
    return transaction.immediate();
  }

  /**
   * Publish one declaration and its bounded lifecycle suffix in a single
   * SQLite transaction. Nested store operations use savepoints; an exception
   * rolls back the declaration and every event, so recovery never observes a
   * half-written legacy reconciliation head.
   */
  writeAtomic(input: InvocationAtomicWrite): InvocationAtomicWriteResult {
    if (this.readOnly) {
      throw new InvocationReceiptStoreError('READ_ONLY', 'Invocation receipt store is read-only');
    }
    if (input.events.length < 1 || input.events.length > 4) {
      throw new InvocationReceiptStoreError(
        'INVALID_TRANSITION',
        'Atomic invocation writes require between one and four events',
      );
    }
    const transaction = this.db.transaction((): InvocationAtomicWriteResult => {
      if (
        input.requireSynchronousPrecondition
        && input.requireSynchronousPrecondition() !== true
      ) {
        throw new InvocationReceiptStoreError(
          'RECONCILIATION_CONFLICT',
          'Atomic invocation write precondition changed before persistence',
        );
      }
      const guard = input.requireTaskReceiptAbsence;
      if (guard) {
        this.assertScope(guard);
        requireIdentity('taskId', guard.taskId);
        if (
          guard.tenantId !== input.receipt.tenantId
          || guard.projectId !== input.receipt.projectId
          || guard.taskId !== input.receipt.taskId
          || guard.purpose !== input.receipt.purpose
        ) {
          throw new InvocationReceiptStoreError(
            'SCOPE_MISMATCH',
            'Atomic task receipt guard does not match the receipt identity',
          );
        }
        const conflict = this.db.prepare(`
          SELECT COUNT(*) AS count
          FROM invocations
          WHERE tenant_id = @tenant_id
            AND project_id = @project_id
            AND invocation_id <> @invocation_id
            AND json_extract(payload_json, '$.taskId') = @task_id
            AND json_extract(payload_json, '$.purpose') = @purpose
        `).get({
          tenant_id: guard.tenantId,
          project_id: guard.projectId,
          invocation_id: input.receipt.invocationId,
          task_id: guard.taskId,
          purpose: guard.purpose,
        }) as { count: number };
        if (!Number.isSafeInteger(conflict.count) || conflict.count !== 0) {
          throw new InvocationReceiptStoreError(
            'RECONCILIATION_CONFLICT',
            'Task receipt ownership changed before atomic reconciliation',
          );
        }
      }
      const declaration = this.declare(input.receipt);
      const events = input.events.map(event => this.append(
        input.receipt,
        input.receipt.invocationId,
        event,
      ));
      const view = this.get(input.receipt, input.receipt.invocationId);
      if (!view) {
        throw new InvocationReceiptStoreError(
          'INTEGRITY_FAILURE',
          'Atomic invocation write could not read its persisted receipt',
        );
      }
      return { declaration, events, view };
    });
    return transaction.immediate();
  }

  scanTaskReceipts(input: InvocationTaskReceiptScan): readonly InvocationReceiptView[] {
    this.assertScope(input);
    requireIdentity('taskId', input.taskId);
    const limit = input.limit ?? 32;
    if (!Number.isInteger(limit) || limit < 1 || limit > 256) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Task receipt scan limit must be an integer from 1 to 256',
      );
    }
    const rows = this.db.prepare(`
      SELECT invocation_id, tenant_id, project_id, payload_json, payload_hash
      FROM invocations
      WHERE tenant_id = @tenant_id
        AND project_id = @project_id
        AND json_extract(payload_json, '$.taskId') = @task_id
        AND (
          @purpose IS NULL
          OR json_extract(payload_json, '$.purpose') = @purpose
        )
      ORDER BY julianday(created_at) DESC, invocation_id DESC
      LIMIT @limit
    `).all({
      tenant_id: input.tenantId,
      project_id: input.projectId,
      task_id: input.taskId,
      purpose: input.purpose ?? null,
      limit,
    }) as InvocationRow[];
    return Object.freeze(rows.map(row => this.viewFromRow(row)));
  }

  scanTaskReceiptsBulk(
    input: InvocationTaskReceiptBulkScan,
  ): readonly InvocationTaskReceiptGroup[] {
    if (
      !isRecord(input)
      || !exactKeys(input, ['tenantId', 'projectId', 'taskIds', 'purpose'])
    ) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Bulk task receipt scan has unknown or missing fields',
      );
    }
    this.assertScope(input);
    if (typeof input.purpose !== 'string' || !RECEIPT_PURPOSES.has(input.purpose)) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Bulk task receipt scan purpose is unknown',
      );
    }
    if (
      !Array.isArray(input.taskIds)
      || input.taskIds.length > MAX_TASK_RECEIPT_BULK_INPUT
      || Object.keys(input.taskIds).length !== input.taskIds.length
    ) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        `Bulk task receipt scan requires a dense array of at most ${MAX_TASK_RECEIPT_BULK_INPUT} task ids`,
      );
    }
    const groups = this.scanProjectTaskReceiptsBulk({
      projectId: input.projectId,
      purpose: input.purpose,
      requests: input.taskIds.map(taskId => ({
        tenantId: input.tenantId,
        taskId,
      })),
    });
    return Object.freeze(groups.map(group => Object.freeze({
      taskId: group.taskId,
      receipts: group.receipts,
    })));
  }

  scanProjectTaskReceiptsBulk(
    input: InvocationProjectTaskReceiptBulkScan,
  ): readonly InvocationScopedTaskReceiptGroup[] {
    if (
      !isRecord(input)
      || !exactKeys(input, ['projectId', 'requests', 'purpose'])
    ) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Project task receipt scan has unknown or missing fields',
      );
    }
    requireIdentity('projectId', input.projectId);
    if (input.projectId !== this.projectId) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Receipt project scope does not match this store binding',
      );
    }
    if (typeof input.purpose !== 'string' || !RECEIPT_PURPOSES.has(input.purpose)) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        'Project task receipt scan purpose is unknown',
      );
    }
    if (
      !Array.isArray(input.requests)
      || input.requests.length > MAX_TASK_RECEIPT_BULK_INPUT
      || Object.keys(input.requests).length !== input.requests.length
    ) {
      throw new InvocationReceiptStoreError(
        'SCOPE_MISMATCH',
        `Project task receipt scan requires a dense array of at most ${MAX_TASK_RECEIPT_BULK_INPUT} requests`,
      );
    }

    const requestIndex = new Map<string, Map<string, InvocationScopedTaskReceiptRequest>>();
    const requests: InvocationScopedTaskReceiptRequest[] = [];
    for (const request of input.requests) {
      if (
        !isRecord(request)
        || !exactKeys(request, ['tenantId', 'taskId'])
        || typeof request.tenantId !== 'string'
        || typeof request.taskId !== 'string'
      ) {
        throw new InvocationReceiptStoreError(
          'SCOPE_MISMATCH',
          'Project task receipt request has unknown or missing fields',
        );
      }
      requireIdentity('tenantId', request.tenantId);
      requireIdentity('taskId', request.taskId);
      let tenantRequests = requestIndex.get(request.tenantId);
      if (!tenantRequests) {
        tenantRequests = new Map();
        requestIndex.set(request.tenantId, tenantRequests);
      }
      if (!tenantRequests.has(request.taskId)) {
        const canonicalRequest = {
          tenantId: request.tenantId,
          taskId: request.taskId,
        };
        tenantRequests.set(request.taskId, canonicalRequest);
        requests.push(canonicalRequest);
      }
    }
    requests.sort((left, right) => (
        left.tenantId < right.tenantId
          ? -1
          : left.tenantId > right.tenantId
            ? 1
            : left.taskId < right.taskId
              ? -1
              : left.taskId > right.taskId
                ? 1
                : 0
      ));
    if (requests.length === 0) return Object.freeze([]);

    const receiptsByTenantTask = new Map<string, Map<string, InvocationReceiptView[]>>();
    for (const request of requests) {
      let tenantReceipts = receiptsByTenantTask.get(request.tenantId);
      if (!tenantReceipts) {
        tenantReceipts = new Map();
        receiptsByTenantTask.set(request.tenantId, tenantReceipts);
      }
      tenantReceipts.set(request.taskId, []);
    }
    const receiptStatementCache = new Map<number, Statement>();
    const receiptStatementFor = (size: number): Statement => {
      const cached = receiptStatementCache.get(size);
      if (cached) return cached;
      const requestBindings = Array.from(
        { length: size },
        (_, index) => `(@tenant_id_${index}, @task_id_${index})`,
      ).join(', ');
      const statement = this.db.prepare(`
        WITH requested(tenant_id, task_id) AS (
          VALUES ${requestBindings}
        )
        SELECT
          i.invocation_id,
          i.tenant_id,
          i.project_id,
          i.payload_json,
          i.payload_hash
        FROM requested AS r
        JOIN invocations AS i
          INDEXED BY idx_invocations_task_scope
          ON i.tenant_id = r.tenant_id
          AND i.project_id = @project_id
          AND json_extract(i.payload_json, '$.taskId') = r.task_id
          AND json_extract(i.payload_json, '$.purpose') = @purpose
        ORDER BY
          i.tenant_id ASC,
          json_extract(i.payload_json, '$.taskId') ASC,
          julianday(i.created_at) DESC,
          i.invocation_id DESC
      `);
      receiptStatementCache.set(size, statement);
      return statement;
    };
    const eventStatementCache = new Map<number, Statement>();
    const eventStatementFor = (size: number): Statement => {
      const cached = eventStatementCache.get(size);
      if (cached) return cached;
      const identityBindings = Array.from(
        { length: size },
        (_, index) => `(@tenant_id_${index}, @invocation_id_${index})`,
      ).join(', ');
      const statement = this.db.prepare(`
        WITH requested(tenant_id, invocation_id) AS (
          VALUES ${identityBindings}
        )
        SELECT
          e.tenant_id,
          e.project_id,
          e.event_id,
          e.invocation_id,
          e.sequence,
          e.event_type,
          e.occurred_at,
          e.payload_json,
          e.payload_hash,
          e.prev_hash,
          e.event_hash
        FROM requested AS r
        JOIN invocation_events AS e
          INDEXED BY idx_invocation_events_scope_invocation
          ON e.tenant_id = r.tenant_id
          AND e.project_id = @project_id
          AND e.invocation_id = r.invocation_id
        ORDER BY e.tenant_id ASC, e.invocation_id ASC, e.sequence ASC
      `);
      eventStatementCache.set(size, statement);
      return statement;
    };

    const scanTransaction = this.db.transaction((): readonly InvocationScopedTaskReceiptGroup[] => {
      for (
        let offset = 0;
        offset < requests.length;
        offset += TASK_RECEIPT_BULK_CHUNK_SIZE
      ) {
        const chunk = requests.slice(offset, offset + TASK_RECEIPT_BULK_CHUNK_SIZE);
        const bindings: Record<string, string> = {
          project_id: input.projectId,
          purpose: input.purpose,
        };
        for (const [index, request] of chunk.entries()) {
          bindings[`tenant_id_${index}`] = request.tenantId;
          bindings[`task_id_${index}`] = request.taskId;
        }
        const rows = this.readBulkRows<InvocationRow>(
          'task-receipts',
          receiptStatementFor(chunk.length),
          bindings,
        );
        const verified = rows.map(row => {
          const persisted = this.verifyInvocationRow(row);
          const taskReceipts = persisted.taskId === null
            ? undefined
            : receiptsByTenantTask.get(persisted.tenantId)?.get(persisted.taskId);
          if (
            persisted.taskId === null
            || taskReceipts === undefined
            || persisted.purpose !== input.purpose
            || persisted.projectId !== input.projectId
          ) {
            throw new InvocationReceiptStoreError(
              'INTEGRITY_FAILURE',
              'Bulk task receipt scan returned an out-of-scope receipt',
            );
          }
          return persisted;
        });
        const invocationIdentities = verified
          .map(persisted => ({
            tenantId: persisted.tenantId,
            invocationId: persisted.invocationId,
          }))
          .sort((left, right) => (
            left.tenantId < right.tenantId
              ? -1
              : left.tenantId > right.tenantId
                ? 1
                : left.invocationId < right.invocationId
                  ? -1
                  : left.invocationId > right.invocationId
                    ? 1
                    : 0
          ));
        const invocationIndex = new Map<string, Set<string>>();
        const eventsByTenantInvocation = new Map<string, Map<string, EventRow[]>>();
        for (const identity of invocationIdentities) {
          let tenantInvocations = invocationIndex.get(identity.tenantId);
          if (!tenantInvocations) {
            tenantInvocations = new Set();
            invocationIndex.set(identity.tenantId, tenantInvocations);
          }
          tenantInvocations.add(identity.invocationId);
        }
        for (
          let invocationOffset = 0;
          invocationOffset < invocationIdentities.length;
          invocationOffset += TASK_RECEIPT_BULK_CHUNK_SIZE
        ) {
          const invocationChunk = invocationIdentities.slice(
            invocationOffset,
            invocationOffset + TASK_RECEIPT_BULK_CHUNK_SIZE,
          );
          const eventBindings: Record<string, string> = {
            project_id: input.projectId,
          };
          for (const [index, identity] of invocationChunk.entries()) {
            eventBindings[`tenant_id_${index}`] = identity.tenantId;
            eventBindings[`invocation_id_${index}`] = identity.invocationId;
          }
          const eventRows = this.readBulkRows<ScopedEventRow>(
            'receipt-events',
            eventStatementFor(invocationChunk.length),
            eventBindings,
          );
          for (const eventRow of eventRows) {
            if (
              eventRow.project_id !== input.projectId
              || !invocationIndex.get(eventRow.tenant_id)?.has(eventRow.invocation_id)
            ) {
              throw new InvocationReceiptStoreError(
                'INTEGRITY_FAILURE',
                'Bulk task receipt scan returned an event without its receipt',
              );
            }
            let tenantEvents = eventsByTenantInvocation.get(eventRow.tenant_id);
            if (!tenantEvents) {
              tenantEvents = new Map();
              eventsByTenantInvocation.set(eventRow.tenant_id, tenantEvents);
            }
            const grouped = tenantEvents.get(eventRow.invocation_id) ?? [];
            grouped.push(eventRow);
            tenantEvents.set(eventRow.invocation_id, grouped);
          }
        }
        for (const persisted of verified) {
          const view = this.viewFromVerifiedReceipt(
            persisted,
            eventsByTenantInvocation
              .get(persisted.tenantId)
              ?.get(persisted.invocationId) ?? [],
          );
          receiptsByTenantTask
            .get(persisted.tenantId)!
            .get(persisted.taskId!)!
            .push(view);
        }
      }

      return Object.freeze(requests.map(request => Object.freeze({
        tenantId: request.tenantId,
        projectId: input.projectId,
        taskId: request.taskId,
        receipts: Object.freeze(
          receiptsByTenantTask.get(request.tenantId)?.get(request.taskId) ?? [],
        ),
      })));
    });
    return scanTransaction.deferred();
  }

  private readBulkRows<Row>(
    kind: 'task-receipts' | 'receipt-events',
    statement: Statement,
    bindings: Readonly<Record<string, string>>,
  ): Row[] {
    void kind;
    return statement.all(bindings) as Row[];
  }

  private appendGuarded(
    scope: InvocationScope,
    invocationId: string,
    event: InvocationEvent,
    expectedHeadHash?: string,
  ): StoredInvocationEvent {
    this.assertScope(scope);
    const appendTransaction = this.db.transaction((): StoredInvocationEvent => {
      const invocation = this.selectInvocation.get({
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        invocation_id: invocationId,
      }) as InvocationRow | undefined;
      if (!invocation) {
        throw new InvocationReceiptStoreError('INVOCATION_NOT_FOUND', 'Invocation not found in scope');
      }
      const receipt = this.verifyInvocationRow(invocation);
      const authoredOccurredAt = isRecord(event) && typeof event.occurredAt === 'string'
        ? event.occurredAt
        : undefined;
      assertEventPayload(receipt, event, authoredOccurredAt);
      const semanticJson = canonicalJson({ type: event.type, payload: event.payload });
      const payloadHash = sha256(semanticJson);
      const duplicate = this.selectEvent.get({
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        event_id: event.eventId,
      }) as EventRow | undefined;
      if (duplicate) {
        if (duplicate.invocation_id !== invocationId || duplicate.payload_hash !== payloadHash) {
          throw new InvocationReceiptStoreError(
            'IDEMPOTENCY_CONFLICT',
            'Invocation event id already exists with different immutable content',
          );
        }
        const existingEvents = this.verifyEventRows(this.selectEvents.all({
          tenant_id: scope.tenantId,
          project_id: scope.projectId,
          invocation_id: invocationId,
        }) as EventRow[], invocationId, receipt);
        const verifiedDuplicate = existingEvents.find((stored) => stored.eventId === event.eventId);
        if (!verifiedDuplicate) {
          throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation event lookup mismatch');
        }
        if (
          event.occurredAt !== undefined
          && event.occurredAt !== verifiedDuplicate.occurredAt
        ) {
          throw new InvocationReceiptStoreError(
            'IDEMPOTENCY_CONFLICT',
            'Invocation event retry timestamp differs from stored immutable content',
          );
        }
        return verifiedDuplicate;
      }
      const existingEvents = this.verifyEventRows(this.selectEvents.all({
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        invocation_id: invocationId,
      }) as EventRow[], invocationId, receipt);
      const previous = existingEvents.at(-1);
      if (expectedHeadHash !== undefined && previous?.hash !== expectedHeadHash) {
        throw new InvocationReceiptStoreError(
          'RECONCILIATION_CONFLICT',
          'Open dispatch changed after scan; reconciliation refused',
        );
      }
      const sequence = (previous?.sequence ?? 0) + 1;
      const occurredAt = event.occurredAt ?? this.now();
      requireTimestamp('Invocation event occurredAt', occurredAt);
      assertEventPayload(receipt, {
        ...event,
        occurredAt,
      }, occurredAt);
      assertEventChronology(receipt.createdAt, previous?.occurredAt ?? null, occurredAt);
      assertEventAuthorityTransition(previous, { ...event, occurredAt });
      const previousHash = previous?.hash ?? null;
      const eventHash = sha256(canonicalJson({
        invocationId,
        sequence,
        eventId: event.eventId,
        eventType: event.type,
        occurredAt,
        payloadHash,
        previousHash,
      }));
      this.db.prepare(`
        INSERT INTO invocation_events (
          event_id, invocation_id, tenant_id, project_id, sequence, event_type,
          occurred_at, payload_json, payload_hash, prev_hash, event_hash
        ) VALUES (
          @event_id, @invocation_id, @tenant_id, @project_id, @sequence, @event_type,
          @occurred_at, @payload_json, @payload_hash, @prev_hash, @event_hash
        )
      `).run({
        event_id: event.eventId,
        invocation_id: invocationId,
        tenant_id: scope.tenantId,
        project_id: scope.projectId,
        sequence,
        event_type: event.type,
        occurred_at: occurredAt,
        payload_json: canonicalJson(event.payload),
        payload_hash: payloadHash,
        prev_hash: previousHash,
        event_hash: eventHash,
      });
      return {
        eventId: event.eventId,
        invocationId,
        sequence,
        type: event.type,
        occurredAt,
        payload: event.payload,
        payloadHash,
        previousHash,
        hash: eventHash,
      };
    });
    return appendTransaction.immediate();
  }

  scanOpenDispatches(input: InvocationOpenDispatchScan): readonly InvocationOpenDispatchCandidate[] {
    requireTimestamp('Open-dispatch cutoff', input.before);
    const parsedBefore = new Date(input.before);
    const before = parsedBefore.toISOString();
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new InvocationReceiptStoreError('SCOPE_MISMATCH', 'Open-dispatch scan limit must be an integer from 1 to 1000');
    }
    if (input.tenantId !== undefined) requireIdentity('tenantId', input.tenantId);
    if (input.invocationId !== undefined) requireIdentity('invocationId', input.invocationId);
    const scanTransaction = this.db.transaction((): readonly InvocationOpenDispatchCandidate[] => {
      const rows = this.db.prepare(`
        WITH latest AS (
          SELECT invocation_id, MAX(sequence) AS sequence
          FROM invocation_events
          WHERE project_id = @project_id
          GROUP BY invocation_id
        )
        SELECT i.invocation_id, i.tenant_id, i.project_id, i.payload_json, i.payload_hash
        FROM invocations i
        JOIN latest l ON l.invocation_id = i.invocation_id
        JOIN invocation_events e
          ON e.invocation_id = l.invocation_id AND e.sequence = l.sequence
        WHERE i.project_id = @project_id
          AND (@tenant_id IS NULL OR i.tenant_id = @tenant_id)
          AND (@invocation_id IS NULL OR i.invocation_id = @invocation_id)
          AND e.event_type = 'dispatch_started'
          AND julianday(e.occurred_at) <= julianday(@before)
        ORDER BY julianday(e.occurred_at) ASC, i.invocation_id ASC
        LIMIT @limit
      `).all({
        project_id: this.projectId,
        tenant_id: input.tenantId ?? null,
        invocation_id: input.invocationId ?? null,
        before,
        limit,
      }) as InvocationRow[];

      return rows.map((row): InvocationOpenDispatchCandidate => {
        const receipt = this.verifyInvocationRow(row);
        const events = this.verifyEventRows(this.selectEvents.all({
          tenant_id: row.tenant_id,
          project_id: row.project_id,
          invocation_id: row.invocation_id,
        }) as EventRow[], row.invocation_id, receipt);
        const dispatchEvent = events.at(-1);
        if (!dispatchEvent || dispatchEvent.type !== 'dispatch_started') {
          throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Open-dispatch scan head is invalid');
        }
        return {
          ref: this.toRef(receipt),
          receipt,
          dispatchEvent,
        };
      });
    });
    return scanTransaction.deferred();
  }

  reconcileOpenDispatch(
    candidate: InvocationOpenDispatchCandidate,
    reconciliation: InvocationDispatchReconciliation,
  ): StoredInvocationEvent {
    this.assertScope(candidate.ref);
    requireIdentity('invocationId', candidate.ref.invocationId);
    requireIdentity('eventId', reconciliation.eventId);
    requireIdentity('evidenceRef', reconciliation.evidenceRef);
    if (reconciliation.occurredAt !== undefined) {
      requireTimestamp('Reconciliation occurredAt', reconciliation.occurredAt);
    }
    if (candidate.dispatchEvent.invocationId !== candidate.ref.invocationId
      || candidate.dispatchEvent.type !== 'dispatch_started') {
      throw new InvocationReceiptStoreError('RECONCILIATION_CONFLICT', 'Candidate is not an open dispatch head');
    }
    if (!Number.isFinite(reconciliation.durationMs) || reconciliation.durationMs < 0) {
      throw new InvocationReceiptStoreError('RECONCILIATION_CONFLICT', 'Reconciliation duration must be non-negative');
    }
    return this.appendGuarded(candidate.ref, candidate.ref.invocationId, {
      eventId: reconciliation.eventId,
      type: 'transport_settled',
      ...(reconciliation.occurredAt ? { occurredAt: reconciliation.occurredAt } : {}),
      payload: {
        outcome: reconciliation.outcome,
        exitCode: reconciliation.exitCode,
        signal: reconciliation.signal,
        reasonCode: reconciliation.reasonCode,
        durationMs: reconciliation.durationMs,
        reconciliation: {
          evidenceRef: reconciliation.evidenceRef,
          dispatchEventHash: candidate.dispatchEvent.hash,
        },
      },
    }, candidate.dispatchEvent.hash);
  }

  get(scope: InvocationScope, invocationId: string): InvocationReceiptView | null {
    this.assertScope(scope);
    const row = this.selectInvocation.get({
      tenant_id: scope.tenantId,
      project_id: scope.projectId,
      invocation_id: invocationId,
    }) as InvocationRow | undefined;
    if (!row) return null;
    return this.viewFromRow(row);
  }

  private viewFromRow(row: InvocationRow): InvocationReceiptView {
    const receipt = this.verifyInvocationRow(row);
    return this.viewFromVerifiedReceipt(receipt, this.selectEvents.all({
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      invocation_id: row.invocation_id,
    }) as EventRow[]);
  }

  private viewFromVerifiedReceipt(
    receipt: InvocationReceipt,
    eventRows: EventRow[],
  ): InvocationReceiptView {
    const events = this.verifyEventRows(eventRows, receipt.invocationId, receipt);
    let transportOutcome: InvocationReceiptView['transportOutcome'] = 'not_dispatched';
    let consumerOutcome: InvocationReceiptView['consumerOutcome'] = 'unknown';
    let taskDisposition: InvocationReceiptView['taskDisposition'] = null;
    if (events.some(event => event.type === 'dispatch_started')) transportOutcome = 'unknown';
    for (const event of events) {
      if (event.type === 'transport_settled') {
        const payload = event.payload as Extract<InvocationEvent, { type: 'transport_settled' }>['payload'];
        transportOutcome = payload.outcome;
      }
      if (event.type === 'consumer_settled') {
        const payload = event.payload as Extract<InvocationEvent, { type: 'consumer_settled' }>['payload'];
        consumerOutcome = payload.outcome;
        taskDisposition = payload.taskDisposition ?? null;
      }
    }
    return { receipt, events, transportOutcome, consumerOutcome, taskDisposition };
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  private toRef(receipt: InvocationReceipt): InvocationReceiptRef {
    return {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      invocationId: receipt.invocationId,
      tenantId: receipt.tenantId,
      projectId: receipt.projectId,
    };
  }

  private verifyInvocationRow(row: InvocationRow): InvocationReceipt {
    if (sha256(row.payload_json) !== row.payload_hash) {
      throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation receipt payload hash mismatch');
    }
    let receipt: InvocationReceipt;
    try {
      receipt = JSON.parse(row.payload_json) as InvocationReceipt;
    } catch {
      throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation receipt payload is not JSON');
    }
    if (!validReceiptShape(receipt)
      || receipt.schemaVersion !== INVOCATION_RECEIPT_SCHEMA_VERSION
      || receipt.invocationId !== row.invocation_id
      || receipt.tenantId !== row.tenant_id
      || receipt.projectId !== row.project_id) {
      throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation receipt envelope mismatch');
    }
    if (!hasKnownReceiptReasons(receipt)) {
      throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation receipt reason code is unknown');
    }
    return receipt;
  }

  private verifyEventRows(
    rows: EventRow[],
    invocationId: string,
    receipt: InvocationReceipt,
  ): StoredInvocationEvent[] {
    const events: StoredInvocationEvent[] = [];
    let previousHash: string | null = null;
    for (const [index, row] of rows.entries()) {
      if (
        row.invocation_id !== invocationId
        || !boundedString(row.event_id, MAX_EVENT_ID_LENGTH)
        || row.event_id !== row.event_id.trim()
        || !Number.isSafeInteger(row.sequence)
        || row.sequence !== index + 1
        || !validTimestamp(row.occurred_at)
        || (row.prev_hash !== null
          && (typeof row.prev_hash !== 'string' || !SHA256_RE.test(row.prev_hash)))
        || row.prev_hash !== previousHash
        || typeof row.payload_hash !== 'string'
        || !SHA256_RE.test(row.payload_hash)
        || typeof row.event_hash !== 'string'
        || !SHA256_RE.test(row.event_hash)
        || !EVENT_TYPES.has(row.event_type as InvocationEvent['type'])
      ) {
        throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation event envelope or chain mismatch');
      }
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload_json) as unknown;
      } catch {
        throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation event payload is not JSON');
      }
      const candidate: unknown = {
        eventId: row.event_id,
        type: row.event_type,
        occurredAt: row.occurred_at,
        payload,
      };
      try {
        assertEventPayload(receipt, candidate, row.occurred_at);
      } catch (error) {
        if (error instanceof InvocationReceiptStoreError) {
          throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', error.message);
        }
        throw error;
      }
      const canonicalPayload = canonicalJson(candidate.payload);
      const semanticHash = sha256(canonicalJson({
        type: candidate.type,
        payload: candidate.payload,
      }));
      const expectedHash = sha256(canonicalJson({
        invocationId,
        sequence: row.sequence,
        eventId: row.event_id,
        eventType: candidate.type,
        occurredAt: row.occurred_at,
        payloadHash: semanticHash,
        previousHash,
      }));
      if (
        canonicalPayload !== row.payload_json
        || semanticHash !== row.payload_hash
        || expectedHash !== row.event_hash
      ) {
        throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', 'Invocation event hash mismatch');
      }
      const event: StoredInvocationEvent = {
        eventId: row.event_id,
        invocationId,
        sequence: row.sequence,
        type: candidate.type,
        occurredAt: row.occurred_at,
        payload: candidate.payload,
        payloadHash: row.payload_hash,
        previousHash,
        hash: row.event_hash,
      };
      try {
        assertEventChronology(
          receipt.createdAt,
          events.at(-1)?.occurredAt ?? null,
          event.occurredAt,
        );
        assertEventAuthorityTransition(events.at(-1), candidate);
      } catch (error) {
        if (error instanceof InvocationReceiptStoreError) {
          throw new InvocationReceiptStoreError('INTEGRITY_FAILURE', error.message);
        }
        throw error;
      }
      events.push(event);
      previousHash = event.hash;
    }
    return events;
  }
}
