import { describe, expect, it, vi } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import {
  ApprovalSlackChannel,
  type SlackApprovalTransport,
  type SlackBlockActionInteraction,
  type SlackMessagePayload,
} from '../../src/connectors/approval-slack.js';

function request(riskTier: ApprovalRiskTier): ApprovalRequest {
  return {
    version: '1.0', id: `slack-${riskTier}`, requester: { role: 'worker', instanceId: 'w1' },
    summary: 'channel decision', details: {}, scopeId: 'p', scope: 'shell-exec', risk: 'high',
    policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
    createdAt: '2026-08-21T09:00:00.000Z', expiresAt: '2026-08-21T10:00:00.000Z',
    maskedArgs: null, rawArgsRef: null, riskTier,
  } as ApprovalRequest & { riskTier: ApprovalRiskTier };
}

describe('Slack approval riskTier', () => {
  it('omits actions for high+critical and rejects a forged button value', async () => {
    const sent: SlackMessagePayload[] = [];
    let callback: ((value: SlackBlockActionInteraction) => void) | undefined;
    const transport: SlackApprovalTransport = {
      postMessage: async (message) => { sent.push(message); },
      onBlockAction: (handler) => { callback = handler; },
    };
    const channel = new ApprovalSlackChannel({ transport, channelId: 'ops' });
    const decide = vi.fn();
    channel.onDecision(decide);
    await channel.send({ kind: 'pending', request: request('critical') });
    expect(sent[0]?.blocks.some((block) => block.type === 'actions')).toBe(false);
    callback?.({ channelId: 'ops', userId: 'attacker', actionValue: 'approve:slack-critical' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('keeps explicit elevated tier interactive', async () => {
    const sent: SlackMessagePayload[] = [];
    const transport: SlackApprovalTransport = {
      postMessage: async (message) => { sent.push(message); }, onBlockAction: () => {},
    };
    await new ApprovalSlackChannel({ transport, channelId: 'ops' })
      .send({ kind: 'pending', request: request('elevated') });
    expect(sent[0]?.blocks.some((block) => block.type === 'actions')).toBe(true);
  });
});
