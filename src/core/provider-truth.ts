import { randomUUID } from 'node:crypto';

import type {
  InvocationAuthMode,
  InvocationEvidenceState,
  InvocationExecutionBackend,
  InvocationScope,
  InvocationTransport,
} from './invocation-receipt.js';
import { getLegacyModelMigration } from './model-registry.js';
import type { ReachabilityEvidence } from './role-invocation-resolver.js';

export const PROVIDER_TRUTH_SCHEMA_VERSION = 1 as const;

export type CapabilityStage = 'code-present' | 'wired' | 'enabled' | 'live-proven';
export type CapabilitySourceKind = 'builtin' | 'remote-catalog' | 'provider-list' | 'operator';
export type ReachabilityProbeKind =
  | 'catalog-list'
  | 'binary-version'
  | 'auth-status'
  | 'backend-health'
  | 'model-invocation';
export type ReachabilityCapability = 'inference' | 'tools' | 'vision' | 'streaming';
export type ReachabilityOutcome =
  | 'succeeded'
  | 'not-run'
  | 'unsupported'
  | 'backend-unreachable'
  | 'auth-rejected'
  | 'model-not-found'
  | 'rate-limited'
  | 'timeout'
  | 'transport-error'
  | 'invalid-response';
export type ReachabilityReasonCode =
  | 'none'
  | 'probe_not_run'
  | 'probe_not_live'
  | 'unsupported'
  | 'backend_unreachable'
  | 'auth_rejected'
  | 'model_not_found'
  | 'model_mismatch'
  | 'provider_mismatch'
  | 'approval_required'
  | 'limit_hold'
  | 'budget_required'
  | 'evidence_expired'
  | 'rate_limited'
  | 'timeout'
  | 'transport_error'
  | 'invalid_response';

export interface CapabilityStageEvidence {
  readonly state: InvocationEvidenceState;
  readonly evidenceRef: string | null;
}

export interface CapabilityValueEvidence {
  readonly value: boolean | number | string | null;
  readonly state: InvocationEvidenceState;
  readonly evidenceRef: string | null;
}

export interface CapabilityCatalogEntry {
  readonly provider: string;
  readonly model: string;
  readonly stages: Readonly<Record<Exclude<CapabilityStage, 'live-proven'>, CapabilityStageEvidence>>;
  readonly liveProofs: readonly ReachabilityProofReference[];
  readonly capabilities: Readonly<Record<string, CapabilityValueEvidence>>;
}

export interface CapabilityCatalog extends InvocationScope {
  readonly schemaVersion: typeof PROVIDER_TRUTH_SCHEMA_VERSION;
  readonly catalogId: string;
  readonly idempotencyKey: string;
  readonly entries: readonly CapabilityCatalogEntry[];
  readonly source: {
    readonly sourceId: string;
    readonly kind: CapabilitySourceKind;
    readonly fetchedAt: string;
    readonly expiresAt: string | null;
  };
}

export interface CapabilityCatalogInputEntry {
  readonly provider: string;
  readonly model: string;
  readonly capabilities: Readonly<Record<string, CapabilityValueEvidence>>;
  readonly stages?: Partial<Record<Exclude<CapabilityStage, 'live-proven'>, CapabilityStageEvidence>>;
}

export interface CapabilityCatalogInput extends InvocationScope {
  readonly catalogId?: string;
  readonly idempotencyKey: string;
  readonly entries: readonly CapabilityCatalogInputEntry[];
  readonly source: CapabilityCatalog['source'];
}

export interface ReachabilityBackendScope {
  readonly transport: InvocationTransport;
  readonly executionBackend: InvocationExecutionBackend;
  /** Opaque hash only; never persist a URL containing tenant or credential data. */
  readonly endpointRefHash: string | null;
  readonly runtimeFingerprint: string | null;
  /** Immutable adapter-owned compatibility profile reference. */
  readonly executionProfileRef: string;
}

