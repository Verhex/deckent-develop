import { createHash } from 'node:crypto';

import type {
  ProviderLimitObservation,
  ProviderLimitReservation,
  ProviderLimitReservationEvent,
  ProviderLimitReservationRequest,
} from './provider-limit-truth.js';
import type {
  ProviderLimitDispatchClaim,
  ProviderLimitStore,
} from './provider-limit-store.js';
import {
  resolveProviderConcurrencyCapability,
  type ProviderConcurrencyCapabilityEvidence,
  type ProviderConcurrencyCapabilityRequest,
} from './provider-concurrency-capability.js';
import type { StoredProviderExecutionInterval } from './provider-execution-observation-store.js';
import {
  resolveRoleInvocation,
  type ProviderEvidence,
  type RoleInvocationRequest,
  type RoleInvocationResolution,
  type RoleInvocationSelected,
} from './role-invocation-resolver.js';

export interface ProviderLimitAdmissionRequest {
  readonly invocation: RoleInvocationRequest;
  readonly candidateScopes: Readonly<Record<string, ProviderLimitAdmissionCandidateScope>>;
  /**
   * Caller-authored provider capacity authorities. When supplied, every selected
   * provider must have an exact entry; unresolved capacity is resolver evidence
   * for the existing fallback authority, never a numeric default.
   */
  readonly concurrencyCapabilities?: Readonly<Record<string, ProviderConcurrencyCapabilityRequest>>;
  readonly buildReservation: (selected: RoleInvocationSelected) => ProviderLimitReservationRequest;
}

export interface ProviderLimitAdmissionCandidateScope {
  readonly provider: string;
  readonly model: string;
  readonly accountRefHash: string | null;
  readonly quotaScopeRefHash: string;
  readonly authMode: ProviderLimitReservationRequest['authMode'];
  readonly backend: ProviderLimitObservation['backend'];
  readonly reachabilityEvidenceRef: string;
}

export interface ProviderLimitAdmissionAttempt {
  readonly provider: string;
  readonly model: string;
  readonly reservation: ProviderLimitReservation | null;
  readonly errorRef: string | null;
  readonly concurrency: ProviderConcurrencyCapabilityEvidence | null;
}

export interface ProviderConcurrencyRuntimeProjectionRequest {
  /** Stable, non-secret identity used by direct provider execution observations. */
  readonly providerPrincipalDigest: string;
  /** The exact effective-capability result considered by admission for this principal. */
  readonly capability: ProviderConcurrencyCapabilityEvidence | null;
  /** Bounded direct provider-runtime intervals for this exact principal only. */
  readonly intervals: readonly StoredProviderExecutionInterval[];
  /** Open observations outside the exact run/task scope projected by the caller. */
  readonly unresolvedOpenIntervals?: number;
  /** Whether intervals are the complete observation set or an exact run task-set projection. */
  readonly observationScope?: 'all-observed' | 'exact-task-set';
}

export interface ProviderConcurrencyRuntimeProjection {
  readonly providerPrincipalDigest: string;
  readonly admission: 'ADMITTED' | 'DEGRADED' | 'HOLD';
  /** Unknown capability remains a HOLD and is never converted to a numeric capacity. */
  readonly admittedCeiling: number | 'unknown';
  readonly currentAttained: number;
  readonly peakAttained: number;
  /** Retained open observations which are not current run execution authority. */
  readonly unresolvedOpenIntervals: number;
  readonly observationScope: 'all-observed' | 'exact-task-set';
  readonly evidenceRefs: readonly string[];
}

interface RuntimeConcurrencyEvent {
  readonly timestamp: number;
  readonly delta: 1 | -1;
}

function assertProviderPrincipalDigest(value: string): void {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('providerPrincipalDigest must be a canonical non-empty string');
  }
}

function peakAttainedFromIntervals(
  providerPrincipalDigest: string,
  intervals: readonly StoredProviderExecutionInterval[],
): number {
  const events: RuntimeConcurrencyEvent[] = [];
  for (const interval of intervals) {
    if (interval.providerPrincipalDigest !== providerPrincipalDigest) {
      throw new ProviderLimitAdmissionError(
        'IDENTITY_MISMATCH', 'Observed execution interval does not belong to the projected principal',
      );
    }
    events.push({ timestamp: Date.parse(interval.start.observedAt), delta: 1 });
    if (interval.end !== null) {
      events.push({ timestamp: Date.parse(interval.end.observedAt), delta: -1 });
    }
  }
  events.sort((left, right) => left.timestamp - right.timestamp || right.delta - left.delta);
  let attained = 0;
  let peak = 0;
  for (const event of events) {
    attained += event.delta;
    peak = Math.max(peak, attained);
  }
  return peak;
}

