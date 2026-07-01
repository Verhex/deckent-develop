// ─── NervousApprovalBridge tests (NERVOUS-APR, task 355-012) ────────────────────
// Fake-broker unit tests for the nervous-decision -> broker.decide() forwarding path
// (accept -> allow, reject -> deny, pending-store cleanup always runs), a real-broker
// double-decision idempotency proof, and pure-function coverage of the broker-pending
// (nervous-sourced) -> NervousNotification projection.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import type { ApprovalRequest, ApprovalRisk } from '../../src/core/approval-contract.js';
import {
  NervousApprovalBridge,
  isNervousSourced,
  toNervousNotification,
  type NervousApprovalBrokerLike,
  type NervousPendingCleanup,
} from '../../src/nervous/approval-bridge.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id,
    version: '1.0',
    requester: { role: 'nervous', instanceId: 'nervous-detector-1' },
    summary: `approval request ${id}`,
    details: {},
    scopeId: 'sprint-355',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    maskedArgs: null,
    rawArgsRef: null,
    ...overrides,
  };
}

// ─── Direction 1: nervous decision -> broker.decide() ────────────────────────────

describe('NervousApprovalBridge.applyNervousDecision — fake broker', () => {
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

  it('maps accepted -> allow and clears the pending store', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const { cleanup, removed } = makeFakeCleanup();
    const bridge = new NervousApprovalBridge(broker, cleanup);

    const result = bridge.applyNervousDecision({
      notificationId: 'ns-1',
      resolution: 'accepted',
      decidedBy: 'user-cli',
    });

    expect(result).toEqual({
      applied: true,
      decision: expect.objectContaining({ requestId: 'ns-1', decision: 'allow', decidedBy: 'user-cli', channel: 'nervous' }),
    });
    expect(decideCalls).toHaveLength(1);
    expect(decideCalls[0]?.input).toMatchObject({ decision: 'allow', decidedBy: 'user-cli', channel: 'nervous' });
    expect(removed).toEqual(['ns-1']);
  });

  it('maps rejected -> deny', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const bridge = new NervousApprovalBridge(broker);

    bridge.applyNervousDecision({
      notificationId: 'ns-2',
      resolution: 'rejected',
      decidedBy: 'user-mcp',
      reason: 'stale proposal',
    });

    expect(decideCalls[0]?.input).toMatchObject({ decision: 'deny', decidedBy: 'user-mcp', reason: 'stale proposal' });
  });

  it('honors an explicit channel/decidedAt override instead of the nervous default', () => {
    const { broker, decideCalls } = makeFakeBroker();
    const bridge = new NervousApprovalBridge(broker);

    bridge.applyNervousDecision({
      notificationId: 'ns-3',
      resolution: 'accepted',
      decidedBy: 'operator',
      channel: 'telegram-via-nervous',
      decidedAt: '2026-07-01T22:00:00.000Z',
    });

    expect(decideCalls[0]?.input).toMatchObject({
      channel: 'telegram-via-nervous',
      decidedAt: '2026-07-01T22:00:00.000Z',
    });
  });

  it('works without an injected pendingCleanup (optional)', () => {
    const { broker } = makeFakeBroker();
    const bridge = new NervousApprovalBridge(broker);

    expect(() =>
      bridge.applyNervousDecision({ notificationId: 'ns-4', resolution: 'accepted', decidedBy: 'user-cli' }),
    ).not.toThrow();
  });
});

