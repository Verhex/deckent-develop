// ═══ Tests — PLANOBS-002: notify 'progress' + 'phase-change' event types ═════
// Sprint 280 Task 2 — Verifies that the two new NotificationEventName values
// are routed through all registered adapters via the generic dispatch path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NotifyDispatcher,
  createNotification,
  type NotificationEventName,
  type NotificationAdapter,
  type Notification,
} from '../../src/core/notification-dispatcher.js';
import { notify, notifyProgress } from '../../src/core/notify.js';
import {
  setNotificationDispatcher,
  clearNotificationDispatcher,
  getNotificationDispatcher,
  clearGlobalNotifyDispatcher,
  setGlobalNotifyDispatcher,
  type NotifyBusEvent,
} from '../../src/core/notify-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeMockAdapter(name: string): NotificationAdapter & { received: Notification[] } {
  const received: Notification[] = [];
  return {
    name,
    isAvailable: () => true,
    async send(n: Notification) { received.push(n); },
    received,
  };
}

// ─── Test 1: 'progress' is a valid NotificationEventName ─────────

describe('NotificationEventName — new types', () => {
  it("'progress' is accepted by createNotification without throwing", () => {
    expect(() =>
      createNotification('progress', 'sprint-280', 'EXECUTE', '5/10 tasks done'),
    ).not.toThrow();
  });

  it("'phase-change' is accepted by createNotification without throwing", () => {
    expect(() =>
      createNotification('phase-change', 'sprint-280', 'SPAWN', 'entering spawn phase'),
    ).not.toThrow();
  });

  it("'progress' notification has priority 'info'", () => {
    const n = createNotification('progress', 'sprint-280', 'EXECUTE', 'x');
    expect(n.priority).toBe('info');
    expect(n.event).toBe('progress');
  });

  it("'phase-change' notification has priority 'info'", () => {
    const n = createNotification('phase-change', 'sprint-280', 'PLAN→SPAWN', 'x');
    expect(n.priority).toBe('info');
    expect(n.event).toBe('phase-change');
  });
});

// ─── Test 2: 3-adapter fan-out for 'progress' ────────────────────

describe('NotifyDispatcher — 3-adapter fan-out', () => {
  it("'progress' is dispatched to all 3 registered adapters", async () => {
    const tty = makeMockAdapter('tty');
    const mcp = makeMockAdapter('mcp');
    const file = makeMockAdapter('file');

    const dispatcher = new NotifyDispatcher(0); // no throttle
    dispatcher.addAdapter(tty);
    dispatcher.addAdapter(mcp);
    dispatcher.addAdapter(file);

    const n = createNotification('progress', 'sprint-280', 'EXECUTE', 'halfway');
    const delivered = await dispatcher.sendNow(n);

    expect(delivered).toBe(3);
    expect(tty.received).toHaveLength(1);
    expect(mcp.received).toHaveLength(1);
    expect(file.received).toHaveLength(1);
    expect(tty.received[0]?.event).toBe('progress');
  });

  it("'phase-change' is dispatched to all 3 registered adapters", async () => {
    const tty = makeMockAdapter('tty');
    const mcp = makeMockAdapter('mcp');
    const file = makeMockAdapter('file');

    const dispatcher = new NotifyDispatcher(0);
    dispatcher.addAdapter(tty);
    dispatcher.addAdapter(mcp);
    dispatcher.addAdapter(file);

    const n = createNotification('phase-change', 'sprint-280', 'SPAWN', 'started');
    const delivered = await dispatcher.sendNow(n);

    expect(delivered).toBe(3);
    expect(tty.received).toHaveLength(1);
    expect(mcp.received).toHaveLength(1);
    expect(file.received).toHaveLength(1);
    expect(mcp.received[0]?.event).toBe('phase-change');
  });
});

// ─── Test 3: Existing types are unaffected (regression) ──────────

describe('NotifyDispatcher — existing types regression', () => {
  it('all 5 original event types still dispatch correctly', async () => {
    const adapter = makeMockAdapter('tty');
    const dispatcher = new NotifyDispatcher(0);
    dispatcher.addAdapter(adapter);

    const originals: NotificationEventName[] = [
      'sprint-started',
      'task-done',
      'task-no-go',
      'sprint-finalized',
      'human-checkpoint-required',
    ];

    for (const event of originals) {
      const n = createNotification(event, 'sprint-280', `t-${event}`, `s-${event}`);
      await dispatcher.sendNow(n);
    }

    expect(adapter.received).toHaveLength(originals.length);
    for (let i = 0; i < originals.length; i++) {
      expect(adapter.received[i]?.event).toBe(originals[i]);
    }
  });
});

// ─── Test 4: notify() helper routes 'progress' + 'phase-change' via event bus ──

describe('notify() — event bus routing for new types', () => {
  let previousDispatcher: ReturnType<typeof getNotificationDispatcher>;

  beforeEach(() => {
    previousDispatcher = getNotificationDispatcher();
    clearNotificationDispatcher();
    clearGlobalNotifyDispatcher();
  });

  afterEach(() => {
    setNotificationDispatcher(previousDispatcher);
    clearGlobalNotifyDispatcher();
  });

  it("notify('progress') emits on DECKENT→USER:NOTIFY with event='progress'", async () => {
    const captured: NotifyBusEvent[] = [];
    setNotificationDispatcher((evt) => { captured.push(evt); });

    await notify('progress', 'sprint-280', 'EXECUTE', '3/10 done');

    expect(captured).toHaveLength(1);
    expect(captured[0]?.payload['event']).toBe('progress');
    expect(captured[0]?.channel).toBe('DECKENT→USER:NOTIFY');
  });

  it("notify('phase-change') emits on DECKENT→USER:NOTIFY with event='phase-change'", async () => {
    const captured: NotifyBusEvent[] = [];
    setNotificationDispatcher((evt) => { captured.push(evt); });

    await notify('phase-change', 'sprint-280', 'SPAWN', 'entering spawn');

    expect(captured).toHaveLength(1);
    expect(captured[0]?.payload['event']).toBe('phase-change');
    expect(captured[0]?.channel).toBe('DECKENT→USER:NOTIFY');
  });

  it('notifyProgress helper dispatches a progress notification via global dispatcher', async () => {
    const adapter = makeMockAdapter('tty');
    const dispatcher = new NotifyDispatcher(0);
    dispatcher.addAdapter(adapter);
    setGlobalNotifyDispatcher(dispatcher);

    await notifyProgress('sprint-280', 'EXECUTE', '5/10 done');

    expect(adapter.received).toHaveLength(1);
    expect(adapter.received[0]?.event).toBe('progress');
    expect(adapter.received[0]?.title).toBe('EXECUTE');
  });
});