export interface ReachabilityAuthScope {
  readonly mode: InvocationAuthMode;
  /** Opaque hash only; never persist an email, account id, token or credential. */
  readonly accountRefHash: string | null;
}

export interface ReachabilityProbeRequest extends InvocationScope {
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly model: string;
  readonly auth: ReachabilityAuthScope;
  readonly backend: ReachabilityBackendScope;
  readonly probeKind: ReachabilityProbeKind;
  readonly capability: ReachabilityCapability;
  readonly admission: ReachabilityAdmissionDecision;
  readonly executionProfile: ProviderExecutionProfile;
  readonly evidenceRefs?: readonly string[];
  readonly ttlMs: number;
}

/** Sanitized provider probe result. Prompt, output, argv and error bodies are forbidden. */
export interface ReachabilityProbeObservation {
  readonly outcome: ReachabilityOutcome;
  readonly calledProvider: string | null;
  readonly calledModel: string | null;
  readonly providerRequestRefHash: string | null;
  readonly latencyMs: number | null;
  /** Required when a successful probe claims tools, vision or streaming. */
  readonly verifiedCapability?: ReachabilityCapability | null;
  readonly evidenceRefs?: readonly string[];
}

export type ReachabilityProbeTransport = (
  request: Readonly<ReachabilityProbeRequest>,
) => Promise<ReachabilityProbeObservation>;

export interface ReachabilityResult extends InvocationScope {
  readonly schemaVersion: typeof PROVIDER_TRUTH_SCHEMA_VERSION;
  readonly reachabilityId: string;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly model: string;
  readonly auth: ReachabilityAuthScope;
  readonly backend: ReachabilityBackendScope;
  readonly executionProfile: ProviderExecutionProfile;
  readonly admission: ReachabilityAdmissionDecision;
  readonly probe: {
    readonly kind: ReachabilityProbeKind;
    readonly capability: ReachabilityCapability;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly expiresAt: string;
  };
  readonly state: InvocationEvidenceState;
  readonly reachable: boolean;
  readonly liveProven: boolean;
  readonly outcome: ReachabilityOutcome;
  readonly reasonCode: ReachabilityReasonCode;
  readonly observed: {
    readonly requestedProvider: string;
    readonly requestedModel: string;
    readonly calledProvider: string | null;
    readonly calledModel: string | null;
    readonly providerRequestRefHash: string | null;
    readonly latencyMs: number | null;
    readonly verifiedCapability: ReachabilityCapability | null;
  };
  readonly evidenceRefs: readonly string[];
}

export interface ProviderExecutionProfile {
  readonly profileRef: string;
  readonly provider: string;
  readonly allowed: readonly {
    readonly authMode: InvocationAuthMode;
    readonly transport: InvocationTransport;
    readonly executionBackend: InvocationExecutionBackend;
  }[];
}

export interface ReachabilityAdmissionDecision extends InvocationScope {
  readonly decision: 'allow' | 'hold';
  readonly provider: string;
  readonly model: string;
  readonly auth: ReachabilityAuthScope;
  readonly backend: ReachabilityBackendScope;
  readonly approvalRef: string | null;
  readonly approvalGrantedAt: string | null;
  readonly approvalExpiresAt: string | null;
  readonly limits: {
    readonly state: InvocationEvidenceState;
    readonly decision: 'allow' | 'hold';
    readonly evidenceRefs: readonly string[];
    readonly fetchedAt: string | null;
    readonly expiresAt: string | null;
  };
  readonly budget: {
    readonly evidenceRef: string | null;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly maxTotalTokens: number;
    readonly maxUsd: number;
  };
}

export interface ReachabilityProofReference {
  readonly evidenceRef: string;
  readonly auth: ReachabilityAuthScope;
  readonly backend: ReachabilityBackendScope;
  readonly capability: ReachabilityCapability;
  readonly expiresAt: string;
}

