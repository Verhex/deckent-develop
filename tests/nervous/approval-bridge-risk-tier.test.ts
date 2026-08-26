import { describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import { toNervousNotification } from '../../src/nervous/approval-bridge.js';

function request(riskTier: ApprovalRiskTier): ApprovalRequest {
  return {
    version: '1.0', id: `nervous-${riskTier}`, requester: { role: 'nervous', instanceId: 'observer' },
    summary: 'nervous action', details: {}, scopeId: 'p', scope: 'lifecycle', risk: 'high',
    policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
    createdAt: '2026-08-21T09:00:00.000Z', expiresAt: '2026-08-21T10:00:00.000Z',
    maskedArgs: null, rawArgsRef: null, riskTier,
  } as ApprovalRequest & { riskTier: ApprovalRiskTier };
}

describe('Nervous approval effective riskTier', () => {
  it('sets the safety floor from authoritative riskTier, not legacy risk', () => {
    expect(toNervousNotification(request('critical'))?.actions[0]?.isSafetyFloor).toBe(true);
    expect(toNervousNotification(request('elevated'))?.actions[0]?.isSafetyFloor).toBe(false);
  });

  it('fails malformed explicit tier to the safety floor', () => {
    expect(toNervousNotification({ ...request('elevated'), riskTier: 'unknown' } as never)
      ?.actions[0]?.isSafetyFloor).toBe(true);
  });
});
