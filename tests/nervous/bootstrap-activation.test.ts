// tests/nervous/bootstrap-activation.test.ts
//
// Task 220-012 — Nervous bootstrap + config enable (dormant→aktif).
// Hermetic mock-only — gerçek observer FS watch ETME, gerçek EventBus YOK.
//
// ≥4 test (sprint plan): enabled→observer kurulur, disabled→null, dispose temizler,
// pipeline wire. Bonus: actionHandler injection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  NervousSystemConfig,
  SprintStateSnapshot,
  DetectorResult,
  ObserverEvent,
} from '../../src/core/nervous-types.js';

// ─── Hoisted spies (vi.mock factories evaluate before top-level imports) ───
const {
  mockEventBus,
  decisionEngineSpies,
  proposerSpies,
  dispatcherSpies,
  executorSpies,
  historySpies,
} = vi.hoisted(() => ({
  mockEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  decisionEngineSpies: {
    decide: vi.fn(),
    ctorArgs: [] as unknown[][],
  },
  proposerSpies: {
    propose: vi.fn(),
    ctorArgs: [] as unknown[][],
  },
  dispatcherSpies: {
    dispatch: vi.fn(),
    ctorArgs: [] as unknown[][],
  },
  executorSpies: {
    handle: vi.fn(),
    shutdown: vi.fn(),
    ctorArgs: [] as unknown[][],
    actionHandlerArg: undefined as unknown,
  },
  historySpies: {
    append: vi.fn(),
    ctorArgs: [] as unknown[][],
  },
}));

// ─── Mock EventBus ─────────────────────────────────────────────────────────
vi.mock('../../src/orchestra/event-bus.js', () => ({
  eventBus: mockEventBus,
}));

// ─── Mock node:fs watch (hermetic — no real FS watcher) ────────────────────
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

// ─── Mock pipeline modules (assert that bootstrap wires them together) ─────
vi.mock('../../src/nervous/decision-engine.js', () => ({
  DecisionEngine: vi.fn().mockImplementation((cfg: unknown) => {
    decisionEngineSpies.ctorArgs.push([cfg]);
    return { decide: decisionEngineSpies.decide };
  }),
}));

vi.mock('../../src/nervous/proposer.js', () => ({
  Proposer: vi.fn().mockImplementation((cfg: unknown) => {
    proposerSpies.ctorArgs.push([cfg]);
    return { propose: proposerSpies.propose };
  }),
}));

vi.mock('../../src/nervous/dispatcher.js', () => ({
  NervousDispatcher: vi.fn().mockImplementation((cfg: unknown, root: unknown) => {
    dispatcherSpies.ctorArgs.push([cfg, root]);
    return { dispatch: dispatcherSpies.dispatch };
  }),
}));

vi.mock('../../src/nervous/executor.js', () => ({
  Executor: vi.fn().mockImplementation((history: unknown, actionHandler: unknown) => {
    executorSpies.ctorArgs.push([history, actionHandler]);
    executorSpies.actionHandlerArg = actionHandler;
    return {
      handle: executorSpies.handle,
      shutdown: executorSpies.shutdown,
    };
  }),
}));