export interface ReachabilityProducerDependencies {
  readonly probe: ReachabilityProbeTransport;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

const UNKNOWN_STAGE: CapabilityStageEvidence = Object.freeze({ state: 'unknown', evidenceRef: null });

function requireNonEmpty(name: string, value: string): void {
  if (!value || value !== value.trim() || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${name} must be a non-empty canonical value`);
  }
}

export function assertCanonicalModelApiId(model: string): void {
  requireNonEmpty('model', model);
  if (model.length > 256 || /\s/u.test(model)) throw new Error('model must be a bounded exact API identity');
  if (getLegacyModelMigration(model)) throw new Error(`Legacy model alias is not a wire identity: ${model}`);
}

export function assertCanonicalProviderId(provider: string): void {
  requireNonEmpty('provider', provider);
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(provider)) throw new Error('provider must be a canonical provider id');
}

export function assertOpaqueSha256(name: string, value: string | null, required: boolean): void {
  if (value === null) {
    if (required) throw new Error(`${name} is required for live proof`);
    return;
  }
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${name} must be a SHA-256 digest`);
}

export function assertOpaqueEvidenceRef(name: string, value: string | null, required: boolean): void {
  if (value === null) {
    if (required) throw new Error(`${name} is required`);
    return;
  }
  if (value.length > 192 || value.includes('://') || !/^[a-z][a-z0-9-]*:[A-Za-z0-9._-]{8,160}$/u.test(value)) {
    throw new Error(`${name} must be an opaque durable reference`);
  }
}

function sameAuth(left: ReachabilityAuthScope, right: ReachabilityAuthScope): boolean {
  return left.mode === right.mode && left.accountRefHash === right.accountRefHash;
}

function sameBackend(left: ReachabilityBackendScope, right: ReachabilityBackendScope): boolean {
  return left.transport === right.transport
    && left.executionBackend === right.executionBackend
    && left.endpointRefHash === right.endpointRefHash
    && left.runtimeFingerprint === right.runtimeFingerprint
    && left.executionProfileRef === right.executionProfileRef;
}

function hasPositiveBudget(budget: ReachabilityAdmissionDecision['budget']): boolean {
  const values = [budget.maxInputTokens, budget.maxOutputTokens, budget.maxTotalTokens, budget.maxUsd];
  return values.every(value => Number.isFinite(value) && value > 0)
    && budget.maxInputTokens + budget.maxOutputTokens <= budget.maxTotalTokens;
}

function admissionMatchesRequest(request: ReachabilityProbeRequest): boolean {
  const admission = request.admission;
  return admission.tenantId === request.tenantId
    && admission.projectId === request.projectId
    && admission.provider === request.provider
    && admission.model === request.model
    && sameAuth(admission.auth, request.auth)
    && sameBackend(admission.backend, request.backend);
}

function profileAllowsRequest(request: ReachabilityProbeRequest): boolean {
  const profile = request.executionProfile;
  return profile.profileRef === request.backend.executionProfileRef
    && profile.provider === request.provider
    && profile.allowed.some(item => item.authMode === request.auth.mode
      && item.transport === request.backend.transport
      && item.executionBackend === request.backend.executionBackend);
}

function assertTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('ttlMs must be a positive integer');
}

function isFreshWindow(fetchedAt: string | null, expiresAt: string | null, at: Date): boolean {
  if (fetchedAt === null || expiresAt === null) return false;
  const fetched = Date.parse(fetchedAt);
  const expires = Date.parse(expiresAt);
  return Number.isFinite(fetched) && Number.isFinite(expires)
    && fetched <= at.getTime() && at.getTime() < expires;
}

function resultRef(result: Pick<ReachabilityResult, 'reachabilityId'>): string {
  return `provider-reachability:${result.reachabilityId}`;
}

