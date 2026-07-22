import { describe, expect, it } from 'vitest';

import {
  assertProviderLimitResult,
  assertProviderLimitReservationEvent,
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  materializeProviderLimitResult,
  toLimitEvidence,
  type ProviderLimitObservation,
  type ProviderLimitPolicy,
  type ProviderLimitWindow,
} from '../../src/core/provider-limit-truth.js';

const T0 = '2026-07-20T12:00:00.000Z';
const T1 = '2026-07-20T12:05:00.000Z';
const ACCOUNT_HASH = 'a'.repeat(64);
const RESET_TEXT_HASH = 'b'.repeat(64);
const ENDPOINT_HASH = 'd'.repeat(64);
const QUOTA_HASH = deriveProviderQuotaScopeRefHash({
  tenantId: 'tenant-a', provider: 'claude', accountRefHash: ACCOUNT_HASH,
  authMode: 'subscription',
  backend: { transport: 'cli', executionBackend: 'docker', endpointRefHash: ENDPOINT_HASH },
});

const POLICY: ProviderLimitPolicy = {
  policyRef: 'limit-policy:00000001',
  warnAtRatio: 0.7,
  blockAtRatio: 0.9,
  minimumRemaining: { requests: 2, tokens: 128 },
};

function window(
  windowId: string,
  consumed: number | null,
  remaining: number | null,
  limit: number | null,
  overrides: Partial<ProviderLimitWindow> = {},
): ProviderLimitWindow {
  return {
    windowId,
    kind: 'session',
    model: null,
    unit: 'percent',
    consumed,
    remaining,
    limit,
    reset: { state: 'unknown', at: null, displayRefHash: RESET_TEXT_HASH },
    ...overrides,
  };
}

function observation(overrides: Partial<ProviderLimitObservation> = {}): ProviderLimitObservation {
  return {
    idempotencyKey: 'limit-observation:00000001',
    tenantId: 'tenant-a',
    projectId: 'project-a',
    provider: 'claude',
    accountRefHash: ACCOUNT_HASH,
    quotaScopeRefHash: QUOTA_HASH,
    authMode: 'subscription',
    backend: { transport: 'cli', executionBackend: 'docker', endpointRefHash: ENDPOINT_HASH },
    state: 'known',
    requiredWindowIds: ['session', 'week-all'],
    windows: [
      window('session', 50, 50, 100),
      window('week-all', 20, 80, 100, { kind: 'week-all' }),
    ],
    source: {
      kind: 'provider-cli',
      authority: 'authoritative',
      operatorApprovalRef: null,
      evidenceRef: 'limit-source:00000001',
      fetchedAt: T0,
      expiresAt: T1,
      incorporatedReservationEventRefs: [],
    },
    ...overrides,
  };
}

