import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowRuntime } from '../../src/core/flow-runtime.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';
import type { DueDispatch } from '../../src/core/flow-scheduler.js';

function makeFlow(overrides: Partial<ScheduledFlow> = {}): ScheduledFlow {
  return {
    id: 'flow-001',
    cronExpr: '* * * * *',
    action: 'deckent:start',
    tenantId: 'tenant-a',
    enabled: true,
    ...overrides,
  };
}

function makeRegistry(flows: ScheduledFlow[] = []): FlowRegistry {
  const registry = {
    listFlows: () => flows,
  } as unknown as FlowRegistry;
  return registry;
}

describe('FlowRuntime.tick', () => {
  it('dispatches due flows when registry has eligible flows', () => {
    const flow = makeFlow();
    const registry = makeRegistry([flow]);
    // Clock returns a time far in the future so the flow is always due
    const clock = () => new Date('2099-01-01T00:05:00.000Z');
    const runtime = new FlowRuntime(registry, { clock });

    const dispatches: DueDispatch[] = [];
    runtime.tick(items => dispatches.push(...items));

    expect(dispatches.length).toBeGreaterThan(0);
    expect(dispatches[0]!.kind).toBe('scheduled');
  });

  it('calls callback with empty array for empty registry', () => {
    const registry = makeRegistry([]);
    const clock = () => new Date('2099-01-01T00:05:00.000Z');
    const runtime = new FlowRuntime(registry, { clock });

    const calls: DueDispatch[][] = [];
    runtime.tick(items => calls.push(items));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(0);
  });

  it('does not dispatch disabled flows', () => {
    const flow = makeFlow({ enabled: false });
    const registry = makeRegistry([flow]);
    const clock = () => new Date('2099-01-01T00:05:00.000Z');
    const runtime = new FlowRuntime(registry, { clock });

    const dispatches: DueDispatch[] = [];
    runtime.tick(items => dispatches.push(...items));

    expect(dispatches).toHaveLength(0);
  });
});

describe('FlowRuntime start/stop', () => {
  it('starts and stops the tick loop', () => {
    const registry = makeRegistry([]);
    let timerId: unknown;
    const setIntervalFn = vi.fn((fn: () => void, ms: number) => {
      timerId = { fn, ms };
      return timerId as ReturnType<typeof setInterval>;
    });
    const clearIntervalFn = vi.fn();

    const runtime = new FlowRuntime(registry, { setIntervalFn, clearIntervalFn });

    expect(runtime.running).toBe(false);
    runtime.start(() => {});
    expect(runtime.running).toBe(true);
    expect(setIntervalFn).toHaveBeenCalledOnce();

    runtime.stop();
    expect(runtime.running).toBe(false);
    expect(clearIntervalFn).toHaveBeenCalledOnce();
  });

  it('start is a no-op when already running', () => {
    const registry = makeRegistry([]);
    const setIntervalFn = vi.fn(() => ({}) as ReturnType<typeof setInterval>);
    const clearIntervalFn = vi.fn();

    const runtime = new FlowRuntime(registry, { setIntervalFn, clearIntervalFn });
    runtime.start(() => {});
    runtime.start(() => {}); // second call should be no-op

    expect(setIntervalFn).toHaveBeenCalledOnce();
  });

  it('stop is a no-op when not running', () => {
    const registry = makeRegistry([]);
    const clearIntervalFn = vi.fn();

    const runtime = new FlowRuntime(registry, { clearIntervalFn });
    runtime.stop(); // should not throw or call clearInterval

    expect(clearIntervalFn).not.toHaveBeenCalled();
  });

  it('uses configured interval ms when starting', () => {
    const registry = makeRegistry([]);
    const setIntervalFn = vi.fn(() => ({}) as ReturnType<typeof setInterval>);
    const clearIntervalFn = vi.fn();

    const runtime = new FlowRuntime(registry, {
      intervalMs: 30_000,
      setIntervalFn,
      clearIntervalFn,
    });
    runtime.start(() => {});

    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });
});
