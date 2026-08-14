import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  isBoundedReachabilityProbeRequest,
  isProbeInvocationIdentity,
  isProviderEvidenceProbeSubject,
  isProviderNativeProbeObservation,
  isReachabilityProbeBudget,
  type BoundedReachabilityProbeRequest,
  type ProviderNativeProbeObservation,
  type ReachabilityProbeBudget,
} from '../../src/core/provider-evidence-probe-contract.js';

const tokenCeilings = {
  maxInputTokens: 64,
  maxOutputTokens: 16,
  maxTokens: 80,
  timeoutMs: 1_000,
} as const;

function exhaustObservation(observation: ProviderNativeProbeObservation): string {
  switch (observation.outcome) {
    case 'completed': return observation.providerRequestRef ?? 'completed';
    case 'rejected': return observation.providerCode ?? 'rejected';
    case 'timed-out': return String(observation.elapsedMs);
    case 'transport-error': return observation.errorCode;
    default: {
      const neverObservation: never = observation;
      return neverObservation;
    }
  }
}

describe('ReachabilityProbeBudget', () => {
  it.each(['subscription', 'free', 'local'] as const)(
    'accepts the %s arm and rejects a USD field',
    billingMode => {
      expect(isReachabilityProbeBudget({ billingMode, ...tokenCeilings })).toBe(true);
      expect(isReachabilityProbeBudget({
        billingMode,
        ...tokenCeilings,
        maxUsd: 0.2,
      })).toBe(false);
    },
  );

  it('requires owner-authored USD only for the metered-api arm', () => {
    expect(isReachabilityProbeBudget({
      billingMode: 'metered-api',
      ...tokenCeilings,
      maxUsd: 0.2,
    })).toBe(true);
    expect(isReachabilityProbeBudget({ billingMode: 'metered-api', ...tokenCeilings }))
      .toBe(false);
    expect(isReachabilityProbeBudget({
      billingMode: 'metered-api',
      ...tokenCeilings,
      maxUsd: 0,
    })).toBe(false);
  });

  it('keeps maxUsd absent from the subscription type', () => {
    type SubscriptionBudget = Extract<ReachabilityProbeBudget, { billingMode: 'subscription' }>;
    expectTypeOf<keyof SubscriptionBudget>().not.toEqualTypeOf<'maxUsd'>();
  });
});

describe('provider evidence probe subjects and requests', () => {
  const budget = { billingMode: 'subscription', ...tokenCeilings } as const;

  it('guards the freshness identity and complete approval subject', () => {
    expect(isProbeInvocationIdentity({
      scopeDigest: 'a'.repeat(64),
      freshnessEpoch: 'supersession-42',
    })).toBe(true);
    expect(isProbeInvocationIdentity({
      scopeDigest: 'not-a-digest',
      freshnessEpoch: 'supersession-42',
    })).toBe(false);

    expect(isProviderEvidenceProbeSubject({
      kind: 'provider-evidence-probe',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      provider: 'provider-a',
      model: 'model-a',
      backendScope: 'backend:docker',
      executionProfileRef: 'profile:probe-a',
      budget,
      ttl: {
        startsAt: '2026-08-12T00:00:00.000Z',
        expiresAt: '2026-08-12T00:01:00.000Z',
      },
    })).toBe(true);
    expect(isProviderEvidenceProbeSubject({
      kind: 'provider-evidence-probe',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      provider: 'provider-a',
      model: 'model-a',
      backendScope: 'backend:docker',
      executionProfileRef: 'profile:probe-a',
      budget,
      ttl: {
        startsAt: '2026-08-12T00:01:00.000Z',
        expiresAt: '2026-08-12T00:00:00.000Z',
      },
    })).toBe(false);
  });

  it('accepts only the bounded scalar transport request surface', () => {
    const request: BoundedReachabilityProbeRequest = {
      provider: 'provider-a',
      model: 'model-a',
      executionProfileRef: 'profile:probe-a' as BoundedReachabilityProbeRequest['executionProfileRef'],
      promptBytes: new Uint8Array([1, 2, 3]),
      timeoutMs: 1_000,
      maxOutputTokens: 16,
    };
    expect(isBoundedReachabilityProbeRequest(request)).toBe(true);
    expect(isBoundedReachabilityProbeRequest({ ...request, argv: ['provider'] })).toBe(false);
    expect(isBoundedReachabilityProbeRequest({ ...request, promptBytes: new Uint8Array() }))
      .toBe(false);
  });
});

describe('ProviderNativeProbeObservation', () => {
  const observations = [
    { outcome: 'completed', providerRequestRef: 'request:1', outputBytes: 2, latencyMs: 3 },
    { outcome: 'rejected', providerCode: 'rate_limit', retryable: true, latencyMs: 3 },
    { outcome: 'timed-out', elapsedMs: 1_000 },
    { outcome: 'transport-error', errorCode: 'connection-reset', retryable: true, elapsedMs: 4 },
  ] as const satisfies readonly ProviderNativeProbeObservation[];

  it('guards and exhaustively consumes every frozen union arm', () => {
    for (const observation of observations) {
      expect(isProviderNativeProbeObservation(observation)).toBe(true);
      expect(exhaustObservation(observation)).toBeTypeOf('string');
    }
  });

  it('rejects promotion claims and malformed discriminator payloads', () => {
    expect(isProviderNativeProbeObservation({
      ...observations[0],
      reachable: true,
    })).toBe(false);
    expect(isProviderNativeProbeObservation({ outcome: 'timed-out', elapsedMs: -1 }))
      .toBe(false);
    expect(isProviderNativeProbeObservation({ outcome: 'live-proven', latencyMs: 1 }))
      .toBe(false);
  });
});
