// Sprint 357 Task 357-006 — APPROVE-007b: REPL /nervous köprüsü + handleEdit.
//
// Pure unit tests — no fs, no tmpdir. `NervousPendingStore` / `NervousBridgeExecutor` /
// `NervousBridgePendingCleanup` are all injected seams; every collaborator here is an
// in-memory fake. Never imports the real `src/nervous/executor.ts` Executor as a value
// (only its TYPE flows through nervous-bridge.ts) — this module and its tests never
// perform a real nervous execution.

import { describe, it, expect } from 'vitest';
import {
  listPendingNervous,
  planAccept,
  planReject,
  handleEdit,
  applyNervousBridgePlan,
  type NervousPendingStore,
  type NervousBridgeExecutor,
  type NervousBridgePendingCleanup,
  type NervousBridgeResolution,
} from '../../../src/cli/repl/nervous-bridge.js';
import type { NervousNotification } from '../../../src/core/nervous-types.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    shortCode: 'ab12c',
    type: 'test-type',
    title: 'Test notification',
    message: 'A test message',
    severity: 'warning',
    createdAt: '2026-07-01T00:00:00.000Z',
    detectorId: 'test-detector',
    actions: [
      {
        id: 'TEST_ACTION',
        label: 'Test Action',
        policy: 'approve',
        risk: 'medium',
        isSafetyFloor: false,
      },
    ],
    timeoutMs: null,
    ...overrides,
  };
}

function makeStore(notifications: readonly NervousNotification[]): NervousPendingStore {
  return { listPending: () => notifications };
}

interface FakeExecutor extends NervousBridgeExecutor {
  readonly calls: Array<{
    notificationId: string;
    decision: NervousBridgeResolution;
    opts: { modifiedPayload?: Record<string, unknown> } | undefined;
  }>;
}

function makeExecutor(result = true): FakeExecutor {
  const calls: FakeExecutor['calls'] = [];
  return {
    calls,
    resolveApproval(notificationId, decision, opts) {
      calls.push({ notificationId, decision, opts });
      return result;
    },
  };
}

interface FakeCleanup extends NervousBridgePendingCleanup {
  readonly removed: string[];
}

function makeCleanup(): FakeCleanup {
  const removed: string[] = [];
  return {
    removed,
    remove(notificationId: string) {
      removed.push(notificationId);
    },
  };
}

// ─── listPendingNervous ───────────────────────────────────────────────────────

describe('listPendingNervous', () => {
  it('passes through whatever the store returns, unmodified', () => {
    const n1 = makeNotification({ id: 'n1' });
    const n2 = makeNotification({ id: 'n2' });
    const store = makeStore([n1, n2]);

    expect(listPendingNervous(store)).toEqual([n1, n2]);
  });

  it('returns an empty list when the store has nothing pending', () => {
    expect(listPendingNervous(makeStore([]))).toEqual([]);
  });
});

// ─── planAccept ─────────────────────────────────────────────────────────────

describe('planAccept', () => {
  it('builds an accept plan with resolve-approval + clear-pending steps', () => {
    const n = makeNotification({ id: 'target-id' });
    const store = makeStore([n]);

    const result = planAccept(store, 'target-id');

    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.notification).toEqual(n);
    expect(result.plan.resolution).toBe('accepted');
    expect(result.plan.modifiedPayload).toBeUndefined();
    expect(result.plan.steps).toEqual([
      { kind: 'resolve-approval', notificationId: 'target-id' },
      { kind: 'clear-pending', notificationId: 'target-id' },
    ]);
  });

  it('matches by id prefix', () => {
    const n = makeNotification({ id: 'abcdef01-full-id' });
    const result = planAccept(makeStore([n]), 'abcdef01');
    expect(result.found).toBe(true);
  });

  it('matches by shortCode (case-insensitive)', () => {
    const n = makeNotification({ id: 'full-id', shortCode: 'zz99x' });
    const result = planAccept(makeStore([n]), 'ZZ99X');
    expect(result.found).toBe(true);
  });

  it('returns found:false with the requested id when nothing matches', () => {
    const result = planAccept(makeStore([]), 'nope');
    expect(result).toEqual({ found: false, id: 'nope' });
  });
});

// ─── planReject ─────────────────────────────────────────────────────────────

describe('planReject', () => {
  it('builds a reject plan and carries the reason as plan metadata', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = planReject(makeStore([n]), 'target-id', 'not needed');

    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.resolution).toBe('rejected');
    expect(result.plan.reason).toBe('not needed');
    expect(result.plan.steps).toEqual([
      { kind: 'resolve-approval', notificationId: 'target-id' },
      { kind: 'clear-pending', notificationId: 'target-id' },
    ]);
  });

  it('omits reason from the plan when not given', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = planReject(makeStore([n]), 'target-id');
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.reason).toBeUndefined();
  });

  it('returns found:false when nothing matches', () => {
    const result = planReject(makeStore([]), 'nope');
    expect(result).toEqual({ found: false, id: 'nope' });
  });
});