export function createCapabilityCatalog(input: CapabilityCatalogInput): CapabilityCatalog {
  requireNonEmpty('catalog idempotencyKey', input.idempotencyKey);
  requireNonEmpty('catalog sourceId', input.source.sourceId);
  const seen = new Set<string>();
  const entries = input.entries.map(entry => {
    assertCanonicalProviderId(entry.provider);
    assertCanonicalModelApiId(entry.model);
    const key = `${entry.provider}\0${entry.model}`;
    if (seen.has(key)) throw new Error(`Duplicate capability catalog identity: ${entry.provider}/${entry.model}`);
    seen.add(key);
    return {
      provider: entry.provider,
      model: entry.model,
      capabilities: entry.capabilities,
      stages: {
        'code-present': entry.stages?.['code-present'] ?? UNKNOWN_STAGE,
        wired: entry.stages?.wired ?? UNKNOWN_STAGE,
        enabled: entry.stages?.enabled ?? UNKNOWN_STAGE,
      },
      liveProofs: [],
    } satisfies CapabilityCatalogEntry;
  });
  const catalog: CapabilityCatalog = {
    schemaVersion: PROVIDER_TRUTH_SCHEMA_VERSION,
    catalogId: input.catalogId ?? randomUUID(),
    idempotencyKey: input.idempotencyKey,
    tenantId: input.tenantId,
    projectId: input.projectId,
    entries,
    source: input.source,
  };
  assertCapabilityCatalog(catalog);
  return catalog;
}

function mapFailure(outcome: ReachabilityOutcome): {
  state: InvocationEvidenceState;
  reasonCode: ReachabilityReasonCode;
} {
  switch (outcome) {
    case 'not-run': return { state: 'unknown', reasonCode: 'probe_not_run' };
    case 'unsupported': return { state: 'unavailable', reasonCode: 'unsupported' };
    case 'backend-unreachable': return { state: 'unavailable', reasonCode: 'backend_unreachable' };
    case 'auth-rejected': return { state: 'unavailable', reasonCode: 'auth_rejected' };
    case 'model-not-found': return { state: 'unavailable', reasonCode: 'model_not_found' };
    case 'rate-limited': return { state: 'unavailable', reasonCode: 'rate_limited' };
    case 'timeout': return { state: 'unavailable', reasonCode: 'timeout' };
    case 'transport-error': return { state: 'unavailable', reasonCode: 'transport_error' };
    case 'invalid-response': return { state: 'unavailable', reasonCode: 'invalid_response' };
    case 'succeeded': return { state: 'unknown', reasonCode: 'probe_not_live' };
  }
}

