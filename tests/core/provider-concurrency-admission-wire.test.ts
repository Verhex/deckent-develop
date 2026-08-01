import { describe, expect, it, vi } from 'vitest';

import { admitRoleInvocation } from '../../src/core/provider-limit-admission.js';
import type { ProviderLimitReservation } from '../../src/core/provider-limit-truth.js';
import type { ProviderLimitStore } from '../../src/core/provider-limit-store.js';
import type { RoleInvocationRequest, RoleInvocationSelected } from '../../src/core/role-invocation-resolver.js';
import type { ProviderConcurrencyCapabilityRequest } from '../../src/core/provider-concurrency-capability.js';

const PROVIDER = 'claude' as const;
const MODEL = 'claude-opus-4-8';
const ACCOUNT_REF = 'a'.repeat(64);
const ENDPOINT_REF = 'b'.repeat(64);
const EVALUATED_AT = '2026-07-31T12:01:00.000Z';
const FRESHNESS = {
  observedAt: '2026-07-31T12:00:00.000Z',
  expiresAt: '2026-07-31T12:05:00.000Z',
};
const SCOPE = {
  tenantRef: 'tenant:admission-wire',
  principalRef: 'principal:admission-wire',
  authModeClass: 'auth:subscription',
};

function capability(
  provider: ProviderConcurrencyCapabilityRequest['provider'],
): ProviderConcurrencyCapabilityRequest {
  return {
    evaluatedAt: EVALUATED_AT,
    configured: { scope: SCOPE, ceiling: 8, evidenceRefs: ['configured:admission-wire'] },
    provider,
    host: { scope: SCOPE, ceiling: 5, evidenceRefs: ['host:admission-wire'] },
  };
}

function invocation(): RoleInvocationRequest {
  return {
    role: 'worker',
    primaryProvider: PROVIDER,
    model: MODEL,
    fallbackProviders: [],
    evidence: {
      [PROVIDER]: {
        reachability: {
          state: 'known', reachable: true, evidenceRef: 'reachability:admission-wire',
        },
        limits: { state: 'known', limited: false, evidenceRefs: ['limit:admission-wire'] },
      },
    },
  };
}

function candidateScopes() {
  return {
    [PROVIDER]: {
      provider: PROVIDER,
      model: MODEL,
      accountRefHash: ACCOUNT_REF,
      quotaScopeRefHash: 'quota:admission-wire',
      authMode: 'subscription' as const,
      backend: {
        transport: 'cli' as const,
        executionBackend: 'local' as const,
        endpointRefHash: null,
      },
      reachabilityEvidenceRef: 'reachability:admission-wire',
    },
  };
}

function reservation(selected: RoleInvocationSelected) {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    provider: selected.provider,
    model: selected.model,
    accountRefHash: ACCOUNT_REF,
    quotaScopeRefHash: 'quota:admission-wire',
    authMode: 'subscription',
    backend: { transport: 'cli', executionBackend: 'local', endpointRefHash: null },
    reservationId: 'reservation:admission-wire',
    idempotencyKey: 'idempotency:admission-wire',
    runId: 'run-a',
    taskId: 'task-a',
    callId: 'call-a',
    attemptId: 'attempt-a',
    fenceTokenHash: 'c'.repeat(64),
    receiptRef: 'receipt:admission-wire',
    reachabilityEvidenceRef: 'reachability:admission-wire',
    estimates: [],
    estimateEvidenceRefs: ['estimate:admission-wire'],
    requestedAt: EVALUATED_AT,
    leaseExpiresAt: '2026-07-31T12:04:00.000Z',
  } as never;
}

function admittedReservation(): ProviderLimitReservation {
  return {
    decision: 'allow',
    reservationId: 'reservation:admission-wire',
    provider: PROVIDER,
    model: MODEL,
    snapshotEvidenceRef: 'snapshot:admission-wire',
  } as ProviderLimitReservation;
}

describe('provider concurrency admission wiring', () => {
  it('uses the resolver intersection before creating the existing provider-limit reservation', () => {
    const reserveWithStatus = vi.fn(() => ({ reservation: admittedReservation(), created: true }));
    const buildReservation = vi.fn(reservation);

    const result = admitRoleInvocation(
      { reserveWithStatus } as unknown as ProviderLimitStore,
      {
        invocation: invocation(),
        candidateScopes: candidateScopes(),
        concurrencyCapabilities: {
          [PROVIDER]: capability({
            state: 'known',
            scope: SCOPE,
            ceiling: 3,
            freshness: FRESHNESS,
            evidenceRefs: ['provider:admission-wire'],
          }),
        },
        buildReservation,
      },
    );

    expect(result).toMatchObject({
      decision: 'allow',
      attempts: [{
        concurrency: {
          decision: 'DEGRADED',
          effectiveAdmittedCeiling: 3,
          reasonCodes: ['provider_capacity_limited'],
        },
      }],
    });
    expect(buildReservation).toHaveBeenCalledOnce();
    expect(reserveWithStatus).toHaveBeenCalledOnce();
  });

  it.each([
    ['unknown', capability({
      state: 'unknown',
      scope: SCOPE,
      freshness: FRESHNESS,
      evidenceRefs: ['provider:unknown'],
    }), 'provider_capacity_unknown'],
    ['expired', capability({
      state: 'known',
      scope: SCOPE,
      ceiling: 3,
      freshness: { ...FRESHNESS, expiresAt: '2026-07-31T12:00:30.000Z' },
      evidenceRefs: ['provider:expired'],
    }), 'provider_capacity_expired'],
  ] as const)('holds %s provider authority without creating a reservation', (_state, concurrency, reasonCode) => {
    const reserveWithStatus = vi.fn();
    const buildReservation = vi.fn(reservation);

    const result = admitRoleInvocation(
      { reserveWithStatus } as unknown as ProviderLimitStore,
      {
        invocation: invocation(),
        candidateScopes: candidateScopes(),
        concurrencyCapabilities: { [PROVIDER]: concurrency },
        buildReservation,
      },
    );

    expect(result).toMatchObject({
      decision: 'hold',
      reasonCode: 'fallback_exhausted',
      attempts: [{
        reservation: null,
        concurrency: { decision: 'HOLD', reasonCodes: [reasonCode], effectiveAdmittedCeiling: 'unknown' },
      }],
    });
    expect(buildReservation).not.toHaveBeenCalled();
    expect(reserveWithStatus).not.toHaveBeenCalled();
  });
});
