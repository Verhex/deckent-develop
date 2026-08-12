import { createHash } from 'node:crypto';

import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationAuthMode,
  type InvocationExecutionBackend,
  type InvocationReceipt,
  type InvocationReceiptLedger,
  type InvocationReceiptRef,
  type InvocationTransport,
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
  assertOpaqueSha256,
  probeExactModelReachability,
  type ProviderExecutionProfile,
  type ReachabilityBackendScope,
  type ReachabilityProbeObservation,
  type ReachabilityProbeTransport,
  type ReachabilityResult,
} from './provider-truth.js';

export type ProviderAccountIdentityKind =
  | 'provider-account'
  | 'organization'
  | 'workspace';

export interface ProviderAccountIdentityRequest {
  readonly tenantId: string;
  readonly provider: string;
  readonly authMode: InvocationAuthMode;
  readonly backend: ReachabilityBackendScope;
  readonly executionProfile: ProviderExecutionProfile;
}

export interface ProviderAccountIdentityReady {
  readonly state: 'ready';
  readonly provider: string;
  readonly authMode: InvocationAuthMode;
  readonly identityKind: ProviderAccountIdentityKind;
  readonly assurance: 'provider-verified';
  readonly issuer: string;
  /** Raw subject is host-memory-only and is immediately pseudonymized by the keyring. */
  readonly stableSubject: string;
  readonly evidenceRef: string;
  readonly credentialGenerationRef: string;
  readonly backendScopeRefHash: string;
  readonly fetchedAt: string;
  readonly expiresAt: string;
}

export interface ProviderCredentialOnlyIdentity {
  readonly state: 'credential-only';
  readonly credentialGenerationRef: string;
  readonly evidenceRef: string;
  readonly fetchedAt: string;
  readonly expiresAt: string;
}

export type ProviderAccountIdentityResult =
  | ProviderAccountIdentityReady
  | ProviderCredentialOnlyIdentity
  | { readonly state: 'hold'; readonly evidenceRef: string };

