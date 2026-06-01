import { describe, it, expect } from 'vitest';
import {
  PendingDispatchQueue,
  type SelfDispatchPolicy,
} from '../../src/core/self-dispatch.js';
import type { DueDispatch } from '../../src/core/flow-scheduler.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';

function makePolicy(overrides: Partial<SelfDispatchPolicy> = {}): SelfDispatchPolicy {
  return {
    id: 'policy-001',
    trigger: 'scheduled',
    action: 'plan',
    ...overrides,
  };
}

function makeFlow(id = 'flow-001'): ScheduledFlow {
  return {
    id,
    cronExpr: '* * * * *',
    action: 'deckent:start',
    tenantId: 'tenant-a',
    enabled: true,
  };
}

function makeDispatches(count = 1): DueDispatch[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: 'scheduled' as const,
    flow: makeFlow(`flow-${i}`),
    nextRun: new Date('2026-01-01T00:00:00.000Z'),
  }));
}

describe('PendingDispatchQueue — enqueue', () => {
  it('enqueues when dispatch=true AND requiresApproval=true', () => {
    const fixedClock = () => new Date('2026-05-31T12:00:00.000Z');
    const queue = new PendingDispatchQueue({ clock: fixedClock });
    const policy = makePolicy();

    const entry = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: makeDispatches(2),
    });

    expect(entry).not.toBeNull();
    expect(entry!.id).toMatch(/^pd-/);
    expect(entry!.policyId).toBe('policy-001');
    expect(entry!.decision.dispatch).toBe(true);
    expect(entry!.decision.requiresApproval).toBe(true);
    expect(entry!.status).toBe('pending');
    expect(entry!.enqueuedAt.toISOString()).toBe('2026-05-31T12:00:00.000Z');
    expect(entry!.dispatches).toHaveLength(2);
  });

  it('does not enqueue when dispatch=false (no due dispatches)', () => {
    const queue = new PendingDispatchQueue();
    const policy = makePolicy();

    const entry = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: [],
    });

    expect(entry).toBeNull();
    expect(queue.listPendingDispatches()).toHaveLength(0);
  });

  it('does not enqueue when requiresApproval=false', () => {
    const queue = new PendingDispatchQueue();
    const policy = makePolicy({ guard: { requiresApproval: false } });

    const entry = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: makeDispatches(1),
    });

    expect(entry).toBeNull();
    expect(queue.listPendingDispatches()).toHaveLength(0);
  });
});

describe('PendingDispatchQueue — listPendingDispatches', () => {
  it('returns only pending entries (approved are filtered out)', () => {
    const queue = new PendingDispatchQueue();
    const policy = makePolicy();

    const a = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: makeDispatches(1),
    });
    const b = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: makeDispatches(1),
    });

    expect(queue.listPendingDispatches()).toHaveLength(2);

    queue.approveDispatch(a!.id);
    const stillPending = queue.listPendingDispatches();
    expect(stillPending).toHaveLength(1);
    expect(stillPending[0].id).toBe(b!.id);
  });
});

describe('PendingDispatchQueue — approveDispatch', () => {
  it('transitions pending → approved and stamps approvedAt', () => {
    const approveClock = () => new Date('2026-05-31T13:30:00.000Z');
    const queue = new PendingDispatchQueue({ clock: approveClock });
    const policy = makePolicy();

    const entry = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: makeDispatches(1),
    });
    const approved = queue.approveDispatch(entry!.id);

    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('approved');
    expect(approved!.approvedAt?.toISOString()).toBe('2026-05-31T13:30:00.000Z');
  });

  it('returns null for unknown id', () => {
    const queue = new PendingDispatchQueue();
    expect(queue.approveDispatch('pd-999')).toBeNull();
  });

  it('returns null when approving an already-approved entry (idempotent guard)', () => {
    const queue = new PendingDispatchQueue();
    const policy = makePolicy();
    const entry = queue.evaluateAndEnqueue(policy, {
      kind: 'scheduled',
      dispatches: makeDispatches(1),
    });

    expect(queue.approveDispatch(entry!.id)).not.toBeNull();
    expect(queue.approveDispatch(entry!.id)).toBeNull();
  });
});

describe('PendingDispatchQueue — no auto-start', () => {
  it('does not invoke any callback or side-effect on enqueue or approve', () => {
    // Ground truth: this class' module surface is purely data (enqueue, list,
    // approve). There is no callback / runSprint hook reachable from it.
    // Verify by exercising the full path and asserting that the queue's
    // observable state is the only thing that changed.
    const queue = new PendingDispatchQueue();
    const policy = makePolicy();
    const dispatches = makeDispatches(1);

    const entry = queue.evaluateAndEnqueue(policy, { kind: 'scheduled', dispatches });

    // Enqueue: entry exists, status pending, no other observable channel.
    expect(queue.listPendingDispatches()).toHaveLength(1);
    expect(entry!.status).toBe('pending');

    // Approve: status flips, list shrinks. No sprint started — the caller is
    // responsible for invoking Brain.runSprint after observing approval.
    queue.approveDispatch(entry!.id);
    expect(queue.listPendingDispatches()).toHaveLength(0);
    expect(entry!.status).toBe('approved');

    // Module exposes no auto-start surface. Confirmed by API shape: only
    // evaluateAndEnqueue / listPendingDispatches / approveDispatch exist.
    const apiKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(queue));
    expect(apiKeys).not.toContain('runSprint');
    expect(apiKeys).not.toContain('start');
    expect(apiKeys).not.toContain('dispatch');
  });
});
