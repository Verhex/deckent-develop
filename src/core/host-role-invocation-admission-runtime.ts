import { createHash } from 'node:crypto';

import {
  admitRoleInvocation,
  claimAdmittedProviderDispatch,
  ProviderLimitAdmissionError,
  type ProviderLimitAdmissionAllowed,
  type ProviderLimitAdmissionAttempt,
  type ProviderLimitAdmissionHeld,
} from './provider-limit-admission.js';
import type {
  ProviderLimitDispatchClaim,
  ProviderLimitReservationView,
  ProviderLimitSnapshotQuery,
  ProviderLimitStore,
  StoredProviderLimitReservationEvent,
} from './provider-limit-store.js';
import {
  toLimitEvidence,
  type ProviderLimitReservationEvent,
  type ProviderLimitReservationRequest,
} from './provider-limit-truth.js';
import type {
  ExactReachabilityQuery,
  ProviderTruthStore,
} from './provider-truth-store.js';
import { toReachabilityEvidence } from './provider-truth.js';
import {
  resolveRoleInvocation,
  type ProviderEvidence,
  type RoleInvocationRequest,
  type RoleInvocationResolution,
  type RoleInvocationSelected,
} from './role-invocation-resolver.js';

export interface HostRoleInvocationAuthorities {
  /** Canonical tenant boundary for the entire primary→fallback chain. */
  readonly tenantId: string;
  readonly truthStore: Pick<ProviderTruthStore, 'projectId' | 'getLatestReachability'>;
  readonly limitStore: ProviderLimitStore;
  /** Host-owned decision clock. Callers cannot supply or rewind evaluation time per request. */
  readonly now?: () => Date;
}

export interface HostRoleInvocationCandidateAuthority {
  readonly provider: string;
  readonly model: string;
  readonly reachabilityQuery: ExactReachabilityQuery;
  readonly limitQuery: ProviderLimitSnapshotQuery;
}

export interface HostRoleInvocationAdmissionRequest {
  readonly invocation: Omit<RoleInvocationRequest, 'evidence'>;
  readonly candidates: Readonly<Record<string, HostRoleInvocationCandidateAuthority>>;
  readonly buildReservation: (selected: RoleInvocationSelected) => ProviderLimitReservationRequest;
}

export type HostRoleInvocationHoldReason =
  | ProviderLimitAdmissionHeld['reasonCode']
  | 'authority_unavailable'
  | 'authority_identity_mismatch'
  | 'authority_failure';

export interface HostRoleInvocationHeld {
  readonly decision: 'hold';
  readonly reservation: null;
  readonly reasonCode: HostRoleInvocationHoldReason;
  readonly resolution: RoleInvocationResolution;
  readonly attempts: readonly ProviderLimitAdmissionAttempt[];
  readonly authorityEvidenceRef: string;
}

export type HostRoleInvocationAdmissionResult =
  | ProviderLimitAdmissionAllowed
  | HostRoleInvocationHeld;

export class HostRoleInvocationAdmissionError extends Error {
  constructor(
    readonly code: 'AUTHORITY_UNAVAILABLE' | 'SCOPE_MISMATCH' | 'INVALID_EVENT',
    message: string,
  ) {
    super(message);
    this.name = 'HostRoleInvocationAdmissionError';
  }
}

const UNKNOWN_EVIDENCE: ProviderEvidence = {
  reachability: { state: 'unknown', reachable: false, evidenceRef: null },
  limits: { state: 'unknown', limited: false, evidenceRefs: [] },
};

function authorityEvidenceRef(kind: string, detail: string): string {
  return `host-role-admission:${createHash('sha256').update(`${kind}\0${detail}`).digest('hex')}`;
}

function errorDetail(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'unknown');
  }
  return error instanceof Error ? error.name : 'unknown';
}

function orderedProviders(request: HostRoleInvocationAdmissionRequest): string[] {
  return [...new Set([
    String(request.invocation.primaryProvider),
    ...request.invocation.fallbackProviders.map(String),
  ])];
}

function held(
  request: HostRoleInvocationAdmissionRequest,
  reasonCode: HostRoleInvocationHoldReason,
  evidenceRef: string,
): HostRoleInvocationHeld {
  const blockedEvidence = Object.fromEntries(orderedProviders(request).map(provider => [provider, {
    reachability: { state: 'unavailable' as const, reachable: false, evidenceRef },
    limits: { state: 'unavailable' as const, limited: false, evidenceRefs: [evidenceRef] },
  }]));
  return {
    decision: 'hold',
    reservation: null,
    reasonCode,
    resolution: resolveRoleInvocation({ ...request.invocation, evidence: blockedEvidence }),
    attempts: [],
    authorityEvidenceRef: evidenceRef,
  };
}