describe('NervousApprovalBridge.applyNervousDecision — real ApprovalBroker, double-decision idempotency', () => {
  it('a second accept/reject for an already-decided id is swallowed, not thrown, and cleanup still runs both times', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-nervous-apr-'));
    try {
      const broker = new ApprovalBroker(projectRoot);
      const requestInput: ApprovalRequestInput = {
        id: 'ns-dup-1',
        requester: { role: 'nervous', instanceId: 'nervous-detector-1' },
        summary: 'dup test',
        details: {},
        scopeId: 'sprint-355',
        scope: 'shell-exec',
        risk: 'high',
        policy: 'require-approval',
        defaultAction: 'deny',
        tenantId: 'local',
        userId: 'alperen',
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
      };
      broker.submit(requestInput);

      const removed: string[] = [];
      const cleanup: NervousPendingCleanup = { remove: (id) => removed.push(id) };
      const bridge = new NervousApprovalBridge(broker, cleanup);

      const first = bridge.applyNervousDecision({
        notificationId: 'ns-dup-1',
        resolution: 'accepted',
        decidedBy: 'user-cli',
      });
      expect(first.applied).toBe(true);

      const second = bridge.applyNervousDecision({
        notificationId: 'ns-dup-1',
        resolution: 'accepted',
        decidedBy: 'user-cli',
      });
      expect(second).toEqual({ applied: false, reason: 'already-decided' });

      expect(removed).toEqual(['ns-dup-1', 'ns-dup-1']);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('rethrows a broker error that is NOT already-decided', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-nervous-apr-'));
    try {
      const broker = new ApprovalBroker(projectRoot);
      const bridge = new NervousApprovalBridge(broker);
      // No request was ever submitted for this id, but the broker's decide() still
      // fails — on invalid decision input (missing/blank decidedBy) it throws
      // APR_INVALID_DECISION, a different code the bridge must NOT swallow.
      expect(() =>
        bridge.applyNervousDecision({ notificationId: 'ns-never-submitted', resolution: 'accepted', decidedBy: '' }),
      ).toThrow();
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

// ─── Direction 2: broker-pending (nervous-sourced) -> nervous notification ───────

describe('isNervousSourced / toNervousNotification', () => {
  it('isNervousSourced is true only for requester.role === "nervous"', () => {
    expect(isNervousSourced(buildRequest('r-1', { requester: { role: 'nervous', instanceId: 'n-1' } }))).toBe(true);
    expect(isNervousSourced(buildRequest('r-2', { requester: { role: 'worker', instanceId: 'w-1' } }))).toBe(false);
  });

  it('returns undefined for a non-nervous-sourced request', () => {
    const request = buildRequest('r-3', { requester: { role: 'worker', instanceId: 'w-1' } });
    expect(toNervousNotification(request)).toBeUndefined();
  });

  it('projects a full NervousNotification from a nervous-sourced request', () => {
    const request = buildRequest('r-4', {
      requester: { role: 'nervous', instanceId: 'nervous-detector-7' },
      scope: 'git-mutation',
      risk: 'high',
      policy: 'require-approval',
      scopeId: 'sprint-355-scope',
      maskedArgs: { cmd: '[REDACTED]' },
      details: { sprintId: 'sprint-355', taskId: 'task-355-012', note: 'ignored, not a string field we extract' },
    });

    const result = toNervousNotification(request);
    expect(result).toBeDefined();
    expect(result).toMatchObject({
      id: 'r-4',
      type: 'git-mutation',
      title: request.summary,
      severity: 'critical',
      createdAt: CREATED_AT,
      detectorId: 'nervous-detector-7',
      timeoutMs: Date.parse(EXPIRES_AT) - Date.parse(CREATED_AT),
      sprintId: 'sprint-355',
      taskId: 'task-355-012',
      groupKey: 'sprint-355-scope',
    });
    expect(result?.message).toContain('git-mutation');
    expect(result?.message).toContain('high');
    expect(result?.actions).toHaveLength(1);
    expect(result?.actions[0]).toMatchObject({
      id: 'r-4',
      label: request.summary,
      policy: 'approve',
      risk: 'high',
      isSafetyFloor: false,
      payload: { cmd: '[REDACTED]' },
    });
  });

  it.each<[ApprovalRisk, string, string]>([
    ['none', 'info', 'low'],
    ['low', 'info', 'low'],
    ['medium', 'warning', 'medium'],
    ['high', 'critical', 'high'],
    ['critical', 'emergency', 'high'],
  ])('maps risk=%s -> severity=%s, action.risk=%s', (risk, severity, actionRisk) => {
    const request = buildRequest(`r-risk-${risk}`, { risk });
    const result = toNervousNotification(request);
    expect(result?.severity).toBe(severity);
    expect(result?.actions[0]?.risk).toBe(actionRisk);
    expect(result?.actions[0]?.isSafetyFloor).toBe(risk === 'critical');
  });

  it.each([
    ['auto-approve', 'autonomous'],
    ['notify', 'suggest-30m'],
    ['require-approval', 'approve'],
    ['deny', 'approve'],
  ] as const)('maps policy=%s -> nervous policy=%s', (policy, expected) => {
    const request = buildRequest(`r-policy-${policy}`, { policy });
    const result = toNervousNotification(request);
    expect(result?.actions[0]?.policy).toBe(expected);
  });

  it('omits sprintId/taskId when details does not carry them as strings', () => {
    const request = buildRequest('r-5', { details: { sprintId: 42 } });
    const result = toNervousNotification(request);
    expect(result?.sprintId).toBeUndefined();
    expect(result?.taskId).toBeUndefined();
  });
});
