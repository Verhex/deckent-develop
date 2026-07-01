// ─── ApprovalEventStream tests (APR-EVENTSTREAM, task 353-006) ──────────────
// Multi-client publish stream built on top of ApprovalRelay's public
// attachChannel/detachChannel surface (never relay internals): per-client
// filtering, late-join pending-backfill, bounded drop-oldest backpressure
// with a coalesced marker, and leak-free unsubscribe (including an early
// `for await` break, which Node routes through the iterator's `return()`).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay } from '../../src/core/approval-relay.js';
import {
  ApprovalEventStream,
  ApprovalEventStreamError,
  type ApprovalStreamEvent,
} from '../../src/core/approval-eventstream.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-353-006' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-353',
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

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-eventstream-'));
  broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
  relay = new ApprovalRelay(broker);
});

afterEach(() => {
  relay.dispose();
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('ApprovalEventStream — per-client filters', () => {
  it('two clients with different filters each see only their own matching notifications', async () => {
    const stream = new ApprovalEventStream(relay);
    const subA = stream.subscribe('client-a', (n) => n.request.scope === 'shell-exec');
    const subB = stream.subscribe('client-b', (n) => n.request.scope === 'file-write');

    const reqShell = broker.submit(buildRequest('es-1', { scope: 'shell-exec' }));
    const reqFile = broker.submit(buildRequest('es-2', { scope: 'file-write' }));

    const eventA1 = await readOne(subA.events);
    expect(eventA1).toMatchObject({ kind: 'pending', request: reqShell });

    const eventB1 = await readOne(subB.events);
    expect(eventB1).toMatchObject({ kind: 'pending', request: reqFile });

    // Direct broker.decide (bypassing the relay's own channels entirely) still
    // reaches this stream's channel — it never decides anything itself, so it
    // is never excluded from a cross-broadcast.
    broker.decide(reqShell.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'test-direct',
      decidedAt: '2026-07-01T21:05:00.000Z',
    });

    const eventA2 = await readOne(subA.events);
    expect(eventA2).toMatchObject({ kind: 'cross-decided', request: reqShell });

    // client-b's filter never matches a shell-exec request — it must not have
    // received the cross-decided notification for reqShell at all.
    const iterB = subB.events[Symbol.asyncIterator]();
    const nextB = await Promise.race([
      iterB.next(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20)),
    ]);
    expect(nextB).toBeNull();

    stream.dispose();
  });
});

describe('ApprovalEventStream — late-join backfill', () => {
  it('a client subscribing after requests are already pending receives them immediately, then live events', async () => {
    const stream = new ApprovalEventStream(relay);

    const req1 = broker.submit(buildRequest('es-backfill-1'));
    const req2 = broker.submit(buildRequest('es-backfill-2'));

    const sub = stream.subscribe('late-client');

    const iter = sub.events[Symbol.asyncIterator]();
    const first = await iter.next();
    const second = await iter.next();
    expect(first.done).toBe(false);
    expect(second.done).toBe(false);
    expect(first.value).toMatchObject({ kind: 'pending', request: req1 });
    expect(second.value).toMatchObject({ kind: 'pending', request: req2 });

    const req3 = broker.submit(buildRequest('es-backfill-3'));
    const third = await iter.next();
    expect(third.done).toBe(false);
    expect(third.value).toMatchObject({ kind: 'pending', request: req3 });

    stream.dispose();
  });

  it('a decided request is retired from the pending cache and is not backfilled', async () => {
    const stream = new ApprovalEventStream(relay);

    const req1 = broker.submit(buildRequest('es-backfill-decided'));
    broker.decide(req1.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'test-direct',
      decidedAt: '2026-07-01T21:05:00.000Z',
    });
    broker.submit(buildRequest('es-backfill-still-pending'));

    const sub = stream.subscribe('late-client-2');
    const only = await readOne(sub.events);
    expect(only).toMatchObject({ kind: 'pending', request: { id: 'es-backfill-still-pending' } });

    stream.dispose();
  });
});

describe('ApprovalEventStream — backpressure', () => {
  it('drops the oldest events beyond maxBuffer and marks the drop with a coalesced counter', async () => {
    const stream = new ApprovalEventStream(relay);
    const sub = stream.subscribe('client-bp', undefined, { maxBuffer: 2 });

    // Four pending events land while nothing reads — only the newest 2 survive.
    broker.submit(buildRequest('es-bp-1'));
    broker.submit(buildRequest('es-bp-2'));
    const req3 = broker.submit(buildRequest('es-bp-3'));
    const req4 = broker.submit(buildRequest('es-bp-4'));

    const iter = sub.events[Symbol.asyncIterator]();

    const dropped = await iter.next();
    expect(dropped.done).toBe(false);
    expect(dropped.value).toEqual({ kind: 'dropped', droppedCount: 2 });

    const kept3 = await iter.next();
    expect(kept3.value).toMatchObject({ kind: 'pending', request: req3 });

    const kept4 = await iter.next();
    expect(kept4.value).toMatchObject({ kind: 'pending', request: req4 });

    stream.dispose();
  });
});

describe('ApprovalEventStream — unsubscribe does not leak', () => {
  it('unsubscribe() terminates the iterator, stops further delivery, and drops the client entry', async () => {
    const stream = new ApprovalEventStream(relay);
    const sub = stream.subscribe('client-u');
    expect(stream.clientIds).toContain('client-u');

    sub.unsubscribe();
    expect(stream.clientIds).not.toContain('client-u');

    const iter = sub.events[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(true);

    // A relay event after unsubscribe must not throw or resurrect the client.
    expect(() => broker.submit(buildRequest('es-after-unsub'))).not.toThrow();
    expect(stream.clientIds).not.toContain('client-u');

    stream.dispose();
  });

  it('breaking a for-await loop early (iterator.return()) also cleans up, same as explicit unsubscribe', async () => {
    const stream = new ApprovalEventStream(relay);
    const sub = stream.subscribe('client-break');
    broker.submit(buildRequest('es-break-1'));

    for await (const event of sub.events) {
      expect(event).toMatchObject({ kind: 'pending' });
      break;
    }

    expect(stream.clientIds).not.toContain('client-break');
    stream.dispose();
  });

  it('rejects a duplicate client id', () => {
    const stream = new ApprovalEventStream(relay);
    stream.subscribe('dup-client');
    expect(() => stream.subscribe('dup-client')).toThrow(ApprovalEventStreamError);
    stream.dispose();
  });
});

describe('ApprovalEventStream — dispose', () => {
  it('detaches from the relay via its public API only and closes open subscriptions', async () => {
    const stream = new ApprovalEventStream(relay, { channelName: 'es-dispose-test' });
    expect(relay.channelNames).toContain('es-dispose-test');

    const sub = stream.subscribe('client-d');
    stream.dispose();

    expect(relay.channelNames).not.toContain('es-dispose-test');

    const iter = sub.events[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(true);

    // dispose() is idempotent.
    expect(() => stream.dispose()).not.toThrow();
  });
});
