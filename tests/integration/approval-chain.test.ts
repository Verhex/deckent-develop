// ─── Approval chain E2E integration (APR-E2E-INT, task 356-010) ─────────────
// Walks the full runtime-wide approval chain with every module REAL (only the
// notification channels are fakes, IO is a hermetic tmpdir): contract ->
// rules-load -> policy -> broker.submit -> relay -> eventstream -> (fake
// channel decide) -> broker resume -> store transition (alt settlement path)
// -> expiry-driver sweep. Three invariants are each tested in their own
// dedicated block: raw payload never serialized, risk:critical never
// auto-approves, and the store recovers full state after a simulated restart.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApprovalBroker, ApprovalBrokerError } from '../../src/core/approval-broker.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import { ApprovalStore } from '../../src/core/approval-store.js';
import { ApprovalRelay, type ChannelDecisionInput, type RelayChannel, type RelayNotification } from '../../src/core/approval-relay.js';
import { ApprovalEventStream, type ApprovalStreamEvent } from '../../src/core/approval-eventstream.js';
import { ApprovalExpiryDriver } from '../../src/core/approval-expiry-driver.js';
import { loadApprovalRules } from '../../src/core/approval-rules-load.js';
import { decidePolicy } from '../../src/core/approval-policy.js';

const CREATED_AT = '2099-07-01T21:00:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id,
    version: '1.0',
    requester: { role: 'worker', instanceId: 'w-356-010' },
    summary: `approval request ${id}`,
    details: { note: 'e2e' },
    scopeId: 'sprint-356',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: '2099-07-01T21:30:00.000Z',
    maskedArgs: { cmd: '***REDACTED***' },
    rawArgsRef: null,
    ...overrides,
  };
}

/** Fake channel — records every notification and exposes a `decide()` test
 *  helper that invokes whatever handler the relay registered via `onDecision`,
 *  simulating a user resolving the approval on this surface. */
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

async function nextEvent(iter: AsyncIterator<ApprovalStreamEvent>): Promise<ApprovalStreamEvent> {
  const result = await iter.next();
  if (result.done) throw new Error('event stream ended unexpectedly');
  return result.value;
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;
let store: ApprovalStore;
let relay: ApprovalRelay;
let eventstream: ApprovalEventStream;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-chain-e2e-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir });
  store = new ApprovalStore(projectRoot, { storeDir });
  relay = new ApprovalRelay(broker);
  eventstream = new ApprovalEventStream(relay);
});