export async function probeExactModelReachability(
  request: ReachabilityProbeRequest,
  dependencies: ReachabilityProducerDependencies,
): Promise<ReachabilityResult> {
  assertCanonicalProviderId(request.provider);
  requireNonEmpty('tenantId', request.tenantId);
  requireNonEmpty('projectId', request.projectId);
  requireNonEmpty('reachability idempotencyKey', request.idempotencyKey);
  assertCanonicalModelApiId(request.model);
  assertTtl(request.ttlMs);
  assertOpaqueEvidenceRef('executionProfileRef', request.backend.executionProfileRef, true);
  assertOpaqueEvidenceRef('executionProfile.profileRef', request.executionProfile.profileRef, true);
  assertOpaqueEvidenceRef('budgetRef', request.admission.budget.evidenceRef, false);
  assertOpaqueEvidenceRef('approvalRef', request.admission.approvalRef, false);
  for (const ref of request.admission.limits.evidenceRefs) assertOpaqueEvidenceRef('limitEvidenceRef', ref, true);
  for (const ref of request.evidenceRefs ?? []) assertOpaqueEvidenceRef('evidenceRef', ref, true);
  const now = dependencies.now ?? (() => new Date());
  const started = now();
  let observation: ReachabilityProbeObservation;
  let admissionReason: ReachabilityReasonCode | null = null;
  if (request.probeKind === 'model-invocation') {
    if (!profileAllowsRequest(request)) admissionReason = 'backend_unreachable';
    else if (!admissionMatchesRequest(request) || request.admission.decision !== 'allow') admissionReason = 'approval_required';
    else if (!request.admission.budget.evidenceRef || !hasPositiveBudget(request.admission.budget)) {
      admissionReason = 'budget_required';
    }
    else if (!request.admission.approvalRef
      || !isFreshWindow(request.admission.approvalGrantedAt, request.admission.approvalExpiresAt, started)) {
      admissionReason = 'approval_required';
    } else if (request.admission.limits.state !== 'known'
      || request.admission.limits.decision !== 'allow'
      || request.admission.limits.evidenceRefs.length === 0
      || !isFreshWindow(request.admission.limits.fetchedAt, request.admission.limits.expiresAt, started)) {
      admissionReason = 'limit_hold';
    }
  }
  if (admissionReason) {
    observation = {
      outcome: 'not-run', calledProvider: null, calledModel: null,
      providerRequestRefHash: null, latencyMs: null,
    };
  } else try {
    observation = await dependencies.probe(request);
  } catch {
    observation = {
      outcome: 'transport-error',
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
      latencyMs: null,
    };
  }
  const completed = now();
  for (const ref of observation.evidenceRefs ?? []) assertOpaqueEvidenceRef('evidenceRef', ref, true);

  let state: InvocationEvidenceState;
  let reachable = false;
  let liveProven = false;
  let reasonCode: ReachabilityReasonCode;

  if (admissionReason) {
    state = 'unknown';
    reasonCode = admissionReason;
  } else if (request.probeKind === 'model-invocation'
    && !isFreshWindow(request.admission.approvalGrantedAt, request.admission.approvalExpiresAt, completed)) {
    state = 'unknown';
    reasonCode = 'approval_required';
  } else if (request.probeKind === 'model-invocation'
    && !isFreshWindow(request.admission.limits.fetchedAt, request.admission.limits.expiresAt, completed)) {
    state = 'unknown';
    reasonCode = 'limit_hold';
  } else if (observation.outcome === 'succeeded' && request.probeKind === 'model-invocation') {
    if (observation.calledProvider !== request.provider) {
      state = 'unavailable';
      reasonCode = 'provider_mismatch';
    } else if (observation.calledModel !== request.model) {
      state = 'unavailable';
      reasonCode = 'model_mismatch';
    } else if (request.capability !== 'inference' && observation.verifiedCapability !== request.capability) {
      state = 'unavailable';
      reasonCode = 'invalid_response';
    } else {
      state = 'known';
      reachable = true;
      liveProven = true;
      reasonCode = 'none';
    }
  } else {
    ({ state, reasonCode } = mapFailure(observation.outcome));
  }

  const admissionExpiries = [request.admission.approvalExpiresAt, request.admission.limits.expiresAt]
    .map(value => {
      if (value === null) return Number.POSITIVE_INFINITY;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    });
  const expiresAtMs = state === 'known'
    ? Math.min(completed.getTime() + request.ttlMs, ...admissionExpiries)
    : completed.getTime() + request.ttlMs;
  const result: ReachabilityResult = {
    schemaVersion: PROVIDER_TRUTH_SCHEMA_VERSION,
    reachabilityId: dependencies.idFactory?.() ?? randomUUID(),
    idempotencyKey: request.idempotencyKey,
    tenantId: request.tenantId,
    projectId: request.projectId,
    provider: request.provider,
    model: request.model,
    auth: request.auth,
    backend: request.backend,
    executionProfile: request.executionProfile,
    admission: request.admission,
    probe: {
      kind: request.probeKind,
      capability: request.capability,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    },
    state,
    reachable,
    liveProven,
    outcome: observation.outcome,
    reasonCode,
    observed: {
      requestedProvider: request.provider,
      requestedModel: request.model,
      calledProvider: observation.calledProvider,
      calledModel: observation.calledModel,
      providerRequestRefHash: observation.providerRequestRefHash,
      latencyMs: observation.latencyMs,
      verifiedCapability: observation.verifiedCapability ?? null,
    },
    evidenceRefs: [...(request.evidenceRefs ?? []), ...(observation.evidenceRefs ?? [])],
  };
  assertReachabilityResult(result);
  return result;
}

