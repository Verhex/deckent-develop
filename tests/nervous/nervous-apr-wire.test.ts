// ─── NervousApprovalActions tests (NERVOUS-APR-WIRE, task 356-014) ──────────────
// Flag-gated dispatch: flag off routes to the injected legacy resolver UNCHANGED
// (byte-identical to pre-task behavior); flag on forwards to
// NervousApprovalBridge.applyNervousDecision (accept -> allow, reject -> deny) using
// a fake broker + fake pending-cleanup (same pattern as approval-bridge.test.ts),
// proving both the broker-decide call and pending-store cleanup happen.
import { describe, it, expect } from 'vitest';
import { ApprovalBrokerError } from '../../src/core/approval-broker.js';
import {
  NervousApprovalBridge,
  type NervousApprovalBrokerLike,
  type NervousPendingCleanup,
} from '../../src/nervous/approval-bridge.js';
import {
  resolveNervousApprovalAction,
  isNervousApprovalBridgeEnabled,
  type NervousApprovalActionInput,
} from '../../src/nervous/approval-actions.js';
// tests/nervous/panic-gate-wire.test.ts
//
// Sprint 279 Task 279-002 — Panic-gate timeout wire tests.
//
// Verifies that Executor.handleApprove:
//   1. auto-proceeds (timeout-auto-applied) for non-SAFETY_FLOOR actions after timeout
//   2. does NOT auto-proceed for SAFETY_FLOOR actions — still waits for human
//   3. early accept resolves immediately (before timeout)
//   4. early reject resolves immediately (before timeout)
//   5. action handler IS called on auto-proceed
//   6. action handler is NOT called on reject
//   7. multiple pending approvals: each independent
//
// All tests use vi.useFakeTimers + tmpdir — no real network/docker.
import { vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Executor } from "../../src/nervous/executor.js";
import type { ActionHandler, NervousHistory } from "../../src/nervous/executor.js";
import type { NervousNotification, NotificationAction, ExecutionRecord } from "../../src/core/nervous-types.js";

function makeFakeBroker() {
  const decideCalls: Array<{ id: string; input: unknown }> = [];
  const broker: NervousApprovalBrokerLike = {
    decide(id, input) {
      decideCalls.push({ id, input });
      return {
        requestId: id,
        decision: input.decision,
        decidedBy: input.decidedBy,
        channel: input.channel,
        decidedAt: input.decidedAt,
        reason: input.reason ?? '',
      };
    },
  };
  return { broker, decideCalls };
}

function makeFakeCleanup() {
  const removed: string[] = [];
  const cleanup: NervousPendingCleanup = {
    remove(id) {
      removed.push(id);
    },
  };
  return { cleanup, removed };
}

describe('resolveNervousApprovalAction — flag off (legacy path)', () => {
  it('routes to legacyResolve unchanged and never touches the bridge', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const bridge = new NervousApprovalBridge(broker);
    const legacyCalls: NervousApprovalActionInput[] = [];

    const input: NervousApprovalActionInput = {
      notificationId: 'ns-legacy-1',
      resolution: 'accepted',
      decidedBy: 'user-cli',
    };

    const result = resolveNervousApprovalAction(input, {
      approvalBridgeEnabled: false,
      bridge,
      legacyResolve: (i) => {
        legacyCalls.push(i);
        return { queued: true, ipcFile: '/tmp/fake.json' };
      },
    });

    expect(result).toEqual({
      routedTo: 'legacy',
      legacyResult: { queued: true, ipcFile: '/tmp/fake.json' },
    });
    expect(legacyCalls).toEqual([input]);
    expect(decideCalls).toHaveLength(0);
  });

  it('is the default expectation when approvalBridgeEnabled is false for a reject too', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const bridge = new NervousApprovalBridge(broker);

    const result = resolveNervousApprovalAction(
      { notificationId: 'ns-legacy-2', resolution: 'rejected', decidedBy: 'user-mcp', reason: 'stale' },
      {
        approvalBridgeEnabled: false,
        bridge,
        legacyResolve: () => ({ rejected: true }),
      },
    );

    expect(result).toEqual({ routedTo: 'legacy', legacyResult: { rejected: true } });
    expect(decideCalls).toHaveLength(0);
  });
});

