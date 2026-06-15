// tests/nervous/observer-phase-guard.test.ts
//
// Sprint 183 W1-1 (P0-1) — NervousObserver phase guard + FSWatcher debounce.
//
// Root cause (Sprint 182 dogfood):
//   `nervous_system.enabled: true` ile PLAN phase 14+dk donuyor. Brain
//   17 task JSON yazıyor → her FS event detector cycle tetikliyor →
//   kombinatoryel overhead (controller %85 CPU, 0 worker spawn).
//
// Fix (two-layer):
//   1. **Phase guard:** detector cycle yalnızca EXECUTE phase'inde aktif.
//   2. **Debounce:** 500ms window içindeki ardışık event'ler tek cycle.
//
// 4 TDD cases — RED → GREEN.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SprintStateSnapshot } from '../../src/core/nervous-types.js';

// ─── Mock EventBus ────────────────────────────────────────────────────────────
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

// ─── Mock node:fs watch ───────────────────────────────────────────────────────
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

// ─── Mock DetectorRegistry (count runAll calls) ──────────────────────────────
const { mockRunAll, MockDetectorRegistryCtor } = vi.hoisted(() => {
  const runAll = vi.fn(async () => []);
  class Ctor {
    runAll = runAll;
    get activeCount(): number {
      return 1;
    }
    get detectorIds(): string[] {
      return ['mock'];
    }
  }
  return { mockRunAll: runAll, MockDetectorRegistryCtor: Ctor };
});

vi.mock('../../src/nervous/detector-registry.js', () => ({
  DetectorRegistry: MockDetectorRegistryCtor,
}));