export function assertCapabilityCatalog(catalog: CapabilityCatalog): void {
  if (catalog.schemaVersion !== PROVIDER_TRUTH_SCHEMA_VERSION) throw new Error('Unsupported catalog schema');
  requireNonEmpty('tenantId', catalog.tenantId);
  requireNonEmpty('projectId', catalog.projectId);
  requireNonEmpty('catalogId', catalog.catalogId);
  requireNonEmpty('catalog idempotencyKey', catalog.idempotencyKey);
  const fetchedAt = Date.parse(catalog.source.fetchedAt);
  const expiresAt = catalog.source.expiresAt === null ? null : Date.parse(catalog.source.expiresAt);
  if (!Number.isFinite(fetchedAt)
    || (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= fetchedAt))) {
    throw new Error('Capability catalog timestamps are invalid');
  }
  const seen = new Set<string>();
  for (const entry of catalog.entries) {
    assertCanonicalProviderId(entry.provider);
    assertCanonicalModelApiId(entry.model);
    const key = `${entry.provider}\0${entry.model}`;
    if (seen.has(key)) throw new Error(`Duplicate capability catalog identity: ${entry.provider}/${entry.model}`);
    seen.add(key);
    for (const stage of Object.values(entry.stages)) {
      if (stage.evidenceRef !== null) {
        assertOpaqueEvidenceRef('catalog stage evidenceRef', stage.evidenceRef, true);
      }
    }
    for (const capability of Object.values(entry.capabilities)) {
      if (capability.evidenceRef !== null) {
        assertOpaqueEvidenceRef('catalog capability evidenceRef', capability.evidenceRef, true);
      }
    }
    const proofRefs = new Set<string>();
    for (const proof of entry.liveProofs) {
      assertOpaqueEvidenceRef('live proof evidenceRef', proof.evidenceRef, true);
      if (proofRefs.has(proof.evidenceRef)) throw new Error('Duplicate live proof evidence ref');
      proofRefs.add(proof.evidenceRef);
      if (!Number.isFinite(Date.parse(proof.expiresAt))) throw new Error('Live proof expiry is invalid');
      if (!(['inference', 'tools', 'vision', 'streaming'] as const).includes(proof.capability)) {
        throw new Error('Unknown live proof capability');
      }
      assertOpaqueSha256('live proof accountRefHash', proof.auth.accountRefHash, proof.auth.mode !== 'local');
      assertOpaqueSha256('live proof endpointRefHash', proof.backend.endpointRefHash, proof.backend.transport !== 'cli');
      assertOpaqueSha256('live proof runtimeFingerprint', proof.backend.runtimeFingerprint, true);
      assertOpaqueEvidenceRef('live proof executionProfileRef', proof.backend.executionProfileRef, true);
    }
  }
}

export function materializeCapabilityCatalog(
  catalog: CapabilityCatalog,
  at = new Date(),
): CapabilityCatalog {
  assertCapabilityCatalog(catalog);
  const entries = catalog.entries.map(entry => ({
    ...entry,
    liveProofs: entry.liveProofs.filter(proof => at.getTime() < Date.parse(proof.expiresAt)),
  }));
  return { ...catalog, entries };
}

