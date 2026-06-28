// ═══ DECKENT→USER:NOTIFY Sprint Lifecycle E2E ═══════════════════════════════
// Sprint 151 Task 009
//
// Simulates a mini 1-task sprint lifecycle and verifies that DECKENT→USER:NOTIFY
// events are emitted correctly through both channels:
//   1. In-process eventBus (deckent-event)
//   2. Global NotifyDispatcher → mock NotificationAdapter
//
// Events tested: sprint-started → task-done → sprint-finalized
//                sprint-started → task-no-go → sprint-finalized
//                human-checkpoint-required (critical priority bypass)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  NotifyDispatcher,
  createNotification,
  toEventPayload,
  type Notification,
  type NotificationAdapter,
  type NotificationEventName,
} from '../../src/core/notification-dispatcher.js';
import {
  setGlobalNotifyDispatcher,
  clearGlobalNotifyDispatcher,
} from '../../src/core/notify-registry.js';
import { notify } from '../../src/core/notify.js';
import { eventBus } from '../../src/orchestra/event-bus.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockAdapter(): NotificationAdapter & { sent: Notification[] } {
  const sent: Notification[] = [];
  return {
    name: 'test-adapter',
    isAvailable: () => true,
    send: async (n: Notification) => {
      sent.push(n);
    },
    sent,
  };
}