describe('resolveNervousApprovalAction — flag on (bridge path, fake broker)', () => {
  it('accept -> broker.decide(allow) + pending-store cleanup runs', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const { cleanup, removed } = makeFakeCleanup();
    const bridge = new NervousApprovalBridge(broker, cleanup);
    let legacyInvoked = false;

    const result = resolveNervousApprovalAction(
      { notificationId: 'ns-bridge-1', resolution: 'accepted', decidedBy: 'user-cli' },
      {
        approvalBridgeEnabled: true,
        bridge,
        legacyResolve: () => {
          legacyInvoked = true;
          return null;
        },
      },
    );

    expect(legacyInvoked).toBe(false);
    expect(decideCalls).toHaveLength(1);
    expect(decideCalls[0]?.input).toMatchObject({ decision: 'allow', decidedBy: 'user-cli' });
    // pending-temizlik: the bridge's own cleanup runs on a successful decide.
    expect(removed).toEqual(['ns-bridge-1']);
    expect(result).toEqual({
      routedTo: 'bridge',
      bridgeResult: {
        applied: true,
        decision: expect.objectContaining({ requestId: 'ns-bridge-1', decision: 'allow' }),
      },
    });
  });

  it('reject -> broker.decide(deny) with reason forwarded + pending-store cleanup runs', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const { cleanup, removed } = makeFakeCleanup();
    const bridge = new NervousApprovalBridge(broker, cleanup);

    const result = resolveNervousApprovalAction(
      { notificationId: 'ns-bridge-2', resolution: 'rejected', decidedBy: 'user-mcp', reason: 'stale proposal' },
      {
        approvalBridgeEnabled: true,
        bridge,
        legacyResolve: () => null,
      },
    );

    expect(decideCalls[0]?.input).toMatchObject({ decision: 'deny', decidedBy: 'user-mcp', reason: 'stale proposal' });
    expect(removed).toEqual(['ns-bridge-2']);
    expect(result.routedTo).toBe('bridge');
  });

  it('an already-decided id is surfaced as applied:false, not thrown, and cleanup still runs', () => {
    let decideCallCount = 0;
    const throwingBroker: NervousApprovalBrokerLike = {
      decide() {
        decideCallCount += 1;
        throw new ApprovalBrokerError('approval request already decided: ns-dup', 'APR_ALREADY_DECIDED');
      },
    };
    const { cleanup, removed } = makeFakeCleanup();
    const bridge = new NervousApprovalBridge(throwingBroker, cleanup);

    const result = resolveNervousApprovalAction(
      { notificationId: 'ns-dup', resolution: 'accepted', decidedBy: 'user-cli' },
      { approvalBridgeEnabled: true, bridge, legacyResolve: () => null },
    );

    expect(result).toEqual({ routedTo: 'bridge', bridgeResult: { applied: false, reason: 'already-decided' } });
    expect(decideCallCount).toBe(1);
    // pending-temizlik: cleanup runs even on the swallowed already-decided path.
    expect(removed).toEqual(['ns-dup']);
  });
});

describe('isNervousApprovalBridgeEnabled', () => {
  it('defaults to false when nervous_system config is undefined', () => {
    expect(isNervousApprovalBridgeEnabled(undefined)).toBe(false);
  });

  it('defaults to false when approval_bridge is absent', () => {
    expect(isNervousApprovalBridgeEnabled({ enabled: true, mode: 'balanced' })).toBe(false);
  });

  it('is true only when approval_bridge is explicitly true', () => {
    expect(isNervousApprovalBridgeEnabled({ approval_bridge: true })).toBe(true);
    expect(isNervousApprovalBridgeEnabled({ approval_bridge: false })).toBe(false);
  });
});

// WIRE-027: physically merged from tests/nervous/panic-gate-wire.test.ts.
{
// ─── Helpers ─────────────────────────────────────────────────────────────────
function createMockHistory(): NervousHistory & {
    records: ExecutionRecord[];
} {
    const records: ExecutionRecord[] = [];
    return {
        records,
        append: vi.fn(async (record: ExecutionRecord) => { records.push(record); }),
    };
}

function createMockHandler(outcome: 'success' | 'failure' = 'success'): ActionHandler {
    return vi.fn(async () => ({ outcome }));
}

function createNotification(id: string, actionOverrides: Partial<NotificationAction> = {}): NervousNotification {
    const action: NotificationAction = {
        id: 'ORPHAN_TASK_ARCHIVE',
        label: 'Archive orphan tasks',
        policy: 'approve',
        risk: 'low',
        isSafetyFloor: false,
        payload: {},
        ...actionOverrides,
    };
    return {
        id,
        type: 'test',
        title: 'Test Notification',
        message: 'Test message',
        severity: 'info',
        createdAt: '2026-06-10T00:00:00.000Z',
        detectorId: 'test-detector',
        actions: [action],
        timeoutMs: null,
    };
}

// ─── Suite ───────────────────────────────────────────────────────────────────
let testRoot: string;

beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-pg-wire-${process.pid}-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
    vi.useRealTimers();
    try {
        rmSync(testRoot, { recursive: true, force: true });
    }
    catch {
        // best-effort
    }
});

