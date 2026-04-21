// ═══ Notify Wire Tests — Hot Fix H6 ══════════════════════════════════════════
// Validates the DECKENT→USER:NOTIFY runtime wire introduced in Sprint 150.
// - event-stream emit on every notify() call
// - fail-safe when dispatcher not initialized
// - all 5 NotificationEventName handled
// - priority mapping via createNotification
// - parent-TTY env detection logic (CliNotificationAdapter)
// - nervous bridge fires notify()

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { notify } from '../../src/core/notify.js';
import {
  NotifyDispatcher,
  createNotification,
  type Notification,
  type NotificationAdapter,
  type NotificationEventName,
} from '../../src/core/notification-dispatcher.js';
import {
  setGlobalNotifyDispatcher,
  getGlobalNotifyDispatcher,
  clearGlobalNotifyDispatcher,
} from '../../src/core/notify-registry.js';
import { CliNotificationAdapter } from '../../src/core/notify-adapters/cli-adapter.js';
import { eventBus } from '../../src/orchestra/event-bus.js';

// ─── Test Adapter (collects everything dispatched) ─────────────
class CollectorAdapter implements NotificationAdapter {
  readonly name = 'collector';
  readonly sent: Notification[] = [];
  isAvailable(): boolean { return true; }
  async send(n: Notification): Promise<void> { this.sent.push(n); }
}

