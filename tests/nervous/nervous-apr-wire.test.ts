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
