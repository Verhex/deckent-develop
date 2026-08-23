import { describe, expect, it, vi } from 'vitest';
import {
  NotifyDispatcher,
  createNotification,
  type NotificationAdapter,
} from '../../src/core/notification-dispatcher.js';

describe('detached sprint runner notification lifecycle', () => {
  it('shares concurrent close and tears down only after terminal delivery', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const closeAdapter = vi.fn(async () => { events.push('close'); });
    const adapter: NotificationAdapter = {
      name: 'runner-connector',
      isAvailable: () => true,
      send: async (notification) => { events.push(`send:${notification.event}`); },
      close: closeAdapter,
    };
    const dispatcher = new NotifyDispatcher(1000);
    dispatcher.addAdapter(adapter);

    await dispatcher.dispatch(createNotification('sprint-started', 's-2', 'start', 'start'));
    await dispatcher.dispatch(createNotification('sprint-finalized', 's-2', 'done', 'done'));
    const firstClose = dispatcher.close();
    const secondClose = dispatcher.close();

    expect(secondClose).toBe(firstClose);
    await firstClose;
    expect(events).toEqual(['send:sprint-started', 'send:sprint-finalized', 'close']);
    expect(closeAdapter).toHaveBeenCalledTimes(1);
    await expect(dispatcher.dispatch(
      createNotification('task-done', 's-2', 'late', 'late'),
    )).resolves.toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(events).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