type EventBusPayload = {
  type: string;
  source: string;
  target: string;
  channel: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('DECKENT→USER:NOTIFY Sprint Lifecycle E2E', () => {
  let dispatcher: NotifyDispatcher;
  let adapter: ReturnType<typeof createMockAdapter>;
  let busEvents: EventBusPayload[];
  let busListener: (data: EventBusPayload) => void;

  beforeEach(() => {
    // Fresh dispatcher with 0ms throttle (immediate delivery for tests)
    dispatcher = new NotifyDispatcher(0);
    adapter = createMockAdapter();
    dispatcher.addAdapter(adapter);
    setGlobalNotifyDispatcher(dispatcher);

    // Capture eventBus emissions
    busEvents = [];
    busListener = (data: EventBusPayload) => {
      if (data.channel === 'DECKENT→USER:NOTIFY') {
        busEvents.push(data);
      }
    };
    eventBus.on('deckent-event', busListener);
  });

  afterEach(() => {
    clearGlobalNotifyDispatcher();
    eventBus.removeListener('deckent-event', busListener);
    vi.restoreAllMocks();
  });

  // ─── Happy Path: sprint-started → task-done → sprint-finalized ──────

  it('emits sprint-started event via both eventBus and NotifyDispatcher', async () => {
    await notify('sprint-started', 'sprint-151', 'Sprint baslatildi', '15 task planlandi');

    // eventBus channel
    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].channel).toBe('DECKENT→USER:NOTIFY');
    expect(busEvents[0].payload.event).toBe('sprint-started');
    expect(busEvents[0].payload.sprintId).toBe('sprint-151');

    // NotifyDispatcher adapter
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].event).toBe('sprint-started');
    expect(adapter.sent[0].priority).toBe('info');
    expect(adapter.sent[0].sprintId).toBe('sprint-151');
  });

  it('emits task-done event with correct payload', async () => {
    await notify('task-done', 'sprint-151', 'Task T-001 tamamlandi', 'DONE — 3 dosya degisti');

    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].payload.event).toBe('task-done');
    expect(busEvents[0].payload.title).toBe('Task T-001 tamamlandi');

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].event).toBe('task-done');
    expect(adapter.sent[0].summary).toBe('DONE — 3 dosya degisti');
  });

  it('emits sprint-finalized event after lifecycle completion', async () => {
    await notify('sprint-finalized', 'sprint-151', 'Sprint tamamlandi', '15/15 DONE, coverage 89%');

    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].payload.event).toBe('sprint-finalized');

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].event).toBe('sprint-finalized');
    expect(adapter.sent[0].priority).toBe('info');
  });

  it('maintains correct event ordering for full lifecycle sequence', async () => {
    const events: NotificationEventName[] = [
      'sprint-started',
      'task-done',
      'sprint-finalized',
    ];

    for (const event of events) {
      await notify(event, 'sprint-151', `Event: ${event}`, `Summary for ${event}`);
    }

    // eventBus received all 3 in order
    expect(busEvents).toHaveLength(3);
    expect(busEvents.map((e) => e.payload.event)).toEqual(events);

    // NotifyDispatcher adapter received all 3 in order
    expect(adapter.sent).toHaveLength(3);
    expect(adapter.sent.map((n) => n.event)).toEqual(events);
  });

  // ─── NO_GO Path: sprint-started → task-no-go → sprint-finalized ─────

  it('emits task-no-go with warning priority', async () => {
    await notify('task-no-go', 'sprint-151', 'Task T-003 basarisiz', 'NO_GO — tsc 5 error');

    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].payload.event).toBe('task-no-go');

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].event).toBe('task-no-go');
    expect(adapter.sent[0].priority).toBe('warning');
  });

  it('handles full NO_GO lifecycle: sprint-started → task-no-go → sprint-finalized', async () => {
    await notify('sprint-started', 'sprint-151', 'Sprint baslatildi', '1 task');
    await notify('task-no-go', 'sprint-151', 'Task basarisiz', 'NO_GO');
    await notify('sprint-finalized', 'sprint-151', 'Sprint bitti', '0/1 DONE');

    expect(busEvents).toHaveLength(3);
    expect(busEvents.map((e) => e.payload.event)).toEqual([
      'sprint-started',
      'task-no-go',
      'sprint-finalized',
    ]);

    expect(adapter.sent).toHaveLength(3);
    expect(adapter.sent[0].priority).toBe('info');
    expect(adapter.sent[1].priority).toBe('warning');
    expect(adapter.sent[2].priority).toBe('info');
  });

  // ─── Critical Path: human-checkpoint-required ───────────────────────

  it('emits human-checkpoint-required with critical priority (immediate dispatch)', async () => {
    await notify(
      'human-checkpoint-required',
      'sprint-151',
      'Checkpoint gerekli',
      'Kill komutu Alperen onayi bekliyor',
    );

    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].payload.event).toBe('human-checkpoint-required');
    expect(busEvents[0].payload.priority).toBe('critical');

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].event).toBe('human-checkpoint-required');
    expect(adapter.sent[0].priority).toBe('critical');
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────

  it('works when no global dispatcher is registered (eventBus only)', async () => {
    clearGlobalNotifyDispatcher();

    await notify('sprint-started', 'sprint-151', 'No dispatcher', 'Should not throw');

    // eventBus still receives the event
    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].payload.event).toBe('sprint-started');

    // No adapter delivery (dispatcher is null)
    expect(adapter.sent).toHaveLength(0);
  });

  it('continues when adapter throws error (fail-safe)', async () => {
    const failingAdapter: NotificationAdapter = {
      name: 'fail-adapter',
      isAvailable: () => true,
      send: async () => {
        throw new Error('Adapter crash');
      },
    };
    dispatcher.clearAdapters();
    dispatcher.addAdapter(failingAdapter);
    dispatcher.addAdapter(adapter); // second adapter should still receive

    await notify('sprint-started', 'sprint-151', 'Fail-safe test', 'Should survive adapter crash');

    // eventBus still works
    expect(busEvents).toHaveLength(1);

    // Second adapter should still receive despite first failing
    expect(adapter.sent).toHaveLength(1);
  });

  it('includes details field when provided', async () => {
    await notify('task-no-go', 'sprint-151', 'TSC fail', 'Build broken', 'Error at src/foo.ts:42');

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].details).toBe('Error at src/foo.ts:42');

    expect(busEvents).toHaveLength(1);
    expect(busEvents[0].payload.details).toBe('Error at src/foo.ts:42');
  });

  // ─── createNotification + toEventPayload unit integration ──────────

  it('createNotification maps event names to correct priorities', () => {
    const mapping: Array<[NotificationEventName, string]> = [
      ['sprint-started', 'info'],
      ['task-done', 'info'],
      ['task-no-go', 'warning'],
      ['sprint-finalized', 'info'],
      ['human-checkpoint-required', 'critical'],
    ];

    for (const [event, expectedPriority] of mapping) {
      const notification = createNotification(event, 'sprint-test', 'title', 'summary');
      expect(notification.priority).toBe(expectedPriority);
      expect(notification.event).toBe(event);
      expect(notification.timestamp).toBeTruthy();
    }
  });

  it('toEventPayload produces correct structure for event stream', () => {
    const notification = createNotification('sprint-started', 'sprint-151', 'Title', 'Summary', 'Details');
    const payload = toEventPayload(notification);

    expect(payload).toEqual({
      priority: 'info',
      event: 'sprint-started',
      title: 'Title',
      summary: 'Summary',
      details: 'Details',
      sprintId: 'sprint-151',
      // owningPid defaults to process.pid (dispatcher) for orphan-process
      // tracking — assert presence + type, never the dynamic value.
      owningPid: expect.any(Number),
    });
  });
});
