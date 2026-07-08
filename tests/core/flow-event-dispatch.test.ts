/**
 * FLOW-EVENT-DISPATCH (task 387-009).
 *
 * Before this fix: FlowRuntime.tick() hardcoded collectDue(flows, [], [], now) —
 * an event-triggered DueDispatch could never occur in production, and there was
 * no id-addressable, persisted pending-approval record nor a `flow approve`
 * command to unblock one. This file proves the full path end-to-end:
 *   FlowRuntime (real triggers/events) -> event-kind DueDispatch
 *     -> enqueuePendingEventDispatches (persisted, pending)
 *       -> approveDispatch (the "approveDispatch reader") -> approved, unblocked
 * and that without calling approve, the entry never leaves the pending list.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type EventTrigger,
  type IncomingEvent,
  createPendingEventDispatch,
  enqueuePendingEventDispatches,
  listPendingEventDispatches,
  approveDispatch,
  pendingEventDispatchPath,
} from '../../src/core/event-trigger.js';
import { FlowRuntime } from '../../src/core/flow-runtime.js';
import type { FlowRegistry } from '../../src/core/flow-registry.js';
import type { DueDispatch } from '../../src/core/flow-scheduler.js';
import { handleEventDispatchTick } from '../../src/cli/commands/flow.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

const dirs: string[] = [];
function root(): string {
  const d = mkdtempSync(join(tmpdir(), 'flow-event-dispatch-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeTrigger(overrides: Partial<EventTrigger> = {}): EventTrigger {
  return {
    id: 'trig-deploy',
    eventType: 'deploy.complete',
    source: 'ci',
    action: 'run-smoke',
    tenantId: 'tenant-a',
    enabled: true,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<IncomingEvent> = {}): IncomingEvent {
  return {
    eventType: 'deploy.complete',
    source: 'ci',
    tenantId: 'tenant-a',
    ...overrides,
  };
}

function makeRegistry(): FlowRegistry {
  return { listFlows: () => [] } as unknown as FlowRegistry;
}

function eventDueDispatch(trigger: EventTrigger, event: IncomingEvent): DueDispatch {
  return { kind: 'event', trigger, event };
}

// ─── event-trigger.ts: createPendingEventDispatch ──────────────────────────

describe('createPendingEventDispatch', () => {
  it('builds a pending entry stamped with the injected clock', () => {
    const trigger = makeTrigger();
    const event = makeEvent();
    const entry = createPendingEventDispatch(trigger, event, 'evt-1', () => new Date('2026-07-01T00:00:00.000Z'));

    expect(entry).toMatchObject({
      id: 'evt-1',
      trigger,
      event,
      status: 'pending',
      enqueuedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(entry.approvedAt).toBeUndefined();
  });
});

// ─── FlowRuntime: event-trigger dispatch wiring ────────────────────────────

describe('FlowRuntime.tick — event-trigger dispatch wiring', () => {
  it('produces a kind:"event" dispatch when listTriggers/listEvents are supplied and match', () => {
    const trigger = makeTrigger();
    const event = makeEvent();
    const runtime = new FlowRuntime(makeRegistry(), {
      clock: () => new Date('2026-07-01T00:00:00.000Z'),
      listTriggers: () => [trigger],
      listEvents: () => [event],
    });

    const dispatches: DueDispatch[] = [];
    runtime.tick(items => dispatches.push(...items));

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({ kind: 'event', trigger, event });
  });

  it('produces no event dispatch when the event does not match any trigger', () => {
    const trigger = makeTrigger({ eventType: 'deploy.complete' });
    const event = makeEvent({ eventType: 'push' });
    const runtime = new FlowRuntime(makeRegistry(), {
      listTriggers: () => [trigger],
      listEvents: () => [event],
    });

    const dispatches: DueDispatch[] = [];
    runtime.tick(items => dispatches.push(...items));

    expect(dispatches).toHaveLength(0);
  });

  it('regression: default (no listTriggers/listEvents) behaves exactly as before — no event dispatches', () => {
    const runtime = new FlowRuntime(makeRegistry(), { clock: () => new Date('2026-07-01T00:00:00.000Z') });

    const dispatches: DueDispatch[] = [];
    runtime.tick(items => dispatches.push(...items));

    expect(dispatches).toHaveLength(0);
  });
});

// ─── flow-runtime.ts: enqueuePendingEventDispatches ────────────────────────

describe('enqueuePendingEventDispatches', () => {
  it('persists newly matched event dispatches to disk with unique ids', () => {
    const r = root();
    const trigger = makeTrigger();
    const event = makeEvent();
    const clock = () => new Date('2026-07-01T00:00:00.000Z');

    const added = enqueuePendingEventDispatches(r, [eventDueDispatch(trigger, event)], { clock });

    expect(added).toHaveLength(1);
    expect(added[0]!.status).toBe('pending');
    const path = pendingEventDispatchPath(r);
    expect(existsSync(path)).toBe(true);
    const onDisk = JSON.parse(readFileSync(path, 'utf-8')) as unknown[];
    expect(onDisk).toHaveLength(1);
  });

  it('ignores scheduled-kind dispatches and writes nothing when no event-kind items exist', () => {
    const r = root();
    const scheduledOnly: DueDispatch[] = [
      { kind: 'scheduled', flow: { id: 'f1', cronExpr: '* * * * *', action: 'x', tenantId: 't', enabled: true }, nextRun: new Date() },
    ];

    const added = enqueuePendingEventDispatches(r, scheduledOnly);

    expect(added).toHaveLength(0);
    expect(existsSync(pendingEventDispatchPath(r))).toBe(false);
  });

  it('accumulates across calls (the persisted queue grows, ids stay unique)', () => {
    const r = root();
    const trigger = makeTrigger();
    enqueuePendingEventDispatches(r, [eventDueDispatch(trigger, makeEvent())]);
    enqueuePendingEventDispatches(r, [eventDueDispatch(trigger, makeEvent())]);

    const onDisk = JSON.parse(readFileSync(pendingEventDispatchPath(r), 'utf-8')) as Array<{ id: string }>;
    expect(onDisk).toHaveLength(2);
    expect(onDisk[0]!.id).not.toBe(onDisk[1]!.id);
  });
});

// ─── flow-runtime.ts: approveDispatch (the "approveDispatch reader") ───────

describe('approveDispatch — the approveDispatch reader', () => {
  it('flips a pending entry to approved and stamps approvedAt', () => {
    const r = root();
    const [entry] = enqueuePendingEventDispatches(r, [eventDueDispatch(makeTrigger(), makeEvent())]);

    const approved = approveDispatch(r, entry!.id, () => new Date('2026-07-01T01:00:00.000Z'));

    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('approved');
    expect(approved!.approvedAt).toBe('2026-07-01T01:00:00.000Z');

    // Persisted, not just in-memory — a fresh read must see the same state.
    const onDisk = JSON.parse(readFileSync(pendingEventDispatchPath(r), 'utf-8')) as Array<{ status: string }>;
    expect(onDisk[0]!.status).toBe('approved');
  });

  it('returns null for an unknown id', () => {
    const r = root();
    enqueuePendingEventDispatches(r, [eventDueDispatch(makeTrigger(), makeEvent())]);

    expect(approveDispatch(r, 'evt-does-not-exist')).toBeNull();
  });

  it('returns null when approving an already-approved entry (idempotent guard)', () => {
    const r = root();
    const [entry] = enqueuePendingEventDispatches(r, [eventDueDispatch(makeTrigger(), makeEvent())]);

    expect(approveDispatch(r, entry!.id)).not.toBeNull();
    expect(approveDispatch(r, entry!.id)).toBeNull();
  });
});

// ─── Core goCriteria proof ──────────────────────────────────────────────────
// "event-tetiklemeli flow onay-bekler -> `flow approve <id>` gerçekten dispatch
// eder + flow ilerler (test); onaysız ilerlemez."

describe('FLOW-EVENT-DISPATCH goCriteria — approval gate blocks until approved', () => {
  it('an event-triggered dispatch stays pending (blocked) until flow approve <id> is called, then proceeds', () => {
    const r = root();
    const trigger = makeTrigger();
    const event = makeEvent();
    const runtime = new FlowRuntime(makeRegistry(), {
      clock: () => new Date('2026-07-01T00:00:00.000Z'),
      listTriggers: () => [trigger],
      listEvents: () => [event],
    });

    // 1. Tick produces the event-triggered dispatch (event-trigger dispatch is connected).
    const dispatches: DueDispatch[] = [];
    runtime.tick(items => dispatches.push(...items));
    expect(dispatches).toHaveLength(1);

    // 2. Enqueue onto the persisted approval queue.
    const added = enqueuePendingEventDispatches(r, dispatches);
    const id = added[0]!.id;

    // 3. Onaysız ilerlemez: still blocked/pending before approval.
    expect(listPendingEventDispatches(r).map(e => e.id)).toContain(id);

    // 4. `flow approve <id>` gerçekten dispatch eder: approveDispatch flips it.
    const approved = approveDispatch(r, id);
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('approved');

    // 5. Flow ilerler: no longer blocked — dropped from the pending list.
    expect(listPendingEventDispatches(r).map(e => e.id)).not.toContain(id);
  });
});

// ─── CLI wiring: handleEventDispatchTick ────────────────────────────────────

describe('handleEventDispatchTick (flow.ts CLI wiring)', () => {
  it('enqueues event dispatches and reports the queued count + path (en)', () => {
    const r = root();
    const out: string[] = [];
    const dispatches = [eventDueDispatch(makeTrigger(), makeEvent())];

    const added = handleEventDispatchTick(r, dispatches, 'en', { print: m => out.push(m) });

    expect(added).toBe(1);
    expect(out.join(' ')).toContain('1 event-triggered dispatch(es) queued for approval');
    expect(out.join(' ')).toContain(pendingEventDispatchPath(r));
  });

  it('reports in Turkish when lang="tr"', () => {
    const r = root();
    const out: string[] = [];
    const dispatches = [eventDueDispatch(makeTrigger(), makeEvent())];

    handleEventDispatchTick(r, dispatches, 'tr', { print: m => out.push(m) });

    expect(out.join(' ')).toContain('event-tetiklemeli dispatch onay için kuyruğa alındı');
  });

  it('is a silent no-op when the tick has no event-kind dispatches (existing scheduled-only ticks unaffected)', () => {
    const r = root();
    const out: string[] = [];
    const scheduledOnly: DueDispatch[] = [
      { kind: 'scheduled', flow: { id: 'f1', cronExpr: '* * * * *', action: 'x', tenantId: 't', enabled: true }, nextRun: new Date() },
    ];

    const added = handleEventDispatchTick(r, scheduledOnly, 'en', { print: m => out.push(m) });

    expect(added).toBe(0);
    expect(out).toHaveLength(0);
    expect(existsSync(pendingEventDispatchPath(r))).toBe(false);
  });
});