export function assertReachabilityResult(result: ReachabilityResult): void {
  if (result.schemaVersion !== PROVIDER_TRUTH_SCHEMA_VERSION) throw new Error('Unsupported reachability schema');
  requireNonEmpty('tenantId', result.tenantId);
  requireNonEmpty('projectId', result.projectId);
  requireNonEmpty('reachabilityId', result.reachabilityId);
  requireNonEmpty('reachability idempotencyKey', result.idempotencyKey);
  assertCanonicalProviderId(result.provider);
  assertCanonicalModelApiId(result.model);
  const started = Date.parse(result.probe.startedAt);
  const completed = Date.parse(result.probe.completedAt);
  const expires = Date.parse(result.probe.expiresAt);
  if (![started, completed, expires].every(Number.isFinite) || completed < started || expires <= completed) {
    throw new Error('Reachability timestamps are invalid');
  }
  const positive = result.state === 'known' || result.reachable || result.liveProven;
  if (!(['subscription', 'api', 'hybrid', 'local', 'unknown'] as const).includes(result.auth.mode)) {
    throw new Error('Unknown auth mode');
  }
  if (!(['cli', 'api', 'http', 'local-runtime'] as const).includes(result.backend.transport)) {
    throw new Error('Unknown transport');
  }
  if (!(['host-subprocess', 'docker', 'tmux', 'api', 'in-process', 'unknown'] as const)
    .includes(result.backend.executionBackend)) {
    throw new Error('Unknown execution backend');
  }
  if (!(['inference', 'tools', 'vision', 'streaming'] as const).includes(result.probe.capability)) {
    throw new Error('Unknown reachability capability');
  }
  assertOpaqueSha256('accountRefHash', result.auth.accountRefHash, positive && result.auth.mode !== 'local');
  assertOpaqueSha256('endpointRefHash', result.backend.endpointRefHash, positive && result.backend.transport !== 'cli');
  assertOpaqueSha256('runtimeFingerprint', result.backend.runtimeFingerprint, positive);
  assertOpaqueEvidenceRef('executionProfileRef', result.backend.executionProfileRef, true);
  assertOpaqueEvidenceRef('executionProfile.profileRef', result.executionProfile.profileRef, true);
  assertCanonicalProviderId(result.executionProfile.provider);
  if (result.executionProfile.allowed.length === 0) throw new Error('Execution profile has no allowed tuple');
  for (const item of result.executionProfile.allowed) {
    if (!(['subscription', 'api', 'hybrid', 'local', 'unknown'] as const).includes(item.authMode)
      || !(['cli', 'api', 'http', 'local-runtime'] as const).includes(item.transport)
      || !(['host-subprocess', 'docker', 'tmux', 'api', 'in-process', 'unknown'] as const)
        .includes(item.executionBackend)) {
      throw new Error('Execution profile contains an unknown tuple');
    }
  }
  assertOpaqueSha256('providerRequestRefHash', result.observed.providerRequestRefHash, false);
  if (result.observed.latencyMs !== null
    && (!Number.isFinite(result.observed.latencyMs) || result.observed.latencyMs < 0)) {
    throw new Error('Reachability latency must be a non-negative finite number');
  }
  assertOpaqueEvidenceRef('budgetRef', result.admission.budget.evidenceRef, positive);
  assertOpaqueEvidenceRef('approvalRef', result.admission.approvalRef, positive);
  for (const ref of result.admission.limits.evidenceRefs) {
    assertOpaqueEvidenceRef('limitEvidenceRef', ref, true);
  }
  for (const ref of result.evidenceRefs) assertOpaqueEvidenceRef('evidenceRef', ref, true);
  const admissionScopeMatches = result.admission.tenantId === result.tenantId
    && result.admission.projectId === result.projectId
    && result.admission.provider === result.provider
    && result.admission.model === result.model
    && sameAuth(result.admission.auth, result.auth)
    && sameBackend(result.admission.backend, result.backend);
  const executionProfileMatches = result.executionProfile.profileRef === result.backend.executionProfileRef
    && result.executionProfile.provider === result.provider
    && result.executionProfile.allowed.some(item => item.authMode === result.auth.mode
      && item.transport === result.backend.transport
      && item.executionBackend === result.backend.executionBackend);
  if (positive && (!admissionScopeMatches
    || !executionProfileMatches
    || result.admission.decision !== 'allow'
    || !hasPositiveBudget(result.admission.budget)
    || result.admission.limits.state !== 'known'
    || result.admission.limits.decision !== 'allow'
    || result.admission.limits.evidenceRefs.length === 0
    || !isFreshWindow(result.admission.limits.fetchedAt, result.admission.limits.expiresAt, new Date(completed))
    || !isFreshWindow(result.admission.approvalGrantedAt, result.admission.approvalExpiresAt, new Date(completed)))) {
    throw new Error('Live proof requires fresh approval, limit and budget evidence');
  }
  if (positive) {
    const proofExpiry = Date.parse(result.probe.expiresAt);
    const approvalExpiry = Date.parse(result.admission.approvalExpiresAt!);
    const limitExpiry = Date.parse(result.admission.limits.expiresAt!);
    if (proofExpiry > Math.min(approvalExpiry, limitExpiry)) {
      throw new Error('Live proof cannot outlive approval or limit evidence');
    }
  }
  if (positive && (result.auth.mode === 'unknown' || result.backend.executionBackend === 'unknown')) {
    throw new Error('Unknown auth or execution backend cannot carry live proof');
  }
  const exactLiveSuccess = result.probe.kind === 'model-invocation'
    && result.outcome === 'succeeded'
    && result.reasonCode === 'none'
    && result.observed.requestedProvider === result.provider
    && result.observed.requestedModel === result.model
    && result.observed.calledProvider === result.provider
    && result.observed.calledModel === result.model
    && (result.probe.capability === 'inference'
      || result.observed.verifiedCapability === result.probe.capability);
  if (positive) {
    if (!exactLiveSuccess || result.state !== 'known' || !result.reachable || !result.liveProven) {
      throw new Error('Known reachability requires one exact successful live model invocation');
    }
  }
  if (result.state !== 'known' && (result.reachable || result.liveProven)) {
    throw new Error('Non-known reachability cannot admit dispatch');
  }
}