/**
 * Joins one admitted provider-principal authority to direct provider-runtime
 * observations. It deliberately accepts one exact principal at a time: callers
 * choose the bounded principal set, and no provider or container identity is
 * inferred here.
 */
export function projectProviderConcurrencyRuntime(
  request: ProviderConcurrencyRuntimeProjectionRequest,
): ProviderConcurrencyRuntimeProjection {
  assertProviderPrincipalDigest(request.providerPrincipalDigest);
  const unresolvedOpenIntervals = request.unresolvedOpenIntervals ?? 0;
  if (!Number.isSafeInteger(unresolvedOpenIntervals) || unresolvedOpenIntervals < 0) {
    throw new TypeError('unresolvedOpenIntervals must be a non-negative safe integer');
  }
  const observationScope = request.observationScope ?? 'all-observed';
  const currentAttained = request.intervals.reduce((count, interval) => {
    if (interval.providerPrincipalDigest !== request.providerPrincipalDigest) {
      throw new ProviderLimitAdmissionError(
        'IDENTITY_MISMATCH', 'Observed execution interval does not belong to the projected principal',
      );
    }
    return interval.end === null ? count + 1 : count;
  }, 0);
  const capability = request.capability;
  if (capability === null || capability.decision === 'HOLD'
    || capability.effectiveAdmittedCeiling === 'unknown') {
    return {
      providerPrincipalDigest: request.providerPrincipalDigest,
      admission: 'HOLD',
      admittedCeiling: 'unknown',
      currentAttained,
      peakAttained: peakAttainedFromIntervals(request.providerPrincipalDigest, request.intervals),
      unresolvedOpenIntervals,
      observationScope,
      evidenceRefs: capability?.evidenceRefs ?? [],
    };
  }
  return {
    providerPrincipalDigest: request.providerPrincipalDigest,
    admission: capability.decision,
    admittedCeiling: capability.effectiveAdmittedCeiling,
    currentAttained,
    peakAttained: peakAttainedFromIntervals(request.providerPrincipalDigest, request.intervals),
    unresolvedOpenIntervals,
    observationScope,
    evidenceRefs: capability.evidenceRefs,
  };
}

interface ProviderLimitAdmissionBase {
  readonly resolution: RoleInvocationResolution;
  readonly attempts: readonly ProviderLimitAdmissionAttempt[];
}

export interface ProviderLimitAdmissionAllowed extends ProviderLimitAdmissionBase {
  readonly decision: 'allow';
  readonly reservation: ProviderLimitReservation;
  /** Admission is not an execution grant; a host executor must atomically win claimDispatch. */
  readonly dispatchClaimRequired: true;
}

export interface ProviderLimitAdmissionHeld extends ProviderLimitAdmissionBase {
  readonly decision: 'hold';
  readonly reservation: null;
  readonly reasonCode: 'fallback_exhausted' | 'reservation_not_executable' | 'store_failure';
}

export type ProviderLimitAdmissionResult = ProviderLimitAdmissionAllowed | ProviderLimitAdmissionHeld;

export class ProviderLimitAdmissionError extends Error {
  constructor(
    readonly code: 'IDENTITY_MISMATCH' | 'DUPLICATE_RESERVATION' | 'MISSING_REACHABILITY_EVIDENCE',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderLimitAdmissionError';
  }
}

export function providerLimitReservationEvidenceRef(reservationId: string): string {
  const digest = createHash('sha256').update(reservationId).digest('hex');
  return `provider-limit-reservation:${digest}`;
}

function errorEvidenceRef(error: unknown): string {
  if (error && typeof error === 'object' && 'evidenceRef' in error
    && typeof (error as { evidenceRef?: unknown }).evidenceRef === 'string') {
    return (error as { evidenceRef: string }).evidenceRef;
  }
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? 'unknown')
    : error instanceof Error ? error.name : 'unknown';
  return `provider-limit-admission-error:${createHash('sha256').update(code).digest('hex')}`;
}

function invocationIdentity(request: ProviderLimitReservationRequest): string {
  return JSON.stringify({
    tenantId: request.tenantId,
    projectId: request.projectId,
    runId: request.runId,
    taskId: request.taskId,
    callId: request.callId,
    attemptId: request.attemptId,
    fenceTokenHash: request.fenceTokenHash,
    receiptRef: request.receiptRef,
  });
}

function sameBackend(
  left: ProviderLimitObservation['backend'],
  right: ProviderLimitObservation['backend'],
): boolean {
  return left.transport === right.transport
    && left.executionBackend === right.executionBackend
    && left.endpointRefHash === right.endpointRefHash;
}

