import { describe, it, expect, vi } from 'vitest';
import {
  createSelfDispatchCallback,
  type SelfDispatchPolicy,
  type PendingApprovalItem,
} from '../../src/core/self-dispatch.js';
import { FlowRuntime } from '../../src/core/flow-runtime.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import type { DueDispatch } from '../../src/core/flow-scheduler.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';

function makePolicy(overrides: Partial<SelfDispatchPolicy> = {}): SelfDispatchPolicy {
  return {
    id: 'policy-rt-001',
    trigger: 'scheduled',
    action: 'plan',
    ...overrides,
  };
}

function makeFlow(overrides: Partial<ScheduledFlow> = {}): ScheduledFlow {
  return {
    id: 'flow-rt-001',
    cronExpr: '* * * * *',
    action: 'deckent:start',
    tenantId: 'tenant-a',
    enabled: true,
    ...overrides,
  };
}

function makeRegistry(flows: ScheduledFlow[] = []): FlowRegistry {
  return { listFlows: () => flows } as unknown as FlowRegistry;
}

function makeDispatch(): DueDispatch {
  return {
    kind: 'scheduled',
    flow: makeFlow(),
    nextRun: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('createSelfDispatchCallback — tick → evaluate', () => {
  it('evaluates the policy and pushes pending-approval when dispatches present', () => {
    const queue: PendingApprovalItem[] = [];
    const policy = makePolicy();
    const clock = () => new Date('2026-05-31T23:00:00.000Z');
    const cb = createSelfDispatchCallback(policy, queue, { clock });

    cb([makeDispatch()]);

    expect(queue).toHaveLength(1);
    expect(queue[0]!.policyId).toBe('policy-rt-001');
    expect(queue[0]!.decision.dispatch).toBe(true);
    expect(queue[0]!.decision.trigger).toBe('scheduled');
    expect(queue[0]!.dispatches).toHaveLength(1);
    expect(queue[0]!.enqueuedAt.toISOString()).toBe('2026-05-31T23:00:00.000Z');
  });

  it('does not push when no due dispatches arrive on tick', () => {
    const queue: PendingApprovalItem[] = [];
    const cb = createSelfDispatchCallback(makePolicy(), queue);

    cb([]);

    expect(queue).toHaveLength(0);
  });
});

describe('createSelfDispatchCallback — approval-pending queue', () => {
  it('queued item preserves requiresApproval=true (default guard) — auto-start forbidden', () => {
    const queue: PendingApprovalItem[] = [];
    const cb = createSelfDispatchCallback(makePolicy(), queue);

    cb([makeDispatch()]);

    expect(queue).toHaveLength(1);
    expect(queue[0]!.decision.requiresApproval).toBe(true);
  });

  it('appends multiple pending-approval items across successive ticks', () => {
    const queue: PendingApprovalItem[] = [];
    const cb = createSelfDispatchCallback(makePolicy(), queue);

    cb([makeDispatch()]);
    cb([makeDispatch(), makeDispatch()]);
    cb([]); // no-op

    expect(queue).toHaveLength(2);
    expect(queue[0]!.dispatches).toHaveLength(1);
    expect(queue[1]!.dispatches).toHaveLength(2);
  });
});

describe('createSelfDispatchCallback — auto-start yok', () => {
  it('never invokes any external start side-effect (queue is the only mutation)', () => {
    const queue: PendingApprovalItem[] = [];
    const fakeStart = vi.fn();
    const policy = makePolicy({ guard: { requiresApproval: false } });
    const cb = createSelfDispatchCallback(policy, queue);

    cb([makeDispatch()]);

    // Even with requiresApproval=false, we still only push to queue.
    expect(fakeStart).not.toHaveBeenCalled();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.decision.requiresApproval).toBe(false);
  });

  it('FlowRuntime.start is not implicitly called by the callback factory', () => {
    const registry = makeRegistry([makeFlow()]);
    const setIntervalFn = vi.fn(() => ({}) as ReturnType<typeof setInterval>);
    const clearIntervalFn = vi.fn();
    const runtime = new FlowRuntime(registry, { setIntervalFn, clearIntervalFn });

    const queue: PendingApprovalItem[] = [];
    createSelfDispatchCallback(makePolicy(), queue);

    // Building the callback alone must not start the FlowRuntime loop.
    expect(setIntervalFn).not.toHaveBeenCalled();
    expect(runtime.running).toBe(false);
    expect(queue).toHaveLength(0);
  });
});

describe('createSelfDispatchCallback — disabled skip', () => {
  it('returns immediately when policy.disabled === true (no queue mutation)', () => {
    const queue: PendingApprovalItem[] = [];
    const cb = createSelfDispatchCallback(makePolicy({ disabled: true }), queue);

    cb([makeDispatch(), makeDispatch()]);

    expect(queue).toHaveLength(0);
  });

  it('clock is not consulted when policy.disabled === true', () => {
    const queue: PendingApprovalItem[] = [];
    const clock = vi.fn(() => new Date('2026-05-31T23:00:00.000Z'));
    const cb = createSelfDispatchCallback(makePolicy({ disabled: true }), queue, { clock });

    cb([makeDispatch()]);

    expect(clock).not.toHaveBeenCalled();
    expect(queue).toHaveLength(0);
  });
});

describe('createSelfDispatchCallback — FlowRuntime integration', () => {
  it('FlowRuntime.tick routes due dispatches into the pending-approval queue', () => {
    const registry = makeRegistry([makeFlow()]);
    // Clock far in the future so the cron is due.
    const tickClock = () => new Date('2099-01-01T00:05:00.000Z');
    const runtime = new FlowRuntime(registry, { clock: tickClock });

    const queue: PendingApprovalItem[] = [];
    const cb = createSelfDispatchCallback(makePolicy(), queue, {
      clock: () => new Date('2099-01-01T00:05:00.000Z'),
    });

    runtime.tick(cb);

    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0]!.decision.requiresApproval).toBe(true);
    expect(queue[0]!.decision.trigger).toBe('scheduled');
  });
});
