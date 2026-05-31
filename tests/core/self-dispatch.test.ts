import { describe, it, expect } from 'vitest';
import {
  evaluateDispatch,
  DEFAULT_GUARD,
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

function makeFlow(): ScheduledFlow {
  return {
    id: 'flow-001',
    cronExpr: '* * * * *',
    action: 'deckent:start',
    tenantId: 'tenant-a',
    enabled: true,
  };
}

describe('evaluateDispatch — scheduled trigger', () => {
  it('returns dispatch=true when due dispatches exist', () => {
    const policy = makePolicy({ trigger: 'scheduled', action: 'plan' });
    const dispatches: DueDispatch[] = [
      { kind: 'scheduled', flow: makeFlow(), nextRun: new Date('2026-01-01T00:00:00.000Z') },
    ];
    const decision = evaluateDispatch(policy, { kind: 'scheduled', dispatches });
    expect(decision.dispatch).toBe(true);
    expect(decision.action).toBe('plan');
    expect(decision.trigger).toBe('scheduled');
    expect(decision.reason).toContain('1 due dispatch');
  });

  it('returns dispatch=false when no due dispatches', () => {
    const policy = makePolicy({ trigger: 'scheduled' });
    const decision = evaluateDispatch(policy, { kind: 'scheduled', dispatches: [] });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('no due');
  });
});

describe('evaluateDispatch — requiresApproval guard', () => {
  it('defaults requiresApproval to TRUE when guard not specified', () => {
    const policy = makePolicy();
    const decision = evaluateDispatch(policy, { kind: 'scheduled', dispatches: [] });
    expect(decision.requiresApproval).toBe(true);
  });

  it('honors explicit requiresApproval=true', () => {
    const policy = makePolicy({ guard: { requiresApproval: true } });
    const decision = evaluateDispatch(policy, { kind: 'scheduled', dispatches: [] });
    expect(decision.requiresApproval).toBe(true);
  });

  it('allows explicit opt-out via requiresApproval=false', () => {
    const policy = makePolicy({ guard: { requiresApproval: false } });
    const decision = evaluateDispatch(policy, { kind: 'scheduled', dispatches: [] });
    expect(decision.requiresApproval).toBe(false);
  });

  it('exports DEFAULT_GUARD with requiresApproval=true', () => {
    expect(DEFAULT_GUARD.requiresApproval).toBe(true);
  });
});

describe('evaluateDispatch — threshold trigger', () => {
  it('returns dispatch=true when metric crosses threshold (>)', () => {
    const policy = makePolicy({
      trigger: 'threshold',
      action: 'start',
      threshold: { metric: 'failure_rate', operator: '>', value: 0.1 },
    });
    const decision = evaluateDispatch(policy, {
      kind: 'threshold',
      metric: 'failure_rate',
      value: 0.2,
    });
    expect(decision.dispatch).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toContain('crossed');
  });

  it('returns dispatch=false when threshold not crossed', () => {
    const policy = makePolicy({
      trigger: 'threshold',
      threshold: { metric: 'failure_rate', operator: '>', value: 0.5 },
    });
    const decision = evaluateDispatch(policy, {
      kind: 'threshold',
      metric: 'failure_rate',
      value: 0.2,
    });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('not crossed');
  });

  it('returns dispatch=false when threshold metric mismatches', () => {
    const policy = makePolicy({
      trigger: 'threshold',
      threshold: { metric: 'failure_rate', operator: '>', value: 0.1 },
    });
    const decision = evaluateDispatch(policy, {
      kind: 'threshold',
      metric: 'unknown_metric',
      value: 0.5,
    });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('metric mismatch');
  });

  it('returns dispatch=false when policy.threshold config is missing', () => {
    const policy = makePolicy({ trigger: 'threshold' });
    const decision = evaluateDispatch(policy, {
      kind: 'threshold',
      metric: 'failure_rate',
      value: 0.5,
    });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('missing policy.threshold');
  });

  it('supports >= operator', () => {
    const policy = makePolicy({
      trigger: 'threshold',
      threshold: { metric: 'coverage', operator: '>=', value: 80 },
    });
    const decision = evaluateDispatch(policy, {
      kind: 'threshold',
      metric: 'coverage',
      value: 80,
    });
    expect(decision.dispatch).toBe(true);
  });
});

describe('evaluateDispatch — event trigger', () => {
  it('returns dispatch=true when event matches policy eventType', () => {
    const policy = makePolicy({ trigger: 'event', eventType: 'webhook.push' });
    const decision = evaluateDispatch(policy, {
      kind: 'event',
      eventType: 'webhook.push',
    });
    expect(decision.dispatch).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it('returns dispatch=false when event does not match', () => {
    const policy = makePolicy({ trigger: 'event', eventType: 'webhook.push' });
    const decision = evaluateDispatch(policy, {
      kind: 'event',
      eventType: 'webhook.delete',
    });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('event mismatch');
  });

  it('returns dispatch=true for wildcard (eventType undefined matches any)', () => {
    const policy = makePolicy({ trigger: 'event' });
    const decision = evaluateDispatch(policy, {
      kind: 'event',
      eventType: 'anything',
    });
    expect(decision.dispatch).toBe(true);
  });
});

describe('evaluateDispatch — trigger mismatch', () => {
  it('returns dispatch=false when policy trigger does not match context kind', () => {
    const policy = makePolicy({ trigger: 'scheduled' });
    const decision = evaluateDispatch(policy, {
      kind: 'event',
      eventType: 'any',
    });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('trigger mismatch');
  });
});