function withLimitDecision(
  evidence: Readonly<Record<string, ProviderEvidence>>,
  provider: string,
  limited: boolean,
  evidenceRefs: readonly string[],
): Readonly<Record<string, ProviderEvidence>> {
  const existing = evidence[provider];
  if (!existing) return evidence;
  return {
    ...evidence,
    [provider]: {
      reachability: existing.reachability,
      limits: { state: 'known', limited, evidenceRefs },
    },
  };
}

function reservationQuery(request: ProviderLimitReservationRequest) {
  return {
    tenantId: request.tenantId,
    projectId: request.projectId,
    provider: request.provider,
    accountRefHash: request.accountRefHash,
    quotaScopeRefHash: request.quotaScopeRefHash,
    authMode: request.authMode,
  };
}

function missingConcurrencyEvidenceRef(provider: string): string {
  return `provider-concurrency-capability:${createHash('sha256')
    .update(`missing:${provider}`)
    .digest('hex')}`;
}

function terminalResolution(
  resolution: RoleInvocationResolution,
  reasonCode: 'validation_failed' | 'duplicate_invocation',
  evidenceRef: string,
): RoleInvocationResolution {
  const attempts = resolution.attempts.map(attempt => attempt.accepted
    ? { ...attempt, accepted: false, reasonCode } : attempt);
  return {
    ...resolution,
    selected: null,
    attempts,
    rejected: attempts,
    decisionReasonCode: reasonCode,
    resolved: { provider: null, model: null, source: 'none', reasonCode },
    limits: { state: 'unavailable', evidenceRefs: [evidenceRef] },
  };
}

export function claimAdmittedProviderDispatch(
  store: ProviderLimitStore,
  admission: ProviderLimitAdmissionAllowed,
  event: ProviderLimitReservationEvent,
): ProviderLimitDispatchClaim {
  return store.claimDispatch(
    reservationQuery(admission.reservation),
    admission.reservation.reservationId,
    event,
  );
}

/**
 * Resolve and reserve as one executable-admission authority.
 *
 * The pure role resolver remains the only fallback/model authority. A selected candidate is never
 * executable until its account-wide reservation succeeds. A reservation race/HOLD is fed back as
 * durable limit evidence and the same resolver advances to the next configured candidate. The
 * caller MUST append a `dispatched` reservation event immediately before the provider side effect;
 * after that durable boundary every replay is terminal HOLD and cannot open fallback spend.
 */