export interface ProviderAccountIdentityAuthority {
  readonly authorityRef: string;
  resolve(input: ProviderAccountIdentityRequest): Promise<ProviderAccountIdentityResult>;
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
    readonly model: string;
    readonly authMode: InvocationAuthMode;
    readonly accountRefHash: string | null;
    readonly accountEvidence: {
      readonly identityEvidenceRef: string;
      readonly credentialGenerationRef: string;
      readonly backendScopeRefHash: string;
    } | null;
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

export interface ProviderEvidenceSourceScope {
  readonly provider: string;
  readonly authMode: InvocationAuthMode;
  readonly transport: InvocationTransport;
  readonly executionBackend: InvocationExecutionBackend;
}

export interface ProviderEvidenceSourceSelection extends ProviderEvidenceSourceScope {
  readonly authorityEvidenceRef: string;
  readonly sources: ProviderEvidenceSources;
}

export interface ProviderEvidenceSourceResolver {
  readonly authorityRef: string;
  resolve(scope: ProviderEvidenceSourceScope): ProviderEvidenceSourceSelection | null;
}

export interface ProviderEvidenceProducerOptions {
  readonly tenantId: string;
  readonly projectId: string;
  readonly keyring: ProviderAuthorityKeyring;
  readonly truthStore: ProviderTruthStore;
  readonly limitStore: ProviderLimitStore;
  readonly receiptLedger: InvocationReceiptLedger;
  readonly sourceResolver: ProviderEvidenceSourceResolver;
  readonly policyResolver: (input: ProviderLimitSnapshotQuery) => ProviderLimitPolicy | null;
  readonly now?: () => Date;
  readonly accountIdentityMaxTtlMs?: number;
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
  | 'source_bundle_unavailable'
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
const DEFAULT_ACCOUNT_IDENTITY_MAX_TTL_MS = 60_000;
const ACCOUNT_IDENTITY_KINDS = new Set<ProviderAccountIdentityKind>([
  'provider-account',
  'organization',
  'workspace',
]);

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function authorityRef(kind: string, ...parts: readonly string[]): string {
  return `provider-evidence:${digest(kind, ...parts)}`;
}

export function deriveProviderAccountBackendScopeRefHash(
  request: Pick<ProviderAccountIdentityRequest, 'provider' | 'authMode' | 'backend' | 'executionProfile'>,
): string {
  return digest(
    request.provider,
    request.authMode,
    request.backend.transport,
    request.backend.executionBackend,
    request.backend.endpointRefHash ?? 'none',
    request.backend.runtimeFingerprint ?? 'none',
    request.backend.executionProfileRef,
    request.executionProfile.profileRef,
    request.executionProfile.provider,
  );
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

/** The account evidence trio carried alongside a resolved `accountRefHash`. */
export interface ProviderAccountEvidence {
  readonly identityEvidenceRef: string;
  readonly credentialGenerationRef: string;
  readonly backendScopeRefHash: string;
}

export type ProviderAccountRefHashResolution =
  | {
      readonly state: 'ready';
      /** Null only for `local` auth, which has no provider account authority. */
      readonly accountRefHash: string | null;
      readonly accountEvidence: ProviderAccountEvidence | null;
    }
  | { readonly state: 'hold'; readonly detail: string };

function isUsableAccountIdentity(
  identity: ProviderAccountIdentityReady,
  request: ProviderAccountIdentityRequest,
  nowMs: number,
  maxTtlMs: number,
): boolean {
  try {
    assertCanonicalProviderId(identity.provider);
    assertOpaqueEvidenceRef('account identity evidence', identity.evidenceRef, true);
    assertOpaqueEvidenceRef(
      'account credential generation evidence',
      identity.credentialGenerationRef,
      true,
    );
    assertOpaqueSha256('account backend scope ref', identity.backendScopeRefHash, true);
    requireIdentity('account identity issuer', identity.issuer);
    requireIdentity('account identity stable subject', identity.stableSubject);
  } catch {
    return false;
  }
  if (identity.provider !== request.provider
    || identity.authMode !== request.authMode
    || identity.assurance !== 'provider-verified'
    || !ACCOUNT_IDENTITY_KINDS.has(identity.identityKind)
    || identity.backendScopeRefHash !== deriveProviderAccountBackendScopeRefHash(request)) {
    return false;
  }
  const fetchedAt = Date.parse(identity.fetchedAt);
  const expiresAt = Date.parse(identity.expiresAt);
  return Number.isFinite(fetchedAt)
    && Number.isFinite(expiresAt)
    && new Date(fetchedAt).toISOString() === identity.fetchedAt
    && new Date(expiresAt).toISOString() === identity.expiresAt
    && fetchedAt <= nowMs
    && expiresAt > nowMs
    && expiresAt - fetchedAt <= maxTtlMs;
}

/**
 * The single live account-identity → pseudonymous `accountRefHash` derivation.
 *
 * Both the evidence producer's refresh path and the owner-facing provider-limit
 * authoring flow call THIS function: an authored selector hash that a second
 * derivation produced would silently stop matching the consuming resolver, so
 * there is deliberately only one. Raw subject material stays host-memory-only —
 * it never leaves this function un-pseudonymized.
 */
export async function resolveProviderAccountRefHash(input: {
  readonly account: ProviderAccountIdentityAuthority;
  readonly keyring: Pick<ProviderAuthorityKeyring, 'pseudonymizeAccount'>;
  readonly request: ProviderAccountIdentityRequest;
  readonly now: () => Date;
  readonly maxTtlMs: number;
}): Promise<ProviderAccountRefHashResolution> {
  if (input.request.authMode === 'local') {
    return { state: 'ready', accountRefHash: null, accountEvidence: null };
  }
  let identity: ProviderAccountIdentityResult;
  try {
    identity = await input.account.resolve(input.request);
  } catch (error) {
    return { state: 'hold', detail: `source:${errorCode(error)}` };
  }
  if (identity.state === 'hold') {
    assertOpaqueEvidenceRef('account authority evidence', identity.evidenceRef, true);
    return { state: 'hold', detail: identity.evidenceRef };
  }
  if (identity.state === 'credential-only') {
    try {
      assertOpaqueEvidenceRef('credential generation evidence', identity.credentialGenerationRef, true);
      assertOpaqueEvidenceRef('credential-only authority evidence', identity.evidenceRef, true);
    } catch {
      return { state: 'hold', detail: 'credential-only-evidence-invalid' };
    }
    return { state: 'hold', detail: 'credential-only-not-account-authority' };
  }
  if (!isUsableAccountIdentity(identity, input.request, input.now().getTime(), input.maxTtlMs)) {
    return { state: 'hold', detail: 'account-evidence-invalid' };
  }
  return {
    state: 'ready',
    accountRefHash: input.keyring.pseudonymizeAccount({
      tenantId: input.request.tenantId,
      provider: input.request.provider,
      authMode: input.request.authMode,
      stableAccountIdentity: identity.stableSubject,
    }),
    accountEvidence: {
      identityEvidenceRef: identity.evidenceRef,
      credentialGenerationRef: identity.credentialGenerationRef,
      backendScopeRefHash: identity.backendScopeRefHash,
    },
  };
}

export class ProviderEvidenceProducer {
  readonly authorityRef: string;
  private readonly now: () => Date;
  private readonly accountIdentityMaxTtlMs: number;
  private readonly limitMaxTtlMs: number;
  private readonly reachabilityTtlMs: number;

  constructor(private readonly options: ProviderEvidenceProducerOptions) {
    requireIdentity('tenantId', options.tenantId);
    requireIdentity('projectId', options.projectId);
    if (options.truthStore.projectId !== options.projectId
      || options.receiptLedger.projectId !== options.projectId) {
      throw new TypeError('Provider evidence stores must share one canonical project identity');
    }
    assertOpaqueEvidenceRef(
      'provider evidence source resolver authority',
      options.sourceResolver.authorityRef,
      true,
    );
    this.now = options.now ?? (() => new Date());
    this.accountIdentityMaxTtlMs = options.accountIdentityMaxTtlMs
      ?? DEFAULT_ACCOUNT_IDENTITY_MAX_TTL_MS;
    this.limitMaxTtlMs = options.limitMaxTtlMs ?? DEFAULT_LIMIT_MAX_TTL_MS;
    this.reachabilityTtlMs = options.reachabilityTtlMs ?? DEFAULT_REACHABILITY_TTL_MS;
    requirePositiveTtl('accountIdentityMaxTtlMs', this.accountIdentityMaxTtlMs);
    requirePositiveTtl('limitMaxTtlMs', this.limitMaxTtlMs);
    requirePositiveTtl('reachabilityTtlMs', this.reachabilityTtlMs);
    this.authorityRef = authorityRef(
      'producer',
      options.tenantId,
      options.projectId,
      options.sourceResolver.authorityRef,
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
    const sourceScope: ProviderEvidenceSourceScope = {
      provider: request.provider,
      authMode: request.authMode,
      transport: request.backend.transport,
      executionBackend: request.backend.executionBackend,
    };
    let sourceSelection: ProviderEvidenceSourceSelection | null;
    try {
      sourceSelection = this.options.sourceResolver.resolve(sourceScope);
    } catch (error) {
      return hold('source_bundle_unavailable', `resolver:${errorCode(error)}`);
    }
    if (!sourceSelection) {
      return hold(
        'source_bundle_unavailable',
        digest(
          sourceScope.provider,
          sourceScope.authMode,
          sourceScope.transport,
          sourceScope.executionBackend,
        ),
      );
    }
    try {
      assertCanonicalProviderId(sourceSelection.provider);
      assertOpaqueEvidenceRef(
        'provider evidence source selection',
        sourceSelection.authorityEvidenceRef,
        true,
      );
      for (const ref of [
        sourceSelection.sources.account.authorityRef,
        sourceSelection.sources.limit.authorityRef,
        sourceSelection.sources.reachability.authorityRef,
      ]) assertOpaqueEvidenceRef('provider evidence source authority', ref, true);
    } catch {
      return hold('source_bundle_unavailable', 'source-selection-invalid');
    }
    if (sourceSelection.provider !== sourceScope.provider
      || sourceSelection.authMode !== sourceScope.authMode
      || sourceSelection.transport !== sourceScope.transport
      || sourceSelection.executionBackend !== sourceScope.executionBackend) {
      return hold('source_bundle_unavailable', 'source-selection-scope-mismatch');
    }
    const sources = sourceSelection.sources;

    const account = await resolveProviderAccountRefHash({
      account: sources.account,
      keyring: this.options.keyring,
      request: {
        tenantId: this.options.tenantId,
        provider: request.provider,
        authMode: request.authMode,
        backend: request.backend,
        executionProfile: request.executionProfile,
      },
      now: this.now,
      maxTtlMs: this.accountIdentityMaxTtlMs,
    });
    if (account.state === 'hold') return hold('account_authority_hold', account.detail);
    const accountRefHash = account.accountRefHash;
    const accountEvidence = account.accountEvidence;

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
      observed = await sources.limit.observe({
        ...limitScope,
        model: request.model,
        accountEvidence,
      });
    } catch (error) {
      const unavailable = createProviderLimitResult(sourceFailureObservation(request, {
        ...limitScope,
        source: sources.limit,
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
      return hold('limit_source_invalid', sources.limit.authorityRef);
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
        kind: sources.limit.kind,
        authority: sources.limit.authority,
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
        transportObservation = await sources.reachability.probe(probeRequest);
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
          this.options.sourceResolver.authorityRef,
          sourceSelection.authorityEvidenceRef,
          sources.account.authorityRef,
          sources.limit.authorityRef,
          sources.reachability.authorityRef,
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
