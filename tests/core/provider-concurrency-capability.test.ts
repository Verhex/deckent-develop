import { describe, expect, it } from 'vitest';

import {
  resolveProviderConcurrencyCapability,
  type ProviderConcurrencyCapabilityRequest,
} from '../../src/core/provider-concurrency-capability.js';

const T0 = '2026-07-31T12:00:00.000Z';
const T1 = '2026-07-31T12:05:00.000Z';
const T2 = '2026-07-31T12:06:00.000Z';

function request(overrides: Partial<ProviderConcurrencyCapabilityRequest> = {}): ProviderConcurrencyCapabilityRequest {
  const scope = {
    tenantRef: 'tenant:opaque-0001',
    principalRef: 'principal:opaque-0001',
    authModeClass: 'credential-class:opaque-0001',
  };
  return {
    evaluatedAt: T0,
    configured: { scope, ceiling: 4, evidenceRefs: ['configured-ceiling:0001'] },
    provider: {
      state: 'known', scope, ceiling: 6,
      freshness: { observedAt: T0, expiresAt: T1 },
      evidenceRefs: ['provider-capacity:0001'],
    },
    host: { scope, ceiling: 8, evidenceRefs: ['host-ceiling:0001'] },
    ...overrides,
  };
}

describe('resolveProviderConcurrencyCapability', () => {
  it('admits the configured ceiling when all supplied authorities are fresh and sufficient', () => {
    const result = resolveProviderConcurrencyCapability(request());

    expect(result).toMatchObject({
      decision: 'ADMITTED',
      reasonCodes: ['admitted'],
      configuredCeiling: 4,
      providerAuthoritativeCapacity: 6,
      hostCeiling: 8,
      effectiveAdmittedCeiling: 4,
    });
    expect(result.evidenceRefs).toEqual([
      'configured-ceiling:0001', 'provider-capacity:0001', 'host-ceiling:0001',
    ]);
  });

  it('degrades to the intersection and identifies every equally restrictive authority', () => {
    const base = request();
    const result = resolveProviderConcurrencyCapability({
      ...base,
      configured: { ...base.configured, ceiling: 8 },
      provider: { ...base.provider, ceiling: 3 },
      host: { ...base.host, ceiling: 3 },
    });

    expect(result).toMatchObject({
      decision: 'DEGRADED',
      reasonCodes: ['provider_capacity_limited', 'host_ceiling_limited'],
      effectiveAdmittedCeiling: 3,
    });
  });

  it('holds unknown provider capacity without fabricating an admitted ceiling', () => {
    const base = request();
    const result = resolveProviderConcurrencyCapability({
      ...base,
      provider: {
        state: 'unknown', scope: base.provider.scope,
        freshness: base.provider.freshness,
        evidenceRefs: ['provider-capacity:unknown-0001'],
      },
    });

    expect(result).toMatchObject({
      decision: 'HOLD',
      reasonCodes: ['provider_capacity_unknown'],
      providerAuthoritativeCapacity: 'unknown',
      effectiveAdmittedCeiling: 'unknown',
    });
  });

  it('holds evidence that is expired or not yet valid at the caller-supplied evaluation time', () => {
    expect(resolveProviderConcurrencyCapability(request({ evaluatedAt: T2 }))).toMatchObject({
      decision: 'HOLD', reasonCodes: ['provider_capacity_expired'], effectiveAdmittedCeiling: 'unknown',
    });
    expect(resolveProviderConcurrencyCapability(request({
      evaluatedAt: '2026-07-31T11:59:59.000Z',
    }))).toMatchObject({
      decision: 'HOLD', reasonCodes: ['provider_capacity_not_yet_valid'], effectiveAdmittedCeiling: 'unknown',
    });
  });

  it('holds rather than intersecting authorities from different tenant, principal, or auth scopes', () => {
    const base = request();
    const result = resolveProviderConcurrencyCapability({
      ...base,
      host: {
        ...base.host,
        scope: { ...base.host.scope, principalRef: 'principal:opaque-0002' },
      },
    });

    expect(result).toMatchObject({
      decision: 'HOLD', reasonCodes: ['authority_scope_mismatch'], effectiveAdmittedCeiling: 'unknown',
    });
  });
});