describe('panic-gate wire — Executor.handleApprove timeout', () => {
    it('auto-proceeds (timeout-auto-applied) for non-SAFETY_FLOOR after 50ms', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler();
        const executor = new Executor(history, handler, undefined, testRoot, 50);
        const notification = createNotification('notif-001');
        const handlePromise = executor.handle(notification);
        // Advance past the 50ms explicit approveTimeoutMs
        await vi.advanceTimersByTimeAsync(51);
        const records = await handlePromise;
        expect(records).toHaveLength(1);
        expect(records[0].decision).toBe('timeout-auto-applied');
        expect(records[0].decidedBy).toBe('timeout');
        expect(records[0].outcome).toBe('success');
    });
    it('action handler IS called when timeout auto-proceeds', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler('success');
        const executor = new Executor(history, handler, undefined, testRoot, 50);
        const notification = createNotification('notif-002');
        const handlePromise = executor.handle(notification);
        await vi.advanceTimersByTimeAsync(51);
        await handlePromise;
        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith('ORPHAN_TASK_ARCHIVE', {});
    });
    it('SAFETY_FLOOR action does NOT auto-proceed after timeout — still awaiting human', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler();
        const executor = new Executor(history, handler, undefined, testRoot, 50);
        // KILL_LIVE_SPRINT is a SAFETY_FLOOR action
        const notification = createNotification('notif-003', {
            id: 'KILL_LIVE_SPRINT',
            isSafetyFloor: true,
        });
        let resolved = false;
        executor.handle(notification).then(() => { resolved = true; }).catch(() => { resolved = true; });
        // Advance past timeout — SAFETY_FLOOR should still be waiting
        await vi.advanceTimersByTimeAsync(15000);
        expect(resolved).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        // Cleanup: resolve manually so the Promise doesn't leak
        executor.resolveApproval('notif-003', 'rejected');
        await vi.runAllTimersAsync();
    });
    it('early accept resolves immediately before timeout fires', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler();
        const executor = new Executor(history, handler, undefined, testRoot, 10000);
        const notification = createNotification('notif-004');
        const handlePromise = executor.handle(notification);
        // Accept before timeout (advance only 1s)
        await vi.advanceTimersByTimeAsync(1000);
        executor.resolveApproval('notif-004', 'accepted');
        await vi.runAllTimersAsync();
        const records = await handlePromise;
        expect(records).toHaveLength(1);
        expect(records[0].decision).toBe('accepted');
        expect(records[0].decidedBy).toBe('user');
        expect(records[0].outcome).toBe('success');
        expect(handler).toHaveBeenCalledOnce();
    });
    it('early reject resolves immediately, action handler NOT called', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler();
        const executor = new Executor(history, handler, undefined, testRoot, 10000);
        const notification = createNotification('notif-005');
        const handlePromise = executor.handle(notification);
        await vi.advanceTimersByTimeAsync(500);
        executor.resolveApproval('notif-005', 'rejected');
        await vi.runAllTimersAsync();
        const records = await handlePromise;
        expect(records).toHaveLength(1);
        expect(records[0].decision).toBe('rejected');
        expect(records[0].outcome).toBe('pending');
        expect(handler).not.toHaveBeenCalled();
    });
    it('result is appended to history after auto-proceed', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler();
        const executor = new Executor(history, handler, undefined, testRoot, 50);
        const notification = createNotification('notif-006');
        const handlePromise = executor.handle(notification);
        await vi.advanceTimersByTimeAsync(51);
        await handlePromise;
        expect(history.records).toHaveLength(1);
        expect(history.records[0].decision).toBe('timeout-auto-applied');
    });
    it('after early-accept, subsequent timeout event does not re-execute action', async () => {
        vi.useFakeTimers();
        const history = createMockHistory();
        const handler = createMockHandler();
        const executor = new Executor(history, handler, undefined, testRoot, 10000);
        const notification = createNotification('notif-007');
        const handlePromise = executor.handle(notification);
        await vi.advanceTimersByTimeAsync(500);
        executor.resolveApproval('notif-007', 'accepted');
        await vi.runAllTimersAsync();
        // Advance past full timeout — handler should only be called once
        await vi.advanceTimersByTimeAsync(15000);
        await handlePromise;
        // Handler called exactly once (early-accept path only)
        expect(handler).toHaveBeenCalledOnce();
    });
});
}
