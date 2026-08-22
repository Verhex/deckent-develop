import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import { liveRuleFor, requestTierFor } from '../../src/core/approval-rules-engine.js';
import { saveApprovalRules, type ApprovalRule } from '../../src/core/approval-rules.js';

const NOW = new Date('2026-08-21T10:00:00.000Z');

function request(riskTier?: ApprovalRiskTier, risk: ApprovalRequest['risk'] = 'low'): ApprovalRequest {
  const value: ApprovalRequest & { riskTier?: ApprovalRiskTier } = {
    version: '1.0', id: 'aprp-' + 'a'.repeat(64),
    requester: { role: 'brain', instanceId: 'xverify' }, summary: 'provider probe',
    details: { kind: 'provider-evidence-probe' }, scopeId: 'project', scope: 'network',
    risk, policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
    createdAt: '2026-08-21T09:59:00.000Z', expiresAt: '2026-08-21T10:30:00.000Z',
    maskedArgs: null, rawArgsRef: null,
  };
  if (riskTier !== undefined) value.riskTier = riskTier;
  return value;
}

function rule(max: 'routine' | 'elevated'): ApprovalRule {
  return {
    id: 'rule-tier-01', createdAt: '2026-08-21T09:00:00.000Z', createdBy: 'owner', reason: 'bounded probe',
    match: { idPrefix: 'aprp-', riskTierMax: max }, decision: 'allow', source: 'manual',
  };
}

describe('approval rules effective risk tier', () => {
  it('never automates critical or malformed explicit tiers', () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-rules-tier-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    saveApprovalRules(root, [rule('elevated')]);

    expect(requestTierFor(request('critical'))).toBe('critical');
    expect(liveRuleFor(root, request('critical'), NOW)).toBeNull();
    const malformed = { ...request(), riskTier: 'unknown' } as unknown as ApprovalRequest;
    expect(requestTierFor(malformed)).toBeNull();
    expect(liveRuleFor(root, malformed, NOW)).toBeNull();
  });

  it('uses explicit tier and central legacy normalization instead of a kind-local tier', () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-rules-tier-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    saveApprovalRules(root, [rule('routine')]);
    expect(requestTierFor(request())).toBe('routine');
    expect(liveRuleFor(root, request(), NOW)?.id).toBe('rule-tier-01');
    expect(requestTierFor(request('elevated'))).toBe('elevated');
    expect(liveRuleFor(root, request('elevated'), NOW)).toBeNull();
    saveApprovalRules(root, [rule('elevated')]);
    expect(liveRuleFor(root, request('elevated'), NOW)?.id).toBe('rule-tier-01');
  });
});