export function admitRoleInvocation(
  store: ProviderLimitStore,
  request: ProviderLimitAdmissionRequest,
): ProviderLimitAdmissionResult {
  let evidence = request.invocation.evidence;
  const attempts: ProviderLimitAdmissionAttempt[] = [];
  const reservationIds = new Set<string>();
  let stableInvocationIdentity: string | null = null;
  const providers = [...new Set([
    String(request.invocation.primaryProvider),
    ...request.invocation.fallbackProviders.map(String),
  ])];
  const maxAttempts = providers.length;

  for (let iteration = 0; iteration <= maxAttempts; iteration += 1) {
    const resolution = resolveRoleInvocation({ ...request.invocation, evidence });
    const selected = resolution.selected;
    if (!selected) {
      return {
        decision: 'hold', reservation: null, reasonCode: 'fallback_exhausted', resolution, attempts,
      };
    }

    const selectedAttempt = resolution.attempts.find(attempt => attempt.accepted);
    const reachabilityRef = selectedAttempt?.reachability.evidenceRef ?? null;
    if (reachabilityRef === null) {
      throw new ProviderLimitAdmissionError(
        'MISSING_REACHABILITY_EVIDENCE',
        'Executable provider admission requires durable exact-model reachability evidence',
      );
    }

    const candidateScope = request.candidateScopes[String(selected.provider)];
    if (!candidateScope || candidateScope.provider !== String(selected.provider)
      || candidateScope.model !== selected.model
      || candidateScope.reachabilityEvidenceRef !== reachabilityRef) {
      throw new ProviderLimitAdmissionError(
        'IDENTITY_MISMATCH', 'Resolved candidate lacks exact scoped reachability provenance',
      );
    }

    const provider = String(selected.provider);
    const concurrencyRequest = request.concurrencyCapabilities?.[provider];
    if (request.concurrencyCapabilities && !concurrencyRequest) {
      evidence = withLimitDecision(
        evidence,
        provider,
        true,
        [missingConcurrencyEvidenceRef(provider)],
      );
      continue;
    }
    const concurrency = concurrencyRequest
      ? resolveProviderConcurrencyCapability(concurrencyRequest)
      : null;
    if (concurrency?.decision === 'HOLD') {
      attempts.push({
        provider,
        model: selected.model,
        reservation: null,
        errorRef: null,
        concurrency,
      });
      evidence = withLimitDecision(evidence, provider, true, concurrency.evidenceRefs);
      continue;
    }

    const reservationRequest = request.buildReservation(selected);
    if (reservationRequest.provider !== String(selected.provider)
      || reservationRequest.model !== selected.model
      || reservationRequest.reachabilityEvidenceRef !== reachabilityRef
      || reservationRequest.accountRefHash !== candidateScope.accountRefHash
      || reservationRequest.quotaScopeRefHash !== candidateScope.quotaScopeRefHash
      || reservationRequest.authMode !== candidateScope.authMode
      || !sameBackend(reservationRequest.backend, candidateScope.backend)) {
      throw new ProviderLimitAdmissionError(
        'IDENTITY_MISMATCH',
        'Reservation identity does not match the resolved provider/model/reachability evidence',
      );
    }
    const identity = invocationIdentity(reservationRequest);
    if (stableInvocationIdentity !== null && stableInvocationIdentity !== identity) {
      throw new ProviderLimitAdmissionError(
        'IDENTITY_MISMATCH', 'Fallback reservation changed the logical invocation identity',
      );
    }
    stableInvocationIdentity = identity;
    if (reservationIds.has(reservationRequest.reservationId)) {
      throw new ProviderLimitAdmissionError(
        'DUPLICATE_RESERVATION', 'Fallback candidates must use distinct reservation identities',
      );
    }
    reservationIds.add(reservationRequest.reservationId);

    let reservation: ProviderLimitReservation;
    let created: boolean;
    try {
      ({ reservation, created } = store.reserveWithStatus(reservationRequest));
    } catch (error) {
      const errorRef = errorEvidenceRef(error);
      attempts.push({
        provider, model: selected.model, reservation: null, errorRef, concurrency,
      });
      return {
        decision: 'hold',
        reservation: null,
        reasonCode: 'store_failure',
        resolution: terminalResolution(resolution, 'validation_failed', errorRef),
        attempts,
      };
    }

    const ref = providerLimitReservationEvidenceRef(reservation.reservationId);
    attempts.push({
      provider, model: selected.model, reservation, errorRef: null, concurrency,
    });
    if (reservation.decision === 'hold') {
      evidence = withLimitDecision(
        evidence,
        String(selected.provider),
        true,
        [ref, ...(reservation.snapshotEvidenceRef === null ? [] : [reservation.snapshotEvidenceRef])],
      );
      continue;
    }
    if (!created) {
      let state: ReturnType<ProviderLimitStore['getReservation']>;
      try {
        state = store.getReservation(
          reservationQuery(reservationRequest),
          reservation.reservationId,
        );
      } catch (error) {
        const errorRef = errorEvidenceRef(error);
        return {
          decision: 'hold',
          reservation: null,
          reasonCode: 'store_failure',
          resolution: terminalResolution(resolution, 'validation_failed', errorRef),
          attempts: attempts.map((attempt, index) => index === attempts.length - 1
            ? { ...attempt, errorRef } : attempt),
        };
      }
      if (state?.state !== 'admitted') {
        const stateRef = `provider-limit-reservation-state:${createHash('sha256')
          .update(`${reservation.reservationId}:${state?.state ?? 'missing'}`)
          .digest('hex')}`;
        return {
          decision: 'hold',
          reservation: null,
          reasonCode: 'reservation_not_executable',
          resolution: terminalResolution(resolution, 'duplicate_invocation', stateRef),
          attempts: attempts.map((attempt, index) => index === attempts.length - 1
            ? { ...attempt, errorRef: stateRef } : attempt),
        };
      }
    }

    evidence = withLimitDecision(
      evidence,
      String(selected.provider),
      false,
      [ref, reservation.snapshotEvidenceRef!],
    );
    const finalResolution = resolveRoleInvocation({ ...request.invocation, evidence });
    if (finalResolution.selected?.provider !== selected.provider
      || finalResolution.selected.model !== selected.model) {
      throw new ProviderLimitAdmissionError(
        'IDENTITY_MISMATCH', 'Reservation changed the canonical fallback resolution',
      );
    }
    return {
      decision: 'allow', reservation, dispatchClaimRequired: true,
      resolution: finalResolution, attempts,
    };
  }

  const resolution = resolveRoleInvocation({ ...request.invocation, evidence });
  return {
    decision: 'hold', reservation: null, reasonCode: 'fallback_exhausted', resolution, attempts,
  };
}
