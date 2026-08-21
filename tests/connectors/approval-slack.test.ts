import { describe, expect, it, vi } from 'vitest';
import type { ApprovalRequestInput } from '../../src/core/approval-broker.js';
import {
  ApprovalSlackChannel,
  type SlackApprovalTransport,
  type SlackBlockActionInteraction,
  type SlackMessagePayload,
} from '../../src/connectors/approval-slack.js';

function request(risk: ApprovalRequestInput['risk'] = 'high'): ApprovalRequestInput {
  return {
    id: 'approval-with-a-raw-identifier',
    requester: { role: 'worker', instanceId: 'w-600-004' },
    summary: 'Run the masked operation',
    details: {},
    scopeId: 'sprint-600',
    scope: 'shell-exec',
    risk,
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'operator',
    createdAt: '2026-08-21T00:00:00.000Z',
    expiresAt: '2026-08-21T00:15:00.000Z',
    maskedArgs: { secret: '[REDACTED]' },
  };
}

function fakeTransport() {
  const sent: SlackMessagePayload[] = [];
  let handler: ((interaction: SlackBlockActionInteraction) => void) | undefined;
  const transport: SlackApprovalTransport = {
    async postMessage(payload) { sent.push(payload); },
    onBlockAction(next) { handler = next; },
  };
  return { transport, sent, fire: (actionValue: string) => handler?.({ channelId: 'C1', userId: 'U1', actionValue }) };
}

describe('ApprovalSlackChannel — broker card contract', () => {
  it('renders the source/reason/code card triple with brk values, a nonce, and no raw id', async () => {
    const fake = fakeTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C1' });
    const req = request();

    await channel.send({ kind: 'pending', request: req as never });
    await channel.send({ kind: 'pending', request: req as never });

    const payload = fake.sent[0]!;
    expect(payload.blocks).toHaveLength(2);
    expect(payload.text).toMatch(/source: worker\/w-600-004 · reason: Run the masked operation · #[0-9A-HJKMNP-TV-Z]{5}/i);
    const actions = payload.blocks[1];
    expect(actions?.type).toBe('actions');
    if (actions?.type !== 'actions') throw new Error('expected actions block');
    expect(actions.elements).toHaveLength(2);
    const values = actions.elements.map((element) => element.value);
    expect(values[0]).toMatch(/^dk1:brk:approve:[0-9A-HJKMNP-TV-Z]{5}:[0-9a-f]{8}$/i);
    expect(values[1]).toMatch(/^dk1:brk:reject:[0-9A-HJKMNP-TV-Z]{5}:[0-9a-f]{8}$/i);
    expect(values[0]?.split(':')[4]).toBe(values[1]?.split(':')[4]);
    const nextActions = fake.sent[1]!.blocks[1];
    if (nextActions?.type !== 'actions') throw new Error('expected actions block');
    expect(nextActions.elements[0]!.value.split(':')[4]).not.toBe(values[0]?.split(':')[4]);
    expect(JSON.stringify(payload)).not.toContain(req.id);
  });

  it('resolves a valid brk callback to its raw broker id and rejects unknown or wrong-namespace payloads', async () => {
    const fake = fakeTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C1' });
    const handler = vi.fn();
    channel.onDecision(handler);

    await channel.send({ kind: 'pending', request: request() as never });
    const actions = fake.sent[0]!.blocks[1];
    if (actions?.type !== 'actions') throw new Error('expected actions block');
    const approveValue = actions.elements[0]!.value;
    const [, , , shortCode] = approveValue.split(':');

    fake.fire(approveValue);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'approval-with-a-raw-identifier',
      decision: 'allow',
      decidedBy: 'U1',
    }));

    handler.mockClear();
    fake.fire(`dk1:brk:approve:${shortCode}:deadbeef`);
    fake.fire(approveValue.replace('dk1:brk:', 'dk1:bot:'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('renders critical requests view-only with approve/reject command hints', async () => {
    const fake = fakeTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C1' });

    await channel.send({ kind: 'pending', request: request('critical') as never });

    const payload = fake.sent[0]!;
    expect(payload.blocks).toHaveLength(1);
    expect(payload.blocks.some((block) => block.type === 'actions')).toBe(false);
    expect(payload.text).toMatch(/deckent approvals decide #[0-9A-HJKMNP-TV-Z]{5}/i);
    expect(JSON.stringify(payload)).not.toContain('approval-with-a-raw-identifier');
  });
});