function sameBackend(
  reachability: Pick<ExactReachabilityQuery, 'transport' | 'executionBackend' | 'endpointRefHash'>,
  candidate: HostRoleInvocationCandidateAuthority,
): boolean {
  return reachability.transport === candidate.reachabilityQuery.transport
    && reachability.executionBackend === candidate.reachabilityQuery.executionBackend
    && reachability.endpointRefHash === candidate.reachabilityQuery.endpointRefHash;
}

function candidateIdentityMatches(
  candidateKey: string,
  candidate: HostRoleInvocationCandidateAuthority,
  tenantId: string,
  projectId: string,
): boolean {
  const reachability = candidate.reachabilityQuery;
  const limit = candidate.limitQuery;
  return candidateKey === candidate.provider
    && candidate.provider === reachability.provider
    && candidate.model === reachability.model
    && reachability.tenantId === tenantId
    && reachability.projectId === projectId
    && reachability.tenantId === limit.tenantId
    && reachability.authMode === limit.authMode
    && reachability.accountRefHash === limit.accountRefHash
    && candidate.provider === limit.provider;
}

/**
 * Host-only composition of exact reachability truth and account-wide limit admission.
 * The runtime never creates authority values or calls a provider. Without an injected
 * authority bundle it returns an explicit HOLD for every orchestration role.
 */
export class HostRoleInvocationAdmissionRuntime {
  constructor(private readonly authorities: HostRoleInvocationAuthorities | null) {}

  admit(request: HostRoleInvocationAdmissionRequest): HostRoleInvocationAdmissionResult {
    const providers = orderedProviders(request);
    if (!this.authorities) {
      return held(
        request,
        'authority_unavailable',
        authorityEvidenceRef('unavailable', request.invocation.role),
      );
    }

    const { tenantId, truthStore, limitStore } = this.authorities;
    const evidence: Record<string, ProviderEvidence> = {};
    const reachabilityExpiries = new Map<string, string>();
    const candidateScopes: Record<string, {
      provider: string;
      model: string;
      accountRefHash: string | null;
      quotaScopeRefHash: string;
      authMode: ProviderLimitReservationRequest['authMode'];
      backend: ProviderLimitReservationRequest['backend'];
      reachabilityEvidenceRef: string;
    }> = {};

    try {
      const at = this.authorities.now?.() ?? new Date();
      for (const provider of providers) {
        const candidate = request.candidates[provider];
        if (!candidate) {
          return held(
            request,
            'authority_unavailable',
            authorityEvidenceRef('candidate-unavailable', provider),
          );
        }
        if (!candidateIdentityMatches(provider, candidate, tenantId, truthStore.projectId)) {
          const ref = authorityEvidenceRef('identity', provider);
          return held(request, 'authority_identity_mismatch', ref);
        }

        const reachability = truthStore.getLatestReachability(candidate.reachabilityQuery, at);
        const limit = limitStore.getLatestSnapshot(candidate.limitQuery, at);
        if (limit && (limit.provider !== candidate.provider
          || limit.tenantId !== candidate.limitQuery.tenantId
          || limit.accountRefHash !== candidate.limitQuery.accountRefHash
          || limit.quotaScopeRefHash !== candidate.limitQuery.quotaScopeRefHash
          || limit.authMode !== candidate.limitQuery.authMode
          || !sameBackend(limit.backend, candidate))) {
          const ref = authorityEvidenceRef('limit-identity', provider);
          return held(request, 'authority_identity_mismatch', ref);
        }

        const reachabilityEvidence = reachability
          ? toReachabilityEvidence(reachability, at)
          : UNKNOWN_EVIDENCE.reachability;
        evidence[provider] = {
          reachability: reachabilityEvidence,
          limits: limit ? toLimitEvidence(limit, at) : UNKNOWN_EVIDENCE.limits,
        };
        if (reachability) reachabilityExpiries.set(provider, reachability.probe.expiresAt);
        if (reachabilityEvidence.evidenceRef) {
          candidateScopes[provider] = {
            provider: candidate.provider,
            model: candidate.model,
            accountRefHash: candidate.limitQuery.accountRefHash,
            quotaScopeRefHash: candidate.limitQuery.quotaScopeRefHash,
            authMode: candidate.limitQuery.authMode,
            backend: {
              transport: candidate.reachabilityQuery.transport,
              executionBackend: candidate.reachabilityQuery.executionBackend,
              endpointRefHash: candidate.reachabilityQuery.endpointRefHash,
            },
            reachabilityEvidenceRef: reachabilityEvidence.evidenceRef,
          };
        }
      }

      const result = admitRoleInvocation(limitStore, {
        invocation: { ...request.invocation, evidence },
        candidateScopes,
        buildReservation: selected => {
          const reservation = request.buildReservation(selected);
          const candidate = request.candidates[String(selected.provider)];
          const reachabilityExpiresAt = reachabilityExpiries.get(String(selected.provider));
          if (!candidate
            || reservation.tenantId !== tenantId
            || reservation.projectId !== truthStore.projectId
            || !reachabilityExpiresAt
            || Date.parse(reservation.leaseExpiresAt) > Date.parse(reachabilityExpiresAt)) {
            throw new ProviderLimitAdmissionError(
              'IDENTITY_MISMATCH',
              'Reservation scope or lease exceeds host reachability authority',
            );
          }
          return reservation;
        },
      });
      if (result.decision === 'allow') return result;
      return {
        ...result,
        authorityEvidenceRef: authorityEvidenceRef('hold', result.reasonCode),
      };
    } catch (error) {
      const identityMismatch = error instanceof ProviderLimitAdmissionError;
      const ref = authorityEvidenceRef(identityMismatch ? 'identity' : 'failure', errorDetail(error));
      return held(
        request,
        identityMismatch ? 'authority_identity_mismatch' : 'authority_failure',
        ref,
      );
    }
  }

