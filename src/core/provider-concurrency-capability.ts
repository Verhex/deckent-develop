/**
 * Provider-neutral concurrency authority used by later admission layers.
 *
 * This module neither discovers capacity nor interprets provider identities.
 * Callers must supply every authority and the evaluation time explicitly.
 */

export type ProviderConcurrencyDecision = 'ADMITTED' | 'DEGRADED' | 'HOLD';

export type ProviderConcurrencyCapabilityReasonCode =
  | 'admitted'
  | 'configured_ceiling_limited'
  | 'provider_capacity_limited'
  | 'host_ceiling_limited'
  | 'provider_capacity_unknown'
  | 'provider_capacity_expired'
  | 'provider_capacity_not_yet_valid'
  | 'authority_scope_mismatch';

/** Exact principal, tenant, and credential class to which a capacity authority applies. */
export interface ProviderConcurrencyScope {
  readonly tenantRef: string;
  readonly principalRef: string;
  readonly authModeClass: string;
}

export interface ProviderConcurrencyFreshness {
  readonly observedAt: string;
  readonly expiresAt: string;
}

export interface ProviderConcurrencyConfiguredCeiling {
  readonly scope: ProviderConcurrencyScope;
  readonly ceiling: number;
  readonly evidenceRefs: readonly string[];
}

export interface ProviderConcurrencyHostCeiling {
  readonly scope: ProviderConcurrencyScope;
  readonly ceiling: number;
  readonly evidenceRefs: readonly string[];
}

export interface ProviderConcurrencyKnownCapacity {
  readonly state: 'known';
  readonly scope: ProviderConcurrencyScope;
  readonly ceiling: number;
  readonly freshness: ProviderConcurrencyFreshness;
  readonly evidenceRefs: readonly string[];
}

export interface ProviderConcurrencyUnknownCapacity {
  readonly state: 'unknown';
  readonly scope: ProviderConcurrencyScope;
  readonly freshness: ProviderConcurrencyFreshness;
  readonly evidenceRefs: readonly string[];
}

/** Unknown capacity is an explicit state, never a numeric fallback. */
export type ProviderAuthoritativeConcurrencyCapacity =
  | ProviderConcurrencyKnownCapacity
  | ProviderConcurrencyUnknownCapacity;

export interface ProviderConcurrencyCapabilityRequest {
  /** Explicit evaluation time makes freshness evaluation deterministic and side-effect free. */
  readonly evaluatedAt: string;
  readonly configured: ProviderConcurrencyConfiguredCeiling;
  readonly provider: ProviderAuthoritativeConcurrencyCapacity;
  readonly host: ProviderConcurrencyHostCeiling;
}

export interface ProviderConcurrencyCapabilityEvidence {
  readonly decision: ProviderConcurrencyDecision;
  readonly reasonCodes: readonly ProviderConcurrencyCapabilityReasonCode[];
  readonly scope: ProviderConcurrencyScope;
  readonly configuredCeiling: number;
  readonly providerAuthoritativeCapacity: number | 'unknown';
  readonly hostCeiling: number;
  readonly effectiveAdmittedCeiling: number | 'unknown';
  readonly freshness: ProviderConcurrencyFreshness;
  readonly evidenceRefs: readonly string[];
}

const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function requireNonEmpty(name: string, value: string): void {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
}

