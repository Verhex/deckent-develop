// tests/nervous/observer.test.ts
//
// NervousObserver test suite — 10 tests.
// Sprint 147 Task 4.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ObserverEvent } from '../../src/core/nervous-types.js';

// ─── Mock EventBus ──────────────────────────────────────────────────────────
// eventBus singleton'ı mock'lıyoruz — vi.hoisted ile factory'nin erişebileceği
// değişkenleri oluşturuyoruz (Vitest hoisting pattern).
const { mockEventBus } = vi.hoisted(() => ({
  mockEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('../../src/orchestra/event-bus.js', () => ({
  eventBus: mockEventBus,
}));

// ─── Mock node:fs watch ─────────────────────────────────────────────────────
const { mockWatcherInstances } = vi.hoisted(() => ({
  mockWatcherInstances: [] as Array<{ close: ReturnType<typeof import('vitest')['vi']['fn']>; callback: ((eventType: string, filename: string | null) => void) | null }>,
}));

vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs')>();
  return {
    ...orig,
    watch: vi.fn((_path: string, _options: unknown, callback: (eventType: string, filename: string | null) => void) => {
      const watcher = {
        close: vi.fn(),
        callback,
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        addListener: vi.fn(),
        emit: vi.fn(),
        listeners: vi.fn(() => []),
        ref: vi.fn(),
        unref: vi.fn(),
      };
      mockWatcherInstances.push({ close: watcher.close, callback });
      return watcher;
    }),
  };
});

// ─── Import after mocks ─────────────────────────────────────────────────────
import { NervousObserver } from '../../src/nervous/observer.js';
import { watch } from 'node:fs';

// ─── UUID v4 regex ──────────────────────────────────────────────────────────
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

describe('NervousObserver', () => {
  let observer: NervousObserver;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    mockWatcherInstances.length = 0;
    mockEventBus.on.mockReset();
    mockEventBus.off.mockReset();
    mockEventBus.emit.mockReset();

    // Re-mock watch after restoreAllMocks
    vi.mocked(watch).mockImplementation((_path: unknown, _options: unknown, callback: unknown) => {
      const watcher = {
        close: vi.fn(),
        callback: callback as (eventType: string, filename: string | null) => void,
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        addListener: vi.fn(),
        emit: vi.fn(),
        listeners: vi.fn(() => []),
        ref: vi.fn(),
        unref: vi.fn(),
      };
      mockWatcherInstances.push({ close: watcher.close, callback: watcher.callback });
      return watcher as unknown as ReturnType<typeof watch>;
    });

    observer = new NervousObserver('/test/project', 50); // 50ms cron for fast tests
  });

  afterEach(() => {
    observer.stop();
    vi.useRealTimers();
  });

  // ─── Test 1: start() idempotent ────────────────────────────────────────────
  it('should set isStarted=true on start(), 2nd call is no-op', () => {
    expect(observer.isStarted).toBe(false);

    observer.start();
    expect(observer.isStarted).toBe(true);

    // Count how many times eventBus.on was called
    const firstCallCount = mockEventBus.on.mock.calls.length;

    // Second call should be no-op
    observer.start();
    expect(observer.isStarted).toBe(true);
    expect(mockEventBus.on.mock.calls.length).toBe(firstCallCount); // No additional subscription
  });

  // ─── Test 2: stop() clears watchers and timer ──────────────────────────────
  it('should clear all watchers and timer on stop()', () => {
    observer.start();
    expect(observer.isStarted).toBe(true);

    // FS watchers were created (4 targets)
    const watcherCount = mockWatcherInstances.length;
    expect(watcherCount).toBe(4);

    observer.stop();
    expect(observer.isStarted).toBe(false);

    // All watcher.close() called
    for (const w of mockWatcherInstances) {
      expect(w.close).toHaveBeenCalled();
    }

    // eventBus.off called
    expect(mockEventBus.off).toHaveBeenCalledWith('event', expect.any(Function));
  });

  // ─── Test 3: EventBus emit → observer 'observe' with source='event-bus' ───
  it('should emit observe event with source=event-bus when eventBus publishes', () => {
    observer.start();

    // Capture the callback registered on eventBus
    const onCall = mockEventBus.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'event',
    );
    expect(onCall).toBeDefined();
    const busCallback = onCall![1] as (payload: Record<string, unknown>) => void;

    // Set up observer listener
    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    // Simulate EventBus event (non-lifecycle)
    busCallback({ type: 'WORKER_HEARTBEAT', workerId: 'w-001', sprintId: 'sprint-147' });

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('event-bus');
    expect(events[0].type).toBe('WORKER_HEARTBEAT');
    expect(events[0].sprintId).toBe('sprint-147');
  });

  // ─── Test 4: Filesystem change → observe with source='filesystem' ─────────
  it('should emit observe event with source=filesystem on FS change', () => {
    observer.start();

    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    // Find the .tasks watcher and trigger its callback
    const tasksWatcher = mockWatcherInstances[0]; // first target is .tasks
    expect(tasksWatcher.callback).toBeDefined();
    tasksWatcher.callback!('change', 'test.json');

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('filesystem');
    expect(events[0].type).toBe('FILE_CHANGE');
    expect(events[0].payload.filename).toBe('test.json');
    expect(events[0].payload.path).toBe('.tasks/test.json');
  });

  // ─── Test 5: Cron tick emits observe with source='cron' ────────────────────
  it('should emit observe event with source=cron within interval', () => {
    observer.start();

    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    // Advance timer past one cron interval (50ms)
    vi.advanceTimersByTime(60);

    const cronEvents = events.filter(e => e.source === 'cron');
    expect(cronEvents.length).toBeGreaterThanOrEqual(1);
    expect(cronEvents[0].type).toBe('TICK');
    expect(cronEvents[0].payload.intervalMs).toBe(50);
  });

  // ─── Test 6: All sources emit valid ObserverEvent ──────────────────────────
  it('should emit valid ObserverEvent with UUID and ISO timestamp from all sources', () => {
    observer.start();

    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    // Trigger event-bus
    const busCallback = mockEventBus.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'event',
    )![1] as (payload: Record<string, unknown>) => void;
    busCallback({ type: 'TEST_EVENT' });

    // Trigger filesystem
    mockWatcherInstances[0].callback!('change', 'file.ts');

    // Trigger cron
    vi.advanceTimersByTime(60);

    // At least 3 events (one per source)
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Validate all events
    for (const ev of events) {
      expect(ev.id).toMatch(UUID_V4_REGEX);
      expect(ev.timestamp).toMatch(ISO_8601_REGEX);
      expect(['event-bus', 'filesystem', 'cron', 'sprint-lifecycle']).toContain(ev.source);
      expect(typeof ev.type).toBe('string');
      expect(typeof ev.payload).toBe('object');
    }
  });

  // ─── Test 7: sprintId/taskId extracted from payload ────────────────────────
  it('should extract sprintId and taskId from payload', () => {
    observer.start();

    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    const busCallback = mockEventBus.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'event',
    )![1] as (payload: Record<string, unknown>) => void;

    // With sprintId and taskId
    busCallback({ type: 'TASK_DONE', sprintId: 'sprint-147', taskId: '147-004' });
    expect(events[0].sprintId).toBe('sprint-147');
    expect(events[0].taskId).toBe('147-004');

    // Without sprintId/taskId
    busCallback({ type: 'GENERIC' });
    expect(events[1].sprintId).toBeUndefined();
    expect(events[1].taskId).toBeUndefined();

    // Non-string sprintId → undefined
    busCallback({ type: 'NUMERIC', sprintId: 42, taskId: true });
    expect(events[2].sprintId).toBeUndefined();
    expect(events[2].taskId).toBeUndefined();
  });

  // ─── Test 8: Multiple start() calls idempotent ────────────────────────────
  it('should be idempotent — multiple start() calls do not duplicate subscriptions', () => {
    observer.start();
    observer.start();
    observer.start();

    // eventBus.on should only be called once
    const eventCalls = mockEventBus.on.mock.calls.filter(
      (call: unknown[]) => call[0] === 'event',
    );
    expect(eventCalls).toHaveLength(1);

    // FS watchers: only 4 (not 12)
    expect(mockWatcherInstances).toHaveLength(4);
  });

  // ─── Test 9: FS watcher error (missing dir) → continue ────────────────────
  it('should continue when FS watch target does not exist', () => {
    // Make first 2 watch calls throw, last 2 succeed
    let callIndex = 0;
    vi.mocked(watch).mockImplementation((_path: unknown, _options: unknown, callback: unknown) => {
      callIndex++;
      if (callIndex <= 2) {
        throw new Error('ENOENT: no such file or directory');
      }
      const watcher = {
        close: vi.fn(),
        callback: callback as (eventType: string, filename: string | null) => void,
        on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), removeAllListeners: vi.fn(),
        addListener: vi.fn(), emit: vi.fn(), listeners: vi.fn(() => []),
        ref: vi.fn(), unref: vi.fn(),
      };
      mockWatcherInstances.push({ close: watcher.close, callback: watcher.callback });
      return watcher as unknown as ReturnType<typeof watch>;
    });

    // Should not throw
    expect(() => observer.start()).not.toThrow();
    expect(observer.isStarted).toBe(true);

    // Only 2 watchers created (last 2 targets succeeded)
    expect(mockWatcherInstances).toHaveLength(2);

    // Observer still works — cron events still fire
    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));
    vi.advanceTimersByTime(60);
    expect(events.some(e => e.source === 'cron')).toBe(true);
  });

  // ─── Test 10: stop() removes eventBus subscription ─────────────────────────
  it('should not receive events after stop()', () => {
    observer.start();

    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    // Capture bus callback before stop
    const busCallback = mockEventBus.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'event',
    )![1] as (payload: Record<string, unknown>) => void;

    // Verify it works before stop
    busCallback({ type: 'BEFORE_STOP' });
    expect(events).toHaveLength(1);

    observer.stop();

    // eventBus.off should have been called
    expect(mockEventBus.off).toHaveBeenCalledWith('event', busCallback);

    // Cron timer cleared — advancing time produces no new events
    const countBefore = events.length;
    vi.advanceTimersByTime(200);
    expect(events.length).toBe(countBefore);
  });

  // ─── Bonus: Sprint lifecycle events get correct source ─────────────────────
  it('should tag sprint lifecycle events with source=sprint-lifecycle', () => {
    observer.start();

    const events: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => events.push(ev));

    const busCallback = mockEventBus.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'event',
    )![1] as (payload: Record<string, unknown>) => void;

    // Sprint lifecycle event types
    busCallback({ type: 'SPRINT_PHASE_CHANGE', sprintId: 'sprint-147' });
    busCallback({ type: 'SPRINT_STARTED', sprintId: 'sprint-147' });
    busCallback({ type: 'SPRINT_COMPLETED', sprintId: 'sprint-147' });
    busCallback({ type: 'SPRINT_RETRO_COMPLETE', sprintId: 'sprint-147' });

    // All should have sprint-lifecycle source
    expect(events).toHaveLength(4);
    for (const ev of events) {
      expect(ev.source).toBe('sprint-lifecycle');
    }

    // Non-lifecycle event should be event-bus
    busCallback({ type: 'WORKER_HEARTBEAT' });
    expect(events[4].source).toBe('event-bus');
  });
});
