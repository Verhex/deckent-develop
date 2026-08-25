// ─── ApprovalTelegramChannel tests (APR-TG-CHANNEL, task 355-003) ────────────
// Fake-transport unit tests for the Telegram RelayChannel adapter: pending ->
// masked+buttoned message payload, cross-decided -> edit-in-place/fallback send,
// callback -> decision (approve/reject -> allow/deny, unrelated payload ignored),
// and an end-to-end wire through a REAL ApprovalBroker + ApprovalRelay proving a
// transport failure never kills the relay or blocks another attached channel.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay, type RelayChannel, type RelayNotification } from '../../src/core/approval-relay.js';
import {
  ApprovalTelegramChannel,
  type TelegramApprovalTransport,
} from '../../src/connectors/approval-telegram.js';
import type { IncomingCallback, OutgoingMessage } from '../../src/connectors/types.js';

const CREATED_AT = '2099-07-01T21:00:00.000Z';
const EXPIRES_AT = '2099-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-355-003' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-355',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    maskedArgs: { cmd: '[REDACTED]' },
    ...overrides,
  };
}

/** Fake transport: records sent/edited messages, exposes a way to fire a callback
 *  press exactly as a real TelegramConnector would forward one. */
function makeFakeTransport(opts: { withReturningId?: boolean; withEditMessage?: boolean; failSend?: boolean } = {}) {
  const sent: OutgoingMessage[] = [];
  const edits: Array<{ channelId: string; messageId: string; text: string; parseMode?: 'HTML' | 'MarkdownV2' }> = [];
  let callbackHandler: ((cb: IncomingCallback) => void) | undefined;
  let nextMessageId = 1;

  const transport: TelegramApprovalTransport = {
    async sendMessage(msg) {
      if (opts.failSend) throw new Error('boom: telegram send failed');
      sent.push(msg);
    },
    onCallback(handler) {
      callbackHandler = handler;
    },
  };
  if (opts.withReturningId !== false) {
    transport.sendMessageReturningId = async (msg) => {
      if (opts.failSend) throw new Error('boom: telegram send failed');
      sent.push(msg);
      return String(nextMessageId++);
    };
  }
  if (opts.withEditMessage !== false) {
    transport.editMessage = async (channelId, messageId, text, parseMode) => {
      edits.push({ channelId, messageId, text, parseMode });
    };
  }

  return {
    transport,
    sent,
    edits,
    fireCallback(cb: IncomingCallback) {
      if (!callbackHandler) throw new Error('onCallback handler was never registered');
      callbackHandler(cb);
    },
  };
}

describe('ApprovalTelegramChannel — pending -> message payload', () => {
  it('sends the source/reason/short-code triple with versioned buttons and no raw request id in payloads', async () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    const req = buildRequest('apr-tg-1');
    await channel.send({ kind: 'pending', request: req as never });

    expect(fake.sent).toHaveLength(1);
    const msg = fake.sent[0]!;
    expect(msg.connector).toBe('telegram');
    expect(msg.channelId).toBe('chat-1');
    expect(msg.parseMode).toBe('HTML');
    expect(msg.text).toContain('source: worker/w-355-003');
    expect(msg.text).toContain('reason: approval request apr-tg-1');
    expect(msg.text).toMatch(/#[0-9A-HJKMNP-TV-Z]{5}/i);

    expect(msg.buttons).toHaveLength(1);
    const row = msg.buttons![0]!;
    expect(row).toHaveLength(2);
    expect(row[0]!.callbackData).toMatch(/^dk1:brk:approve:[0-9A-HJKMNP-TV-Z]{5}:[0-9a-f]{8}$/i);
    expect(row[1]!.callbackData).toMatch(/^dk1:brk:reject:[0-9A-HJKMNP-TV-Z]{5}:[0-9a-f]{8}$/i);
    expect(row[0]!.callbackData.split(':')[3]).toBe(row[1]!.callbackData.split(':')[3]);
    expect(row[0]!.callbackData.split(':')[4]).toBe(row[1]!.callbackData.split(':')[4]);
    for (const button of row) expect(button.callbackData).not.toContain(req.id);
  });

  it('generates one fresh 8-hex nonce per card', async () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    await channel.send({ kind: 'pending', request: buildRequest('apr-tg-nonce-1') as never });
    await channel.send({ kind: 'pending', request: buildRequest('apr-tg-nonce-2') as never });

    const firstNonce = fake.sent[0]!.buttons![0]![0]!.callbackData.split(':')[4];
    const secondNonce = fake.sent[1]!.buttons![0]![0]!.callbackData.split(':')[4];
    expect(firstNonce).toMatch(/^[0-9a-f]{8}$/);
    expect(secondNonce).toMatch(/^[0-9a-f]{8}$/);
    expect(secondNonce).not.toBe(firstNonce);
  });

  it('renders critical requests view-only with the short-code CLI decision hint', async () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    await channel.send({
      kind: 'pending',
      request: buildRequest('raw-critical-request-id', { risk: 'critical' }) as never,
    });

    const msg = fake.sent[0]!;
    expect(msg.buttons).toBeUndefined();
    expect(msg.text).toMatch(/deckent approvals decide #[0-9A-HJKMNP-TV-Z]{5}/i);
  });

  it('falls back to sendMessage (no id captured) when the transport lacks sendMessageReturningId', async () => {
    const fake = makeFakeTransport({ withReturningId: false });
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    await channel.send({ kind: 'pending', request: buildRequest('apr-tg-2') as never });

    expect(fake.sent).toHaveLength(1);
  });
});

