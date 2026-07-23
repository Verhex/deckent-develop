import { createHash } from 'node:crypto';

import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationAuthMode,
  type InvocationReceipt,
  type InvocationReceiptLedger,
  type InvocationReceiptRef,
} from './invocation-receipt.js';
import type { ProviderAuthorityKeyring } from './provider-authority-keyring.js';
import type { ProviderLimitSnapshotQuery, ProviderLimitStore } from './provider-limit-store.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitObservation,
  type ProviderLimitPolicy,
  type ProviderLimitResult,
  type ProviderLimitSourceKind,
  type ProviderLimitWindow,
} from './provider-limit-truth.js';
import type { ProviderTruthStore } from './provider-truth-store.js';
import {
  assertCanonicalModelApiId,
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
  probeExactModelReachability,
  type ProviderExecutionProfile,
  type ReachabilityBackendScope,
  type ReachabilityProbeObservation,
  type ReachabilityProbeTransport,
  type ReachabilityResult,
} from './provider-truth.js';

export interface ProviderAccountIdentityAuthority {
  readonly authorityRef: string;
  resolve(input: {
    readonly tenantId: string;
    readonly provider: string;
    readonly authMode: InvocationAuthMode;
  }): Promise<
    | { readonly state: 'ready'; readonly stableAccountIdentity: string }
    | { readonly state: 'hold'; readonly evidenceRef: string }
  >;
}

export interface ProviderLimitSourceObservation {
  readonly state: ProviderLimitObservation['state'];
  readonly requiredWindowIds: readonly string[];
  readonly windows: readonly ProviderLimitWindow[];
  readonly source: Omit<ProviderLimitObservation['source'], 'kind' | 'authority'>;
  readonly evidenceRefs?: readonly string[];
}

export interface ProviderLimitEvidenceSource {
  readonly authorityRef: string;
  readonly kind: ProviderLimitSourceKind;
  readonly authority: 'authoritative' | 'advisory';
  observe(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly provider: string;
    readonly authMode: InvocationAuthMode;
    readonly accountRefHash: string | null;
    readonly backend: ProviderLimitObservation['backend'];
  }): Promise<ProviderLimitSourceObservation>;
}

export interface ProviderReachabilityEvidenceSource {
  readonly authorityRef: string;
  readonly probe: ReachabilityProbeTransport;
}

export interface ProviderEvidenceSources {
  readonly account: ProviderAccountIdentityAuthority;
  readonly limit: ProviderLimitEvidenceSource;
  readonly reachability: ProviderReachabilityEvidenceSource;
}

export interface ProviderEvidenceProducerOptions {
  readonly tenantId: string;
  readonly projectId: string;
  readonly keyring: ProviderAuthorityKeyring;
  readonly truthStore: ProviderTruthStore;
  readonly limitStore: ProviderLimitStore;
  readonly receiptLedger: InvocationReceiptLedger;
  readonly sources: ProviderEvidenceSources;
  readonly policyResolver: (input: ProviderLimitSnapshotQuery) => ProviderLimitPolicy | null;
  readonly now?: () => Date;
  readonly limitMaxTtlMs?: number;
  readonly reachabilityTtlMs?: number;
}

export interface ProviderEvidenceRefreshRequest {
  readonly idempotencyKey: string;
  readonly runId: string;
  readonly taskId: string | null;
  readonly callId: string;
  readonly provider: string;
  readonly model: string;
  readonly authMode: InvocationAuthMode;
  readonly backend: ReachabilityBackendScope;
  readonly executionProfile: ProviderExecutionProfile;
  readonly approval: {
    readonly evidenceRef: string;
    readonly grantedAt: string;
    readonly expiresAt: string;
  };
  readonly budget: {
    readonly evidenceRef: string;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly maxTotalTokens: number;
    readonly maxUsd: number;
  };
}

export type ProviderEvidenceHoldReason =
  | 'account_authority_hold'
  | 'limit_policy_unavailable'
  | 'limit_source_failure'
  | 'limit_source_invalid'
  | 'limit_hold'
  | 'probe_replay_blocked'
  | 'probe_unreachable'
  | 'authority_failure';

export interface ProviderEvidenceRefreshHeld {
  readonly state: 'hold';
  readonly reasonCode: ProviderEvidenceHoldReason;
  readonly authorityEvidenceRef: string;
  readonly limit: ProviderLimitResult | null;
  readonly reachability: ReachabilityResult | null;
  readonly receiptRef: InvocationReceiptRef | null;
}

