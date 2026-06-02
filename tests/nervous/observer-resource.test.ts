// tests/nervous/observer-resource.test.ts
//
// Sprint 223 T8 — Nervous resource-optimization tests.
//
// Validates three observer cost knobs introduced for weak-system support:
//   (a) scan-interval — cron tick honours the constructor `cronIntervalMs`
//   (b) lazy-detector — empty DetectorConfig means no detector cycle work
//       even after debounce, and configured detectors DO run in EXECUTE
//   (c) idle-throttle — when phase=IDLE and multiplier>1, next cron tick
//       is delayed by `cronIntervalMs * multiplier` instead of the base
//
// Hermetic: vi.useFakeTimers + mocked eventBus + mocked node:fs.
// No real spawn, no real FS, no project state read.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ObserverEvent, SprintStateSnapshot } from '../../src/core/nervous-types.js';

// ─── Mock EventBus ──────────────────────────────────────────────────────────
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
  mockWatcherInstances: [] as Array<{
    close: ReturnType<typeof import('vitest')['vi']['fn']>;
    callback: ((eventType: string, filename: string | null) => void) | null;
  }>,
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

// ─── Mock DetectorRegistry — count instantiations + runAll calls ───────────
// Lazy-detector verification leans on instantiation count: an empty config
// must not create the registry (observer skips construction entirely).
const { mockRunAll, mockRegistryCtor, registryCtorCalls } = vi.hoisted(() => {
  const runAll = vi.fn(async () => []);
  const calls: Array<unknown> = [];
  class Ctor {
    constructor(cfg: unknown) {
      calls.push(cfg);
    }
    runAll = runAll;
    get activeCount(): number {
      return 1;
    }
    get detectorIds(): string[] {
      return ['mock'];
    }
  }
  return { mockRunAll: runAll, mockRegistryCtor: Ctor, registryCtorCalls: calls };
});

vi.mock('../../src/nervous/detector-registry.js', () => ({
  DetectorRegistry: mockRegistryCtor,
}));

// ─── Import after mocks ─────────────────────────────────────────────────────
import { NervousObserver, DETECTOR_DEBOUNCE_WINDOW_MS } from '../../src/nervous/observer.js';
import { watch } from 'node:fs';

// ─── Helpers ────────────────────────────────────────────────────────────────
function snapshot(phase: SprintStateSnapshot['currentPhase']): SprintStateSnapshot {
  return {
    sprintId: phase === 'IDLE' ? null : 'sprint-223',
    currentPhase: phase,
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 0,
    completedTasks: 0,
  };
}

function reinstallFsWatchMock(): void {
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
}

