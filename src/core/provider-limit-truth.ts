import { createHash, randomUUID } from 'node:crypto';

import type {
  InvocationAuthMode,
  InvocationExecutionBackend,
  InvocationEvidenceState,
  InvocationScope,
  InvocationTransport,
} from './invocation-receipt.js';
import {
  assertCanonicalModelApiId,
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
  assertOpaqueSha256,
} from './provider-truth.js';
import type { LimitEvidence } from './role-invocation-resolver.js';

export const PROVIDER_LIMIT_SCHEMA_VERSION = 1 as const;

export type ProviderLimitUnit = 'percent' | 'requests' | 'tokens' | 'credits' | 'usd';
export type ProviderLimitWindowKind =
  | 'session'
  | 'week-all'
  | 'week-model'
  | 'rate-window'
  | 'billing-window'
  | 'custom';
export type ProviderLimitSourceKind =
  | 'provider-cli'
  | 'provider-api'
  | 'http-headers'
  | 'historical-transcript'
  | 'local-runtime'
  | 'operator';
export type ProviderLimitDecision = 'allow' | 'hold';
export type ProviderLimitPressure = 'ok' | 'warn' | 'block' | 'unknown';
export type ProviderLimitReasonCode =
  | 'none'
  | 'source_unknown'
  | 'source_unavailable'
  | 'incomplete_windows'
  | 'threshold_block'
  | 'threshold_observed'
  | 'remaining_floor'
  | 'evidence_not_yet_valid'
  | 'evidence_expired';

export interface ProviderLimitResetEvidence {
  readonly state: 'known' | 'unknown';
  readonly at: string | null;
  /** Hash of ambiguous provider display text; the text itself is never persisted. */
  readonly displayRefHash: string | null;
}

export interface ProviderLimitWindow {
  readonly windowId: string;
  readonly kind: ProviderLimitWindowKind;
  readonly model: string | null;
  readonly unit: ProviderLimitUnit;
  readonly consumed: number | null;
  readonly remaining: number | null;
  readonly limit: number | null;
  readonly reset: ProviderLimitResetEvidence;
}

export interface ProviderLimitPolicy {
  readonly policyRef: string;
  /** Absent on legacy callers and therefore resolved as `enforce`. */
  readonly ratioEnforcement?: 'enforce' | 'observe_only';
  readonly warnAtRatio: number;
  readonly blockAtRatio: number;
  readonly minimumRemaining: Partial<Record<ProviderLimitUnit, number>>;
}

export interface ProviderLimitObservation extends InvocationScope {
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly accountRefHash: string | null;
  /** Opaque account/endpoint quota bucket. Local runtimes must hash their exact endpoint/runtime. */
  readonly quotaScopeRefHash: string;
  readonly authMode: InvocationAuthMode;
  readonly backend: {
    readonly transport: InvocationTransport;
    readonly executionBackend: InvocationExecutionBackend;
    readonly endpointRefHash: string | null;
  };
  readonly state: Exclude<InvocationEvidenceState, 'stale'>;
  readonly requiredWindowIds: readonly string[];
  readonly windows: readonly ProviderLimitWindow[];
  readonly source: {
    readonly kind: ProviderLimitSourceKind;
    readonly authority: 'authoritative' | 'advisory';
    readonly operatorApprovalRef: string | null;
    readonly evidenceRef: string;
    readonly fetchedAt: string;
    readonly expiresAt: string;
    /** Explicit terminal reservation events proven incorporated by this provider observation. */
    readonly incorporatedReservationEventRefs: readonly string[];
  };
  readonly evidenceRefs?: readonly string[];
}

export interface ProviderLimitResult extends InvocationScope {
  readonly schemaVersion: typeof PROVIDER_LIMIT_SCHEMA_VERSION;
  readonly limitResultId: string;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly authMode: InvocationAuthMode;
  readonly backend: ProviderLimitObservation['backend'];
  readonly state: InvocationEvidenceState;
  readonly decision: ProviderLimitDecision;
  readonly pressure: ProviderLimitPressure;
  readonly reasonCode: ProviderLimitReasonCode;
  readonly requiredWindowIds: readonly string[];
  readonly windows: readonly ProviderLimitWindow[];
  readonly policy: ProviderLimitPolicy;
  readonly source: ProviderLimitObservation['source'];
  readonly evidenceRefs: readonly string[];
}

