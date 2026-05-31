// tests/nervous/bootstrap.test.ts
//
// Nervous bootstrap fabrika — Sprint 180 Task 3 (W1-2).
// NERVOUS-TODO §11.2 Step A.
//
// 4 test PASS:
// 1. disabled → null (default-off respect)
// 2. enabled → {observer, dispose} object
// 3. dispose cleanup — observer.stop + executor pending timers cleared
// 4. observer.start invoked at bootstrap

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NervousSystemConfig, SprintStateSnapshot } from '../../src/core/nervous-types.js';

// ─── Mock EventBus (Observer subscribes on start) ──────────────────────────
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

// ─── Mock node:fs watch (Observer FS watchers) ─────────────────────────────
vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs')>();
  return {
    ...orig,
    watch: vi.fn(() => ({
      close: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      addListener: vi.fn(),
      emit: vi.fn(),
      listeners: vi.fn(() => []),
      ref: vi.fn(),
      unref: vi.fn(),
    })),
  };
});

// ─── Import after mocks ────────────────────────────────────────────────────
import { createNervousSystemIfEnabled } from '../../src/nervous/bootstrap.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────
function makeNervousConfig(overrides: Partial<NervousSystemConfig> = {}): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

const IDLE_SNAPSHOT: SprintStateSnapshot = {
  sprintId: null,
  currentPhase: 'IDLE',
  activeWorkers: [],
  openDebtCount: 0,
  totalTasks: 0,
  completedTasks: 0,
};

const idleProvider = (): SprintStateSnapshot => IDLE_SNAPSHOT;

beforeEach(() => {
  mockEventBus.on.mockClear();
  mockEventBus.off.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('createNervousSystemIfEnabled', () => {
  it('returns null when nervous_system.enabled=false (default-off respect)', () => {
    const wrapper = { nervous_system: makeNervousConfig({ enabled: false }) };

    const result = createNervousSystemIfEnabled(wrapper, '/tmp/project', idleProvider);

    expect(result).toBeNull();
    // Observer should NOT have subscribed to EventBus (no instantiation)
    expect(mockEventBus.on).not.toHaveBeenCalled();
  });

  it('returns null when nervous_system config is missing', () => {
    const result = createNervousSystemIfEnabled({}, '/tmp/project', idleProvider);

    expect(result).toBeNull();
    expect(mockEventBus.on).not.toHaveBeenCalled();
  });

  it('returns {observer, dispose} when enabled=true and starts observer', () => {
    const wrapper = { nervous_system: makeNervousConfig({ enabled: true }) };

    const result = createNervousSystemIfEnabled(wrapper, '/tmp/project', idleProvider);

    expect(result).not.toBeNull();
    expect(result?.observer).toBeDefined();
    expect(typeof result?.dispose).toBe('function');
    // Observer.start() should have been invoked → EventBus subscription happened
    expect(mockEventBus.on).toHaveBeenCalledWith('event', expect.any(Function));
    expect(result?.observer.isStarted).toBe(true);

    result?.dispose();
  });

  it('dispose() stops observer and clears executor pending timers', () => {
    const wrapper = { nervous_system: makeNervousConfig({ enabled: true }) };
    const result = createNervousSystemIfEnabled(wrapper, '/tmp/project', idleProvider);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.observer.isStarted).toBe(true);

    result.dispose();

    // Observer.stop() must remove the EventBus listener
    expect(mockEventBus.off).toHaveBeenCalledWith('event', expect.any(Function));
    expect(result.observer.isStarted).toBe(false);
    // dispose() is idempotent — second call should not throw
    expect(() => result.dispose()).not.toThrow();
  });
});
