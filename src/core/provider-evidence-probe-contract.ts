import type { ExecutionBudget } from './work-model.js';

declare const probeContractBrand: unique symbol;

type BrandedString<Name extends string> = string & {
  readonly [probeContractBrand]: Name;
};

export type ProbeScopeDigest = BrandedString<'ProbeScopeDigest'>;
export type ProbeFreshnessEpoch = BrandedString<'ProbeFreshnessEpoch'>;
export type ScopeDigest = ProbeScopeDigest;
export type FreshnessEpoch = ProbeFreshnessEpoch;
export type ExecutionProfileRef = BrandedString<'ExecutionProfileRef'>;
export type ProbeBackendScope = BrandedString<'ProbeBackendScope'>;

type TokenCeilings = Required<Pick<
  ExecutionBudget,
  'maxInputTokens' | 'maxOutputTokens' | 'maxTokens'
>>;

export type ReachabilityProbeBudget =
  | (Readonly<TokenCeilings> & {
    readonly billingMode: 'subscription' | 'free' | 'local';
    readonly timeoutMs: number;
  })
  | (Readonly<TokenCeilings> & {
    readonly billingMode: 'metered-api';
    readonly timeoutMs: number;
    readonly maxUsd: number;
  });

/**
 * Stable singleflight identity for one evidence generation. `freshnessEpoch`
 * is deterministic for an evidence-supersession boundary and MUST NOT be
 * randomized independently by contenders for the same boundary.
 */
export interface ProbeInvocationIdentity {
  readonly scopeDigest: ScopeDigest;
  readonly freshnessEpoch: FreshnessEpoch;
}

export interface ProbeTtlWindow {
  readonly startsAt: string;
  readonly expiresAt: string;
}

export interface ProviderEvidenceProbeSubject {
  readonly kind: 'provider-evidence-probe';
  readonly tenantId: string;
  readonly projectId: string;
  readonly provider: string;
  readonly model: string;
  readonly backendScope: ProbeBackendScope;
  readonly executionProfileRef: ExecutionProfileRef;
  /** 7081 approval freshness (sprint-556): sha256 hex naming THIS execution
   *  attempt (runId × runtimeFingerprint). The deterministic requestId digests
   *  the whole subject, so same-run contenders still adopt APR_DUPLICATE_ID
   *  while a later run can never resurrect a previous run's expired
   *  request/decision (the DECISION_UNTRUSTED stale-adoption class). */
  readonly attemptNonce: string;
  readonly budget: ReachabilityProbeBudget;
  readonly ttl: Readonly<ProbeTtlWindow>;
}

