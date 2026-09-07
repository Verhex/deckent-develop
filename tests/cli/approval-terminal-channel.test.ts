import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay } from '../../src/core/approval-relay.js';
import { ApprovalEventStream } from '../../src/core/approval-eventstream.js';
import { createApprovalTerminalChannel, type ApprovalTerminalEvent } from '../../src/cli/repl/approval-terminal-channel.js';
import type { ApprovalTerminalDecisionAdapter } from '../../src/cli/repl/approval-terminal-command.js';

function buildRequest(id: string): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'channel-worker' },
    summary: `approval ${id}`,
    details: {},
    scopeId: 'channel-scope',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'operator-a',
    createdAt: '2026-09-07T12:00:00.000Z',
    expiresAt: '2099-09-07T13:00:00.000Z',
  };
}

async function readOne(events: AsyncIterable<ApprovalTerminalEvent>): Promise<ApprovalTerminalEvent> {
  const result = await events[Symbol.asyncIterator]().next();
  if (result.done) throw new Error('event stream ended');
  return result.value;
}

let root: string;
let broker: ApprovalBroker;
let relay: ApprovalRelay;
let stream: ApprovalEventStream;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'approval-terminal-channel-'));
  broker = new ApprovalBroker(root, { storeDir: join(root, 'approvals') });
  relay = new ApprovalRelay(broker);
  stream = new ApprovalEventStream(relay);
});

afterEach(() => {
  stream.dispose();
  relay.dispose();
  rmSync(root, { recursive: true, force: true });
});

