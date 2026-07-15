// ─── ApprovalRelay tests (APR-2, task 352-011) ───────────────────────────────
// Fake-channel behavior tests for the multi-channel approval relay core: fan-out
// on 'pending' (maskedArgs, never raw), channel-decide -> broker resume +
// cross-broadcast to the OTHER channel(s), duplicate-channel rejection, and
// channel-error isolation (a bad channel never kills the relay or the others).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import {
  ApprovalRelay,
  ApprovalRelayError,
  type ChannelDecisionInput,
  type RelayChannel,
  type RelayNotification,
} from '../../src/core/approval-relay.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-352-011' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-352',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: '2026-07-01T21:15:00.000Z',
    maskedArgs: { cmd: '***REDACTED***' },
    ...overrides,
  };
}

/** Fake channel: records every notification it receives and exposes a
 *  `decide()` test helper that invokes whatever handler the relay registered
 *  via `onDecision` — simulating a user resolving the approval on this surface. */
function makeFakeChannel() {
  const sent: RelayNotification[] = [];
  let decisionHandler: ((input: ChannelDecisionInput) => void) | undefined;
  const channel: RelayChannel = {
    send(notification) {
      sent.push(notification);
    },
    onDecision(handler) {
      decisionHandler = handler;
    },
  };
  return {
    channel,
    sent,
    decide(input: ChannelDecisionInput) {
      if (!decisionHandler) throw new Error('onDecision handler was never registered');
      decisionHandler(input);
    },
  };
}

let projectRoot: string;
let broker: ApprovalBroker;
let relay: ApprovalRelay;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-relay-'));
  broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
  relay = new ApprovalRelay(broker);
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('ApprovalRelay — pending fan-out', () => {
  it('notifies every attached channel with maskedArgs, never a raw value', () => {
    const a = makeFakeChannel();
    const b = makeFakeChannel();
    relay.attachChannel('channel-a', a.channel);
    relay.attachChannel('channel-b', b.channel);

    const req = broker.submit(buildRequest('apr-relay-1'));

    for (const fake of [a, b]) {
      expect(fake.sent).toHaveLength(1);
      const notification = fake.sent[0]!;
      expect(notification.kind).toBe('pending');
      expect(notification).toMatchObject({ kind: 'pending', request: req });
      expect((notification as { request: typeof req }).request.maskedArgs).toEqual({ cmd: '***REDACTED***' });
      // The contract has no raw-args field at all — only an opaque rawArgsRef
      // pointer — so asserting the full request shape is the strongest
      // "raw never leaks" guarantee available.
      expect(Object.keys(notification.request)).not.toContain('rawArgs');
    }
  });
});

describe('ApprovalRelay — channel-decide resumes broker + cross-broadcasts', () => {
  it('channel-A deciding resolves awaitDecision and notifies only channel-B', async () => {
    const a = makeFakeChannel();
    const b = makeFakeChannel();
    relay.attachChannel('channel-a', a.channel);
    relay.attachChannel('channel-b', b.channel);

    const req = broker.submit(buildRequest('apr-relay-2'));
    const waiting = broker.awaitDecision(req.id);

    a.decide({
      requestId: req.id,
      decision: 'allow',
      decidedBy: 'alperen',
      decidedAt: '2026-07-01T21:05:00.000Z',
    });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('channel-a');

    // channel-A only saw the original pending notification — not its own decision.
    expect(a.sent).toHaveLength(1);
    expect(a.sent[0]!.kind).toBe('pending');

    // channel-B saw pending, then exactly one cross-broadcast.
    expect(b.sent).toHaveLength(2);
    const crossBroadcast = b.sent[1]!;
    expect(crossBroadcast.kind).toBe('cross-decided');
    expect(crossBroadcast).toMatchObject({
      kind: 'cross-decided',
      decision,
      // born-697 D3 — the message is now a neutral English DEFAULT (was a
      // hardcoded-Turkish "… kanalında karar verildi" i18n violation).
      message: 'decision made on channel channel-a',
    });
  });

  it('uses an injected formatCrossDecided builder (string-free, i18n-first — born-697 D3)', async () => {
    const localizedBroker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals-fmt') });
    const localizedRelay = new ApprovalRelay(
      localizedBroker,
      undefined,
      (d) => `[${d.channel}] ${d.decision === 'allow' ? 'ONAYLANDI' : 'REDDEDİLDİ'}`,
    );
    const a = makeFakeChannel();
    const b = makeFakeChannel();
    localizedRelay.attachChannel('channel-a', a.channel);
    localizedRelay.attachChannel('channel-b', b.channel);

    const req = localizedBroker.submit(buildRequest('apr-relay-fmt-1'));
    const waiting = localizedBroker.awaitDecision(req.id);
    a.decide({ requestId: req.id, decision: 'allow', decidedBy: 'alperen', decidedAt: '2026-07-01T21:05:00.000Z' });
    await waiting;

    expect(b.sent[1]).toMatchObject({ kind: 'cross-decided', message: '[channel-a] ONAYLANDI' });
    localizedRelay.dispose();
  });
});

