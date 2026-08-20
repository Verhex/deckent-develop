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
  evaluateProviderLimitWindows,
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
import type {
  ProbeFreshnessEpoch,
  ProbeInvocationIdentity,
  ProbeScopeDigest,
  ReachabilityProbeBudget,
} from './provider-evidence-probe-contract.js';
import { isReachabilityProbeBudget } from './provider-evidence-probe-contract.js';
import type { ExactReachabilityQuery } from './provider-truth-store.js';

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
  /**
   * 7081 layer-2: nullable — a refresh that reuses fresh evidence needs no
   * one-shot approval; a REAL probe without one holds with the typed
   * probe_approval_required (see refreshChecked).
   */
  readonly approval: {
    readonly evidenceRef: string | null;
    readonly grantedAt: string | null;
    readonly expiresAt: string | null;
  };
  readonly budget: {
    readonly evidenceRef: string;
    /**
     * Billing-mode discriminated probe ceiling (§12.2 clause 2). The
     * subscription/free/local arm carries token+timeout ceilings and has no
     * usd field; only the metered-api arm requires an owner-authored usd
     * ceiling. A flat unconditional maxUsd here would force fabricating USD
     * authority for subscription work.
     */
    readonly projection: ReachabilityProbeBudget;
  };
}

export type ProviderEvidenceHoldReason =
  | 'account_authority_hold'
  /** 7081 layer-2: a real probe needs the one-shot owner approval; fresh-evidence reuse never reaches this. */
  | 'probe_approval_required'
  | 'source_bundle_unavailable'
  | 'limit_policy_unavailable'
  | 'limit_source_failure'
  | 'limit_source_invalid'
  | 'limit_hold'
  | 'probe_replay_blocked'
  | 'probe_cooldown'
  | 'probe_singleflight_deferred'
  | 'probe_unreachable'
  | 'authority_failure';

export interface ProviderEvidenceRefreshHeld {
  readonly state: 'hold';
  readonly reasonCode: ProviderEvidenceHoldReason;
  readonly authorityEvidenceRef: string;
  readonly limit: ProviderLimitResult | null;
  readonly reachability: ReachabilityResult | null;
  readonly receiptRef: InvocationReceiptRef | null;
  /** Immutable evidence that explains a cooldown or bounded singleflight deferral. */
  readonly deferralEvidenceRef: string | null;
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
// 7094/7081 xverify-ux fix (2026-08-20): the old 60s TTL guaranteed an
// approval carousel — every owner-approved probe result went stale before the
// NEXT verification run even started (a single verifier run takes 60-300s),
// so each xverify asked for a fresh one-shot approval (observed across the
// D1-D4/F4a seal sessions). Reusing a fresh liveProven row is already the
// §12.2 freshness contract; only the window was wrong. Config-resolved via
// `cross_verify.reachability_ttl_ms`; this constant is the resolver fallback.
const DEFAULT_REACHABILITY_TTL_MS = 1_800_000;
const DEFAULT_ACCOUNT_IDENTITY_MAX_TTL_MS = 60_000;
const SINGLEFLIGHT_RETRY_DELAYS_MS = [2, 4, 8] as const;
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
  deferralEvidenceRef: string | null = null,
): ProviderEvidenceRefreshHeld {
  return {
    state: 'hold',
    reasonCode,
    authorityEvidenceRef: authorityRef(reasonCode, detail),
    limit,
    reachability,
    receiptRef,
    deferralEvidenceRef,
  };
}

