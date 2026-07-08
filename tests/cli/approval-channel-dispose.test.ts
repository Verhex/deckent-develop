// ─── ApprovalTerminalChannel — dispose() handler-leak regression (task 387-017) ─
// born-534: dispose() previously left the module-local `decisionHandler` closure
// pointing at the relay's registered handler even after `relay.detachChannel()`
// removed the channel from the relay's own map — a dangling-handler leak, since
// the closure still called back into `ApprovalRelay#handleChannelDecision` (which
// still invokes `broker.decide()`) with no way to observe the channel was gone.
// This file proves: (1) dispose() nulls the handler so a post-dispose decide()
// is a silent no-op, and (2) that no-op is real — the broker never sees the
// decision (no throw, no state mutation, no cross-broadcast to other channels).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay, type RelayChannel, type RelayNotification } from '../../src/core/approval-relay.js';
import { ApprovalEventStream } from '../../src/core/approval-eventstream.js';
import { createApprovalTerminalChannel } from '../../src/cli/repl/approval-terminal-channel.js';

const CREATED_AT = '2026-07-08T21:00:00.000Z';
const EXPIRES_AT = '2026-07-08T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-387-017' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-387',
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

/** Fake channel: records every notification it receives — used to prove a
 *  post-dispose decide() never reaches cross-broadcast (i.e. never reached
 *  the broker at all). */
function makeFakeChannel() {
  const sent: RelayNotification[] = [];
  const channel: RelayChannel = {
    send(notification) {
      sent.push(notification);
    },
    onDecision() {
      // Not exercised by this suite — a passive observer channel only.
    },
  };
  return { channel, sent };
}

let projectRoot: string;
let broker: ApprovalBroker;
let relay: ApprovalRelay;
let eventStream: ApprovalEventStream;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-channel-dispose-'));
  broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
  relay = new ApprovalRelay(broker);
  eventStream = new ApprovalEventStream(relay);
});

afterEach(() => {
  eventStream.dispose();
  relay.dispose();
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('createApprovalTerminalChannel — dispose() nulls decisionHandler (born-534)', () => {
  it('decide() after dispose() is a no-op: the broker never observes the decision', async () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('dispose-1'));

    bridge.dispose();

    // No throw — decide() on a disposed bridge degrades silently rather than
    // crashing a late/racing caller.
    expect(() =>
      bridge.decide(req.id, {
        decision: 'allow',
        decidedBy: 'alperen',
        channel: 'terminal',
        decidedAt: '2026-07-08T21:05:00.000Z',
        reason: '',
      }),
    ).not.toThrow();

    // The request is still pending — the post-dispose decide() never reached
    // broker.decide() through the (now-dangling) handler closure.
    expect(broker.list('pending').map((r) => r.id)).toContain(req.id);
  });

  it('decide() after dispose() never cross-broadcasts to other attached channels', () => {
    const other = makeFakeChannel();
    relay.attachChannel('dashboard', other.channel);

    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('dispose-2'));
    const sentBeforeDispose = other.sent.length; // 1: the fan-out 'pending' notification

    bridge.dispose();
    bridge.decide(req.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-08T21:05:00.000Z',
      reason: 'no',
    });

    // No new notification landed on the still-attached 'dashboard' channel —
    // proof the decision never reached the broker's 'decided' event at all.
    expect(other.sent.length).toBe(sentBeforeDispose);
  });

  it('repeated dispose() calls stay idempotent no-ops (decisionHandler already null)', () => {
    const bridge = createApprovalTerminalChannel(relay, eventStream);
    const req = broker.submit(buildRequest('dispose-3'));

    bridge.dispose();
    expect(() => bridge.dispose()).not.toThrow();

    expect(() =>
      bridge.decide(req.id, {
        decision: 'allow',
        decidedBy: 'alperen',
        channel: 'terminal',
        decidedAt: '2026-07-08T21:05:00.000Z',
        reason: '',
      }),
    ).not.toThrow();
    expect(broker.list('pending').map((r) => r.id)).toContain(req.id);
  });

  it('a fresh bridge on a new channelName after the first is disposed still decides correctly (handler swap is clean)', async () => {
    const bridgeA = createApprovalTerminalChannel(relay, eventStream, { channelName: 'terminal-a' });
    bridgeA.dispose();

    const bridgeB = createApprovalTerminalChannel(relay, eventStream, { channelName: 'terminal-b' });
    const req = broker.submit(buildRequest('dispose-4'));

    const waiting = broker.awaitDecision(req.id);
    bridgeB.decide(req.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'irrelevant',
      decidedAt: '2026-07-08T21:05:00.000Z',
      reason: '',
    });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('terminal-b');

    bridgeB.dispose();
  });
});