describe('ApprovalTerminalChannel authenticated boundary', () => {
  it('keeps the event-stream read path and tenant filter intact', async () => {
    const channel = createApprovalTerminalChannel(relay, stream, {
      filter: (notification) => notification.request.tenantId === 'tenant-a',
    });
    broker.submit(buildRequest('read-a'));
    expect(await readOne(channel.events)).toMatchObject({ kind: 'pending', request: { id: 'read-a' } });
    channel.dispose();
  });

  it('routes a card intent only through the injected adapter and never the raw relay writer', async () => {
    const req = broker.submit(buildRequest('decide-a'));
    const decide = vi.fn(async () => ({
      kind: 'accepted' as const,
      decision: {
        requestId: req.id, decision: 'allow' as const, decidedBy: req.userId,
        channel: 'local-terminal', decidedAt: '2026-09-07T12:01:00.000Z', reason: '',
      },
    }));
    const adapter = {
      decide,
      verifyCrossDecision: vi.fn(),
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };

    await expect(channel.decide(req, 'allow', suspend)).resolves.toMatchObject({ kind: 'accepted' });
    expect(decide).toHaveBeenCalledExactlyOnceWith(req, 'allow', suspend);
    expect(broker.getDecision(req.id)).toBeNull();
    channel.dispose();
  });

  it('returns typed HOLD for an absent adapter and for the obsolete raw call shape', async () => {
    const req = broker.submit(buildRequest('no-adapter'));
    const channel = createApprovalTerminalChannel(relay, stream);
    const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
    await expect(channel.decide(req, 'deny', suspend)).resolves.toEqual({
      kind: 'hold', reasonCode: 'authenticated-decision-adapter-unavailable',
    });
    await expect(channel.decide(req.id, {
      decision: 'allow', decidedBy: 'fake', channel: 'terminal', decidedAt: new Date().toISOString(), reason: '',
    })).resolves.toEqual({ kind: 'hold', reasonCode: 'authenticated-decision-adapter-required' });
    expect(broker.getDecision(req.id)).toBeNull();
    channel.dispose();
  });

  it('does not blindly retire a cross-channel decision that fails durable authorization', async () => {
    const adapter = {
      decide: vi.fn(),
      verifyCrossDecision: vi.fn(async () => ({ kind: 'untrusted' as const, reasonCode: 'integrity-failure' })),
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const req = broker.submit(buildRequest('cross-untrusted'));
    await readOne(channel.events);
    broker.decide(req.id, {
      decision: 'allow', decidedBy: 'forged', channel: 'dashboard', decidedAt: new Date().toISOString(), reason: '',
    });
    expect(await readOne(channel.events)).toMatchObject({
      kind: 'terminal-outcome', outcome: 'untrusted', reasonCode: 'integrity-failure', request: { id: req.id },
    });
    channel.dispose();
  });

  it('forwards a cross-channel retirement only after exact verification', async () => {
    const adapter = {
      decide: vi.fn(),
      verifyCrossDecision: vi.fn(async (_request, decision) => ({ kind: 'trusted' as const, decision })),
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const req = broker.submit(buildRequest('cross-trusted'));
    await readOne(channel.events);
    broker.decide(req.id, {
      decision: 'deny', decidedBy: 'operator-a', channel: 'local-terminal', decidedAt: new Date().toISOString(), reason: '',
    });
    expect(await readOne(channel.events)).toMatchObject({
      kind: 'cross-decided', decision: { decision: 'deny' }, request: { id: req.id },
    });
    channel.dispose();
  });

  it('reconciles an independently verified durable winner while the local intent returns HOLD', async () => {
    const req = broker.submit(buildRequest('cross-inflight-hold'));
    let finish!: (result: Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>) => void;
    const local = new Promise<Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>>((resolve) => { finish = resolve; });
    const verifyCrossDecision = vi.fn(async (_request, durable) => ({ kind: 'trusted' as const, decision: durable }));
    const adapter = {
      decide: vi.fn(() => local),
      verifyCrossDecision,
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
    await readOne(channel.events);

    const localOutcome = channel.decide(req, 'allow', suspend);
    const durable = broker.decide(req.id, {
      decision: 'deny', decidedBy: 'operator-a', channel: 'local-terminal', decidedAt: '2026-09-07T12:01:00.000Z', reason: '',
    });
    const cross = readOne(channel.events);
    finish({
      kind: 'hold',
      reasonCode: 'child-exit:1',
      observedDecision: {
        action: durable.decision,
        channel: durable.channel,
        decidedBy: durable.decidedBy,
        decidedAt: durable.decidedAt,
      },
    });

    await expect(localOutcome).resolves.toMatchObject({ kind: 'hold', reasonCode: 'child-exit:1' });
    await expect(cross).resolves.toMatchObject({
      kind: 'cross-decided',
      request: { id: req.id },
      decision: { decision: 'deny' },
    });
    expect(verifyCrossDecision).toHaveBeenCalledExactlyOnceWith(req, durable);
    channel.dispose();
  });

  it('keeps an in-flight conflict untrusted when independent verification rejects it', async () => {
    const req = broker.submit(buildRequest('cross-inflight-untrusted'));
    let finish!: (result: Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>) => void;
    const local = new Promise<Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>>((resolve) => { finish = resolve; });
    const adapter = {
      decide: vi.fn(() => local),
      verifyCrossDecision: vi.fn(async () => ({ kind: 'untrusted' as const, reasonCode: 'integrity-failure' })),
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
    await readOne(channel.events);

    const localOutcome = channel.decide(req, 'allow', suspend);
    broker.decide(req.id, {
      decision: 'deny', decidedBy: 'forged', channel: 'local-terminal', decidedAt: '2026-09-07T12:01:00.000Z', reason: '',
    });
    const cross = readOne(channel.events);
    finish({ kind: 'hold', reasonCode: 'child-exit:1' });

    await expect(localOutcome).resolves.toMatchObject({ kind: 'hold' });
    await expect(cross).resolves.toMatchObject({
      kind: 'terminal-outcome',
      outcome: 'untrusted',
      reasonCode: 'integrity-failure',
      request: { id: req.id },
    });
    channel.dispose();
  });

  it('suppresses only the matching accepted race and forwards an accepted mismatch for verification', async () => {
    const matching = broker.submit(buildRequest('cross-inflight-accepted'));
    let finishMatching!: (result: Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>) => void;
    const matchingLocal = new Promise<Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>>((resolve) => { finishMatching = resolve; });
    const verifyCrossDecision = vi.fn(async (_request, durable) => ({ kind: 'trusted' as const, decision: durable }));
    const adapter = {
      decide: vi.fn(() => matchingLocal),
      verifyCrossDecision,
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
    await readOne(channel.events);

    const matchingOutcome = channel.decide(matching, 'allow', suspend);
    const matchingDecision = broker.decide(matching.id, {
      decision: 'allow', decidedBy: 'operator-a', channel: 'local-terminal', decidedAt: '2026-09-07T12:01:00.000Z', reason: '',
    });
    const afterSuppressed = readOne(channel.events);
    finishMatching({ kind: 'accepted', decision: matchingDecision });
    await expect(matchingOutcome).resolves.toMatchObject({ kind: 'accepted' });
    const sentinel = broker.submit(buildRequest('cross-after-suppressed'));
    await expect(afterSuppressed).resolves.toMatchObject({ kind: 'pending', request: { id: sentinel.id } });
    expect(verifyCrossDecision).not.toHaveBeenCalled();

    const mismatch = broker.submit(buildRequest('cross-inflight-mismatch'));
    await readOne(channel.events);
    let finishMismatch!: (result: Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>) => void;
    const mismatchLocal = new Promise<Awaited<ReturnType<ApprovalTerminalDecisionAdapter['decide']>>>((resolve) => { finishMismatch = resolve; });
    adapter.decide.mockReturnValueOnce(mismatchLocal);
    const mismatchOutcome = channel.decide(mismatch, 'allow', suspend);
    const durableDeny = broker.decide(mismatch.id, {
      decision: 'deny', decidedBy: 'operator-a', channel: 'local-terminal', decidedAt: '2026-09-07T12:02:00.000Z', reason: '',
    });
    const forwarded = readOne(channel.events);
    finishMismatch({
      kind: 'accepted',
      decision: { ...durableDeny, decision: 'allow' },
    });
    await expect(mismatchOutcome).resolves.toMatchObject({ kind: 'accepted' });
    await expect(forwarded).resolves.toMatchObject({
      kind: 'cross-decided',
      decision: { decision: 'deny' },
    });
    expect(verifyCrossDecision).toHaveBeenCalledExactlyOnceWith(mismatch, durableDeny);
    channel.dispose();
  });

  it('deduplicates a concurrent intent and fails closed after dispose', async () => {
    const req = broker.submit(buildRequest('dedup-a'));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const adapter = {
      decide: vi.fn(async () => {
        await pending;
        return {
          kind: 'accepted' as const,
          decision: {
            requestId: req.id, decision: 'allow' as const, decidedBy: req.userId,
            channel: 'local-terminal', decidedAt: '2026-09-07T12:01:00.000Z', reason: '',
          },
        };
      }),
      verifyCrossDecision: vi.fn(),
    } as unknown as ApprovalTerminalDecisionAdapter;
    const channel = createApprovalTerminalChannel(relay, stream, { decisionAdapter: adapter });
    const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
    const first = channel.decide(req, 'allow', suspend);
    const duplicate = channel.decide(req, 'allow', suspend);
    expect(adapter.decide).toHaveBeenCalledTimes(1);
    finish();
    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2);
    channel.dispose();
    await expect(channel.decide(req, 'allow', suspend)).resolves.toEqual({
      kind: 'hold', reasonCode: 'terminal-channel-disposed',
    });
  });
});