export interface BoundedReachabilityProbeRequest {
  readonly provider: string;
  readonly model: string;
  readonly executionProfileRef: ExecutionProfileRef;
  readonly promptBytes: Uint8Array;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export type ProviderNativeProbeObservation =
  | {
    readonly outcome: 'completed';
    readonly providerRequestRef: string | null;
    readonly outputBytes: number;
    readonly latencyMs: number;
  }
  | {
    readonly outcome: 'rejected';
    readonly providerCode: string | null;
    readonly retryable: boolean;
    readonly latencyMs: number;
  }
  | {
    readonly outcome: 'timed-out';
    readonly elapsedMs: number;
  }
  | {
    readonly outcome: 'transport-error';
    readonly errorCode: string;
    readonly retryable: boolean;
    readonly elapsedMs: number;
  };

export interface BoundedReachabilityProbeTransport {
  invoke(
    request: Readonly<BoundedReachabilityProbeRequest>,
  ): Promise<Readonly<ProviderNativeProbeObservation>>;
}

const DIGEST_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/u;
const BUDGET_FIELDS = new Set([
  'billingMode',
  'maxInputTokens',
  'maxOutputTokens',
  'maxTokens',
  'timeoutMs',
  'maxUsd',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const expected = new Set(fields);
  return Object.keys(value).length === expected.size
    && Object.keys(value).every(field => expected.has(field));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isScopeDigest(value: unknown): value is ScopeDigest {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

export function isFreshnessEpoch(value: unknown): value is FreshnessEpoch {
  return isCanonicalId(value);
}

export function isExecutionProfileRef(value: unknown): value is ExecutionProfileRef {
  return isCanonicalId(value);
}

export function isProbeBackendScope(value: unknown): value is ProbeBackendScope {
  return isCanonicalId(value);
}

export function isReachabilityProbeBudget(value: unknown): value is ReachabilityProbeBudget {
  if (!isRecord(value)
    || !isPositiveInteger(value.maxInputTokens)
    || !isPositiveInteger(value.maxOutputTokens)
    || !isPositiveInteger(value.maxTokens)
    || value.maxTokens < value.maxInputTokens + value.maxOutputTokens
    || !isPositiveInteger(value.timeoutMs)) {
    return false;
  }

  if (value.billingMode === 'metered-api') {
    return hasExactFields(value, [...BUDGET_FIELDS]) && isPositiveFinite(value.maxUsd);
  }
  if (value.billingMode === 'subscription'
    || value.billingMode === 'free'
    || value.billingMode === 'local') {
    return hasExactFields(value, [...BUDGET_FIELDS].filter(field => field !== 'maxUsd'));
  }
  return false;
}

export function isProbeInvocationIdentity(value: unknown): value is ProbeInvocationIdentity {
  return isRecord(value)
    && hasExactFields(value, ['scopeDigest', 'freshnessEpoch'])
    && isScopeDigest(value.scopeDigest)
    && isFreshnessEpoch(value.freshnessEpoch);
}

export function isProbeTtlWindow(value: unknown): value is ProbeTtlWindow {
  if (!isRecord(value)
    || !hasExactFields(value, ['startsAt', 'expiresAt'])
    || typeof value.startsAt !== 'string'
    || typeof value.expiresAt !== 'string') {
    return false;
  }
  const startsAt = Date.parse(value.startsAt);
  const expiresAt = Date.parse(value.expiresAt);
  return Number.isFinite(startsAt) && Number.isFinite(expiresAt) && expiresAt > startsAt;
}

export function isProviderEvidenceProbeSubject(
  value: unknown,
): value is ProviderEvidenceProbeSubject {
  return isRecord(value)
    && hasExactFields(value, [
      'kind', 'tenantId', 'projectId', 'provider', 'model', 'backendScope',
      'executionProfileRef', 'attemptNonce', 'budget', 'ttl',
    ])
    && value.kind === 'provider-evidence-probe'
    && isCanonicalId(value.tenantId)
    && isCanonicalId(value.projectId)
    && isNonEmptyString(value.provider)
    && isNonEmptyString(value.model)
    && isProbeBackendScope(value.backendScope)
    && isExecutionProfileRef(value.executionProfileRef)
    && typeof value.attemptNonce === 'string'
    && /^[a-f0-9]{64}$/u.test(value.attemptNonce)
    && isReachabilityProbeBudget(value.budget)
    && isProbeTtlWindow(value.ttl);
}

export function isBoundedReachabilityProbeRequest(
  value: unknown,
): value is BoundedReachabilityProbeRequest {
  return isRecord(value)
    && hasExactFields(value, [
      'provider', 'model', 'executionProfileRef', 'promptBytes', 'timeoutMs',
      'maxOutputTokens',
    ])
    && isNonEmptyString(value.provider)
    && isNonEmptyString(value.model)
    && isExecutionProfileRef(value.executionProfileRef)
    && value.promptBytes instanceof Uint8Array
    && value.promptBytes.byteLength > 0
    && isPositiveInteger(value.timeoutMs)
    && isPositiveInteger(value.maxOutputTokens);
}

export function isProviderNativeProbeObservation(
  value: unknown,
): value is ProviderNativeProbeObservation {
  if (!isRecord(value)) return false;
  switch (value.outcome) {
    case 'completed':
      return hasExactFields(value, [
        'outcome', 'providerRequestRef', 'outputBytes', 'latencyMs',
      ])
        && (value.providerRequestRef === null || isNonEmptyString(value.providerRequestRef))
        && isNonNegativeInteger(value.outputBytes)
        && isNonNegativeInteger(value.latencyMs);
    case 'rejected':
      return hasExactFields(value, ['outcome', 'providerCode', 'retryable', 'latencyMs'])
        && (value.providerCode === null || isNonEmptyString(value.providerCode))
        && typeof value.retryable === 'boolean'
        && isNonNegativeInteger(value.latencyMs);
    case 'timed-out':
      return hasExactFields(value, ['outcome', 'elapsedMs'])
        && isNonNegativeInteger(value.elapsedMs);
    case 'transport-error':
      return hasExactFields(value, ['outcome', 'errorCode', 'retryable', 'elapsedMs'])
        && isNonEmptyString(value.errorCode)
        && typeof value.retryable === 'boolean'
        && isNonNegativeInteger(value.elapsedMs);
    default:
      return false;
  }
}
