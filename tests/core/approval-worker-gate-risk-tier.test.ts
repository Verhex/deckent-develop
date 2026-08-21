import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalDecisionInput, ApprovalRequestInput } from '../../src/core/approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalRiskTier } from '../../src/core/config-types.js';
import {
  WorkerApprovalGate,
  type ApprovalBrokerLike,
  type WorkerActionDescriptor,
} from '../../src/core/approval-worker-gate.js';

class Broker implements ApprovalBrokerLike {
  readonly decisions: ApprovalDecisionInput[] = [];
  constructor(private readonly riskTier: ApprovalRiskTier) {}
  submit(input: ApprovalRequestInput): ApprovalRequest {
    return {
      version: '1.0', maskedArgs: null, rawArgsRef: null, ...input, riskTier: this.riskTier,
    } as ApprovalRequest & { riskTier: ApprovalRiskTier };
  }
  decide(id: string, input: ApprovalDecisionInput): ApprovalDecision {
    this.decisions.push(input);
    return { requestId: id, reason: '', ...input };
  }
  awaitDecision(): Promise<ApprovalDecision> {
    return new Promise(() => {});
  }
}

function action(policy: WorkerActionDescriptor['policy']): WorkerActionDescriptor {
  return {
    summary: 'guard action', details: {}, scopeId: 'p', scope: 'shell-exec', risk: 'high',
    policy, defaultAction: 'allow',
  };
}

function gate(broker: Broker, options: { timeoutMs?: number; fallbackResolver?: () => 'allow' } = {}) {
  return new WorkerApprovalGate({
    broker, requester: { role: 'worker', instanceId: 'w1' }, tenantId: 'main', userId: 'owner',
    idFactory: () => 'worker-risk-tier-1', now: () => new Date('2026-08-21T10:00:00.000Z'), ...options,
  });
}

describe('WorkerApprovalGate effective riskTier', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles high+critical auto-approve as deny without granting', async () => {
    const broker = new Broker('critical');
    await expect(gate(broker).guard(action('auto-approve'))).resolves.toBe('deny');
    expect(broker.decisions[0]).toMatchObject({ decision: 'deny', channel: 'risk-tier-guard' });
  });

  it('overrides an allow fallback for a critical tier', async () => {
    const broker = new Broker('critical');
    const verdict = gate(broker, { timeoutMs: 10, fallbackResolver: () => 'allow' })
      .guard(action('require-approval'));
    await vi.advanceTimersByTimeAsync(10);
    await expect(verdict).resolves.toBe('deny');
    expect(broker.decisions[0]).toMatchObject({ decision: 'deny', channel: 'fallback' });
  });

  it('preserves noncritical auto-approve behavior', async () => {
    const broker = new Broker('elevated');
    await expect(gate(broker).guard(action('auto-approve'))).resolves.toBe('allow');
  });
});