// ─── handleEdit ─────────────────────────────────────────────────────────────

describe('handleEdit', () => {
  it('builds an accept plan carrying modifiedPayload', () => {
    const n = makeNotification({ id: 'target-id' });
    const payload = { priority: 'high', reason: 'approved' };

    const result = handleEdit(makeStore([n]), 'target-id', payload);

    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.resolution).toBe('accepted');
    expect(result.plan.modifiedPayload).toEqual(payload);
  });

  it('gotcha-parity: edit-accept plan includes the SAME clear-pending step as a plain accept', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = handleEdit(makeStore([n]), 'target-id', { k: 'v' });

    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.plan.steps).toContainEqual({ kind: 'clear-pending', notificationId: 'target-id' });
    expect(result.plan.steps).toContainEqual({ kind: 'resolve-approval', notificationId: 'target-id' });
  });

  it('matches by id prefix and shortCode like planAccept/planReject', () => {
    const n = makeNotification({ id: 'abcdef01-full-id', shortCode: 'qr55t' });
    expect(handleEdit(makeStore([n]), 'abcdef01', {}).found).toBe(true);
    expect(handleEdit(makeStore([n]), 'QR55T', {}).found).toBe(true);
  });

  it('returns found:false when nothing matches', () => {
    const result = handleEdit(makeStore([]), 'nope', {});
    expect(result).toEqual({ found: false, id: 'nope' });
  });
});

// ─── applyNervousBridgePlan (injected-executor dispatch — no real exec) ────────

describe('applyNervousBridgePlan', () => {
  it('accept plan: calls executor.resolveApproval once with the resolution + no opts', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = planAccept(makeStore([n]), 'target-id');
    if (!result.found) throw new Error('unreachable');
    const executor = makeExecutor(true);

    const applied = applyNervousBridgePlan(result.plan, executor);

    expect(applied).toBe(true);
    expect(executor.calls).toEqual([
      { notificationId: 'target-id', decision: 'accepted', opts: undefined },
    ]);
  });

  it('reject plan: calls executor.resolveApproval with decision "rejected"', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = planReject(makeStore([n]), 'target-id');
    if (!result.found) throw new Error('unreachable');
    const executor = makeExecutor(true);

    applyNervousBridgePlan(result.plan, executor);

    expect(executor.calls).toEqual([
      { notificationId: 'target-id', decision: 'rejected', opts: undefined },
    ]);
  });

  it('edit-accept plan: forwards modifiedPayload to the injected executor', () => {
    const n = makeNotification({ id: 'target-id' });
    const payload = { priority: 'high' };
    const result = handleEdit(makeStore([n]), 'target-id', payload);
    if (!result.found) throw new Error('unreachable');
    const executor = makeExecutor(true);

    applyNervousBridgePlan(result.plan, executor);

    expect(executor.calls).toEqual([
      { notificationId: 'target-id', decision: 'accepted', opts: { modifiedPayload: payload } },
    ]);
  });

  it('regression (project_nervous_accept_pending_not_cleared parity): edit-accept apply clears pending', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = handleEdit(makeStore([n]), 'target-id', { k: 'v' });
    if (!result.found) throw new Error('unreachable');
    const executor = makeExecutor(true);
    const cleanup = makeCleanup();

    applyNervousBridgePlan(result.plan, executor, cleanup);

    expect(cleanup.removed).toEqual(['target-id']);
  });

  it('plain accept and reject also clear pending (parity across all resolutions)', () => {
    const n = makeNotification({ id: 'target-id' });
    const executor = makeExecutor(true);

    const acceptCleanup = makeCleanup();
    const acceptPlan = planAccept(makeStore([n]), 'target-id');
    if (!acceptPlan.found) throw new Error('unreachable');
    applyNervousBridgePlan(acceptPlan.plan, executor, acceptCleanup);
    expect(acceptCleanup.removed).toEqual(['target-id']);

    const rejectCleanup = makeCleanup();
    const rejectPlan = planReject(makeStore([n]), 'target-id');
    if (!rejectPlan.found) throw new Error('unreachable');
    applyNervousBridgePlan(rejectPlan.plan, executor, rejectCleanup);
    expect(rejectCleanup.removed).toEqual(['target-id']);
  });

  it('returns the executor result verbatim (false when nothing was resolved)', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = planAccept(makeStore([n]), 'target-id');
    if (!result.found) throw new Error('unreachable');
    const executor = makeExecutor(false);

    expect(applyNervousBridgePlan(result.plan, executor)).toBe(false);
  });

  it('works without a pendingCleanup dependency (optional)', () => {
    const n = makeNotification({ id: 'target-id' });
    const result = planAccept(makeStore([n]), 'target-id');
    if (!result.found) throw new Error('unreachable');
    const executor = makeExecutor(true);

    expect(() => applyNervousBridgePlan(result.plan, executor)).not.toThrow();
  });
});