vi.mock('../../src/nervous/history.js', () => ({
  NervousHistory: vi.fn().mockImplementation((root: unknown) => {
    historySpies.ctorArgs.push([root]);
    return { append: historySpies.append };
  }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────
import { createNervousSystemIfEnabled } from '../../src/nervous/bootstrap.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────
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

function makeDetectorResult(): DetectorResult {
  return {
    risk: 'low',
    suggestedActions: [{ id: 'ORPHAN_TASK_ARCHIVE', label: 'archive', risk: 'low' }],
    shouldNotify: true,
    severity: 'warning',
    metadata: { detectorId: 'orphan-task', title: 'orphan', message: 'orphan detected' },
  };
}

function makeObserverEvent(): ObserverEvent {
  return {
    id: 'evt-1',
    source: 'cron',
    type: 'CRON_TICK',
    timestamp: new Date().toISOString(),
    payload: {},
    sprintId: 'sprint-220',
    taskId: 'task-220-012',
  };
}

beforeEach(() => {
  mockEventBus.on.mockClear();
  mockEventBus.off.mockClear();
  decisionEngineSpies.decide.mockReset();
  proposerSpies.propose.mockReset();
  dispatcherSpies.dispatch.mockReset();
  executorSpies.handle.mockReset();
  executorSpies.shutdown.mockReset();
  historySpies.append.mockReset();
  decisionEngineSpies.ctorArgs.length = 0;
  proposerSpies.ctorArgs.length = 0;
  dispatcherSpies.ctorArgs.length = 0;
  executorSpies.ctorArgs.length = 0;
  historySpies.ctorArgs.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('createNervousSystemIfEnabled — activation contract', () => {
  it('enabled=true → observer kurulur (NervousObserver + start + pipeline ctors)', () => {
    const wrapper = { nervous_system: makeNervousConfig({ enabled: true }) };

    const handle = createNervousSystemIfEnabled(wrapper, '/tmp/p', idleProvider);

    expect(handle).not.toBeNull();
    expect(handle?.observer).toBeDefined();
    expect(typeof handle?.dispose).toBe('function');
    // observer.start() subscribes to EventBus
    expect(mockEventBus.on).toHaveBeenCalledWith('event', expect.any(Function));
    expect(handle?.observer.isStarted).toBe(true);
    // Pipeline modules instantiated (config propagated)
    expect(decisionEngineSpies.ctorArgs.length).toBe(1);
    expect(proposerSpies.ctorArgs.length).toBe(1);
    expect(dispatcherSpies.ctorArgs.length).toBe(1);
    expect(executorSpies.ctorArgs.length).toBe(1);
    expect(historySpies.ctorArgs.length).toBe(1);

    handle?.dispose();
  });

  it('disabled (enabled=false OR missing) → null (default-off respect, ADR-040 opt-in)', () => {
    const explicitFalse = createNervousSystemIfEnabled(
      { nervous_system: makeNervousConfig({ enabled: false }) },
      '/tmp/p',
      idleProvider,
    );
    expect(explicitFalse).toBeNull();

    const missingConfig = createNervousSystemIfEnabled({}, '/tmp/p', idleProvider);
    expect(missingConfig).toBeNull();

    // Observer not instantiated → no EventBus subscription, no pipeline ctors
    expect(mockEventBus.on).not.toHaveBeenCalled();
    expect(decisionEngineSpies.ctorArgs.length).toBe(0);
    expect(executorSpies.ctorArgs.length).toBe(0);
  });

  it('dispose() temizler — observer.stop + executor.shutdown + idempotent', () => {
    const handle = createNervousSystemIfEnabled(
      { nervous_system: makeNervousConfig({ enabled: true }) },
      '/tmp/p',
      idleProvider,
    );
    expect(handle).not.toBeNull();
    if (!handle) return;

    expect(handle.observer.isStarted).toBe(true);

    handle.dispose();

    expect(mockEventBus.off).toHaveBeenCalledWith('event', expect.any(Function));
    expect(handle.observer.isStarted).toBe(false);
    expect(executorSpies.shutdown).toHaveBeenCalledTimes(1);

    // idempotent — second dispose does not throw nor double-shutdown
    expect(() => handle.dispose()).not.toThrow();
    expect(executorSpies.shutdown).toHaveBeenCalledTimes(1);
  });

  it('pipeline wire — detection event triggers decide → propose → dispatch + handle', async () => {
    const handle = createNervousSystemIfEnabled(
      { nervous_system: makeNervousConfig({ enabled: true }) },
      '/tmp/p',
      idleProvider,
    );
    expect(handle).not.toBeNull();
    if (!handle) return;

    // Spy chain returns deterministic non-empty results so each stage triggers the next
    const decisions = [{ action: { id: 'X' }, policy: 'autonomous', risk: 'low', isSafetyFloor: false, reason: 'r' }];
    const notification = { id: 'n-1', actions: [], type: 't', title: 'a', message: 'b', severity: 'info', createdAt: '', detectorId: 'd', timeoutMs: null };
    decisionEngineSpies.decide.mockReturnValue(decisions);
    proposerSpies.propose.mockReturnValue(notification);
    dispatcherSpies.dispatch.mockResolvedValue([]);
    executorSpies.handle.mockResolvedValue([]);

    // Drive a synthetic 'detection' event — bootstrap.ts registered listener
    handle.observer.emit('detection', makeDetectorResult(), makeObserverEvent());

    // runPipeline is async (void Promise) — flush microtasks
    await new Promise((r) => setImmediate(r));

    expect(decisionEngineSpies.decide).toHaveBeenCalledTimes(1);
    expect(proposerSpies.propose).toHaveBeenCalledTimes(1);
    expect(dispatcherSpies.dispatch).toHaveBeenCalledWith(notification);
    expect(executorSpies.handle).toHaveBeenCalledWith(notification);

    handle.dispose();
  });

  it('custom actionHandler is forwarded to Executor (W2-1 injection point)', () => {
    const customHandler = vi.fn().mockResolvedValue({ outcome: 'success' });

    const handle = createNervousSystemIfEnabled(
      { nervous_system: makeNervousConfig({ enabled: true }) },
      '/tmp/p',
      idleProvider,
      customHandler,
    );

    expect(handle).not.toBeNull();
    expect(executorSpies.ctorArgs.length).toBe(1);
    // Executor constructor receives (history, actionHandler) — actionHandler must be customHandler
    expect(executorSpies.actionHandlerArg).toBe(customHandler);

    handle?.dispose();
  });
});
