import { describe, expect, it, vi } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import {
  ApprovalTeamsChannel,
  type TeamsAdaptiveCardActionInvocation,
  type TeamsApprovalTransport,
  type TeamsMessagePayload,
} from '../../src/connectors/approval-teams.js';

function request(riskTier: ApprovalRiskTier): ApprovalRequest {
  return {
    version: '1.0', id: `teams-${riskTier}`, requester: { role: 'worker', instanceId: 'w1' },
    summary: 'channel decision', details: {}, scopeId: 'p', scope: 'shell-exec', risk: 'high',
    policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
    createdAt: '2026-08-21T09:00:00.000Z', expiresAt: '2026-08-21T10:00:00.000Z',
    maskedArgs: null, rawArgsRef: null, riskTier,
  } as ApprovalRequest & { riskTier: ApprovalRiskTier };
}

describe('Teams approval riskTier', () => {
  it('omits card actions for high+critical and rejects a forged submit', async () => {
    const sent: TeamsMessagePayload[] = [];
    let callback: ((value: TeamsAdaptiveCardActionInvocation) => void) | undefined;
    const transport: TeamsApprovalTransport = {
      sendActivity: async (message) => { sent.push(message); },
      onCardAction: (handler) => { callback = handler; },
    };
    const channel = new ApprovalTeamsChannel({ transport, channelId: 'ops' });
    const decide = vi.fn();
    channel.onDecision(decide);
    await channel.send({ kind: 'pending', request: request('critical') });
    expect(sent[0]?.attachments[0]?.content.actions).toEqual([]);
    callback?.({ channelId: 'ops', userId: 'attacker', actionValue: 'approve:teams-critical' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('keeps explicit elevated tier interactive', async () => {
    const sent: TeamsMessagePayload[] = [];
    const transport: TeamsApprovalTransport = {
      sendActivity: async (message) => { sent.push(message); }, onCardAction: () => {},
    };
    await new ApprovalTeamsChannel({ transport, channelId: 'ops' })
      .send({ kind: 'pending', request: request('elevated') });
    expect(sent[0]?.attachments[0]?.content.actions).toHaveLength(2);
  });
});
