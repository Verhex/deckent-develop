// ─── ApprovalTerminalChannel tests (APR-TERM-CHANNEL, task 355-004) ─────────
// Fake end-to-end chain proving the bridge's read path (relay-pending ->
// eventstream-publish -> bridge.events, the seam ApprovalCard's own ingest loop
// would consume) and write path (bridge.decide -> the relay's registered
// 'terminal' onDecision handler -> broker.decide -> cross-broadcast to every
// OTHER attached channel, including this bridge's own eventstream subscription
// via the separate 'event-stream' channel ApprovalEventStream itself owns).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { ApprovalEventStream, type ApprovalStreamEvent } from '../../src/core/approval-eventstream.js';
import { createApprovalTerminalChannel } from '../../src/cli/repl/approval-terminal-channel.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-355-004' },
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
    maskedArgs: { cmd: '***REDACTED***' },
    ...overrides,
  };
}

/** Fake channel: records every notification it receives and exposes a `decide()`
 *  test helper invoking whatever handler the relay registered via `onDecision` —
 *  mirrors tests/core/approval-relay.test.ts's helper. */
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

/** Drain exactly one event from an AsyncIterable's iterator. */
async function readOne(events: AsyncIterable<ApprovalStreamEvent>): Promise<ApprovalStreamEvent> {
  const iter = events[Symbol.asyncIterator]();
  const result = await iter.next();
  if (result.done) throw new Error('expected an event, got done:true');
  return result.value;
}

let projectRoot: string;
let broker: ApprovalBroker;
let relay: ApprovalRelay;
let eventStream: ApprovalEventStream;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-terminal-channel-'));
  broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
  relay = new ApprovalRelay(broker);
  eventStream = new ApprovalEventStream(relay);
});

afterEach(() => {
  eventStream.dispose();
  relay.dispose();
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('createApprovalTerminalChannel — read path (relay-pending -> eventstream-publish -> bridge.events)', () => {
  it('bridge.events yields the pending notification exactly like a raw eventstream subscriber would', async () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('term-1'));

    const event = await readOne(bridge.events);
    expect(event).toMatchObject({ kind: 'pending', request: req });

    bridge.dispose();
  });

  it('late-join backfill: subscribing after a request is already pending still delivers it', async () => {
    const req = broker.submit(buildRequest('term-backfill'));
    const bridge = createApprovalTerminalChannel(relay, eventStream);

    const event = await readOne(bridge.events);
    expect(event).toMatchObject({ kind: 'pending', request: req });

    bridge.dispose();
  });
});

describe('createApprovalTerminalChannel — write path (bridge.decide -> relay.onDecision -> broker -> cross-broadcast)', () => {
  it('routes a decision through the relay under the "terminal" channel name, ignoring any input.channel', async () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('term-2'));
    await readOne(bridge.events); // drain the pending event

    const waiting = broker.awaitDecision(req.id);
    bridge.decide(req.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'bogus-should-be-ignored',
      decidedAt: '2026-07-01T21:05:00.000Z',
      reason: '',
    });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('terminal');

    bridge.dispose();
  });

  it('cross-broadcasts the decision to every OTHER attached channel', () => {
    const other = makeFakeChannel();
    relay.attachChannel('dashboard', other.channel);

    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('term-3'));

    bridge.decide(req.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'irrelevant',
      decidedAt: '2026-07-01T21:05:00.000Z',
      reason: 'no',
    });

    expect(other.sent).toHaveLength(2); // pending, then cross-decided
    const crossBroadcast = other.sent[1]!;
    expect(crossBroadcast).toMatchObject({
      kind: 'cross-decided',
      request: req,
      decision: { channel: 'terminal', decision: 'deny' },
    });

    bridge.dispose();
  });

  it("the bridge's own eventstream subscription also observes the cross-decided notification (fanned via the separate event-stream channel)", async () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('term-4'));
    await readOne(bridge.events); // pending

    bridge.decide(req.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-01T21:05:00.000Z',
      reason: '',
    });

    const crossEvent = await readOne(bridge.events);
    expect(crossEvent).toMatchObject({ kind: 'cross-decided', request: req });

    bridge.dispose();
  });
});

describe('createApprovalTerminalChannel — channel naming + dispose', () => {
  it('rejects a duplicate channelName exactly like a raw attachChannel call would, without leaking a subscription', () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream, { channelName: 'terminal-dup' });

    expect(() => createApprovalTerminalChannel(relay, eventStream, { channelName: 'terminal-dup' })).toThrow(
      ApprovalRelayError,
    );
    // The failed attempt attached nothing and subscribed nothing — only the first
    // bridge's client id is present.
    expect(eventStream.clientIds).toEqual(['terminal-dup']);

    bridge.dispose();
  });

  it('dispose() unsubscribes the eventstream client and detaches the relay channel', async () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream);
    expect(relay.channelNames).toContain('terminal');

    bridge.dispose();
    expect(relay.channelNames).not.toContain('terminal');

    const iter = bridge.events[Symbol.asyncIterator]();
    broker.submit(buildRequest('term-5'));
    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it('supports independent instances via channelName overrides (multi-instance scenario)', async () => {
    const bridgeA = createApprovalTerminalChannel(relay, eventStream, { channelName: 'terminal-a' });
    const bridgeB = createApprovalTerminalChannel(relay, eventStream, { channelName: 'terminal-b' });

    const req = broker.submit(buildRequest('term-6'));
    expect(await readOne(bridgeA.events)).toMatchObject({ kind: 'pending', request: req });
    expect(await readOne(bridgeB.events)).toMatchObject({ kind: 'pending', request: req });

    bridgeA.dispose();
    bridgeB.dispose();
  });
});
