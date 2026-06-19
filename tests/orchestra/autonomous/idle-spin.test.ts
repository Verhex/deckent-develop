// tests/orchestra/autonomous/idle-spin.test.ts
// Regression guard for the idle-tick sleep semantics in runAutonomousLoop.
//
// Sprint-302 update: threshold-backoff (IDLE_BACKOFF_THRESHOLD=3) was removed in
// favour of immediate-intervalMs for ALL non-active outcomes (no_trigger, pending,
// denied, rejected, failed). Active outcomes (executed, dispatched) still sleep 0
// to re-tick immediately. This prevents the ~57456-cycle busy-spin observed when
// entries are stuck awaiting approval or authority without any additional delay.
//
// Hermetic: injectable sleep + cycle mock; no I/O, no real backlog.
import { describe, it, expect, vi } from 'vitest';
import {
  runAutonomousLoop,
  type RunAutonomousLoopOptions,
} from '../../../src/orchestra/autonomous/runtime-loop.js';
import type { AutonomousRuntimeDeps } from '../../../src/orchestra/autonomous-runtime.js';

// Minimal deps that produce 'no_trigger' every cycle (empty backlog scenario).
function makeIdleDeps(): AutonomousRuntimeDeps {
  return {
    triggerSource: {
      next: vi.fn().mockResolvedValue(null),
    },
    authority: {
      check: vi.fn().mockReturnValue({ outcome: 'allowed', reason: 'test' }),
    },
    approvalGate: {
      request: vi.fn().mockResolvedValue({ outcome: 'approved', reason: '' }),
      pending: vi.fn().mockReturnValue([]),
      accept: vi.fn(),
      reject: vi.fn(),
      takeResolved: vi.fn().mockReturnValue(null),
    },
    executor: {
      execute: vi.fn().mockResolvedValue({ ok: true }),
    },
    audit: {
      record: vi.fn(),
    },
  };
}

const INTERVAL_MS = 500;

describe('runAutonomousLoop — idle sleep guard (immediate intervalMs, no threshold)', () => {
  it('non-active outcome (no_trigger) sleeps intervalMs immediately — no threshold window', async () => {
    const sleepCalls: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const deps = makeIdleDeps();
    const opts: RunAutonomousLoopOptions = {
      intervalMs: INTERVAL_MS,
      maxIterations: 3,
      sleep,
    };

    await runAutonomousLoop({}, deps, opts);

    // All 3 idle ticks → immediate intervalMs (no 0-sleep warmup period).
    expect(sleepCalls).toHaveLength(3);
    expect(sleepCalls.every((ms) => ms === INTERVAL_MS)).toBe(true);
  });

  it('all idle ticks sleep intervalMs regardless of count (no backoff window)', async () => {
    const sleepCalls: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const deps = makeIdleDeps();
    const opts: RunAutonomousLoopOptions = {
      intervalMs: INTERVAL_MS,
      maxIterations: 6,
      sleep,
    };

    await runAutonomousLoop({}, deps, opts);

    expect(sleepCalls).toHaveLength(6);
    // Every idle tick sleeps intervalMs immediately.
    expect(sleepCalls.every((ms) => ms === INTERVAL_MS)).toBe(true);
  });

  it('active work sleeps 0, then idle ticks sleep intervalMs immediately', async () => {
    const sleepCalls: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    // Cycle 1: active (executed), cycles 2-5: idle (no_trigger)
    const deps = makeIdleDeps();
    deps.triggerSource.next = vi.fn()
      .mockResolvedValueOnce({
        id: 't1', source: 'test', action: 'test-action', requestedBy: 'system',
      })
      .mockResolvedValue(null);
    // Make authority allow and executor succeed
    (deps.executor.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const opts: RunAutonomousLoopOptions = {
      intervalMs: INTERVAL_MS,
      maxIterations: 5,
      sleep,
    };

    await runAutonomousLoop({}, deps, opts);

    // Cycle 1: executed → sleep 0 (active, re-tick immediately)
    expect(sleepCalls[0]).toBe(0);
    // Cycles 2-5: idle → sleep intervalMs immediately (no threshold window)
    expect(sleepCalls[1]).toBe(INTERVAL_MS);
    expect(sleepCalls[2]).toBe(INTERVAL_MS);
    expect(sleepCalls[3]).toBe(INTERVAL_MS);
    expect(sleepCalls[4]).toBe(INTERVAL_MS);
    expect(sleepCalls).toHaveLength(5);
  });

  it('returns maxIterations reason after running all ticks', async () => {
    const deps = makeIdleDeps();
    const opts: RunAutonomousLoopOptions = {
      intervalMs: INTERVAL_MS,
      maxIterations: 3,
      sleep: () => Promise.resolve(),
    };

    const summary = await runAutonomousLoop({}, deps, opts);
    expect(summary.reason).toBe('maxIterations');
    expect(summary.iterations).toBe(3);
  });

  it('aborts immediately when signal fires', async () => {
    const deps = makeIdleDeps();
    const ctrl = new AbortController();
    ctrl.abort();

    const opts: RunAutonomousLoopOptions = {
      intervalMs: INTERVAL_MS,
      signal: ctrl.signal,
      sleep: () => Promise.resolve(),
    };

    const summary = await runAutonomousLoop({}, deps, opts);
    expect(summary.reason).toBe('aborted');
    expect(summary.iterations).toBe(0);
  });
});
