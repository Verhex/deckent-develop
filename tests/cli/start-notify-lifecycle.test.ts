import { describe, expect, it, vi } from 'vitest';
import {
  NotifyDispatcher,
  createNotification,
  type NotificationAdapter,
} from '../../src/core/notification-dispatcher.js';

describe('CLI start notification lifecycle', () => {
  it('delivers a queued sprint-finalized notification before connector teardown', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const connector: NotificationAdapter = {
      name: 'connector',
      isAvailable: () => true,
      send: async (notification) => { events.push(`send:${notification.event}`); },
      close: async () => { events.push('close'); },
    };
    const dispatcher = new NotifyDispatcher(1000);
    dispatcher.addAdapter(connector);

    await dispatcher.dispatch(createNotification('sprint-started', 's-1', 'start', 'start'));
    await dispatcher.dispatch(createNotification('sprint-finalized', 's-1', 'done', 'done'));
    await dispatcher.close();
    await vi.advanceTimersByTimeAsync(2000);

    expect(events).toEqual(['send:sprint-started', 'send:sprint-finalized', 'close']);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