describe('provider limit truth', () => {
  it('derives a fresh allow decision from every complete required window', () => {
    const result = createProviderLimitResult(observation(), POLICY, {
      idFactory: () => 'limit-result-1',
    });
    expect(result).toMatchObject({
      state: 'known', decision: 'allow', pressure: 'ok', reasonCode: 'none',
    });
    expect(result.windows[0]?.reset).toEqual({
      state: 'unknown', at: null, displayRefHash: RESET_TEXT_HASH,
    });
    expect(toLimitEvidence(result, new Date(T0))).toEqual({
      state: 'known', limited: false, evidenceRefs: ['provider-limit:limit-result-1'],
    });
  });

  it('warns without blocking and blocks at the policy threshold', () => {
    const warn = createProviderLimitResult(observation({
      windows: [window('session', 75, 25, 100), window('week-all', 20, 80, 100, { kind: 'week-all' })],
    }), POLICY);
    expect(warn).toMatchObject({ state: 'known', decision: 'allow', pressure: 'warn' });

    const block = createProviderLimitResult(observation({
      windows: [window('session', 90, 10, 100), window('week-all', 20, 80, 100, { kind: 'week-all' })],
    }), POLICY);
    expect(block).toMatchObject({
      state: 'known', decision: 'hold', pressure: 'block', reasonCode: 'threshold_block',
    });
    expect(toLimitEvidence(block, new Date(T0)).limited).toBe(true);
  });

  it('uses remaining floors for absolute request/token windows', () => {
    const result = createProviderLimitResult(observation({
      requiredWindowIds: ['requests'],
      windows: [window('requests', 99, 1, 100, {
        kind: 'rate-window', unit: 'requests', reset: { state: 'known', at: T1, displayRefHash: null },
      })],
      source: {
        kind: 'http-headers', authority: 'authoritative', operatorApprovalRef: null,
        evidenceRef: 'limit-source:00000002', fetchedAt: T0, expiresAt: T1,
        incorporatedReservationEventRefs: [],
      },
    }), POLICY);
    expect(result).toMatchObject({ decision: 'hold', reasonCode: 'remaining_floor' });
  });

  it('keeps incomplete or absent capacity unknown instead of converting null to zero', () => {
    const result = createProviderLimitResult(observation({
      windows: [window('session', 1234, null, null)],
      requiredWindowIds: ['session'],
      source: {
        kind: 'historical-transcript', authority: 'advisory', operatorApprovalRef: null,
        evidenceRef: 'transcript-history:00000001', fetchedAt: T0, expiresAt: T1,
        incorporatedReservationEventRefs: [],
      },
    }), POLICY);
    expect(result).toMatchObject({
      state: 'unknown', decision: 'hold', pressure: 'unknown', reasonCode: 'source_unknown',
    });
    expect(result.windows[0]).toMatchObject({ consumed: 1234, remaining: null, limit: null });
  });

  it('never promotes complete advisory history to authoritative remaining capacity', () => {
    const result = createProviderLimitResult(observation({
      source: {
        ...observation().source, kind: 'historical-transcript', authority: 'advisory',
        evidenceRef: 'transcript-history:00000002',
      },
    }), POLICY);
    expect(result).toMatchObject({ state: 'unknown', decision: 'hold', reasonCode: 'source_unknown' });
    expect(result.windows[0]).toMatchObject({ consumed: 50, remaining: 50, limit: 100 });
    expect(() => createProviderLimitResult(observation({
      source: {
        ...observation().source, kind: 'historical-transcript', authority: 'authoritative',
        evidenceRef: 'transcript-history:forged-authority',
      },
    }), POLICY)).toThrow(/advisory only/);
  });

  it.each(['unknown', 'unavailable'] as const)('maps source %s to explicit HOLD', (state) => {
    const result = createProviderLimitResult(observation({ state, windows: [], requiredWindowIds: [] }), POLICY);
    expect(result).toMatchObject({
      state,
      decision: 'hold',
      pressure: 'unknown',
      reasonCode: state === 'unknown' ? 'source_unknown' : 'source_unavailable',
    });
  });

  it('projects expired evidence to stale HOLD without mutating the stored result', () => {
    const result = createProviderLimitResult(observation(), POLICY);
    const stale = materializeProviderLimitResult(result, new Date(T1));
    expect(stale).toMatchObject({
      state: 'stale', decision: 'hold', pressure: 'unknown', reasonCode: 'evidence_expired',
    });
    expect(result.state).toBe('known');
    expect(toLimitEvidence(stale, new Date(T1)).state).toBe('stale');
  });

  it('projects future-dated evidence to unknown HOLD and rejects non-canonical timestamps', () => {
    const result = createProviderLimitResult(observation(), POLICY);
    expect(materializeProviderLimitResult(result, new Date('2026-07-20T11:59:59.000Z')))
      .toMatchObject({ state: 'unknown', decision: 'hold', reasonCode: 'evidence_not_yet_valid' });
    expect(() => createProviderLimitResult(observation({
      source: { ...observation().source, fetchedAt: '2026-07-20T15:00:00+03:00' },
    }), POLICY)).toThrow(/canonical ISO timestamp/);
  });

  it('rejects a forged allow decision and legacy model aliases', () => {
    const result = createProviderLimitResult(observation(), POLICY);
    expect(() => assertProviderLimitResult({ ...result, decision: 'hold' }))
      .toThrow(/inconsistent with durable evidence/);
    expect(() => createProviderLimitResult(observation({
      requiredWindowIds: ['week-model'],
      windows: [window('week-model', 20, 80, 100, { kind: 'week-model', model: 'fable' })],
    }), POLICY)).toThrow(/Legacy model alias/);
    expect(() => createProviderLimitResult(observation({
      requiredWindowIds: ['week-model'],
      windows: [window('week-model', 20, 80, 100, { kind: 'week-model', model: null })],
    }), POLICY)).toThrow(/require an exact model API ID/);
  });

  it('requires canonical quota identity and exact backend evidence for known capacity', () => {
    expect(() => createProviderLimitResult(observation({ quotaScopeRefHash: 'f'.repeat(64) }), POLICY))
      .toThrow(/canonical account\/endpoint identity/);
    const unknownBackend = {
      transport: 'http' as const, executionBackend: 'unknown' as const, endpointRefHash: ENDPOINT_HASH,
    };
    expect(() => createProviderLimitResult(observation({
      backend: unknownBackend,
      quotaScopeRefHash: deriveProviderQuotaScopeRefHash({
        tenantId: 'tenant-a', provider: 'claude', accountRefHash: ACCOUNT_HASH,
        authMode: 'subscription', backend: unknownBackend,
      }),
    }), POLICY)).toThrow(/exact auth and execution backend/);
  });

  it('does not let evidence freshness outlive a required quota reset', () => {
    expect(() => createProviderLimitResult(observation({
      windows: [window('session', 50, 50, 100, {
        reset: { state: 'known', at: '2026-07-20T12:04:00.000Z', displayRefHash: null },
      }), window('week-all', 20, 80, 100, { kind: 'week-all' })],
    }), POLICY)).toThrow(/cannot outlive a required window reset/);
  });

  it('accepts measured zero usage but rejects negative usage and unproven release', () => {
    expect(() => assertProviderLimitReservationEvent({
      eventId: 'event-zero', type: 'consumed', occurredAt: T0,
      fenceTokenHash: 'f'.repeat(64), evidenceRef: 'provider-usage:00000001',
      actual: [{ windowId: 'input-tokens', unit: 'tokens', amount: 0 }],
    })).not.toThrow();
    expect(() => assertProviderLimitReservationEvent({
      eventId: 'event-negative', type: 'consumed', occurredAt: T0,
      fenceTokenHash: 'f'.repeat(64), evidenceRef: 'provider-usage:00000002',
      actual: [{ windowId: 'input-tokens', unit: 'tokens', amount: -1 }],
    })).toThrow(/must be non-negative/);
    expect(() => assertProviderLimitReservationEvent({
      eventId: 'event-release', type: 'released', occurredAt: T0,
      fenceTokenHash: 'f'.repeat(64), evidenceRef: 'release-event:00000001',
    })).toThrow(/terminationEvidenceRef/);
    expect(() => assertProviderLimitReservationEvent({
      eventId: 'event-release-authority', type: 'released', occurredAt: T0,
      fenceTokenHash: 'f'.repeat(64), evidenceRef: 'release-event:00000002',
      terminationEvidenceRef: 'runtime-stopped:00000002',
    })).toThrow(/terminationAuthorityRef/);
  });

  it('requires owner provenance before operator evidence can become authoritative', () => {
    expect(() => createProviderLimitResult(observation({
      source: {
        ...observation().source,
        kind: 'operator',
        authority: 'authoritative',
        operatorApprovalRef: null,
      },
    }), POLICY)).toThrow(/owner approval provenance/);
  });
});