describe('ApprovalRelay — attachChannel', () => {
  it('rejects a duplicate channel name', () => {
    const a = makeFakeChannel();
    const aAgain = makeFakeChannel();
    relay.attachChannel('channel-a', a.channel);

    expect(() => relay.attachChannel('channel-a', aAgain.channel)).toThrow(ApprovalRelayError);
    try {
      relay.attachChannel('channel-a', aAgain.channel);
    } catch (err) {
      expect((err as ApprovalRelayError).code).toBe('APR_RELAY_DUPLICATE_CHANNEL');
    }
    expect(relay.channelNames).toEqual(['channel-a']);
  });

  it('detachChannel removes a channel and reports whether one existed', () => {
    const a = makeFakeChannel();
    relay.attachChannel('channel-a', a.channel);

    expect(relay.detachChannel('channel-a')).toBe(true);
    expect(relay.detachChannel('channel-a')).toBe(false);
    expect(relay.channelNames).toEqual([]);
  });
});

describe('ApprovalRelay — channel errors never kill the relay', () => {
  it('a channel whose send() throws does not block the other channel from being notified', () => {
    const badChannel: RelayChannel = {
      send: vi.fn(() => {
        throw new Error('boom: bad channel send');
      }),
      onDecision: vi.fn(),
    };
    const good = makeFakeChannel();
    relay.attachChannel('channel-bad', badChannel);
    relay.attachChannel('channel-good', good.channel);

    const errorListener = vi.fn();
    relay.on('channel-error', errorListener);

    expect(() => broker.submit(buildRequest('apr-relay-3'))).not.toThrow();

    expect(good.sent).toHaveLength(1);
    expect(good.sent[0]!.kind).toBe('pending');
    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'channel-bad', error: expect.any(Error) }),
    );
  });

  it('a channel whose send() rejects (async) is reported without an unhandled rejection', async () => {
    const badChannel: RelayChannel = {
      send: vi.fn(() => Promise.reject(new Error('boom: async bad channel'))),
      onDecision: vi.fn(),
    };
    relay.attachChannel('channel-bad-async', badChannel);

    const errorListener = vi.fn();
    relay.on('channel-error', errorListener);

    broker.submit(buildRequest('apr-relay-4'));
    // Let the rejected promise's .catch() microtask run.
    await Promise.resolve();
    await Promise.resolve();

    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'channel-bad-async', error: expect.any(Error) }),
    );
  });

  it('a losing decide() race (already-decided) is reported via channel-error, not thrown', () => {
    const a = makeFakeChannel();
    const b = makeFakeChannel();
    relay.attachChannel('channel-a', a.channel);
    relay.attachChannel('channel-b', b.channel);

    const req = broker.submit(buildRequest('apr-relay-5'));

    const errorListener = vi.fn();
    relay.on('channel-error', errorListener);

    a.decide({ requestId: req.id, decision: 'allow', decidedBy: 'alperen', decidedAt: '2026-07-01T21:05:00.000Z' });
    // channel-B tries to decide the SAME already-decided request — must not throw.
    expect(() =>
      b.decide({ requestId: req.id, decision: 'deny', decidedBy: 'someone-else', decidedAt: '2026-07-01T21:05:01.000Z' }),
    ).not.toThrow();

    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'channel-b', error: expect.any(Error) }),
    );
  });
});

describe('ApprovalRelay — dispose', () => {
  it('stops reacting to broker events after dispose()', () => {
    const a = makeFakeChannel();
    relay.attachChannel('channel-a', a.channel);

    relay.dispose();
    broker.submit(buildRequest('apr-relay-6'));

    expect(a.sent).toHaveLength(0);
  });
});
