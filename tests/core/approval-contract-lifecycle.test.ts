import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  APPROVAL_CONTRACT_V1_VERSION,
  APPROVAL_CONTRACT_V2_VERSION,
  approvalRequestV2Schema,
  validateApprovalRequest,
  validateStoredApprovalRequest,
  type ApprovalRequestV2,
} from '../../src/core/approval-contract.js';
import { approvalLifecycleProfileDigest } from '../../src/core/approval-lifecycle-policy.js';

const CREATED_AT = '2026-08-21T00:00:00.000Z';
const EXPIRES_AT = '2026-08-21T00:10:00.000Z';

function baseRequest(): Record<string, unknown> {
  return {
    id: 'apr-d4-contract-1',
    requester: { role: 'worker', instanceId: 'worker-d4' },
    summary: 'Apply a governed operation',
    details: { kind: 'test' },
    scopeId: 'scope-d4',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-d4',
    userId: 'user-d4',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  };
}

describe('approval contract lifecycle envelope', () => {
  it('keeps the new-write v1 compatibility default', () => {
    const result = validateApprovalRequest(baseRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(APPROVAL_CONTRACT_V1_VERSION);
    expect(result.value.maskedArgs).toBeNull();
    expect(result.value.rawArgsRef).toBeNull();
  });

  it('reads stored v1 source shape without injecting enumerable defaults or changing its digest', () => {
    const source = baseRequest();
    const before = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    const result = validateStoredApprovalRequest(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.prototype.hasOwnProperty.call(result.value, 'version')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.value, 'maskedArgs')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.value, 'rawArgsRef')).toBe(false);
    expect(createHash('sha256').update(JSON.stringify(result.value)).digest('hex')).toBe(before);
  });

  it('accepts the strict v2 lifecycle envelope and preserves source lineage exactly', () => {
    const sourceDigest = 'a'.repeat(64);
    const lifecycleProfile = {
      ttlMs: 600_000,
      slaMs: [60_000, 180_000, 420_000] as [number, number, number],
      riskTier: 'critical' as const,
      timeoutDisposition: 'deny-expire' as const,
      blocking: 'security' as const,
    };
    const candidate = {
      ...baseRequest(),
      version: APPROVAL_CONTRACT_V2_VERSION,
      origin: 'gateway-pairing',
      riskTier: 'critical',
      blocking: 'security',
      lifecycleProfile,
      policySnapshotDigest: approvalLifecycleProfileDigest('gateway-pairing', lifecycleProfile),
      source: {
        contractVersion: APPROVAL_CONTRACT_V1_VERSION,
        requestDigest: sourceDigest,
        reference: 'gateway-access://pairing/pair-d4',
      },
      lifecycleGeneration: 'attempt-1',
      slaStage: 'initial',
    };
    const result = validateApprovalRequest(candidate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value: ApprovalRequestV2 = result.value as ApprovalRequestV2;
    expect(value.version).toBe(APPROVAL_CONTRACT_V2_VERSION);
    expect(value.source).toEqual(candidate.source);
    expect(value.source.requestDigest).toBe(sourceDigest);
    expect(approvalRequestV2Schema.safeParse(candidate).success).toBe(true);
  });

  it('rejects incomplete, malformed and raw-secret-bearing v2 envelopes', () => {
    const lifecycleProfile = {
      ttlMs: 1_800_000,
      slaMs: [120_000, 600_000, 1_200_000] as [number, number, number],
      riskTier: 'routine' as const,
      timeoutDisposition: 'request-default' as const,
      blocking: 'request' as const,
    };
    const base = {
      ...baseRequest(),
      version: APPROVAL_CONTRACT_V2_VERSION,
      origin: 'broker-native',
      riskTier: 'elevated',
      blocking: 'request',
      lifecycleProfile,
      policySnapshotDigest: approvalLifecycleProfileDigest('broker-native', lifecycleProfile),
      source: {
        contractVersion: APPROVAL_CONTRACT_V2_VERSION,
        requestDigest: 'd'.repeat(64),
        reference: 'broker://request/apr-d4-contract-1',
      },
      lifecycleGeneration: 'generation-1',
      slaStage: 'initial',
    };
    expect(validateApprovalRequest({ ...base, policySnapshotDigest: 'bad' }).ok).toBe(false);
    expect(validateApprovalRequest({ ...base, policySnapshotDigest: 'c'.repeat(64) }).ok).toBe(false);
    expect(validateApprovalRequest({ ...base, riskTier: 'routine' }).ok).toBe(false);
    expect(validateApprovalRequest({ ...base, origin: 'unknown-origin' }).ok).toBe(false);
    expect(validateApprovalRequest({ ...base, rawArgs: { token: 'secret' } }).ok).toBe(false);
    const { source: _source, ...withoutSource } = base;
    expect(validateApprovalRequest(withoutSource).ok).toBe(false);
  });
});
