import { describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import { decidePolicy } from '../../src/core/approval-policy.js';
import { resolveFallback } from '../../src/core/approval-fallback.js';

function request(riskTier: ApprovalRiskTier): ApprovalRequest {
  return {
    version: '1.0', id: `policy-${riskTier}`, requester: { role: 'worker', instanceId: 'w1' },
    summary: 'guard action', details: {}, scopeId: 'p', scope: 'shell-exec', risk: 'high',
    policy: 'auto-approve', defaultAction: 'allow', tenantId: 'main', userId: 'owner',
    createdAt: '2026-08-21T09:00:00.000Z', expiresAt: '2026-08-21T10:00:00.000Z',
    maskedArgs: null, rawArgsRef: null, riskTier,
  } as ApprovalRequest & { riskTier: ApprovalRiskTier };
}

describe('policy and fallback effective riskTier guards', () => {
  it('clamps high+critical auto-approval to deny while explicit elevated remains authoritative', () => {
    const rules = [{ match: {}, action: 'auto-approve' as const }];
    expect(decidePolicy(request('critical'), rules).policy).toBe('deny');
    expect(decidePolicy(request('elevated'), rules).policy).toBe('auto-approve');
  });

  it('never applies an allow timeout default to an expired critical tier, even with API reachable', () => {
    expect(resolveFallback(request('critical'), {
      channelsAlive: ['api'], expiresAt: '2026-08-21T10:00:00.000Z', policyDefault: 'allow',
    })).toMatchObject({ kind: 'deny' });
  });

  it('fails malformed explicit tiers closed instead of treating them as missing legacy input', () => {
    expect(resolveFallback({ risk: 'high', riskTier: 'unknown', expiresAt: '2026-08-21T11:00:00.000Z' } as never, {
      channelsAlive: ['api'], expiresAt: '2026-08-21T10:00:00.000Z', policyDefault: 'allow',
    })).toMatchObject({ kind: 'deny' });
  });
});