afterEach(() => {
  eventstream.dispose();
  relay.dispose();
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('Approval chain E2E — contract -> rules-load -> policy -> broker -> relay -> eventstream -> store -> expiry-driver', () => {
  it('resolves one request via channel-decide, one via store.transition, and one via TTL sweep', async () => {
    const config = {
      approval: {
        rules: [{ match: { scope: 'shell-exec', risk: 'high' }, action: 'require-approval', timeoutMs: 900_000 }],
      },
    };
    const { rules, warnings } = loadApprovalRules(config);
    expect(warnings).toEqual([]);

    const channelA = makeFakeChannel();
    const channelB = makeFakeChannel();
    relay.attachChannel('channel-a', channelA.channel);
    relay.attachChannel('channel-b', channelB.channel);
    const sub = eventstream.subscribe('client-1');
    const iter = sub.events[Symbol.asyncIterator]();

    // ── request A: channel-decide path ──────────────────────────────────
    const draftA = buildRequest('apr-e2e-channel');
    const policyA = decidePolicy(draftA, rules);
    expect(policyA.policy).toBe('require-approval');

    const submittedA = broker.submit({ ...draftA, policy: policyA.policy });
    expect(submittedA.policy).toBe('require-approval');

    expect(channelA.sent).toHaveLength(1);
    expect(channelA.sent[0]).toMatchObject({ kind: 'pending', request: submittedA });
    expect(channelB.sent).toHaveLength(1);

    expect(await nextEvent(iter)).toMatchObject({ kind: 'pending', request: submittedA });

    const waitingA = broker.awaitDecision(submittedA.id);
    channelA.decide({
      requestId: submittedA.id,
      decision: 'allow',
      decidedBy: 'alperen',
      decidedAt: '2099-07-01T21:05:00.000Z',
    });
    const decisionA = await waitingA;
    expect(decisionA).toMatchObject({ decision: 'allow', channel: 'channel-a' });

    // channel-a only ever saw its own pending notification, never a cross-broadcast of its own decision.
    expect(channelA.sent).toHaveLength(1);
    // channel-b (did not decide) receives the cross-broadcast.
    expect(channelB.sent).toHaveLength(2);
    expect(channelB.sent[1]).toMatchObject({ kind: 'cross-decided', decision: decisionA });
    expect(await nextEvent(iter)).toMatchObject({ kind: 'cross-decided', decision: decisionA });

    store.index(new Date('2099-07-01T21:05:00.000Z'));
    expect(store.load().approved.map((e) => e.request.id)).toEqual([submittedA.id]);

    // ── request B: no rule matches -> safe-side fallback, resolved via an
    // alternate settlement path (store.transition, e.g. a dashboard writer) ──
    const draftB = buildRequest('apr-e2e-store-transition', {
      risk: 'medium',
      scope: 'file-write',
      defaultAction: 'escalate',
    });
    const policyB = decidePolicy(draftB, rules);
    expect(policyB.policy).toBe('notify');

    const submittedB = broker.submit({ ...draftB, policy: policyB.policy });
    expect(await nextEvent(iter)).toMatchObject({ kind: 'pending', request: submittedB });

    // Re-sync the store's in-memory index so it knows about B before transitioning it —
    // the store only ever sees what its own index()/constructor scan discovered.
    store.index(new Date('2099-07-01T21:05:30.000Z'));
    const decisionB = store.transition(submittedB.id, 'denied', {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'dashboard',
      decidedAt: '2099-07-01T21:06:00.000Z',
    });

    // The broker only learns of a store-written decision via its poll seam —
    // this is what turns a foreign write into the SAME 'decided' event/cross-broadcast.
    expect(broker.checkForExternalDecisions()).toEqual([decisionB]);
    expect(await nextEvent(iter)).toMatchObject({ kind: 'cross-decided', decision: decisionB });
    expect(store.load().denied.map((e) => e.request.id)).toEqual([submittedB.id]);

    // ── request C: overdue at submit time relative to the driver's clock ->
    // swept by the expiry-driver's TTL sweep ──────────────────────────────
    const draftC = buildRequest('apr-e2e-ttl', {
      risk: 'low',
      scope: 'file-read',
      defaultAction: 'deny',
      expiresAt: '2099-07-01T21:02:00.000Z',
    });
    const policyC = decidePolicy(draftC, rules);
    const submittedC = broker.submit({ ...draftC, policy: policyC.policy });
    expect(await nextEvent(iter)).toMatchObject({ kind: 'pending', request: submittedC });

    const driver = new ApprovalExpiryDriver({
      broker,
      store,
      clock: () => new Date('2099-07-01T22:00:00.000Z'),
    });
    driver.tick();

    const ttlEvent = await nextEvent(iter);
    expect(ttlEvent.kind).toBe('cross-decided');
    expect((ttlEvent as { decision: { channel: string } }).decision.channel).toBe('ttl-expire');

    const finalSnapshot = store.load();
    expect(finalSnapshot.approved.map((e) => e.request.id)).toEqual([submittedA.id]);
    expect(finalSnapshot.denied.map((e) => e.request.id)).toEqual([submittedB.id]);
    expect(finalSnapshot.expired.map((e) => e.request.id)).toEqual([submittedC.id]);

    sub.unsubscribe();
  });
});

describe('Invariant — raw payload is never serialized', () => {
  it('the .strict() contract schema rejects an unknown "rawArgs" key outright', () => {
    const draft = buildRequest('apr-inv-raw-1');
    const withForbiddenKey = { ...draft, rawArgs: 'THIS-MUST-NEVER-BE-ACCEPTED' };

    expect(() => broker.submit(withForbiddenKey)).toThrow(ApprovalBrokerError);
    try {
      broker.submit(withForbiddenKey);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalBrokerError);
      expect((err as ApprovalBrokerError).code).toBe('APR_INVALID_REQUEST');
    }
  });

  it('only maskedArgs + an opaque rawArgsRef pointer ever reach disk or a channel — never a raw value', () => {
    const RAW_SECRET = 'super-secret-should-never-leak-anywhere';
    const draft = buildRequest('apr-inv-raw-2', {
      maskedArgs: { cmd: '***REDACTED***' },
      rawArgsRef: 'raw-blob://out-of-band-pointer-1',
    });

    const channel = makeFakeChannel();
    relay.attachChannel('audit-channel', channel.channel);

    const submitted = broker.submit(draft);
    broker.decide(submitted.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'audit-channel',
      decidedAt: '2099-07-01T21:05:00.000Z',
    });

    const requestOnDisk = readFileSync(join(storeDir, `${submitted.id}.request.json`), 'utf-8');
    const decisionOnDisk = readFileSync(join(storeDir, `${submitted.id}.decision.json`), 'utf-8');

    for (const raw of [requestOnDisk, decisionOnDisk]) {
      expect(raw).not.toContain(RAW_SECRET);
      expect(Object.keys(JSON.parse(raw) as Record<string, unknown>)).not.toContain('rawArgs');
    }
    expect((JSON.parse(requestOnDisk) as { rawArgsRef: string }).rawArgsRef).toBe('raw-blob://out-of-band-pointer-1');

    expect(channel.sent.length).toBeGreaterThan(0);
    for (const notification of channel.sent) {
      expect(JSON.stringify(notification)).not.toContain(RAW_SECRET);
      expect(Object.keys(notification.request)).not.toContain('rawArgs');
    }
  });
});

