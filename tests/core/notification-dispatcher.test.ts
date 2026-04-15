import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NotifyDispatcher,
  createNotification,
  toEventPayload,
  type Notification,
  type NotificationAdapter,
} from '../../src/core/notification-dispatcher.js';

// ─── Test Helpers ────────────────────────────────────────────────

function makeAdapter(opts?: { available?: boolean; failWith?: Error }): NotificationAdapter & { calls: Notification[] } {
  const calls: Notification[] = [];
  return {
    name: 'test-adapter',
    calls,
    isAvailable: () => opts?.available ?? true,
    send: async (n: Notification) => {
      if (opts?.failWith) throw opts.failWith;
      calls.push(n);
    },
  };
}

function makeNotification(overrides?: Partial<Notification>): Notification {
  return {
    priority: 'info',
    event: 'task-done',
    title: 'Test',
    summary: 'Test summary',
    sprintId: 'sprint-139',
    timestamp: '2026-04-15T10:00:00.000Z',
    ...overrides,
  };
}

// ─── NotifyDispatcher Tests ──────────────────────────────────────

describe('NotifyDispatcher', () => {
  let dispatcher: NotifyDispatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    dispatcher = new NotifyDispatcher(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches to available adapters', async () => {
    const adapter = makeAdapter();
    dispatcher.addAdapter(adapter);

    const n = makeNotification();
    const count = await dispatcher.dispatch(n);

    expect(count).toBe(1);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual(n);
  });

  it('skips unavailable adapters', async () => {
    const available = makeAdapter({ available: true });
    const unavailable = makeAdapter({ available: false });
    dispatcher.addAdapter(available);
    dispatcher.addAdapter(unavailable);

    const count = await dispatcher.dispatch(makeNotification());

    expect(count).toBe(1);
    expect(available.calls).toHaveLength(1);
    expect(unavailable.calls).toHaveLength(0);
  });

  it('sends critical notifications immediately regardless of throttle', async () => {
    const adapter = makeAdapter();
    dispatcher.addAdapter(adapter);

    // First info dispatch to set lastSent
    await dispatcher.dispatch(makeNotification({ priority: 'info' }));
    expect(adapter.calls).toHaveLength(1);

    // Critical should bypass throttle even if fired immediately after
    const count = await dispatcher.dispatch(makeNotification({ priority: 'critical', event: 'human-checkpoint-required' }));
    expect(count).toBe(1);
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[1]!.priority).toBe('critical');
  });

  it('throttles non-critical notifications (queues them)', async () => {
    const adapter = makeAdapter();
    dispatcher.addAdapter(adapter);

    // First dispatch goes through immediately
    await dispatcher.dispatch(makeNotification({ priority: 'info', title: 'first' }));
    expect(adapter.calls).toHaveLength(1);

    // Second dispatch within throttle interval gets queued
    const count = await dispatcher.dispatch(makeNotification({ priority: 'info', title: 'second' }));
    expect(count).toBe(0); // queued, not sent yet
    expect(dispatcher.queueLength).toBe(1);
  });

  it('flushes queued notifications after throttle interval', async () => {
    const adapter = makeAdapter();
    dispatcher.addAdapter(adapter);

    await dispatcher.dispatch(makeNotification({ title: 'first' }));
    await dispatcher.dispatch(makeNotification({ title: 'second' }));

    expect(adapter.calls).toHaveLength(1);
    expect(dispatcher.queueLength).toBe(1);

    // Advance time past throttle interval
    await vi.advanceTimersByTimeAsync(1100);

    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[1]!.title).toBe('second');
    expect(dispatcher.queueLength).toBe(0);
  });

  it('handles adapter errors gracefully (fail-safe)', async () => {
    const failing = makeAdapter({ failWith: new Error('Network error') });
    const working = makeAdapter();
    dispatcher.addAdapter(failing);
    dispatcher.addAdapter(working);

    const count = await dispatcher.dispatch(makeNotification());

    // Only the working adapter counts as delivered
    expect(count).toBe(1);
    expect(working.calls).toHaveLength(1);
  });

  it('returns 0 when no adapters registered', async () => {
    const count = await dispatcher.dispatch(makeNotification());
    expect(count).toBe(0);
  });

  it('clearAdapters removes all adapters', async () => {
    dispatcher.addAdapter(makeAdapter());
    dispatcher.addAdapter(makeAdapter());
    expect(dispatcher.adapterCount).toBe(2);

    dispatcher.clearAdapters();
    expect(dispatcher.adapterCount).toBe(0);
  });

  it('flush returns 0 when queue is empty', async () => {
    dispatcher.addAdapter(makeAdapter());
    const count = await dispatcher.flush();
    expect(count).toBe(0);
  });
});

// ─── createNotification Tests ────────────────────────────────────

describe('createNotification', () => {
  it('assigns correct priority for each event type', () => {
    expect(createNotification('sprint-started', 's1', 't', 's').priority).toBe('info');
    expect(createNotification('task-done', 's1', 't', 's').priority).toBe('info');
    expect(createNotification('task-no-go', 's1', 't', 's').priority).toBe('warning');
    expect(createNotification('sprint-finalized', 's1', 't', 's').priority).toBe('info');
    expect(createNotification('human-checkpoint-required', 's1', 't', 's').priority).toBe('critical');
  });

  it('includes all fields in notification', () => {
    const n = createNotification('task-done', 'sprint-139', 'Task Done', 'All good', 'extra');
    expect(n.event).toBe('task-done');
    expect(n.sprintId).toBe('sprint-139');
    expect(n.title).toBe('Task Done');
    expect(n.summary).toBe('All good');
    expect(n.details).toBe('extra');
    expect(n.timestamp).toBeTruthy();
  });
});

// ─── toEventPayload Tests ────────────────────────────────────────

describe('toEventPayload', () => {
  it('converts notification to event stream payload', () => {
    const n = makeNotification({ details: 'some detail' });
    const payload = toEventPayload(n);

    expect(payload).toEqual({
      priority: 'info',
      event: 'task-done',
      title: 'Test',
      summary: 'Test summary',
      details: 'some detail',
      sprintId: 'sprint-139',
    });
  });

  it('excludes timestamp from payload (carried by event envelope)', () => {
    const payload = toEventPayload(makeNotification());
    expect(payload).not.toHaveProperty('timestamp');
  });
});