export interface ProviderLimitResultDependencies {
  readonly idFactory?: () => string;
}

export interface ProviderLimitReservationRequest extends InvocationScope {
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly runId: string;
  readonly taskId: string | null;
  readonly callId: string;
  readonly attemptId: string;
  readonly fenceTokenHash: string;
  readonly receiptRef: string;
  readonly reachabilityEvidenceRef: string;
  readonly provider: string;
  readonly model: string;
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly authMode: InvocationAuthMode;
  readonly backend: ProviderLimitObservation['backend'];
  readonly estimates: readonly {
    readonly windowId: string;
    readonly unit: ProviderLimitUnit;
    readonly amount: number;
  }[];
  readonly estimateEvidenceRefs: readonly string[];
  readonly leaseExpiresAt: string;
  readonly requestedAt: string;
}

export type ProviderLimitReservationReason =
  | 'allowed'
  | 'snapshot_missing'
  | 'snapshot_not_usable'
  | 'window_missing'
  | 'unit_mismatch'
  | 'model_mismatch'
  | 'estimate_scope_mismatch'
  | 'lease_outlives_snapshot'
  | 'policy_block'
  | 'insufficient_remaining';

export interface ProviderLimitReservation extends ProviderLimitReservationRequest {
  readonly snapshotEvidenceRef: string | null;
  readonly decision: ProviderLimitDecision;
  readonly reasonCode: ProviderLimitReservationReason;
  readonly effectiveRemaining: Readonly<Record<string, number>>;
  readonly appliedPolicy: ProviderLimitPolicy;
}

export interface ProviderLimitReservationEvent {
  readonly eventId: string;
  readonly type: 'dispatched' | 'consumed' | 'released';
  readonly occurredAt: string;
  readonly fenceTokenHash: string;
  readonly evidenceRef: string;
  readonly terminationEvidenceRef?: string;
  readonly terminationAuthorityRef?: string;
  readonly actual?: readonly {
    readonly windowId: string;
    readonly unit: ProviderLimitUnit;
    readonly amount: number;
  }[];
}

const AUTH_MODES = new Set<InvocationAuthMode>(['subscription', 'api', 'hybrid', 'local', 'unknown']);
const EVIDENCE_STATES = new Set<InvocationEvidenceState>(['known', 'unknown', 'stale', 'unavailable']);
const LIMIT_UNITS = new Set<ProviderLimitUnit>(['percent', 'requests', 'tokens', 'credits', 'usd']);
const WINDOW_KINDS = new Set<ProviderLimitWindowKind>([
  'session', 'week-all', 'week-model', 'rate-window', 'billing-window', 'custom',
]);
const SOURCE_KINDS = new Set<ProviderLimitSourceKind>([
  'provider-cli', 'provider-api', 'http-headers', 'historical-transcript', 'local-runtime', 'operator',
]);
const TRANSPORTS = new Set<InvocationTransport>(['cli', 'api', 'http', 'local-runtime']);
const EXECUTION_BACKENDS = new Set<InvocationExecutionBackend>([
  'host-subprocess', 'docker', 'tmux', 'api', 'in-process', 'unknown',
]);

function assertIdentity(name: string, value: string): void {
  if (!value || value !== value.trim()) throw new Error(`${name} is required`);
}