describe('NervousObserver — Sprint 223 T8 resource optimization', () => {
  let observer: NervousObserver | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWatcherInstances.length = 0;
    registryCtorCalls.length = 0;
    mockEventBus.on.mockReset();
    mockEventBus.off.mockReset();
    mockEventBus.emit.mockReset();
    mockRunAll.mockReset();
    mockRunAll.mockResolvedValue([]);
    reinstallFsWatchMock();
  });

  afterEach(() => {
    observer?.stop();
    observer = undefined;
    vi.useRealTimers();
  });

  // ─── Case 1: scan-interval config respected ──────────────────────────────
  // The cron tick MUST fire at the configured `cronIntervalMs` cadence. This
  // proves observer scan frequency is operator-tunable from config rather
  // than hard-coded — a prerequisite for "weak-system" deployments where
  // a 60s interval is healthier than the previous 15s default.
  it('Case 1 — scan-interval honours configured cronIntervalMs', () => {
    const SCAN_INTERVAL = 200;
    observer = new NervousObserver(
      '/test/project',
      SCAN_INTERVAL,
      undefined,
      () => snapshot('EXECUTE'),
      1, // no idle throttle
    );

    const cronEvents: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => {
      if (ev.source === 'cron') cronEvents.push(ev);
    });
    observer.start();

    // Just under one interval → 0 ticks
    vi.advanceTimersByTime(SCAN_INTERVAL - 1);
    expect(cronEvents.length).toBe(0);

    // One full interval → exactly 1 tick (with the configured intervalMs)
    vi.advanceTimersByTime(2);
    expect(cronEvents.length).toBe(1);
    expect(cronEvents[0].payload.intervalMs).toBe(SCAN_INTERVAL);

    // Two more intervals → 2 more ticks (recursive setTimeout cadence)
    vi.advanceTimersByTime(SCAN_INTERVAL * 2 + 10);
    expect(cronEvents.length).toBe(3);
  });

  // ─── Case 2: idle-throttle multiplies cron interval in IDLE phase ─────────
  // With multiplier=4 and base interval=50ms, an IDLE-phase observer must
  // wait 200ms (50 × 4) for the next tick. Advancing by the base interval
  // alone must NOT produce a second tick — proof that the throttle takes
  // effect, dropping observer overhead on quiescent projects.
  it('Case 2 — idle-throttle: IDLE phase multiplies cron interval', () => {
    const BASE = 50;
    const MULTIPLIER = 4;
    observer = new NervousObserver(
      '/test/project',
      BASE,
      undefined,
      () => snapshot('IDLE'),
      MULTIPLIER,
    );

    const cronEvents: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => {
      if (ev.source === 'cron') cronEvents.push(ev);
    });
    observer.start();

    // First tick still fires after BASE ms (observer starts with the base
    // delay; throttle applies to SUBSEQUENT ticks based on current phase).
    vi.advanceTimersByTime(BASE + 5);
    expect(cronEvents.length).toBe(1);

    // After the first tick, next delay must be BASE × MULTIPLIER because
    // phase is IDLE. Advancing only BASE ms must NOT trigger a 2nd tick.
    vi.advanceTimersByTime(BASE + 5);
    expect(cronEvents.length).toBe(1);

    // Advance past the full throttled window → 2nd tick fires.
    vi.advanceTimersByTime(BASE * MULTIPLIER);
    expect(cronEvents.length).toBe(2);
    // The 2nd tick reports the throttled interval (BASE × MULTIPLIER).
    expect(cronEvents[1].payload.intervalMs).toBe(BASE * MULTIPLIER);
  });

  // ─── Case 3: lazy-detector — empty config skips registry instantiation ────
  // No DetectorConfig argument means observer must NOT construct a
  // DetectorRegistry at all (zero cost). FS events still emit raw 'observe'
  // for observability, but detector pipeline never runs — even after the
  // debounce window expires. Proves the "lazy" path saves construction +
  // runtime overhead when no detectors are configured.
  it('Case 3 — lazy-detector: no DetectorConfig → registry not constructed, runAll never called', () => {
    observer = new NervousObserver(
      '/test/project',
      60_000,
      // No detectorConfig — observer should skip registry creation.
      undefined,
      () => snapshot('EXECUTE'),
      1,
    );

    const observeEvents: ObserverEvent[] = [];
    observer.on('observe', (ev: ObserverEvent) => observeEvents.push(ev));
    observer.start();

    // Registry constructor must NOT have been called.
    expect(registryCtorCalls.length).toBe(0);

    // Fire FS events to prove observer still works (observability preserved)
    // but detector dispatch is fully skipped.
    const tasksWatcher = mockWatcherInstances[0];
    expect(tasksWatcher.callback).toBeDefined();
    tasksWatcher.callback!('change', 'task-001.json');
    tasksWatcher.callback!('change', 'task-002.json');

    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS * 3);

    expect(observeEvents.length).toBe(2);
    expect(mockRunAll).toHaveBeenCalledTimes(0);
  });

  // ─── Case 4: active detector runs in EXECUTE phase ────────────────────────
  // When a detector IS configured AND phase is EXECUTE, the debounced
  // detector dispatch must fire — proves the lazy gate is "lazy",
  // not "broken". Without this assertion Case 3 could pass trivially.
  it('Case 4 — active detector runs in EXECUTE phase after debounce', () => {
    observer = new NervousObserver(
      '/test/project',
      60_000,
      { stale_worker: { enabled: true } },
      () => snapshot('EXECUTE'),
      1,
    );

    // Registry MUST be constructed when config is provided.
    expect(registryCtorCalls.length).toBe(1);

    observer.start();

    const tasksWatcher = mockWatcherInstances[0];
    tasksWatcher.callback!('change', 'task-001.hb');

    // Before debounce expires: 0 runs.
    expect(mockRunAll).toHaveBeenCalledTimes(0);

    // After debounce window: exactly 1 detector cycle.
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS + 50);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });
});
