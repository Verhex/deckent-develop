import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import {
  APPROVAL_CHANNEL_AUTHORITY_REF,
  ChannelLiveApprovalAuthenticator,
  approvalMayUseChannel,
  approvalRiskTierFor,
} from '../../src/core/approval-channel-authenticator.js';

const NOW = new Date('2026-08-21T10:00:00.000Z');
const BINDING_DIGEST = 'b'.repeat(64);

function request(riskTier?: ApprovalRiskTier): ApprovalRequest {
  const value: ApprovalRequest & { riskTier?: ApprovalRiskTier } = {
    version: '1.0', id: 'channel-tier-1',
    requester: { role: 'brain', instanceId: 'brain-a' },
    summary: 'Authenticate a channel decision', details: {},
    scopeId: 'project-a', scope: 'shell-exec', risk: 'high',
    policy: 'require-approval', defaultAction: 'deny',
    tenantId: 'tenant-a', userId: 'owner-a',
    createdAt: '2026-08-21T09:59:00.000Z', expiresAt: '2026-08-21T10:01:00.000Z',
    maskedArgs: null, rawArgsRef: null,
  };
  if (riskTier !== undefined) value.riskTier = riskTier;
  return value;
}

function context(riskTier?: ApprovalRiskTier) {
  return { request: request(riskTier), requestDigest: 'a'.repeat(64), action: 'allow' as const, channel: 'telegram' };
}

describe('approval channel normalized risk tier', () => {
  it('uses explicit riskTier authoritatively and delegates missing legacy risk centrally', () => {
    expect(approvalRiskTierFor(request('elevated'))).toBe('elevated');
    expect(approvalRiskTierFor(request())).toBe('elevated');
    expect(approvalRiskTierFor(request('routine'))).toBeNull();
    expect(approvalRiskTierFor({ risk: 'high', riskTier: 'unknown' })).toBeNull();
    expect(approvalMayUseChannel({ risk: 'high', riskTier: 'critical' })).toBe(false);
  });

  it('rejects risk=high+riskTier=critical before nonce use and kills an in-flight proof', async () => {
    const consumeNonce = vi.fn(() => true);
    const authenticator = new ChannelLiveApprovalAuthenticator({
      connector: 'telegram', principal: { userId: 'telegram-owner' },
      chatKey: 'telegram:chat-42', bindingDigest: BINDING_DIGEST, nonce: 'nonce-1',
      isAuthorized: () => true, consumeNonce, now: () => NOW,
    });
    await expect(authenticator.reauthenticate(context('critical'))).resolves.toBeNull();
    expect(consumeNonce).not.toHaveBeenCalled();
    expect(authenticator.isSessionActive({
      actorId: 'channel:telegram:telegram-owner', tenantId: 'tenant-a', role: null,
      sessionRefHash: createHash('sha256').update(BINDING_DIGEST).digest('hex'),
      authorityRef: APPROVAL_CHANNEL_AUTHORITY_REF,
      authenticatedAt: NOW.toISOString(), expiresAt: '2026-08-21T10:01:00.000Z',
    }, context('critical'), NOW)).toBe(false);
  });
});