export interface ProviderEvidenceRefreshReady {
  readonly state: 'ready';
  readonly authorityEvidenceRef: string;
  readonly limit: ProviderLimitResult;
  readonly reachability: ReachabilityResult;
  readonly receiptRef: InvocationReceiptRef;
}

export type ProviderEvidenceRefreshResult =
  | ProviderEvidenceRefreshHeld
  | ProviderEvidenceRefreshReady;

const DEFAULT_LIMIT_MAX_TTL_MS = 60_000;
const DEFAULT_REACHABILITY_TTL_MS = 60_000;

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function authorityRef(kind: string, ...parts: readonly string[]): string {
  return `provider-evidence:${digest(kind, ...parts)}`;
}

function requireIdentity(name: string, value: string): void {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${name} must be a canonical non-empty value`);
  }
}

function requirePositiveTtl(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'unknown');
  }
  return error instanceof Error ? error.name : 'unknown';
}

function hold(
  reasonCode: ProviderEvidenceHoldReason,
  detail: string,
  limit: ProviderLimitResult | null = null,
  reachability: ReachabilityResult | null = null,
  receiptRef: InvocationReceiptRef | null = null,
): ProviderEvidenceRefreshHeld {
  return {
    state: 'hold',
    reasonCode,
    authorityEvidenceRef: authorityRef(reasonCode, detail),
    limit,
    reachability,
    receiptRef,
  };
}

function sourceFailureObservation(
  request: ProviderEvidenceRefreshRequest,
  input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly accountRefHash: string | null;
    readonly source: ProviderLimitEvidenceSource;
    readonly now: Date;
    readonly expiresAt: string;
    readonly detail: string;
  },
): ProviderLimitObservation {
  const backend = {
    transport: request.backend.transport,
    executionBackend: request.backend.executionBackend,
    endpointRefHash: request.backend.endpointRefHash,
  };
  return {
    idempotencyKey: `${request.idempotencyKey}:limit`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    provider: request.provider,
    accountRefHash: input.accountRefHash,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash({
      tenantId: input.tenantId,
      provider: request.provider,
      accountRefHash: input.accountRefHash,
      authMode: request.authMode,
      backend,
    }),
    authMode: request.authMode,
    backend,
    state: 'unavailable',
    requiredWindowIds: [],
    windows: [],
      source: {
        kind: input.source.kind,
        authority: input.source.authority,
        operatorApprovalRef: input.source.kind === 'operator' ? input.source.authorityRef : null,
      evidenceRef: authorityRef('limit-source-failure', input.source.authorityRef, input.detail),
      fetchedAt: input.now.toISOString(),
      expiresAt: input.expiresAt,
      incorporatedReservationEventRefs: [],
    },
  };
}

function mapTransportOutcome(observation: ReachabilityProbeObservation): {
  readonly outcome: 'succeeded' | 'failed' | 'timeout';
  readonly reasonCode: 'none' | 'timeout' | 'spawn_error' | 'validation_failed';
} {
  if (observation.outcome === 'succeeded') return { outcome: 'succeeded', reasonCode: 'none' };
  if (observation.outcome === 'timeout') return { outcome: 'timeout', reasonCode: 'timeout' };
  if (observation.outcome === 'transport-error' || observation.outcome === 'backend-unreachable') {
    return { outcome: 'failed', reasonCode: 'spawn_error' };
  }
  return { outcome: 'failed', reasonCode: 'validation_failed' };
}

export class ProviderEvidenceProducer {
  readonly authorityRef: string;
  private readonly now: () => Date;
  private readonly limitMaxTtlMs: number;
  private readonly reachabilityTtlMs: number;

  constructor(private readonly options: ProviderEvidenceProducerOptions) {
    requireIdentity('tenantId', options.tenantId);
    requireIdentity('projectId', options.projectId);
    if (options.truthStore.projectId !== options.projectId
      || options.receiptLedger.projectId !== options.projectId) {
      throw new TypeError('Provider evidence stores must share one canonical project identity');
    }
    for (const ref of [
      options.sources.account.authorityRef,
      options.sources.limit.authorityRef,
      options.sources.reachability.authorityRef,
    ]) assertOpaqueEvidenceRef('provider evidence source authority', ref, true);
    this.now = options.now ?? (() => new Date());
    this.limitMaxTtlMs = options.limitMaxTtlMs ?? DEFAULT_LIMIT_MAX_TTL_MS;
    this.reachabilityTtlMs = options.reachabilityTtlMs ?? DEFAULT_REACHABILITY_TTL_MS;
    requirePositiveTtl('limitMaxTtlMs', this.limitMaxTtlMs);
    requirePositiveTtl('reachabilityTtlMs', this.reachabilityTtlMs);
    this.authorityRef = authorityRef(
      'producer',
      options.tenantId,
      options.projectId,
      options.sources.account.authorityRef,
      options.sources.limit.authorityRef,
      options.sources.reachability.authorityRef,
    );
  }

  async refresh(request: ProviderEvidenceRefreshRequest): Promise<ProviderEvidenceRefreshResult> {
    try {
      return await this.refreshChecked(request);
    } catch (error) {
      return hold('authority_failure', errorCode(error));
    }
  }

  private async refreshChecked(
    request: ProviderEvidenceRefreshRequest,
  ): Promise<ProviderEvidenceRefreshResult> {
    requireIdentity('idempotencyKey', request.idempotencyKey);
    requireIdentity('runId', request.runId);
    requireIdentity('callId', request.callId);
    assertCanonicalProviderId(request.provider);
    assertCanonicalModelApiId(request.model);
    assertOpaqueEvidenceRef('approval evidence', request.approval.evidenceRef, true);
    assertOpaqueEvidenceRef('budget evidence', request.budget.evidenceRef, true);
    if (request.executionProfile.provider !== request.provider
      || request.executionProfile.profileRef !== request.backend.executionProfileRef) {
      return hold('authority_failure', 'execution-profile-mismatch');
    }

    let accountRefHash: string | null = null;
    if (request.authMode !== 'local') {
      const identity = await this.options.sources.account.resolve({
        tenantId: this.options.tenantId,
        provider: request.provider,
        authMode: request.authMode,
      });
      if (identity.state === 'hold') {
        assertOpaqueEvidenceRef('account authority evidence', identity.evidenceRef, true);
        return hold('account_authority_hold', identity.evidenceRef);
      }
      if (!identity.stableAccountIdentity) return hold('account_authority_hold', 'empty-principal');
      accountRefHash = this.options.keyring.pseudonymizeAccount({
        tenantId: this.options.tenantId,
        provider: request.provider,
        authMode: request.authMode,
        stableAccountIdentity: identity.stableAccountIdentity,
      });
    }

    const limitScope = {
      tenantId: this.options.tenantId,
      projectId: this.options.projectId,
      provider: request.provider,
      accountRefHash,
      authMode: request.authMode,
      backend: {
        transport: request.backend.transport,
        executionBackend: request.backend.executionBackend,
        endpointRefHash: request.backend.endpointRefHash,
      },
    } as const;
    const quotaScopeRefHash = deriveProviderQuotaScopeRefHash(limitScope);
    const policy = this.options.policyResolver({ ...limitScope, quotaScopeRefHash });
    if (!policy) return hold('limit_policy_unavailable', request.provider);

    const startedAt = this.now();
    const maxLimitExpiry = new Date(startedAt.getTime() + this.limitMaxTtlMs).toISOString();
    let observed: ProviderLimitSourceObservation;
    try {
      observed = await this.options.sources.limit.observe(limitScope);
    } catch (error) {
      const unavailable = createProviderLimitResult(sourceFailureObservation(request, {
        ...limitScope,
        source: this.options.sources.limit,
        now: startedAt,
        expiresAt: maxLimitExpiry,
        detail: errorCode(error),
      }), policy, {
        idFactory: () => `limit-${digest(this.options.tenantId, this.options.projectId, request.idempotencyKey).slice(0, 32)}`,
      });
      this.options.limitStore.putSnapshot(unavailable);
      return hold('limit_source_failure', errorCode(error), unavailable);
    }

    const observedAt = this.now();
    const fetchedAt = Date.parse(observed.source.fetchedAt);
    const observedExpiry = Date.parse(observed.source.expiresAt);
    if (!Number.isFinite(fetchedAt)
      || fetchedAt < startedAt.getTime()
      || fetchedAt > observedAt.getTime()
      || !Number.isFinite(observedExpiry)
      || observedExpiry > fetchedAt + this.limitMaxTtlMs) {
      return hold('limit_source_invalid', this.options.sources.limit.authorityRef);
    }
    const limit = createProviderLimitResult({
      idempotencyKey: `${request.idempotencyKey}:limit`,
      ...limitScope,
      quotaScopeRefHash,
      state: observed.state,
      requiredWindowIds: observed.requiredWindowIds,
      windows: observed.windows,
      source: {
        ...observed.source,
        kind: this.options.sources.limit.kind,
        authority: this.options.sources.limit.authority,
      },
      evidenceRefs: observed.evidenceRefs,
    }, policy, {
      idFactory: () => `limit-${digest(this.options.tenantId, this.options.projectId, request.idempotencyKey).slice(0, 32)}`,
    });
    const limitWrite = this.options.limitStore.putSnapshot(limit);
    const reachabilityId = `reach-${digest(
      this.options.tenantId,
      this.options.projectId,
      request.idempotencyKey,
    ).slice(0, 32)}`;
    const priorReachability = this.options.truthStore.getReachability(
      { tenantId: this.options.tenantId, projectId: this.options.projectId },
      reachabilityId,
      startedAt,
    );
    if (priorReachability) {
      const priorReceipt = this.receiptRef(request);
      const priorReceiptView = this.options.receiptLedger.get(priorReceipt, priorReceipt.invocationId);
      const receiptProvesAcceptedCall = priorReceiptView?.transportOutcome === 'succeeded'
        && priorReceiptView.consumerOutcome === 'accepted';
      return priorReachability.liveProven
        && limit.state === 'known'
        && limit.decision === 'allow'
        && receiptProvesAcceptedCall
        ? {
          state: 'ready',
          authorityEvidenceRef: this.authorityRef,
          limit,
          reachability: priorReachability,
          receiptRef: priorReceipt,
        }
        : hold(
          receiptProvesAcceptedCall || !priorReachability.liveProven
            ? 'probe_unreachable'
            : 'probe_replay_blocked',
          priorReachability.reasonCode,
          limit,
          priorReachability,
          priorReceiptView ? priorReceipt : null,
        );
    }

    const invocationId = this.invocationId(request);
    const scope = { tenantId: this.options.tenantId, projectId: this.options.projectId };
    if (this.options.receiptLedger.get(scope, invocationId)) {
      return hold('probe_replay_blocked', invocationId, limit);
    }

    let receiptRef: InvocationReceiptRef | null = null;
    let dispatchStartedAt: Date | null = null;
    let transportObservation: ReachabilityProbeObservation | null = null;
    let raced = false;
    const wrappedProbe: ReachabilityProbeTransport = async (probeRequest) => {
      const receipt = this.buildReceipt(request, limit, limitWrite.evidenceRef, invocationId);
      const declared = this.options.receiptLedger.declare(receipt);
      receiptRef = declared.ref;
      if (!declared.created) {
        raced = true;
        throw new Error('provider reachability probe declaration raced');
      }
      dispatchStartedAt = this.now();
      this.options.receiptLedger.append(scope, invocationId, {
        eventId: `${invocationId}:dispatch`,
        type: 'dispatch_started',
        occurredAt: dispatchStartedAt.toISOString(),
        payload: { attempt: 1 },
      });
      try {
        transportObservation = await this.options.sources.reachability.probe(probeRequest);
        return transportObservation;
      } catch (error) {
        transportObservation = {
          outcome: 'transport-error',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: null,
        };
        return transportObservation;
      } finally {
        const endedAt = this.now();
        const mapped = mapTransportOutcome(transportObservation ?? {
          outcome: 'transport-error',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: null,
        });
        this.options.receiptLedger.append(scope, invocationId, {
          eventId: `${invocationId}:transport`,
          type: 'transport_settled',
          occurredAt: endedAt.toISOString(),
          payload: {
            outcome: mapped.outcome,
            exitCode: null,
            signal: null,
            reasonCode: mapped.reasonCode,
            durationMs: Math.max(0, endedAt.getTime() - dispatchStartedAt!.getTime()),
          },
        });
      }
    };

    let reachability: ReachabilityResult | null = null;
    try {
      reachability = await probeExactModelReachability({
        idempotencyKey: `${request.idempotencyKey}:reachability`,
        tenantId: this.options.tenantId,
        projectId: this.options.projectId,
        provider: request.provider,
        model: request.model,
        auth: { mode: request.authMode, accountRefHash },
        backend: request.backend,
        probeKind: 'model-invocation',
        capability: 'inference',
        admission: {
          // Owner approval is represented here; provider capacity has its own
          // independently-evidenced decision below. Keeping the authorities
          // separate lets the core report `limit_hold` instead of mislabelling
          // an approved but capacity-blocked probe as `approval_required`.
          decision: 'allow',
          tenantId: this.options.tenantId,
          projectId: this.options.projectId,
          provider: request.provider,
          model: request.model,
          auth: { mode: request.authMode, accountRefHash },
          backend: request.backend,
          approvalRef: request.approval.evidenceRef,
          approvalGrantedAt: request.approval.grantedAt,
          approvalExpiresAt: request.approval.expiresAt,
          limits: {
            state: limit.state,
            decision: limit.decision,
            evidenceRefs: [limitWrite.evidenceRef, ...limit.evidenceRefs],
            fetchedAt: limit.source.fetchedAt,
            expiresAt: limit.source.expiresAt,
          },
          budget: request.budget,
        },
        executionProfile: request.executionProfile,
        evidenceRefs: [
          this.options.sources.account.authorityRef,
          this.options.sources.limit.authorityRef,
          this.options.sources.reachability.authorityRef,
        ],
        ttlMs: this.reachabilityTtlMs,
      }, {
        probe: wrappedProbe,
        now: this.now,
        idFactory: () => reachabilityId,
      });

      if (raced) return hold('probe_replay_blocked', invocationId, limit);
      this.options.truthStore.putReachability(reachability);
    } catch (error) {
      if (receiptRef && !raced) {
        this.options.receiptLedger.append(scope, invocationId, {
          eventId: `${invocationId}:consumer`,
          type: 'consumer_settled',
          occurredAt: this.now().toISOString(),
          payload: { outcome: 'rejected', reasonCode: 'validation_failed' },
        });
      }
      return hold('authority_failure', errorCode(error), limit, reachability, receiptRef);
    }
    if (!reachability) return hold('authority_failure', 'reachability-missing', limit, null, receiptRef);
    if (receiptRef) {
      this.options.receiptLedger.append(scope, invocationId, {
        eventId: `${invocationId}:consumer`,
        type: 'consumer_settled',
        occurredAt: this.now().toISOString(),
        payload: {
          outcome: reachability.liveProven ? 'accepted' : 'rejected',
          reasonCode: reachability.liveProven ? 'none' : 'validation_failed',
        },
      });
    }
    if (!reachability.liveProven || !receiptRef) {
      return hold(
        limit.decision === 'hold' ? 'limit_hold' : 'probe_unreachable',
        reachability.reasonCode,
        limit,
        reachability,
        receiptRef,
      );
    }
    return {
      state: 'ready',
      authorityEvidenceRef: this.authorityRef,
      limit,
      reachability,
      receiptRef,
    };
  }

  private invocationId(request: ProviderEvidenceRefreshRequest): string {
    return `inv-probe-${digest(
      this.options.tenantId,
      this.options.projectId,
      request.idempotencyKey,
    ).slice(0, 32)}`;
  }

  private receiptRef(request: ProviderEvidenceRefreshRequest): InvocationReceiptRef {
    return {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      tenantId: this.options.tenantId,
      projectId: this.options.projectId,
      invocationId: this.invocationId(request),
    };
  }

  private buildReceipt(
    request: ProviderEvidenceRefreshRequest,
    limit: ProviderLimitResult,
    limitEvidenceRef: string,
    invocationId: string,
  ): InvocationReceipt {
    const selection = {
      provider: request.provider,
      model: request.model,
      source: 'wire' as const,
      reasonCode: 'none' as const,
    };
    return {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      invocationId,
      idempotencyKey: `${request.idempotencyKey}:probe-receipt`,
      tenantId: this.options.tenantId,
      projectId: this.options.projectId,
      runId: request.runId,
      taskId: request.taskId,
      callId: request.callId,
      role: 'brain',
      purpose: 'reachability-probe',
      configured: { ...selection, source: 'config' },
      requested: { ...selection, source: 'directive' },
      resolved: { ...selection, source: 'router' },
      called: selection,
      backend: {
        transport: request.backend.transport,
        executionBackend: request.backend.executionBackend,
      },
      auth: { mode: request.authMode, accountRefHash: limit.accountRefHash },
      fallbackChain: [],
      reachability: { state: 'unknown', evidenceRef: null },
      limits: { state: limit.state, evidenceRefs: [limitEvidenceRef, ...limit.evidenceRefs] },
      createdAt: this.now().toISOString(),
    };
  }
}
