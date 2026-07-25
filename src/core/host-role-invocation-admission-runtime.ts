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
import type { VerifierEligibilityCandidate } from './cross-verify.js';
import { modelRegistry } from './model-registry.js';
import { PROVIDER_MODEL_MAP } from './task-types.js';

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

export type HostRoleVerifierCandidateProjection =
  | {
      readonly state: 'ready';
      readonly candidate: VerifierEligibilityCandidate;
      /** Exact caller-authored query authority used to produce `candidate`. */
      readonly authority: HostRoleInvocationCandidateAuthority;
      /** Exact fresh windows required by the selected provider-limit authority. */
      readonly requiredWindows: readonly {
        readonly windowId: string;
        readonly unit: ProviderLimitReservationRequest['estimates'][number]['unit'];
        readonly model: string | null;
      }[];
      /** Earliest expiry across reachability and limit evidence. */
      readonly expiresAt: string;
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'authority_unavailable'
        | 'authority_identity_mismatch'
        | 'candidate_evidence_unavailable'
        | 'candidate_not_eligible'
        | 'authority_failure';
      readonly authorityEvidenceRef: string;
    };

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

  /**
   * Project one caller-authored exact scope into verifier eligibility evidence.
   *
   * This is deliberately read-only: it never reserves provider capacity and
   * therefore never grants dispatch. Callers must retain the exact query
   * authority; this runtime does not enumerate stores or guess account/backend
   * identity.
   */
  projectVerifierCandidate(
    candidate: HostRoleInvocationCandidateAuthority,
  ): HostRoleVerifierCandidateProjection {
    if (!this.authorities) {
      return {
        state: 'hold',
        reasonCode: 'authority_unavailable',
        authorityEvidenceRef: authorityEvidenceRef('unavailable', 'auditor'),
      };
    }

    const { tenantId, truthStore, limitStore } = this.authorities;
    if (!candidateIdentityMatches(
      candidate.provider,
      candidate,
      tenantId,
      truthStore.projectId,
    )
      || !Object.hasOwn(PROVIDER_MODEL_MAP, candidate.provider)
      || modelRegistry.get(candidate.model)?.provider !== candidate.provider) {
      return {
        state: 'hold',
        reasonCode: 'authority_identity_mismatch',
        authorityEvidenceRef: authorityEvidenceRef('identity', candidate.provider),
      };
    }

    try {
      const at = this.authorities.now?.() ?? new Date();
      const reachability = truthStore.getLatestReachability(candidate.reachabilityQuery, at);
      const limit = limitStore.getLatestSnapshot(candidate.limitQuery, at);
      if (!reachability || !limit) {
        return {
          state: 'hold',
          reasonCode: 'candidate_evidence_unavailable',
          authorityEvidenceRef: authorityEvidenceRef(
            'candidate-evidence-unavailable',
            candidate.provider,
          ),
        };
      }
      if (limit.provider !== candidate.provider
        || limit.tenantId !== candidate.limitQuery.tenantId
        || limit.accountRefHash !== candidate.limitQuery.accountRefHash
        || limit.quotaScopeRefHash !== candidate.limitQuery.quotaScopeRefHash
        || limit.authMode !== candidate.limitQuery.authMode
        || !sameBackend(limit.backend, candidate)) {
        return {
          state: 'hold',
          reasonCode: 'authority_identity_mismatch',
          authorityEvidenceRef: authorityEvidenceRef('limit-identity', candidate.provider),
        };
      }

      const reachabilityEvidence = toReachabilityEvidence(reachability, at);
      const limitEvidence = toLimitEvidence(limit, at);
      if (reachabilityEvidence.state !== 'known'
        || !reachabilityEvidence.reachable
        || reachabilityEvidence.evidenceRef === null
        || limitEvidence.state !== 'known'
        || limitEvidence.limited
        || limitEvidence.evidenceRefs.length === 0) {
        return {
          state: 'hold',
          reasonCode: 'candidate_not_eligible',
          authorityEvidenceRef: authorityEvidenceRef(
            'candidate-not-eligible',
            [
              candidate.provider,
              reachabilityEvidence.state,
              String(reachabilityEvidence.reachable),
              limitEvidence.state,
              String(limitEvidence.limited),
            ].join('\0'),
          ),
        };
      }

      const projected: VerifierEligibilityCandidate = Object.freeze({
        provider: candidate.provider as VerifierEligibilityCandidate['provider'],
        model: candidate.model,
        auth: Object.freeze({
          mode: candidate.reachabilityQuery.authMode,
          accountRefHash: candidate.reachabilityQuery.accountRefHash,
        }),
        backend: Object.freeze({
          transport: candidate.reachabilityQuery.transport,
          executionBackend: candidate.reachabilityQuery.executionBackend,
          endpointRefHash: candidate.reachabilityQuery.endpointRefHash,
          executionProfileRef: candidate.reachabilityQuery.executionProfileRef,
        }),
        reachability: Object.freeze({ ...reachabilityEvidence }),
        limits: Object.freeze({
          ...limitEvidence,
          evidenceRefs: Object.freeze([...limitEvidence.evidenceRefs]),
        }),
      });
      const requiredWindows = limit.requiredWindowIds.map(windowId => {
        const window = limit.windows.find(item => item.windowId === windowId);
        if (!window) {
          throw new HostRoleInvocationAdmissionError(
            'INVALID_EVENT',
            `Provider limit evidence is missing required window ${windowId}`,
          );
        }
        return Object.freeze({
          windowId,
          unit: window.unit,
          model: window.model,
        });
      });
      const expiresAtMs = Math.min(
        Date.parse(reachability.probe.expiresAt),
        Date.parse(limit.source.expiresAt),
      );
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= at.getTime()) {
        throw new HostRoleInvocationAdmissionError(
          'INVALID_EVENT',
          'Verifier evidence has no common fresh validity window',
        );
      }
      return {
        state: 'ready',
        candidate: projected,
        authority: Object.freeze({
          provider: candidate.provider,
          model: candidate.model,
          reachabilityQuery: Object.freeze({ ...candidate.reachabilityQuery }),
          limitQuery: Object.freeze({ ...candidate.limitQuery }),
        }),
        requiredWindows: Object.freeze(requiredWindows),
        expiresAt: new Date(expiresAtMs).toISOString(),
        authorityEvidenceRef: authorityEvidenceRef(
          'candidate-ready',
          [
            candidate.provider,
            candidate.model,
            reachabilityEvidence.evidenceRef,
            ...limitEvidence.evidenceRefs,
          ].join('\0'),
        ),
      };
    } catch (error) {
      return {
        state: 'hold',
        reasonCode: 'authority_failure',
        authorityEvidenceRef: authorityEvidenceRef('failure', errorDetail(error)),
      };
    }
  }

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