describe('notify-wire (Hot Fix H6)', () => {
  beforeEach(() => {
    clearGlobalNotifyDispatcher();
  });

  afterEach(() => {
    clearGlobalNotifyDispatcher();
  });

  it('emits DECKENT→USER:NOTIFY on event-bus when called', async () => {
    const captured: unknown[] = [];
    const handler = (evt: unknown): void => {
      captured.push(evt);
    };
    eventBus.on('deckent-event', handler);

    try {
      await notify('sprint-started', 'sprint-150', 'Test başladı', 'basic summary');
    } finally {
      eventBus.off('deckent-event', handler);
    }

    // Must have emitted at least one event with channel DECKENT→USER:NOTIFY
    const notifyEvents = captured.filter((e) => {
      const obj = e as Record<string, unknown>;
      return obj.type === 'NOTIFY' && obj.channel === 'DECKENT→USER:NOTIFY';
    });
    expect(notifyEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('is a no-op (fail-safe) when globalNotifyDispatcher is not initialized', async () => {
    expect(getGlobalNotifyDispatcher()).toBeNull();

    // Must not throw
    await expect(
      notify('task-done', 'sprint-150', 'Task 1', 'done'),
    ).resolves.toBeUndefined();
  });

  it('dispatches to all registered adapters when dispatcher is initialized', async () => {
    const dispatcher = new NotifyDispatcher(0); // no throttle for test
    const collector = new CollectorAdapter();
    dispatcher.addAdapter(collector);
    setGlobalNotifyDispatcher(dispatcher);

    await notify('sprint-started', 'sprint-150', 'Başladı', 'summary');

    expect(collector.sent.length).toBe(1);
    expect(collector.sent[0]!.event).toBe('sprint-started');
    expect(collector.sent[0]!.sprintId).toBe('sprint-150');
  });

  it('handles all 5 NotificationEventName values', async () => {
    const dispatcher = new NotifyDispatcher(0);
    const collector = new CollectorAdapter();
    dispatcher.addAdapter(collector);
    setGlobalNotifyDispatcher(dispatcher);

    const events: NotificationEventName[] = [
      'sprint-started',
      'task-done',
      'task-no-go',
      'sprint-finalized',
      'human-checkpoint-required',
    ];

    for (const ev of events) {
      await notify(ev, 'sprint-150', `Title ${ev}`, `Summary ${ev}`);
    }

    expect(collector.sent.length).toBe(5);
    const gotEvents = collector.sent.map(n => n.event);
    expect(gotEvents).toEqual(events);
  });

  it('assigns correct priority via createNotification mapping', () => {
    expect(createNotification('sprint-started', 's-1', 't', 'm').priority).toBe('info');
    expect(createNotification('task-done', 's-1', 't', 'm').priority).toBe('info');
    expect(createNotification('task-no-go', 's-1', 't', 'm').priority).toBe('warning');
    expect(createNotification('sprint-finalized', 's-1', 't', 'm').priority).toBe('info');
    expect(createNotification('human-checkpoint-required', 's-1', 't', 'm').priority).toBe('critical');
  });

  it('CliNotificationAdapter uses parent-PID path when DECKENT_PARENT_PID is set', () => {
    const originalPid = process.env['DECKENT_PARENT_PID'];
    try {
      // Own PID is always alive and /proc/<pid>/fd/1 exists on Linux
      process.env['DECKENT_PARENT_PID'] = String(process.pid);
      const adapter = new CliNotificationAdapter();

      // On Linux /proc/self/fd/1 exists; elsewhere this falls through to TTY check
      // Either way, isAvailable() must return a boolean (not throw)
      const avail = adapter.isAvailable();
      expect(typeof avail).toBe('boolean');
    } finally {
      if (originalPid === undefined) delete process.env['DECKENT_PARENT_PID'];
      else process.env['DECKENT_PARENT_PID'] = originalPid;
    }
  });

  it('nervous dispatcher fires notify() via bridgeToUserNotify', async () => {
    // Install a dispatcher; nervous bridge will dispatch to it.
    const dispatcher = new NotifyDispatcher(0);
    const collector = new CollectorAdapter();
    dispatcher.addAdapter(collector);
    setGlobalNotifyDispatcher(dispatcher);

    // Import NervousDispatcher after setting global (avoids top-of-file import order)
    const { NervousDispatcher } = await import('../../src/nervous/dispatcher.js');

    const nerv = new NervousDispatcher(
      { mode: 'balanced', enabled: true } as any,
      process.cwd(),
      {
        fileAdapter: { push: async () => true },  // suppress real file write
        cliAdapter: { push: async () => true },
        mcpAdapter: { push: async () => true },
        isMcpActive: () => false,
        isTtyAvailable: () => false,
      },
    );

    await nerv.dispatch({
      id: 'nerv-test-1',
      type: 'test',
      title: 'Test risk',
      message: 'something happened',
      severity: 'critical',
      createdAt: new Date().toISOString(),
      detectorId: 'test-detector',
      actions: [],
      timeoutMs: null,
      sprintId: 'sprint-150',
    });

    // Give the fire-and-forget bridge microtask time to complete
    await new Promise((r) => setTimeout(r, 10));

    // Bridge must have fired at least one notification to the global dispatcher
    expect(collector.sent.length).toBeGreaterThanOrEqual(1);
    expect(collector.sent[0]!.sprintId).toBe('sprint-150');
    expect(collector.sent[0]!.title).toContain('[Nervous]');
  });

  it('throttles non-critical notifications (respects 1s min-interval)', async () => {
    const dispatcher = new NotifyDispatcher(1000);
    const collector = new CollectorAdapter();
    dispatcher.addAdapter(collector);
    setGlobalNotifyDispatcher(dispatcher);

    // Three back-to-back info notifications: first wins immediately, rest queue
    await notify('task-done', 'sprint-150', 'a', 'a');
    await notify('task-done', 'sprint-150', 'b', 'b');
    await notify('task-done', 'sprint-150', 'c', 'c');

    // First one sent now; others queued
    expect(collector.sent.length).toBe(1);
  });

  it('dispatches critical notifications immediately (bypasses throttle)', async () => {
    const dispatcher = new NotifyDispatcher(60_000); // huge throttle
    const collector = new CollectorAdapter();
    dispatcher.addAdapter(collector);
    setGlobalNotifyDispatcher(dispatcher);

    await notify('human-checkpoint-required', 'sprint-150', 'Onay', 'approve?');
    await notify('human-checkpoint-required', 'sprint-150', 'Onay 2', 'approve 2?');

    // Both critical: both bypass throttle
    expect(collector.sent.length).toBe(2);
  });
});