function assertIsoTimestamp(name: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${name} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function assertLimitUnit(unit: ProviderLimitUnit): void {
  if (!LIMIT_UNITS.has(unit)) throw new Error('Unsupported provider limit unit');
}

function assertBackend(backend: ProviderLimitObservation['backend']): void {
  if (!TRANSPORTS.has(backend.transport)) throw new Error('Unsupported provider limit transport');
  if (!EXECUTION_BACKENDS.has(backend.executionBackend)) {
    throw new Error('Unsupported provider limit execution backend');
  }
  assertOpaqueSha256('provider limit endpointRefHash', backend.endpointRefHash, false);
}

export function deriveProviderQuotaScopeRefHash(scope: Pick<
  ProviderLimitObservation,
  'tenantId' | 'provider' | 'accountRefHash' | 'authMode' | 'backend'
>): string {
  const identity = JSON.stringify({
    tenantId: scope.tenantId,
    provider: scope.provider,
    accountRefHash: scope.accountRefHash,
    authMode: scope.authMode,
    transport: scope.backend.transport,
    endpointRefHash: scope.backend.endpointRefHash,
  });
  return createHash('sha256').update(identity).digest('hex');
}

function assertQuotaScope(scope: Pick<
  ProviderLimitObservation,
  'tenantId' | 'provider' | 'accountRefHash' | 'quotaScopeRefHash' | 'authMode' | 'backend'
>): void {
  assertOpaqueSha256('quotaScopeRefHash', scope.quotaScopeRefHash, true);
  if (scope.quotaScopeRefHash !== deriveProviderQuotaScopeRefHash(scope)) {
    throw new Error('Provider quota scope does not match its canonical account/endpoint identity');
  }
}

export function assertProviderLimitReservationRequest(request: ProviderLimitReservationRequest): void {
  assertIdentity('tenantId', request.tenantId);
  assertIdentity('projectId', request.projectId);
  assertCanonicalProviderId(request.provider);
  assertCanonicalModelApiId(request.model);
  if (!AUTH_MODES.has(request.authMode)) throw new Error('Unsupported provider limit auth mode');
  assertOpaqueSha256('accountRefHash', request.accountRefHash, request.authMode !== 'local');
  assertBackend(request.backend);
  assertQuotaScope(request);
  assertIdentity('provider limit reservationId', request.reservationId);
  assertIdentity('provider limit idempotencyKey', request.idempotencyKey);
  assertIdentity('provider limit runId', request.runId);
  if (request.taskId !== null) assertIdentity('provider limit taskId', request.taskId);
  assertIdentity('provider limit callId', request.callId);
  assertIdentity('provider limit attemptId', request.attemptId);
  assertOpaqueSha256('provider limit fenceTokenHash', request.fenceTokenHash, true);
  assertOpaqueEvidenceRef('provider limit receiptRef', request.receiptRef, true);
  assertOpaqueEvidenceRef(
    'provider limit reachabilityEvidenceRef', request.reachabilityEvidenceRef, true,
  );
  if (request.estimateEvidenceRefs.length === 0) {
    throw new Error('Provider limit reservation requires estimate evidence');
  }
  for (const ref of request.estimateEvidenceRefs) {
    assertOpaqueEvidenceRef('provider limit estimate evidenceRef', ref, true);
  }
  const requestedAt = assertIsoTimestamp('provider limit requestedAt', request.requestedAt);
  const leaseExpiresAt = assertIsoTimestamp('provider limit leaseExpiresAt', request.leaseExpiresAt);
  if (leaseExpiresAt <= requestedAt) {
    throw new Error('Provider limit reservation lease is invalid');
  }
  if (request.estimates.length === 0) throw new Error('Provider limit reservation requires estimates');
  const seen = new Set<string>();
  for (const estimate of request.estimates) {
    assertWindowIdentity(estimate.windowId);
    assertLimitUnit(estimate.unit);
    if (!Number.isFinite(estimate.amount) || estimate.amount <= 0) {
      throw new Error('Provider limit reservation amount must be positive');
    }
    if (seen.has(estimate.windowId)) throw new Error('Duplicate provider limit reservation window');
    seen.add(estimate.windowId);
  }
}

export function assertProviderLimitReservation(reservation: ProviderLimitReservation): void {
  assertProviderLimitReservationRequest(reservation);
  if (reservation.snapshotEvidenceRef !== null) {
    assertOpaqueEvidenceRef('provider limit snapshot evidenceRef', reservation.snapshotEvidenceRef, true);
  }
  assertPolicy(reservation.appliedPolicy);
  const allowed = reservation.decision === 'allow' && reservation.reasonCode === 'allowed';
  const held = reservation.decision === 'hold' && reservation.reasonCode !== 'allowed';
  if (!allowed && !held) throw new Error('Provider limit reservation decision is inconsistent');
  if ((reservation.reasonCode === 'snapshot_missing') !== (reservation.snapshotEvidenceRef === null)) {
    throw new Error('Provider limit reservation snapshot evidence is inconsistent');
  }
  const estimates = new Map(reservation.estimates.map(item => [item.windowId, item]));
  for (const [windowId, remaining] of Object.entries(reservation.effectiveRemaining)) {
    if (!estimates.has(windowId) || !Number.isFinite(remaining) || remaining < 0) {
      throw new Error('Provider limit reservation effective remaining is invalid');
    }
  }
  if (allowed && reservation.estimates.some(item => {
    const remaining = reservation.effectiveRemaining[item.windowId];
    return remaining === undefined || remaining < item.amount;
  })) {
    throw new Error('Allowed provider limit reservation exceeds effective remaining');
  }
}

export function assertProviderLimitReservationEvent(event: ProviderLimitReservationEvent): void {
  assertIdentity('provider limit reservation eventId', event.eventId);
  assertIsoTimestamp('provider limit reservation occurredAt', event.occurredAt);
  assertOpaqueSha256('provider limit event fenceTokenHash', event.fenceTokenHash, true);
  assertOpaqueEvidenceRef('provider limit event evidenceRef', event.evidenceRef, true);
  if (event.type !== 'dispatched' && event.type !== 'consumed' && event.type !== 'released') {
    throw new Error('Unsupported provider limit reservation event type');
  }
  if (event.type === 'released' && event.actual !== undefined) {
    throw new Error('Released provider limit reservation cannot carry actual usage');
  }
  if (event.type === 'dispatched' && (event.actual !== undefined
    || event.terminationEvidenceRef !== undefined || event.terminationAuthorityRef !== undefined)) {
    throw new Error('Dispatched provider limit reservation cannot carry settlement evidence');
  }
  if (event.type === 'released') {
    assertOpaqueEvidenceRef(
      'provider limit terminationEvidenceRef', event.terminationEvidenceRef ?? '', true,
    );
    assertOpaqueEvidenceRef(
      'provider limit terminationAuthorityRef', event.terminationAuthorityRef ?? '', true,
    );
  } else if (event.terminationEvidenceRef !== undefined || event.terminationAuthorityRef !== undefined) {
    throw new Error('Consumed provider limit reservation cannot carry termination evidence');
  }
  if (event.type === 'consumed' && (!event.actual || event.actual.length === 0)) {
    throw new Error('Consumed provider limit reservation requires actual usage');
  }
  const seen = new Set<string>();
  for (const actual of event.actual ?? []) {
    assertWindowIdentity(actual.windowId);
    assertLimitUnit(actual.unit);
    if (!Number.isFinite(actual.amount) || actual.amount < 0) {
      throw new Error('Actual provider limit usage must be non-negative');
    }
    if (seen.has(actual.windowId)) throw new Error('Duplicate actual provider limit window');
    seen.add(actual.windowId);
  }
}

function assertFiniteNonNegative(name: string, value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${name} must be null or a finite non-negative number`);
  }
}

function assertWindowIdentity(windowId: string): void {
  if (!/^[a-z][a-z0-9._-]{2,95}$/u.test(windowId)) throw new Error('Invalid provider limit window id');
}

function assertPolicy(policy: ProviderLimitPolicy): void {
  assertOpaqueEvidenceRef('limit policyRef', policy.policyRef, true);
  if (policy.ratioEnforcement !== undefined
    && policy.ratioEnforcement !== 'enforce'
    && policy.ratioEnforcement !== 'observe_only') {
    throw new Error('Invalid provider limit ratio enforcement mode');
  }
  if (!Number.isFinite(policy.warnAtRatio) || !Number.isFinite(policy.blockAtRatio)
    || policy.warnAtRatio < 0 || policy.warnAtRatio >= policy.blockAtRatio
    || policy.blockAtRatio > 1) {
    throw new Error('Invalid provider limit policy thresholds');
  }
  for (const [unit, value] of Object.entries(policy.minimumRemaining)) {
    if (!LIMIT_UNITS.has(unit as ProviderLimitUnit)) throw new Error('Invalid provider limit remaining unit');
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error('Invalid provider limit remaining floor');
    }
  }
}

function normalizeWindow(input: ProviderLimitWindow): ProviderLimitWindow {
  assertWindowIdentity(input.windowId);
  if (!WINDOW_KINDS.has(input.kind)) throw new Error('Unsupported provider limit window kind');
  assertLimitUnit(input.unit);
  if (input.kind === 'week-model' && input.model === null) {
    throw new Error('Model-specific provider limit windows require an exact model API ID');
  }
  if (input.model !== null) assertCanonicalModelApiId(input.model);
  assertFiniteNonNegative('consumed', input.consumed);
  assertFiniteNonNegative('remaining', input.remaining);
  assertFiniteNonNegative('limit', input.limit);
  assertOpaqueSha256('reset displayRefHash', input.reset.displayRefHash, false);
  if (input.reset.state !== 'known' && input.reset.state !== 'unknown') {
    throw new Error('Unsupported provider limit reset evidence state');
  }
  if (input.reset.state === 'known') {
    if (input.reset.at === null) {
      throw new Error('Known reset evidence requires an ISO timestamp');
    }
    assertIsoTimestamp('provider limit reset', input.reset.at);
  } else if (input.reset.at !== null) {
    throw new Error('Unknown reset evidence cannot carry a timestamp');
  }

  let { consumed, remaining, limit } = input;
  if (limit !== null && consumed !== null && remaining === null) remaining = Math.max(0, limit - consumed);
  if (limit !== null && remaining !== null && consumed === null) consumed = Math.max(0, limit - remaining);
  if (limit === null && consumed !== null && remaining !== null) limit = consumed + remaining;
  if (consumed !== null && remaining !== null && limit !== null) {
    const tolerance = Math.max(1e-9, limit * 1e-6);
    if (Math.abs((consumed + remaining) - limit) > tolerance) {
      throw new Error('Provider limit window values are inconsistent');
    }
  }
  if (input.unit === 'percent' && limit !== null && limit !== 100) {
    throw new Error('Percent windows must use a 100-point limit');
  }
  return { ...input, consumed, remaining, limit };
}

function isComplete(window: ProviderLimitWindow): boolean {
  return window.consumed !== null && window.remaining !== null
    && window.limit !== null && window.limit > 0;
}

/**
 * Evaluate the real usage windows against a policy's warn/block ratios.
 *
 * `createProviderLimitResult` only runs this for an `authoritative` source, so
 * a durable limit snapshot from an advisory source stays `unknown/hold`. The
 * bounded reachability-probe path (ProviderEvidenceProducer) reuses this to
 * decide whether to admit a single owner-budgeted probe on advisory usage
 * data — it still fails closed at `blockAtRatio`, so a genuinely exhausted
 * quota blocks the probe; it just does not demand a reservation-capable
 * authoritative source that subscription CLIs do not expose. This never
 * mutates the stored snapshot, so heavy-task admission still sees the advisory
 * truth.
 */
export function evaluateProviderLimitWindows(
  windows: readonly ProviderLimitWindow[],
  requiredWindowIds: readonly string[],
  policy: ProviderLimitPolicy,
): Pick<ProviderLimitResult, 'state' | 'decision' | 'pressure' | 'reasonCode'> {
  return evaluateKnownWindows(windows, requiredWindowIds, policy);
}

function evaluateKnownWindows(
  windows: readonly ProviderLimitWindow[],
  requiredWindowIds: readonly string[],
  policy: ProviderLimitPolicy,
): Pick<ProviderLimitResult, 'state' | 'decision' | 'pressure' | 'reasonCode'> {
  const byId = new Map(windows.map(window => [window.windowId, window]));
  if (requiredWindowIds.length === 0
    || requiredWindowIds.some(id => !byId.has(id) || !isComplete(byId.get(id)!))) {
    return { state: 'unknown', decision: 'hold', pressure: 'unknown', reasonCode: 'incomplete_windows' };
  }

  let pressure: ProviderLimitPressure = 'ok';
  const ratioEnforcement = policy.ratioEnforcement ?? 'enforce';
  for (const windowId of requiredWindowIds) {
    const window = byId.get(windowId)!;
    const floor = policy.minimumRemaining[window.unit];
    if (floor !== undefined && window.remaining! <= floor) {
      return { state: 'known', decision: 'hold', pressure: 'block', reasonCode: 'remaining_floor' };
    }
    const ratio = window.consumed! / window.limit!;
    if (ratio >= policy.blockAtRatio) {
      if (ratioEnforcement === 'enforce') {
        return { state: 'known', decision: 'hold', pressure: 'block', reasonCode: 'threshold_block' };
      }
      pressure = 'block';
      continue;
    }
    if (ratio >= policy.warnAtRatio && pressure !== 'block') pressure = 'warn';
  }
  return {
    state: 'known',
    decision: 'allow',
    pressure,
    reasonCode: pressure === 'block' ? 'threshold_observed' : 'none',
  };
}

export function createProviderLimitResult(
  observation: ProviderLimitObservation,
  policy: ProviderLimitPolicy,
  dependencies: ProviderLimitResultDependencies = {},
): ProviderLimitResult {
  assertIdentity('tenantId', observation.tenantId);
  assertIdentity('projectId', observation.projectId);
  assertIdentity('provider limit idempotencyKey', observation.idempotencyKey);
  assertCanonicalProviderId(observation.provider);
  if (!AUTH_MODES.has(observation.authMode)) throw new Error('Unsupported provider limit auth mode');
  if (!EVIDENCE_STATES.has(observation.state)) {
    throw new Error('Unsupported provider limit observation state');
  }
  if (!SOURCE_KINDS.has(observation.source.kind)) throw new Error('Unsupported provider limit source kind');
  assertOpaqueSha256('accountRefHash', observation.accountRefHash, observation.authMode !== 'local');
  assertBackend(observation.backend);
  assertQuotaScope(observation);
  if (observation.state === 'known' && (observation.authMode === 'unknown'
    || observation.backend.executionBackend === 'unknown')) {
    throw new Error('Known provider limit evidence requires exact auth and execution backend');
  }
  if (observation.state === 'known' && observation.backend.transport !== 'cli'
    && observation.backend.endpointRefHash === null) {
    throw new Error('Known non-CLI limit evidence requires an endpoint scope');
  }
  if (observation.source.authority !== 'authoritative' && observation.source.authority !== 'advisory') {
    throw new Error('Unsupported provider limit source authority');
  }
  assertOpaqueEvidenceRef('provider limit operatorApprovalRef', observation.source.operatorApprovalRef, false);
  if (observation.source.kind === 'operator' && observation.source.authority === 'authoritative'
    && observation.source.operatorApprovalRef === null) {
    throw new Error('Authoritative operator limit evidence requires owner approval provenance');
  }
  if (observation.source.kind !== 'operator' && observation.source.operatorApprovalRef !== null) {
    throw new Error('Only operator limit evidence may carry owner approval provenance');
  }
  if (observation.source.kind === 'historical-transcript'
    && observation.source.authority !== 'advisory') {
    throw new Error('Historical transcript evidence is advisory only');
  }
  assertOpaqueEvidenceRef('limit source evidenceRef', observation.source.evidenceRef, true);
  for (const ref of observation.evidenceRefs ?? []) assertOpaqueEvidenceRef('limit evidenceRef', ref, true);
  for (const ref of observation.source.incorporatedReservationEventRefs) {
    assertOpaqueEvidenceRef('incorporated reservation eventRef', ref, true);
  }
  if (new Set(observation.source.incorporatedReservationEventRefs).size
    !== observation.source.incorporatedReservationEventRefs.length) {
    throw new Error('Duplicate incorporated reservation eventRef');
  }
  assertPolicy(policy);
  const fetchedAt = assertIsoTimestamp('provider limit fetchedAt', observation.source.fetchedAt);
  const expiresAt = assertIsoTimestamp('provider limit expiresAt', observation.source.expiresAt);
  if (expiresAt <= fetchedAt) {
    throw new Error('Provider limit source timestamps are invalid');
  }
  const required = [...new Set(observation.requiredWindowIds)];
  if (required.length !== observation.requiredWindowIds.length) {
    throw new Error('Duplicate required provider limit window id');
  }
  const windows = observation.windows.map(normalizeWindow);
  if (new Set(windows.map(window => window.windowId)).size !== windows.length) {
    throw new Error('Duplicate provider limit window id');
  }
  const earliestKnownReset = windows
    .filter(window => required.includes(window.windowId) && window.reset.state === 'known')
    .reduce<number | null>((earliest, window) => {
      const resetAt = Date.parse(window.reset.at!);
      return earliest === null ? resetAt : Math.min(earliest, resetAt);
    }, null);
  if (earliestKnownReset !== null && expiresAt > earliestKnownReset) {
    throw new Error('Provider limit evidence cannot outlive a required window reset');
  }

  const evaluation = observation.state === 'known' && observation.source.authority === 'authoritative'
    ? evaluateKnownWindows(windows, required, policy)
    : observation.state === 'unavailable'
      ? { state: 'unavailable' as const, decision: 'hold' as const, pressure: 'unknown' as const,
        reasonCode: 'source_unavailable' as const }
      : { state: 'unknown' as const, decision: 'hold' as const, pressure: 'unknown' as const,
        reasonCode: 'source_unknown' as const };

  const result: ProviderLimitResult = {
    schemaVersion: PROVIDER_LIMIT_SCHEMA_VERSION,
    limitResultId: dependencies.idFactory?.() ?? randomUUID(),
    idempotencyKey: observation.idempotencyKey,
    tenantId: observation.tenantId,
    projectId: observation.projectId,
    provider: observation.provider,
    accountRefHash: observation.accountRefHash,
    quotaScopeRefHash: observation.quotaScopeRefHash,
    authMode: observation.authMode,
    backend: observation.backend,
    ...evaluation,
    requiredWindowIds: required,
    windows,
    policy,
    source: observation.source,
    evidenceRefs: observation.evidenceRefs ?? [],
  };
  assertProviderLimitResult(result);
  return result;
}

export function assertProviderLimitResult(result: ProviderLimitResult): void {
  if (result.schemaVersion !== PROVIDER_LIMIT_SCHEMA_VERSION) throw new Error('Unsupported provider limit schema');
  assertIdentity('limitResultId', result.limitResultId);
  assertIdentity('tenantId', result.tenantId);
  assertIdentity('projectId', result.projectId);
  assertIdentity('provider limit idempotencyKey', result.idempotencyKey);
  assertCanonicalProviderId(result.provider);
  if (!AUTH_MODES.has(result.authMode)) throw new Error('Unsupported provider limit auth mode');
  if (!EVIDENCE_STATES.has(result.state)) throw new Error('Unsupported provider limit evidence state');
  if (!SOURCE_KINDS.has(result.source.kind)) throw new Error('Unsupported provider limit source kind');
  assertOpaqueSha256('accountRefHash', result.accountRefHash, result.authMode !== 'local');
  assertBackend(result.backend);
  assertQuotaScope(result);
  if (result.state === 'known' && (result.authMode === 'unknown'
    || result.backend.executionBackend === 'unknown')) {
    throw new Error('Known provider limit evidence requires exact auth and execution backend');
  }
  if (result.state === 'known' && result.backend.transport !== 'cli'
    && result.backend.endpointRefHash === null) {
    throw new Error('Known non-CLI limit evidence requires an endpoint scope');
  }
  if (result.source.authority !== 'authoritative' && result.source.authority !== 'advisory') {
    throw new Error('Unsupported provider limit source authority');
  }
  assertOpaqueEvidenceRef('provider limit operatorApprovalRef', result.source.operatorApprovalRef, false);
  if (result.source.kind === 'operator' && result.source.authority === 'authoritative'
    && result.source.operatorApprovalRef === null) {
    throw new Error('Authoritative operator limit evidence requires owner approval provenance');
  }
  if (result.source.kind !== 'operator' && result.source.operatorApprovalRef !== null) {
    throw new Error('Only operator limit evidence may carry owner approval provenance');
  }
  if (result.source.kind === 'historical-transcript' && result.source.authority !== 'advisory') {
    throw new Error('Historical transcript evidence is advisory only');
  }
  assertOpaqueEvidenceRef('limit source evidenceRef', result.source.evidenceRef, true);
  for (const ref of result.evidenceRefs) assertOpaqueEvidenceRef('limit evidenceRef', ref, true);
  for (const ref of result.source.incorporatedReservationEventRefs) {
    assertOpaqueEvidenceRef('incorporated reservation eventRef', ref, true);
  }
  if (new Set(result.source.incorporatedReservationEventRefs).size
    !== result.source.incorporatedReservationEventRefs.length) {
    throw new Error('Duplicate incorporated reservation eventRef');
  }
  assertPolicy(result.policy);
  const fetchedAt = assertIsoTimestamp('provider limit fetchedAt', result.source.fetchedAt);
  const expiresAt = assertIsoTimestamp('provider limit expiresAt', result.source.expiresAt);
  if (expiresAt <= fetchedAt) {
    throw new Error('Provider limit source timestamps are invalid');
  }
  if (new Set(result.requiredWindowIds).size !== result.requiredWindowIds.length) {
    throw new Error('Duplicate required provider limit window id');
  }
  for (const windowId of result.requiredWindowIds) assertWindowIdentity(windowId);
  const windows = result.windows.map(normalizeWindow);
  if (new Set(windows.map(window => window.windowId)).size !== windows.length) {
    throw new Error('Duplicate provider limit window id');
  }
  const earliestKnownReset = windows
    .filter(window => result.requiredWindowIds.includes(window.windowId) && window.reset.state === 'known')
    .reduce<number | null>((earliest, window) => {
      const resetAt = Date.parse(window.reset.at!);
      return earliest === null ? resetAt : Math.min(earliest, resetAt);
    }, null);
  if (earliestKnownReset !== null && expiresAt > earliestKnownReset) {
    throw new Error('Provider limit evidence cannot outlive a required window reset');
  }
  if (JSON.stringify(windows) !== JSON.stringify(result.windows)) {
    throw new Error('Provider limit windows must be persisted in normalized form');
  }
  const expected = result.state === 'stale'
    ? { state: 'stale' as const, decision: 'hold' as const, pressure: 'unknown' as const,
      reasonCode: 'evidence_expired' as const }
    : result.state === 'known' && result.source.authority === 'authoritative'
      ? evaluateKnownWindows(result.windows, result.requiredWindowIds, result.policy)
      : result.state === 'unavailable'
        ? { state: 'unavailable' as const, decision: 'hold' as const, pressure: 'unknown' as const,
          reasonCode: 'source_unavailable' as const }
        : { state: 'unknown' as const, decision: 'hold' as const, pressure: 'unknown' as const,
          reasonCode: result.reasonCode === 'incomplete_windows'
            ? 'incomplete_windows' as const
            : result.reasonCode === 'evidence_not_yet_valid'
              ? 'evidence_not_yet_valid' as const : 'source_unknown' as const };
  if (result.state !== expected.state || result.decision !== expected.decision
    || result.pressure !== expected.pressure || result.reasonCode !== expected.reasonCode) {
    throw new Error('Provider limit decision is inconsistent with durable evidence');
  }
}

export function applyProviderLimitPolicy(
  result: ProviderLimitResult,
  policy: ProviderLimitPolicy,
): ProviderLimitResult {
  assertProviderLimitResult(result);
  assertPolicy(policy);
  if (result.state !== 'known' || result.source.authority !== 'authoritative') {
    return { ...result, policy };
  }
  const evaluated = evaluateKnownWindows(result.windows, result.requiredWindowIds, policy);
  const projected = { ...result, ...evaluated, policy };
  assertProviderLimitResult(projected);
  return projected;
}

export function materializeProviderLimitResult(
  result: ProviderLimitResult,
  at = new Date(),
): ProviderLimitResult {
  assertProviderLimitResult(result);
  if (at.getTime() < Date.parse(result.source.fetchedAt)) {
    return {
      ...result,
      state: 'unknown',
      decision: 'hold',
      pressure: 'unknown',
      reasonCode: 'evidence_not_yet_valid',
    };
  }
  if (at.getTime() < Date.parse(result.source.expiresAt)) return result;
  return {
    ...result,
    state: 'stale',
    decision: 'hold',
    pressure: 'unknown',
    reasonCode: 'evidence_expired',
  };
}

export function toLimitEvidence(result: ProviderLimitResult, at = new Date()): LimitEvidence {
  const fresh = materializeProviderLimitResult(result, at);
  return {
    state: fresh.state,
    limited: fresh.state === 'known' && fresh.decision === 'hold',
    evidenceRefs: [`provider-limit:${result.limitResultId}`, ...result.evidenceRefs],
  };
}
