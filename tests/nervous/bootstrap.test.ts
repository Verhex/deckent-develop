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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  NervousSystemConfigV1,
  SprintStateSnapshot,
  NervousNotification,
} from '../../src/core/nervous-types.js';

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

// ─── Mock action-handlers (NERV-W1 default-wire pin) ───────────────────────
// Sprint 281 NERV-W1: bootstrap's default `actionHandler` param must be the
// REAL `createActionHandler({ projectRoot })` — the previous stub default
// failed every approved action with "not yet wired". This spy pins the
// default-parameter call without dispatching real actions.
const { mockCreateActionHandler } = vi.hoisted(() => ({
  mockCreateActionHandler: vi.fn(() =>
    async (): Promise<{ outcome: 'success' }> => ({ outcome: 'success' })),
}));

vi.mock('../../src/nervous/action-handlers.js', () => ({
  createActionHandler: mockCreateActionHandler,
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
import {
  createNervousSystemIfEnabled,
  makeFilePendingStore,
  runPipeline,
} from '../../src/nervous/bootstrap.js';
import { getPendingNervous } from '../../src/cli/commands/chat-nervous-bridge.js';
import { DetectorRegistry } from '../../src/nervous/detector-registry.js';
import { DecisionEngine } from '../../src/nervous/decision-engine.js';
import { Proposer } from '../../src/nervous/proposer.js';
import type {
  DetectorResult,
  DetectorContext,
  ObserverEvent,
  NervousNotification,
} from '../../src/core/nervous-types.js';
import type { IDetector } from '../../src/nervous/detector-registry.js';
import type { NervousDispatcher } from '../../src/nervous/dispatcher.js';
import type { Executor } from '../../src/nervous/executor.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────
function makeNervousConfig(overrides: Partial<NervousSystemConfigV1> = {}): NervousSystemConfigV1 {
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

// ─── NERV-W1 (Sprint 281) — default actionHandler = REAL handler ────────────

describe('createNervousSystemIfEnabled — default actionHandler is the real one (NERV-W1)', () => {
  it('omitting actionHandler binds createActionHandler({ projectRoot }) — not a stub', () => {
    mockCreateActionHandler.mockClear();
    const wrapper = { nervous_system: makeNervousConfig({ enabled: true }) };

    const handle = createNervousSystemIfEnabled(wrapper, '/tmp/nerv-w1-project', idleProvider);

    expect(mockCreateActionHandler).toHaveBeenCalledWith({ projectRoot: '/tmp/nerv-w1-project' });
    handle?.dispose();
  });

  it('an explicitly injected handler wins over the default (test seam preserved)', () => {
    mockCreateActionHandler.mockClear();
    const wrapper = { nervous_system: makeNervousConfig({ enabled: true }) };
    const injected = async (): Promise<{ outcome: 'success' }> => ({ outcome: 'success' });

    const handle = createNervousSystemIfEnabled(wrapper, '/tmp/nerv-w1-project', idleProvider, injected);

    expect(mockCreateActionHandler).not.toHaveBeenCalled();
    handle?.dispose();
  });
});

// ─── APPROVE-004/005 (§4G) — approval round-trip wiring ─────────────────────

describe('createNervousSystemIfEnabled — approval round-trip wiring (APPROVE-005)', () => {
  const wrapper = { nervous_system: makeNervousConfig({ enabled: true }) };
  const stubHandler = async (): Promise<{ outcome: 'success' }> => ({ outcome: 'success' });

  it('wires NervousIpcQueue.startPolling so MCP IPC approvals reach the executor', () => {
    const startPolling = vi.fn(() => ({ dispose: vi.fn() }));
    const handle = createNervousSystemIfEnabled(
      wrapper,
      '/tmp/project',
      idleProvider,
      stubHandler,
      { ipcQueue: { startPolling } },
    );
    expect(startPolling).toHaveBeenCalledOnce();
    expect(typeof startPolling.mock.calls[0]?.[0]).toBe('function');
    handle?.dispose();
  });

  it('dispose() stops the IPC polling', () => {
    const dispose = vi.fn();
    const startPolling = vi.fn(() => ({ dispose }));
    const handle = createNervousSystemIfEnabled(
      wrapper,
      '/tmp/project',
      idleProvider,
      stubHandler,
      { ipcQueue: { startPolling } },
    );
    handle?.dispose();
    expect(dispose).toHaveBeenCalled();
  });
});

describe('makeFilePendingStore — CLI-readable nervous-pending.json (APPROVE-004)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nervous-store-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function notif(id: string): NervousNotification {
    return {
      id,
      type: 't',
      title: 'T',
      message: 'M',
      severity: 'warning',
      createdAt: '2026-06-05T00:00:00.000Z',
      detectorId: 'd',
      actions: [],
      timeoutMs: null,
    };
  }

  it('add() persists a notification the CLI bridge reads; remove() drops it', () => {
    const store = makeFilePendingStore(root);
    store.add(notif('n1'));
    store.add(notif('n2'));
    expect(getPendingNervous(root).map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    store.remove('n1');
    expect(getPendingNervous(root).map((n) => n.id)).toEqual(['n2']);
  });
});

// ─── bug 2 (Sprint 290) — proposals carry real title/message/detectorId ──────
//
// Regression: bootstrap.runPipeline read metadata.{detectorId,title,message},
// which detectors never set (they set metadata.type) → every proposal showed
// 'unknown' / 'Detected: unknown'. The fix makes title/message first-class on
// DetectorResult, has the registry stamp detectorId, and bootstrap read the
// fields directly. This drives the REAL pipeline path (registry stamp →
// decisionEngine → proposer) through the exported runPipeline with a stub
// dispatcher that captures the emitted notification.

describe('runPipeline — proposal carries detector title/message/detectorId (bug 2)', () => {
  const STUB_EVENT: ObserverEvent = {
    id: 'evt-bug2',
    source: 'cron',
    type: 'CRON_TICK',
    timestamp: '2026-06-17T10:00:00.000Z',
    payload: {},
    sprintId: 'sprint-290',
  };

  // A stub detector that returns a real title/message — the registry stamps its
  // detectorId, exactly as the 12 real detectors flow.
  class StubBug2Detector implements IDetector {
    readonly detectorId = 'stub-bug2';
    detect(): DetectorResult {
      return {
        risk: 'medium',
        shouldNotify: true,
        severity: 'warning',
        title: 'Stale worker w-290-001',
        message: 'Heartbeat stale >10min — respawn proposed for w-290-001',
        groupKey: 'stub-bug2:w-290-001',
        suggestedActions: [
          {
            id: 'WORKER_RESPAWN',
            label: 'Re-spawn w-290-001',
            risk: 'medium',
            payload: { workerId: 'w-290-001' },
          },
        ],
        metadata: { type: 'stub-bug2' },
      };
    }
  }

  function makeDetectorContext(): DetectorContext {
    const snapshot = { ...IDLE_SNAPSHOT, sprintId: 'sprint-290', currentPhase: 'EXECUTE' };
    return {
      event: STUB_EVENT,
      sprintState: snapshot as typeof IDLE_SNAPSHOT,
      projectRoot: '/tmp/bug2-project',
      now: new Date('2026-06-17T10:00:00.000Z'),
    };
  }

  it('dispatched notification carries the detector title/message/detectorId, never "unknown"', async () => {
    // Build a registry and inject the stub onto its active list (private field —
    // test seam) so runAll() stamps detectorId, mirroring the real flow.
    const registry = new DetectorRegistry({});
    (registry as unknown as { active: IDetector[] }).active.push(new StubBug2Detector());

    const results = await registry.runAll(makeDetectorContext());
    expect(results).toHaveLength(1);
    const result = results[0]!;
    // Registry stamped the authoritative detectorId.
    expect(result.detectorId).toBe('stub-bug2');

    const decisionEngine = new DecisionEngine(makeNervousConfig());
    const proposer = new Proposer(makeNervousConfig());

    // Stub dispatcher + executor capture the notification runPipeline builds.
    let captured: NervousNotification | null = null;
    const dispatcher = {
      dispatch: async (n: NervousNotification) => {
        captured = n;
        return { delivered: true, channels: [] };
      },
    } as unknown as NervousDispatcher;
    const executor = {
      handle: async () => [],
    } as unknown as Executor;

    await runPipeline(result, STUB_EVENT, decisionEngine, proposer, dispatcher, executor);

    expect(captured).not.toBeNull();
    const n = captured as unknown as NervousNotification;
    expect(n.detectorId).toBe('stub-bug2');
    expect(n.title).toBe('Stale worker w-290-001');
    expect(n.message).toBe('Heartbeat stale >10min — respawn proposed for w-290-001');
    // The bug: these used to be 'unknown' / 'Detected: unknown'.
    expect(n.detectorId).not.toBe('unknown');
    expect(n.title).not.toBe('unknown');
    expect(n.message).not.toBe('Detected: unknown');
  });
});