  claimDispatch(
    admission: ProviderLimitAdmissionAllowed,
    event: ProviderLimitReservationEvent,
  ): ProviderLimitDispatchClaim {
    if (!this.authorities) {
      throw new HostRoleInvocationAdmissionError(
        'AUTHORITY_UNAVAILABLE',
        'Host role invocation authority is unavailable',
      );
    }
    if (admission.reservation.tenantId !== this.authorities.tenantId
      || admission.reservation.projectId !== this.authorities.truthStore.projectId) {
      throw new HostRoleInvocationAdmissionError(
        'SCOPE_MISMATCH',
        'Admitted invocation does not belong to this host authority scope',
      );
    }
    return claimAdmittedProviderDispatch(this.authorities.limitStore, admission, event);
  }

  /**
   * Read the exact reservation through the same host authority boundary used
   * for admission and settlement. This is intentionally narrower than
   * exposing the underlying store: replay reconciliation cannot cross a
   * tenant/project/provider/account scope supplied by another runtime.
   */
  getReservation(request: ProviderLimitReservationRequest): ProviderLimitReservationView | null {
    if (!this.authorities) {
      throw new HostRoleInvocationAdmissionError(
        'AUTHORITY_UNAVAILABLE',
        'Host role invocation authority is unavailable',
      );
    }
    if (request.tenantId !== this.authorities.tenantId
      || request.projectId !== this.authorities.truthStore.projectId) {
      throw new HostRoleInvocationAdmissionError(
        'SCOPE_MISMATCH',
        'Invocation reservation does not belong to this host authority scope',
      );
    }
    return this.authorities.limitStore.getReservation({
      tenantId: request.tenantId,
      projectId: request.projectId,
      provider: request.provider,
      accountRefHash: request.accountRefHash,
      quotaScopeRefHash: request.quotaScopeRefHash,
      authMode: request.authMode,
    }, request.reservationId);
  }

  /**
   * Settle the exact reservation admitted by this runtime. The private limit
   * store remains the only event authority; callers cannot substitute a second
   * store or change tenant/project/account/backend identity at settlement time.
   */
  settleDispatch(
    admission: ProviderLimitAdmissionAllowed,
    event: ProviderLimitReservationEvent,
  ): StoredProviderLimitReservationEvent {
    if (!this.authorities) {
      throw new HostRoleInvocationAdmissionError(
        'AUTHORITY_UNAVAILABLE',
        'Host role invocation authority is unavailable',
      );
    }
    const reservation = admission.reservation;
    if (reservation.tenantId !== this.authorities.tenantId
      || reservation.projectId !== this.authorities.truthStore.projectId
      || event.fenceTokenHash !== reservation.fenceTokenHash) {
      throw new HostRoleInvocationAdmissionError(
        'SCOPE_MISMATCH',
        'Invocation settlement does not belong to this host authority scope',
      );
    }
    if (event.type === 'dispatched') {
      throw new HostRoleInvocationAdmissionError(
        'INVALID_EVENT',
        'Invocation settlement requires a consumed or released event',
      );
    }
    return this.authorities.limitStore.appendReservationEvent({
      tenantId: reservation.tenantId,
      projectId: reservation.projectId,
      provider: reservation.provider,
      accountRefHash: reservation.accountRefHash,
      quotaScopeRefHash: reservation.quotaScopeRefHash,
      authMode: reservation.authMode,
    }, reservation.reservationId, event);
  }
}