describe('ApprovalTelegramChannel — cross-decided -> edit in place or fallback send', () => {
  it('edits the original card in place when a platform message id was captured', async () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    const req = buildRequest('apr-tg-3');
    await channel.send({ kind: 'pending', request: req as never });
    expect(fake.sent).toHaveLength(1);

    await channel.send({
      kind: 'cross-decided',
      request: req as never,
      decision: { requestId: 'apr-tg-3', decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: EXPIRES_AT, reason: '' } as never,
      message: 'terminal kanalında karar verildi',
    });

    expect(fake.edits).toHaveLength(1);
    expect(fake.edits[0]).toMatchObject({ channelId: 'chat-1', messageId: '1', parseMode: 'HTML' });
    expect(fake.edits[0]!.text).toContain('terminal kanalında karar verildi');
    expect(fake.sent).toHaveLength(1); // no extra fallback send once edited
  });

  it('sends a plain follow-up message when no message id was captured (or no editMessage support)', async () => {
    const fake = makeFakeTransport({ withReturningId: false, withEditMessage: false });
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    const req = buildRequest('apr-tg-4');
    await channel.send({ kind: 'pending', request: req as never });

    await channel.send({
      kind: 'cross-decided',
      request: req as never,
      decision: { requestId: 'apr-tg-4', decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: EXPIRES_AT, reason: '' } as never,
      message: 'terminal kanalında karar verildi',
    });

    expect(fake.edits).toHaveLength(0);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[1]!.text).toContain('terminal kanalında karar verildi');
  });
});

describe('ApprovalTelegramChannel — onDecision (callback -> decision)', () => {
  it('maps an approve press to an allow decision for the raw broker request', async () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    await channel.send({ kind: 'pending', request: buildRequest('apr-tg-5') as never });
    const data = fake.sent[0]!.buttons![0]![0]!.callbackData;
    fake.fireCallback({ connector: 'telegram', channelId: 'chat-1', fromUser: 'u-1', data });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr-tg-5', decision: 'allow', decidedBy: 'u-1' }),
    );
  });

  it('maps a reject press to a deny decision for the raw broker request', async () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    await channel.send({ kind: 'pending', request: buildRequest('apr-tg-6') as never });
    const data = fake.sent[0]!.buttons![0]![1]!.callbackData;
    fake.fireCallback({ connector: 'telegram', channelId: 'chat-1', fromUser: 'u-2', data });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr-tg-6', decision: 'deny', decidedBy: 'u-2' }),
    );
  });

  it('ignores a non-approval callback payload', () => {
    const fake = makeFakeTransport();
    const channel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    fake.fireCallback({ connector: 'telegram', channelId: 'chat-1', fromUser: 'u-3', data: 'unrelated-payload' });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('ApprovalTelegramChannel — wired into a real ApprovalRelay + ApprovalBroker', () => {
  let projectRoot: string;

  function setup() {
    projectRoot = mkdtempSync(join(tmpdir(), 'approval-telegram-'));
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    const relay = new ApprovalRelay(broker);
    return { broker, relay };
  }

  it('a transport failure reports channel-error without blocking another attached channel', async () => {
    const failing = makeFakeTransport({ failSend: true });
    const telegramChannel = new ApprovalTelegramChannel({ transport: failing.transport, channelId: 'chat-1' });
    const { broker, relay } = setup();

    const goodSent: RelayNotification[] = [];
    const goodChannel: RelayChannel = {
      send(n) {
        goodSent.push(n);
      },
      onDecision() {},
    };

    relay.attachChannel('telegram', telegramChannel);
    relay.attachChannel('good', goodChannel);

    const errorListener = vi.fn();
    relay.on('channel-error', errorListener);

    expect(() => broker.submit(buildRequest('apr-tg-7'))).not.toThrow();
    // Let the telegram channel's rejected send() promise settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(goodSent).toHaveLength(1);
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram', error: expect.any(Error) }),
    );

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a button press resolves the broker awaitDecision end-to-end', async () => {
    const fake = makeFakeTransport();
    const telegramChannel = new ApprovalTelegramChannel({ transport: fake.transport, channelId: 'chat-1' });
    const { broker, relay } = setup();

    relay.attachChannel('telegram', telegramChannel);

    const req = broker.submit(buildRequest('apr-tg-8'));
    const waiting = broker.awaitDecision(req.id);

    const callbackData = fake.sent[0]!.buttons![0]![0]!.callbackData;
    expect(callbackData).not.toContain(req.id);
    fake.fireCallback({ connector: 'telegram', channelId: 'chat-1', fromUser: 'alperen', data: callbackData });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('telegram');

    rmSync(projectRoot, { recursive: true, force: true });
  });
});