describe('Invariant — risk:critical can never resolve to policy:auto-approve', () => {
  it('decidePolicy clamps to deny even when a misconfigured rule explicitly says auto-approve', () => {
    const misconfigured = {
      approval: { rules: [{ match: { risk: 'critical' }, action: 'auto-approve' }] },
    };
    const { rules } = loadApprovalRules(misconfigured);
    // The loader is shape-only — it does NOT second-guess a semantically unsafe
    // rule; only decidePolicy enforces the safety clamp.
    expect(rules).toEqual([{ match: { risk: 'critical' }, action: 'auto-approve' }]);

    const critical = buildRequest('apr-inv-critical-1', { risk: 'critical', defaultAction: 'deny' });
    const result = decidePolicy(critical, rules);
    expect(result.policy).toBe('deny');
    expect(result.reason).toContain('clamped');
  });

  it('decidePolicy clamps to deny on the no-rule-matched fallback too, even with a permissive defaultAction', () => {
    const critical = buildRequest('apr-inv-critical-2', { risk: 'critical', defaultAction: 'allow' });
    const result = decidePolicy(critical, []);
    expect(result.policy).toBe('deny');
    expect(result.reason).toContain('clamped');
  });

  it('end-to-end: a critical request never lands in the approved bucket, even after a TTL sweep with a safe defaultAction', () => {
    const misconfigured = {
      approval: { rules: [{ match: { risk: 'critical' }, action: 'auto-approve' }] },
    };
    const { rules } = loadApprovalRules(misconfigured);

    const draft = buildRequest('apr-inv-critical-3', {
      risk: 'critical',
      defaultAction: 'deny',
      expiresAt: '2099-07-01T21:02:00.000Z',
    });
    const policyResult = decidePolicy(draft, rules);
    expect(policyResult.policy).toBe('deny');

    const submitted = broker.submit({ ...draft, policy: policyResult.policy });
    expect(submitted.policy).toBe('deny');

    const driver = new ApprovalExpiryDriver({ broker, store, clock: () => new Date('2099-07-01T22:00:00.000Z') });
    driver.tick();

    const snapshot = store.load();
    expect(snapshot.approved.map((e) => e.request.id)).not.toContain(submitted.id);
    expect(snapshot.expired.map((e) => e.request.id)).toContain(submitted.id);
    expect(snapshot.expired.find((e) => e.request.id === submitted.id)?.decision?.decision).toBe('deny');
  });
});

describe('Invariant — restart-survive: a brand-new store instance recovers full state from disk', () => {
  it('recovers pending/approved/denied/expired categorization with zero shared in-memory state', () => {
    const pending = broker.submit(buildRequest('apr-inv-restart-pending', { expiresAt: '2099-07-01T22:00:00.000Z' }));

    const approved = broker.submit(buildRequest('apr-inv-restart-approved'));
    broker.decide(approved.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: '2099-07-01T21:05:00.000Z' });

    const denied = broker.submit(buildRequest('apr-inv-restart-denied'));
    broker.decide(denied.id, { decision: 'deny', decidedBy: 'a', channel: 'cli', decidedAt: '2099-07-01T21:05:00.000Z' });

    broker.submit(buildRequest('apr-inv-restart-ttl', { defaultAction: 'deny', expiresAt: '2099-07-01T21:02:00.000Z' }));
    broker.expire(new Date('2099-07-01T21:20:00.000Z'));

    // "Restart" = throw away every in-memory reference (broker, relay, eventstream,
    // the ORIGINAL store instance) and construct a brand-new store on the same
    // on-disk storeDir — simulating a fresh process with zero carried-over state.
    const restartedStore = new ApprovalStore(projectRoot, { storeDir });
    // The constructor's own initial index() has no `now` override (real wall
    // clock) — re-index with the timeline's fixed `now` for deterministic,
    // hermetic categorization, matching the pending/expired boundary above.
    restartedStore.index(new Date('2099-07-01T21:25:00.000Z'));
    const snapshot = restartedStore.load();

    expect(snapshot.pending.map((e) => e.request.id)).toEqual([pending.id]);
    expect(snapshot.approved.map((e) => e.request.id)).toEqual([approved.id]);
    expect(snapshot.denied.map((e) => e.request.id)).toEqual([denied.id]);
    expect(snapshot.expired.map((e) => e.request.id)).toEqual(['apr-inv-restart-ttl']);

    // A pure, stateless one-shot scan agrees with the live re-indexed instance.
    const staticSnapshot = ApprovalStore.load(storeDir, new Date('2099-07-01T21:25:00.000Z'));
    expect(staticSnapshot.expired.map((e) => e.request.id)).toEqual(['apr-inv-restart-ttl']);

    // The broker also hydrates validated canonical request/decision state so
    // a fresh process cannot forget a winner or strand an existing waiter.
    const restartedBroker = new ApprovalBroker(projectRoot, { storeDir });
    expect(restartedBroker.list('all').map((request) => request.id).sort()).toEqual([
      approved.id,
      denied.id,
      pending.id,
      'apr-inv-restart-ttl',
    ].sort());
    expect(restartedBroker.list('decided').map((request) => request.id).sort()).toEqual([
      approved.id,
      denied.id,
      'apr-inv-restart-ttl',
    ].sort());
  });
});