function pause(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
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
    // Content-versioned by the read instant so a fixed caller idempotencyKey
    // (e.g. the pre-compose seam's stable xverify-prep key) does not collide
    // with an earlier snapshot that carried different windows/timestamps.
    idempotencyKey: `${request.idempotencyKey}:limit:${input.now.toISOString()}`,
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
    // 7081 approval-carousel layer-2 (2026-08-20): approval evidence is only
    // REQUIRED when a real probe is about to fire — requiring it at entry
    // made the fresh-evidence reuse path unreachable without a new one-shot
    // approval (the preparation layer had already stopped asking when a
    // fresh row existed, and this assert then failed the whole refresh with
    // authority_failure). Shape is still validated here when present; the
    // presence requirement moves to the probe branch below.
    assertOpaqueEvidenceRef('approval evidence', request.approval.evidenceRef, false);
    assertOpaqueEvidenceRef('budget evidence', request.budget.evidenceRef, true);
    if (!isReachabilityProbeBudget(request.budget.projection)) {
      return hold('authority_failure', 'budget-projection-invalid');
    }
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
        idFactory: () => `limit-${digest(this.options.tenantId, this.options.projectId, request.idempotencyKey, startedAt.toISOString()).slice(0, 32)}`,
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
      // Content-versioned by the observation's read instant so a fixed caller
      // idempotencyKey never conflicts with an earlier, differently-timestamped
      // snapshot (the reachability keys are already epoch-versioned; the limit
      // snapshot needs the same treatment or a stable xverify-prep key throws
      // IDEMPOTENCY_CONFLICT on every re-run).
      idempotencyKey: `${request.idempotencyKey}:limit:${observed.source.fetchedAt}`,
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
      idFactory: () => `limit-${digest(this.options.tenantId, this.options.projectId, request.idempotencyKey, observed.source.fetchedAt).slice(0, 32)}`,
    });
    const limitWrite = this.options.limitStore.putSnapshot(limit);

    // Probe-scoped limit admission (§12.2 Öneri-A). The durable snapshot above
    // stays exactly as the source proved it — an advisory codex/claude usage
    // read is `unknown/hold` in the truth store, so heavy-task admission still
    // sees the advisory truth. But a bounded, owner-budgeted reachability probe
    // does not need a reservation-capable authoritative source: it only needs
    // the real usage to be under the block ratio. So for the probe's OWN
    // admission we evaluate the advisory windows here. It still fails closed at
    // `blockAtRatio`, so an exhausted quota blocks the probe; it just no longer
    // demands an authority subscription CLIs cannot expose. This value never
    // enters the durable snapshot or any other admission surface.
    const probeLimitAdmission = limit.state === 'known'
      ? { state: limit.state, decision: limit.decision }
      : observed.state === 'known'
        ? (() => {
            const evaluated = evaluateProviderLimitWindows(
              limit.windows, limit.requiredWindowIds, policy,
            );
            return { state: evaluated.state, decision: evaluated.decision };
          })()
        : { state: limit.state, decision: limit.decision };

    const exactReachabilityScope: ExactReachabilityQuery = {
      tenantId: this.options.tenantId,
      projectId: this.options.projectId,
      provider: request.provider,
      model: request.model,
      authMode: request.authMode,
      accountRefHash,
      transport: request.backend.transport,
      executionBackend: request.backend.executionBackend,
      endpointRefHash: request.backend.endpointRefHash,
      runtimeFingerprint: request.backend.runtimeFingerprint,
      executionProfileRef: request.backend.executionProfileRef,
      capability: 'inference',
    };
    // This is deliberately re-read before every probe attempt. The latest exact
    // scope is independent of a caller's idempotency key.
    let priorReachability = this.options.truthStore.getLatestReachability(exactReachabilityScope, startedAt);
    if (priorReachability && priorReachability.state !== 'stale') {
      const priorReceipt = this.receiptRefFromReachability(priorReachability);
      // Reuse gates on the SAME probe-scoped admission as a fresh probe
      // (§12.2 Öneri-A): an advisory usage read under the block ratio admits
      // reuse of a fresh liveProven row. The row's authenticity is guaranteed
      // by the truth store's integrity verification on read — re-fetching the
      // receipt to "re-prove" the accepted call was belt-and-suspenders that
      // dead-ended at authority_failure whenever the receipt had rotated out
      // from under a still-fresh row (exactly what stalled the Fable→Sol
      // smoke). The receipt is supplementary audit, not the reachability truth.
      if (priorReachability.liveProven
        && probeLimitAdmission.state === 'known' && probeLimitAdmission.decision === 'allow'
        && priorReceipt) {
        return {
          state: 'ready',
          authorityEvidenceRef: this.authorityRef,
          limit,
          reachability: priorReachability,
          receiptRef: priorReceipt,
        };
      }
      if (!priorReachability.liveProven) {
        return hold(
          'probe_cooldown',
          priorReachability.reasonCode,
          limit,
          priorReachability,
          priorReceipt,
          `provider-reachability:${priorReachability.reachabilityId}`,
        );
      }
      // liveProven but the probe-scoped admission now blocks (quota over the
      // block ratio): an honest limit_hold, never authority_failure.
      return hold('limit_hold', priorReachability.reasonCode, limit, priorReachability, priorReceipt);
    }

    // 7081 layer-2: past this point a REAL probe fires — the one-shot owner
    // approval is required exactly here (fresh-evidence reuse above never
    // reaches this branch). Missing approval is the honest typed hold the
    // preparation layer already knows how to remedy, never authority_failure.
    if (request.approval.evidenceRef === null || request.approval.evidenceRef === '') {
      return hold('probe_approval_required', 'probe-approval-missing', limit, priorReachability ?? null, null);
    }
    const identity = this.probeInvocationIdentity(exactReachabilityScope, priorReachability);
    const invocationId = this.invocationId(identity);
    const reachabilityId = `reach-${digest(identity.scopeDigest, identity.freshnessEpoch).slice(0, 32)}`;
    const scope = { tenantId: this.options.tenantId, projectId: this.options.projectId };

    const receipt = this.buildReceipt(request, limit, limitWrite.evidenceRef, invocationId, identity);
    let receiptRef: InvocationReceiptRef | null = null;
    // Singleflight is keyed on the PROBE admission decision: an advisory limit
    // that admits the bounded probe still needs the first-writer-wins receipt
    // declaration so concurrent contenders do not each fire a real probe.
    let ownsProbe = probeLimitAdmission.decision !== 'allow';
    if (!ownsProbe) {
      try {
        const declared = this.options.receiptLedger.declare(receipt);
        receiptRef = declared.ref;
        ownsProbe = declared.created;
      } catch (error) {
        if (errorCode(error) !== 'IDEMPOTENCY_CONFLICT') throw error;
      }
    }

    if (!ownsProbe) {
      for (const delayMs of SINGLEFLIGHT_RETRY_DELAYS_MS) {
        await pause(delayMs);
        priorReachability = this.options.truthStore.getLatestReachability(exactReachabilityScope, this.now());
        if (!priorReachability || priorReachability.state === 'stale') continue;
        const winnerReceipt = this.receiptRefFromReachability(priorReachability);
        const winnerReceiptView = winnerReceipt
          ? this.options.receiptLedger.get(winnerReceipt, winnerReceipt.invocationId)
          : null;
        if (priorReachability.liveProven
          && winnerReceiptView?.transportOutcome === 'succeeded'
          && winnerReceiptView.consumerOutcome === 'accepted'
          && winnerReceipt) {
          return {
            state: 'ready', authorityEvidenceRef: this.authorityRef, limit,
            reachability: priorReachability, receiptRef: winnerReceipt,
          };
        }
        return hold(
          'probe_cooldown', priorReachability.reasonCode, limit, priorReachability, winnerReceipt,
          `provider-reachability:${priorReachability.reachabilityId}`,
        );
      }
      return hold(
        'probe_singleflight_deferred', identity.freshnessEpoch, limit, null, null,
        `provider-singleflight:${identity.scopeDigest}:${identity.freshnessEpoch}`,
      );
    }

    let dispatchStartedAt: Date | null = null;
    let transportObservation: ReachabilityProbeObservation | null = null;
    const wrappedProbe: ReachabilityProbeTransport = async (probeRequest) => {
      dispatchStartedAt = this.now();
      this.options.receiptLedger.append(scope, invocationId, {
        eventId: `${invocationId}:dispatch`,
        type: 'dispatch_started',
        occurredAt: dispatchStartedAt.toISOString(),
        payload: { attempt: this.probeAttempt(identity) },
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
        idempotencyKey: `reachability:${identity.scopeDigest}:${identity.freshnessEpoch}`,
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
            // Probe-scoped admission (§12.2 Öneri-A): an advisory usage read
            // under the block ratio admits the bounded probe. The durable
            // snapshot the evidenceRefs point at is unchanged (still advisory).
            state: probeLimitAdmission.state,
            decision: probeLimitAdmission.decision,
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
          `invocation-receipt:${invocationId}`,
        ],
        ttlMs: this.reachabilityTtlMs,
      }, {
        probe: wrappedProbe,
        now: this.now,
        idFactory: () => reachabilityId,
      });

      this.options.truthStore.putReachability(reachability);
    } catch (error) {
      if (receiptRef) {
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

  private probeInvocationIdentity(
    scope: ExactReachabilityQuery,
    priorReachability: ReachabilityResult | null,
  ): ProbeInvocationIdentity {
    const scopeDigest = digest(
      scope.tenantId,
      scope.projectId,
      scope.provider,
      scope.model,
      scope.authMode,
      scope.accountRefHash ?? 'none',
      scope.transport,
      scope.executionBackend,
      scope.endpointRefHash ?? 'none',
      scope.runtimeFingerprint ?? 'none',
      scope.executionProfileRef,
      scope.capability,
    ) as ProbeScopeDigest;
    const freshnessEpoch = digest(
      'provider-reachability-freshness-epoch',
      scopeDigest,
      priorReachability?.probe.expiresAt ?? 'absent',
    ) as ProbeFreshnessEpoch;
    return { scopeDigest, freshnessEpoch };
  }

  private invocationId(identity: ProbeInvocationIdentity): string {
    return `inv-probe-${digest(identity.scopeDigest, identity.freshnessEpoch).slice(0, 32)}`;
  }

  private probeAttempt(identity: ProbeInvocationIdentity): number {
    return (Number.parseInt(identity.freshnessEpoch.slice(0, 12), 16) % Number.MAX_SAFE_INTEGER) + 1;
  }

  private receiptRefFromReachability(result: ReachabilityResult): InvocationReceiptRef | null {
    const receiptEvidence = result.evidenceRefs.find(ref => ref.startsWith('invocation-receipt:'));
    if (!receiptEvidence) return null;
    const invocationId = receiptEvidence.slice('invocation-receipt:'.length);
    if (!invocationId) return null;
    return {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
      tenantId: this.options.tenantId,
      projectId: this.options.projectId,
      invocationId,
    };
  }

  private buildReceipt(
    request: ProviderEvidenceRefreshRequest,
    limit: ProviderLimitResult,
    limitEvidenceRef: string,
    invocationId: string,
    identity: ProbeInvocationIdentity,
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
      idempotencyKey: `probe-receipt:${identity.scopeDigest}:${identity.freshnessEpoch}`,
      tenantId: this.options.tenantId,
      projectId: this.options.projectId,
      runId: `probe:${identity.scopeDigest}`,
      taskId: null,
      callId: `probe:${identity.freshnessEpoch}`,
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