function requirePositiveCeiling(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function parseCanonicalTimestamp(name: string, value: string): number {
  if (!ISO_UTC_MILLIS.test(value)) {
    throw new TypeError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new TypeError(`${name} must be a valid canonical UTC ISO-8601 timestamp`);
  }
  return milliseconds;
}

function validateScope(scope: ProviderConcurrencyScope, name: string): void {
  requireNonEmpty(`${name}.tenantRef`, scope.tenantRef);
  requireNonEmpty(`${name}.principalRef`, scope.principalRef);
  requireNonEmpty(`${name}.authModeClass`, scope.authModeClass);
}

function scopesMatch(left: ProviderConcurrencyScope, right: ProviderConcurrencyScope): boolean {
  return left.tenantRef === right.tenantRef
    && left.principalRef === right.principalRef
    && left.authModeClass === right.authModeClass;
}

function validateEvidenceRefs(name: string, evidenceRefs: readonly string[]): void {
  if (evidenceRefs.length === 0) throw new TypeError(`${name} must contain evidence references`);
  for (const evidenceRef of evidenceRefs) requireNonEmpty(`${name} entry`, evidenceRef);
}

function validateFreshness(freshness: ProviderConcurrencyFreshness): {
  readonly observedAt: number;
  readonly expiresAt: number;
} {
  const observedAt = parseCanonicalTimestamp('freshness.observedAt', freshness.observedAt);
  const expiresAt = parseCanonicalTimestamp('freshness.expiresAt', freshness.expiresAt);
  if (expiresAt < observedAt) throw new TypeError('freshness.expiresAt cannot precede freshness.observedAt');
  return { observedAt, expiresAt };
}

function collectEvidenceRefs(request: ProviderConcurrencyCapabilityRequest): readonly string[] {
  return Object.freeze([
    ...request.configured.evidenceRefs,
    ...request.provider.evidenceRefs,
    ...request.host.evidenceRefs,
  ]);
}

function evidence(
  request: ProviderConcurrencyCapabilityRequest,
  decision: ProviderConcurrencyDecision,
  reasonCodes: readonly ProviderConcurrencyCapabilityReasonCode[],
  effectiveAdmittedCeiling: number | 'unknown',
): ProviderConcurrencyCapabilityEvidence {
  return Object.freeze({
    decision,
    reasonCodes: Object.freeze([...reasonCodes]),
    scope: Object.freeze({ ...request.configured.scope }),
    configuredCeiling: request.configured.ceiling,
    providerAuthoritativeCapacity: request.provider.state === 'known'
      ? request.provider.ceiling
      : 'unknown',
    hostCeiling: request.host.ceiling,
    effectiveAdmittedCeiling,
    freshness: Object.freeze({ ...request.provider.freshness }),
    evidenceRefs: collectEvidenceRefs(request),
  });
}

/**
 * Intersects supplied configuration, provider, and host ceilings without probing
 * or configuration access. Unknown or temporally unusable provider authority
 * remains a HOLD; it is never inferred as available capacity.
 */
export function resolveProviderConcurrencyCapability(
  request: ProviderConcurrencyCapabilityRequest,
): ProviderConcurrencyCapabilityEvidence {
  const evaluatedAt = parseCanonicalTimestamp('evaluatedAt', request.evaluatedAt);
  validateScope(request.configured.scope, 'configured.scope');
  validateScope(request.provider.scope, 'provider.scope');
  validateScope(request.host.scope, 'host.scope');
  requirePositiveCeiling('configured.ceiling', request.configured.ceiling);
  requirePositiveCeiling('host.ceiling', request.host.ceiling);
  validateEvidenceRefs('configured.evidenceRefs', request.configured.evidenceRefs);
  validateEvidenceRefs('provider.evidenceRefs', request.provider.evidenceRefs);
  validateEvidenceRefs('host.evidenceRefs', request.host.evidenceRefs);
  const freshness = validateFreshness(request.provider.freshness);

  if (!scopesMatch(request.configured.scope, request.provider.scope)
    || !scopesMatch(request.configured.scope, request.host.scope)) {
    return evidence(request, 'HOLD', ['authority_scope_mismatch'], 'unknown');
  }
  if (request.provider.state === 'unknown') {
    return evidence(request, 'HOLD', ['provider_capacity_unknown'], 'unknown');
  }
  requirePositiveCeiling('provider.ceiling', request.provider.ceiling);
  if (evaluatedAt < freshness.observedAt) {
    return evidence(request, 'HOLD', ['provider_capacity_not_yet_valid'], 'unknown');
  }
  if (evaluatedAt > freshness.expiresAt) {
    return evidence(request, 'HOLD', ['provider_capacity_expired'], 'unknown');
  }

  const effectiveAdmittedCeiling = Math.min(
    request.configured.ceiling,
    request.provider.ceiling,
    request.host.ceiling,
  );
  const reasonCodes: ProviderConcurrencyCapabilityReasonCode[] = [];
  if (request.provider.ceiling < request.configured.ceiling
    && request.provider.ceiling === effectiveAdmittedCeiling) {
    reasonCodes.push('provider_capacity_limited');
  }
  if (request.host.ceiling < request.configured.ceiling
    && request.host.ceiling === effectiveAdmittedCeiling) {
    reasonCodes.push('host_ceiling_limited');
  }
  if (reasonCodes.length === 0) {
    return evidence(request, 'ADMITTED', ['admitted'], effectiveAdmittedCeiling);
  }
  return evidence(request, 'DEGRADED', reasonCodes, effectiveAdmittedCeiling);
}
