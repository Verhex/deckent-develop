import { describe, expect, it } from 'vitest';

import { migrateApprovalLifecycleRecord } from '../../src/core/approval-lifecycle-migration.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

const policy = resolveApprovalLifecyclePolicy({ enabled: true });

describe('legacy approval lifecycle migration', () => {
  it('derives expiry from the immutable source timestamp and is byte-deterministic', () => {
    const input = {
      origin: 'autonomous-trigger' as const,
      tenantId: 'tenant-a',
      sourceReference: 'trigger:shared-id',
      sourceRecord: { triggerId: 'shared-id', enqueuedAt: '2026-08-21T12:00:00Z' },
      sourceTimestamp: '2026-08-21T12:00:00Z',
      producerRisk: 'high' as const,
      destructive: true,
      policy,
    };
    const first = migrateApprovalLifecycleRecord(input);
    const afterRestart = migrateApprovalLifecycleRecord(input);

    expect(afterRestart).toEqual(first);
    expect(first).toMatchObject({
      state: 'migrated',
      createdAt: '2026-08-21T12:00:00.000Z',
      expiresAt: '2026-08-21T13:00:00.000Z',
      riskTier: 'critical',
      timeoutDisposition: 'park-alert',
    });
  });

  it('never resets a shorter producer expiry to the profile ceiling', () => {
    const result = migrateApprovalLifecycleRecord({
      origin: 'broker-native', tenantId: 'tenant-a', sourceReference: 'request:1',
      sourceRecord: { id: '1' }, sourceTimestamp: '2026-08-21T12:00:00Z',
      producerExpiresAt: '2026-08-21T12:01:00Z', producerRisk: 'low', policy,
    });
    expect(result).toMatchObject({ state: 'migrated', expiresAt: '2026-08-21T12:01:00.000Z' });
  });

  it.each([
    [undefined, 'missing-source-timestamp'],
    ['', 'missing-source-timestamp'],
    ['not-a-date', 'invalid-source-timestamp'],
  ])('quarantines an invalid original clock %s', (sourceTimestamp, reasonCode) => {
    const result = migrateApprovalLifecycleRecord({
      origin: 'confirmation', tenantId: 'tenant-a', sourceReference: 'confirmation:1',
      sourceRecord: { id: '1', sourceTimestamp }, sourceTimestamp,
      producerRisk: 'medium', policy,
    });
    expect(result).toMatchObject({ state: 'quarantined', reasonCode, sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('isolates identical legacy ids by tenant in deterministic successor identity', () => {
    const common = {
      origin: 'gateway-pairing' as const,
      sourceReference: 'pairing:123456', sourceRecord: { code: '123456' },
      sourceTimestamp: '2026-08-21T12:00:00Z', producerRisk: 'critical' as const, policy,
    };
    const tenantA = migrateApprovalLifecycleRecord({ ...common, tenantId: 'tenant-a' });
    const tenantB = migrateApprovalLifecycleRecord({ ...common, tenantId: 'tenant-b' });
    expect(tenantA).toMatchObject({ state: 'migrated' });
    expect(tenantB).toMatchObject({ state: 'migrated' });
    if (tenantA.state === 'migrated' && tenantB.state === 'migrated') {
      expect(tenantA.requestId).not.toBe(tenantB.requestId);
    }
  });

  it('quarantines a producer expiry at or before source creation', () => {
    const result = migrateApprovalLifecycleRecord({
      origin: 'broker-native', tenantId: 'tenant-a', sourceReference: 'request:1',
      sourceRecord: { id: '1' }, sourceTimestamp: '2026-08-21T12:00:00Z',
      producerExpiresAt: '2026-08-21T12:00:00Z', producerRisk: 'low', policy,
    });
    expect(result).toMatchObject({ state: 'quarantined', reasonCode: 'producer-expiry-not-after-source' });
  });
});
