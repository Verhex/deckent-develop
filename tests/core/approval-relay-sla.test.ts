import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import {
  ApprovalRelay,
  ApprovalRelayError,
  type ChannelDecisionInput,
  type RelayChannel,
  type RelayNotification,
} from '../../src/core/approval-relay.js';
import type { ApprovalNotifyDedup } from '../../src/core/approval-notify-dedup.js';
import type { ApprovalSlaEvidence } from '../../src/core/approval-sla.js';

let projectRoot: string;

beforeEach(() => { projectRoot = mkdtempSync(join(tmpdir(), 'deckent-approval-relay-sla-')); });
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

function request(id: string, expiresAt = '2026-08-21T13:00:00.000Z'): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'worker-1' },
    summary: 'masked approval', details: {}, scopeId: 'scope-1', scope: 'shell-exec',
    risk: 'high', policy: 'require-approval', defaultAction: 'deny', tenantId: 'tenant-1',
    userId: 'user-1', createdAt: '2026-08-21T12:00:00.000Z', expiresAt,
    maskedArgs: {},
  };
}

function fakeChannel() {
  const sent: RelayNotification[] = [];
  let decide: ((input: ChannelDecisionInput) => void) | undefined;
  const channel: RelayChannel = {
    send: (notification) => { sent.push(notification); },
    onDecision: (handler) => { decide = handler; },
  };
  return { channel, sent, decide: (input: ChannelDecisionInput) => decide?.(input) };
}

function slaEvent(requestId: string): ApprovalSlaEvidence {
  return {
    eventId: 'approval-sla:' + 'a'.repeat(64), requestId, lifecycleGeneration: 'generation-1',
    stage: 'renotify', ordinal: 1, kind: 'due',
    dueAt: '2026-08-21T12:02:00.000Z', observedAt: '2026-08-21T12:02:01.000Z',
    authoredPolicyDigest: 'b'.repeat(64), appliedPolicyDigest: 'c'.repeat(64),
  };
}

describe('approval relay SLA route and late-decision guard', () => {
  it('routes a stable SLA event once across restart-aware dedup state', async () => {
    const notified = new Set<string>();
    const dedup = {
      wasNotified: (id: string) => notified.has(id),
      markNotified: (id: string) => { notified.add(id); },
      clear: (ids: string[]) => { ids.forEach((id) => notified.delete(id)); },
    } as ApprovalNotifyDedup;
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    const relay = new ApprovalRelay(broker, dedup, undefined, () => new Date('2026-08-21T12:10:00.000Z'));
    const client = fakeChannel();
    relay.attachChannel('terminal', client.channel);
    const created = broker.submit(request('approval-1'));
    client.sent.splice(0);

    await relay.dispatchLifecycleStage(created, slaEvent(created.id));
    await relay.dispatchLifecycleStage(created, slaEvent(created.id));

    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]).toMatchObject({ kind: 'lifecycle-stage', evidence: { stage: 'renotify' } });
  });

  it('rejects an expired channel decision through the shared broker guard', () => {
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    const relay = new ApprovalRelay(broker, undefined, undefined, () => new Date('2026-08-21T13:00:00.000Z'));
    const client = fakeChannel();
    relay.attachChannel('terminal', client.channel);
    const errors = vi.fn();
    relay.on('channel-error', errors);
    const created = broker.submit(request('approval-expired'));

    client.decide({
      requestId: created.id, decision: 'allow', decidedBy: 'user-1',
      decidedAt: '2026-08-21T13:00:00.000Z',
    });

    expect(broker.getDecision(created.id)).toMatchObject({
      channel: 'ttl-expire', decidedBy: 'system:expiry', closureReason: 'expired',
    });
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'terminal',
      error: expect.objectContaining<Partial<ApprovalRelayError>>({ code: 'APR_RELAY_LATE_DECISION' }),
    }));
  });

  it('rejects SLA evidence bound to another request', async () => {
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    const relay = new ApprovalRelay(broker);
    const created = broker.submit(request('approval-a'));
    await expect(relay.dispatchLifecycleStage(created, slaEvent('approval-b')))
      .rejects.toThrowError(expect.objectContaining<Partial<ApprovalRelayError>>({ code: 'APR_RELAY_LATE_DECISION' }));
  });
});