export function withLiveProof(
  catalog: CapabilityCatalog,
  result: ReachabilityResult,
  at = new Date(),
): CapabilityCatalog {
  assertCapabilityCatalog(catalog);
  assertReachabilityResult(result);
  const freshCatalog = materializeCapabilityCatalog(catalog, at);
  const fresh = materializeReachability(result, at);
  if (!fresh.liveProven || fresh.state !== 'known' || !fresh.reachable) return freshCatalog;
  if (freshCatalog.tenantId !== result.tenantId || freshCatalog.projectId !== result.projectId) return freshCatalog;
  if (freshCatalog.source.expiresAt !== null
    && at.getTime() >= Date.parse(freshCatalog.source.expiresAt)) return freshCatalog;
  let matched = false;
  const entries: CapabilityCatalogEntry[] = freshCatalog.entries.map(entry => {
    if (entry.provider !== result.provider || entry.model !== result.model) return entry;
    matched = true;
    return {
      ...entry,
      liveProofs: entry.liveProofs.some(proof => proof.evidenceRef === resultRef(result))
        ? entry.liveProofs
        : [...entry.liveProofs, {
          evidenceRef: resultRef(result), auth: result.auth, backend: result.backend,
          capability: result.probe.capability, expiresAt: result.probe.expiresAt,
        }],
    };
  });
  return matched ? { ...freshCatalog, entries } : freshCatalog;
}

export function materializeReachability(
  result: ReachabilityResult,
  at = new Date(),
): ReachabilityResult {
  assertReachabilityResult(result);
  if (at.getTime() < Date.parse(result.probe.expiresAt)) return result;
  return {
    ...result, state: 'stale', reachable: false, liveProven: false, reasonCode: 'evidence_expired',
  };
}

export function toReachabilityEvidence(
  result: ReachabilityResult,
  at = new Date(),
): ReachabilityEvidence {
  assertReachabilityResult(result);
  const fresh = materializeReachability(result, at);
  return {
    state: fresh.state,
    reachable: fresh.state === 'known' && fresh.reachable && fresh.liveProven,
    evidenceRef: resultRef(result),
  };
}
