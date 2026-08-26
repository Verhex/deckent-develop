import { describe, expect, it, vi } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import {
  ApprovalTelegramChannel,
  type TelegramApprovalTransport,
} from '../../src/connectors/approval-telegram.js';
import type { IncomingCallback, OutgoingMessage } from '../../src/connectors/types.js';

function request(riskTier: ApprovalRiskTier): ApprovalRequest {
  return {
    version: '1.0', id: `telegram-${riskTier}`, requester: { role: 'worker', instanceId: 'w1' },
    summary: 'channel decision', details: {}, scopeId: 'p', scope: 'shell-exec', risk: 'high',
    policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
    createdAt: '2026-08-21T09:00:00.000Z', expiresAt: '2026-08-21T10:00:00.000Z',
    maskedArgs: null, rawArgsRef: null, riskTier,
  } as ApprovalRequest & { riskTier: ApprovalRiskTier };
}

describe('Telegram approval riskTier', () => {
  it('renders high+critical view-only and ignores a forged legacy callback', async () => {
    const sent: OutgoingMessage[] = [];
    let callback: ((value: IncomingCallback) => void) | undefined;
    const transport: TelegramApprovalTransport = {
      sendMessage: async (message) => { sent.push(message); },
      onCallback: (handler) => { callback = handler; },
    };
    const channel = new ApprovalTelegramChannel({ transport, channelId: 'chat' });
    const decide = vi.fn();
    channel.onDecision(decide);
    await channel.send({ kind: 'pending', request: request('critical') });
    expect(sent[0]?.buttons).toBeUndefined();
    expect(sent[0]?.text).toContain('deckent approvals decide #');
    callback?.({ connector: 'telegram', channelId: 'chat', fromUser: 'attacker', data: 'approve:telegram-critical' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('keeps an explicit elevated tier interactive despite legacy high', async () => {
    const sent: OutgoingMessage[] = [];
    const transport: TelegramApprovalTransport = {
      sendMessage: async (message) => { sent.push(message); }, onCallback: () => {},
    };
    await new ApprovalTelegramChannel({ transport, channelId: 'chat' })
      .send({ kind: 'pending', request: request('elevated') });
    expect(sent[0]?.buttons?.[0]).toHaveLength(2);
  });
});
