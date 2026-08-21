import { describe, expect, it, vi } from 'vitest';
import type { ApprovalRequestInput } from '../../src/core/approval-broker.js';
import {
  ApprovalTeamsChannel,
  type TeamsAdaptiveCardActionInvocation,
  type TeamsApprovalTransport,
  type TeamsMessagePayload,
} from '../../src/connectors/approval-teams.js';

const CREATED_AT = '2026-08-21T10:00:00.000Z';

function request(risk: ApprovalRequestInput['risk'] = 'high'): ApprovalRequestInput {
  return {
    id: 'teams-contract-request',
    requester: { role: 'worker', instanceId: 'w-600-005' },
    summary: 'Deploy the release',
    details: {},
    scopeId: 'sprint-600',
    scope: 'shell-exec',
    risk,
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'operator',
    createdAt: CREATED_AT,
    expiresAt: '2026-08-21T10:15:00.000Z',
  };
}

function fakeTransport() {
  const sent: TeamsMessagePayload[] = [];
  let handler: ((invocation: TeamsAdaptiveCardActionInvocation) => void) | undefined;
  const transport: TeamsApprovalTransport = {
    async sendActivity(payload) {
      sent.push(payload);
    },
    onCardAction(next) {
      handler = next;
    },
  };
  return {
    transport,
    sent,
    invoke(invocation: TeamsAdaptiveCardActionInvocation) {
      if (!handler) throw new Error('card action handler not registered');
      handler(invocation);
    },
  };
}

describe('ApprovalTeamsChannel — relay card contract', () => {
  it('renders the source/reason/code triple and versioned Action.Submit values with a per-card nonce', async () => {
    const fake = fakeTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'teams-ops' });

    await channel.send({ kind: 'pending', request: request() as never });
    await channel.send({ kind: 'pending', request: request() as never });

    const first = fake.sent[0]!.attachments[0]!.content;
    expect(first.body[0]!.text).toMatch(/source: worker\/w-600-005 · reason: Deploy the release · #[0-9A-HJKMNP-TV-Z]{5}/);
    expect(first.actions).toHaveLength(2);
    const approve = first.actions[0]!.data.value;
    const reject = first.actions[1]!.data.value;
    expect(approve).toMatch(/^dk1:brk:approve:[0-9A-HJKMNP-TV-Z]{5}:[0-9a-f]{8}$/);
    expect(reject).toMatch(/^dk1:brk:reject:[0-9A-HJKMNP-TV-Z]{5}:[0-9a-f]{8}$/);
    expect(reject.split(':')[4]).toBe(approve.split(':')[4]);
    expect(fake.sent[1]!.attachments[0]!.content.actions[0]!.data.value.split(':')[4]).not.toBe(
      approve.split(':')[4],
    );
  });

  it('makes critical cards view-only and includes the explicit decision-command hint', async () => {
    const fake = fakeTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'teams-ops' });

    await channel.send({ kind: 'pending', request: request('critical') as never });

    const payload = fake.sent[0]!;
    expect(payload.attachments[0]!.content.actions).toEqual([]);
    expect(payload.text).toMatch(/deckent approvals decide #[0-9A-HJKMNP-TV-Z]{5}/);
  });

  it('validates and decodes a versioned card action into the relay decision shape', async () => {
    const fake = fakeTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'teams-ops' });
    const decide = vi.fn();
    channel.onDecision(decide);
    await channel.send({ kind: 'pending', request: request() as never });
    const actionValue = fake.sent[0]!.attachments[0]!.content.actions[1]!.data.value;

    fake.invoke({ channelId: 'teams-ops', userId: 'operator', actionValue });

    expect(decide).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'teams-contract-request',
      decision: 'deny',
      decidedBy: 'operator',
    }));
  });
});