// ─── Import after mocks ──────────────────────────────────────────────────────
import { NervousObserver, DETECTOR_DEBOUNCE_WINDOW_MS } from '../../src/nervous/observer.js';
import { watch } from 'node:fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildSnapshot(phase: SprintStateSnapshot['currentPhase']): SprintStateSnapshot {
  return {
    sprintId: 'sprint-183',
    currentPhase: phase,
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 17,
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

describe('NervousObserver — Sprint 183 W1-1 phase guard + debounce', () => {
  let observer: NervousObserver;
  let currentPhase: SprintStateSnapshot['currentPhase'];

  beforeEach(() => {
    vi.useFakeTimers();
    mockWatcherInstances.length = 0;
    mockEventBus.on.mockReset();
    mockEventBus.off.mockReset();
    mockEventBus.emit.mockReset();
    mockRunAll.mockReset();
    mockRunAll.mockResolvedValue([]);
    reinstallFsWatchMock();
    currentPhase = 'EXECUTE';
  });

  afterEach(() => {
    observer?.stop();
    vi.useRealTimers();
  });

  // ─── Case 1: PLAN phase → detector cycle 0 ────────────────────────────────
  it('Case 1 — PLAN phase: detector cycle does NOT run even with 17 FS events', () => {
    currentPhase = 'PLAN';
    observer = new NervousObserver(
      '/test/project',
      60_000,
      { stale_worker: { enabled: true } },
      () => buildSnapshot(currentPhase),
    );

    const observeEvents: unknown[] = [];
    observer.on('observe', (ev) => observeEvents.push(ev));
    observer.start();

    // Simulate Sprint 182 dogfood: 17 task JSON FS events during PLAN
    const tasksWatcher = mockWatcherInstances[0];
    expect(tasksWatcher.callback).toBeDefined();
    for (let i = 0; i < 17; i++) {
      tasksWatcher.callback!('change', `task-183-${String(i).padStart(3, '0')}.json`);
    }

    // Advance well past debounce window
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS * 3);

    // Raw 'observe' events still emitted (observability preserved)
    expect(observeEvents.length).toBe(17);

    // CRITICAL: detector pipeline must NOT run during PLAN phase
    expect(mockRunAll).toHaveBeenCalledTimes(0);
  });

  // ─── Case 2: EXECUTE phase → detector cycle runs ──────────────────────────
  it('Case 2 — EXECUTE phase: detector cycle runs (single FS event → 1 detector call)', () => {
    currentPhase = 'EXECUTE';
    observer = new NervousObserver(
      '/test/project',
      60_000,
      { stale_worker: { enabled: true } },
      () => buildSnapshot(currentPhase),
    );
    observer.start();

    const tasksWatcher = mockWatcherInstances[0];
    tasksWatcher.callback!('change', 'task-183-001.hb');

    // Before debounce window expires: 0 detector calls
    expect(mockRunAll).toHaveBeenCalledTimes(0);

    // After debounce window: 1 detector cycle
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS + 50);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });

  // ─── N1 fix (2026-06-15): autonomous (no-sprint, IDLE) detector firing ──────
  // Standalone `deckent autonomous start` has no hosted sprint → phase is
  // permanently IDLE. With activeInAnyPhase=true the detector pipeline must run
  // anyway (so live detections actually flow); the default (false) preserves the
  // EXECUTE-only sprint guard.
  it('N1 — IDLE phase + activeInAnyPhase=true: detector cycle RUNS (autonomous)', () => {
    currentPhase = 'IDLE';
    observer = new NervousObserver(
      '/test/project',
      60_000,
      { stale_worker: { enabled: true } },
      () => buildSnapshot(currentPhase),
      1,
      true, // activeInAnyPhase — the autonomous bootstrap sets this
    );
    observer.start();

    const tasksWatcher = mockWatcherInstances[0];
    tasksWatcher.callback!('change', 'task-001.hb');
    expect(mockRunAll).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS + 50);
    // CRITICAL: detections flow in IDLE (this is the N1 behavior the old
    // mock-only test never proved).
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });

  it('N1 — IDLE phase + activeInAnyPhase=false (default): detector cycle does NOT run (sprint guard preserved)', () => {
    currentPhase = 'IDLE';
    observer = new NervousObserver(
      '/test/project',
      60_000,
      { stale_worker: { enabled: true } },
      () => buildSnapshot(currentPhase),
      // 5th/6th omitted → idleThrottle=1, activeInAnyPhase=false
    );
    observer.start();

    const tasksWatcher = mockWatcherInstances[0];
    tasksWatcher.callback!('change', 'task-001.hb');
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS * 3);
    expect(mockRunAll).toHaveBeenCalledTimes(0);
  });

  // ─── Case 3: Debounce batch — 17 quick events collapse to 1 cycle ─────────
  it('Case 3 — Debounce batch: 17 FS events within 500ms window → 1 detector cycle', () => {
    currentPhase = 'EXECUTE';
    observer = new NervousObserver(
      '/test/project',
      60_000,
      { stale_worker: { enabled: true } },
      () => buildSnapshot(currentPhase),
    );
    observer.start();

    const tasksWatcher = mockWatcherInstances[0];
    // 17 events in quick succession (10ms apart — all within 500ms window)
    for (let i = 0; i < 17; i++) {
      tasksWatcher.callback!('change', `task-${i}.json`);
      vi.advanceTimersByTime(10);
    }

    // Still inside debounce window from last event
    expect(mockRunAll).toHaveBeenCalledTimes(0);

    // Quiet for full debounce window
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS + 50);

    // CRITICAL: 17 events → 1 detector cycle (not 17)
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });

  // ─── Case 4: IDLE phase → cron tick produces 0 detector cycles ────────────
  it('Case 4 — IDLE phase: cron tick does NOT trigger detector cycle', () => {
    currentPhase = 'IDLE';
    observer = new NervousObserver(
      '/test/project',
      50, // 50ms cron for fast test
      { stale_worker: { enabled: true } },
      () => buildSnapshot(currentPhase),
    );
    observer.start();

    // Multiple cron ticks
    vi.advanceTimersByTime(200);
    // Plus a generous debounce window
    vi.advanceTimersByTime(DETECTOR_DEBOUNCE_WINDOW_MS + 50);

    // IDLE phase: detector pipeline skipped — cron tick should NOT run detectors
    expect(mockRunAll).toHaveBeenCalledTimes(0);
  });
});
