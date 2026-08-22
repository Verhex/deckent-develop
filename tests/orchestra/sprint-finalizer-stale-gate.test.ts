import { describe, expect, it, vi } from 'vitest';

import {
  createSprintFinalizerGateAuthority,
  deriveSprintFinalizerGateInputDigest,
  publishSprintFinalizerGate,
  type SprintFinalizerGateInput,
} from '../../src/core/sprint-finalizer-gate-authority.js';
import {
  applyAuthoritativeGateStatus,
  applyGateStatus,
  resolveOrEvaluateFreshFinalizerGate,
} from '../../src/orchestra/sprint-finalizer.js';

const digest = (value: string): string => value.repeat(64);

function gateInput(overrides: Partial<SprintFinalizerGateInput> = {}): SprintFinalizerGateInput {
  return {
    runId: 'run-619', generation: 2, taskSetDigest: digest('a'),
    attemptWinners: { '619-001': 'attempt-fix' }, codeDigest: digest('b'),
    configDigest: digest('c'), observedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

function authorityWith(input: SprintFinalizerGateInput, outcome: 'PASS' | 'FAIL') {
  const published = publishSprintFinalizerGate(createSprintFinalizerGateAuthority('sprint-619'), {
    input, inputDigest: deriveSprintFinalizerGateInputDigest(input), outcome, expectedRevision: 0,
  });
  if (published.decision !== 'published') throw new Error('fixture publish failed');
  return published.state;
}

describe('finalizer fresh-gate production wiring', () => {
  it('re-evaluates a stale failure, preserves it forensically, and keeps a product-green run complete', async () => {
    const staleInput = gateInput({ generation: 1, codeDigest: digest('d'), observedAt: '2026-08-22T09:00:00.000Z' });
    const staleAuthority = authorityWith(staleInput, 'FAIL');
    const evaluate = vi.fn().mockResolvedValue('PASS' as const);

    const resolved = await resolveOrEvaluateFreshFinalizerGate({
      authority: staleAuthority, currentInput: gateInput(), evaluate,
      now: () => '2026-08-22T10:01:00.000Z',
    });

    expect(evaluate).toHaveBeenCalledOnce();
    expect(resolved).toMatchObject({ outcome: 'PASS', reused: false });
    expect(resolved.authority.archivedGates).toEqual([staleAuthority.gate]);
    expect(resolved.authority.invalidations).toHaveLength(1);
    expect(resolved.authority.gate?.outcome).toBe('PASS');
    expect(applyGateStatus('DONE', { overallGate: resolved.outcome === 'PASS' ? 'PASS' : 'GATE_FAILURE' }))
      .toBe('DONE');
    expect(applyAuthoritativeGateStatus('GO_WITH_GATE_FAILURE', resolved.outcome, true)).toBe('DONE');
  });

  it('never accepts stale success and keeps a fresh failure fail-closed', async () => {
    const staleAuthority = authorityWith(
      gateInput({ generation: 1, observedAt: '2026-08-22T09:00:00.000Z' }),
      'PASS',
    );
    const resolved = await resolveOrEvaluateFreshFinalizerGate({
      authority: staleAuthority, currentInput: gateInput(), evaluate: async () => 'FAIL',
      now: () => '2026-08-22T10:01:00.000Z',
    });

    expect(resolved).toMatchObject({ outcome: 'FAIL', reused: false });
    expect(resolved.authority.archivedGates[0]?.outcome).toBe('PASS');
    expect(applyAuthoritativeGateStatus('DONE', resolved.outcome, true)).toBe('GO_WITH_GATE_FAILURE');
  });

  it('reuses an exact-input failure without ignoring it', async () => {
    const currentInput = gateInput();
    const evaluate = vi.fn().mockResolvedValue('PASS' as const);
    const resolved = await resolveOrEvaluateFreshFinalizerGate({
      authority: authorityWith(currentInput, 'FAIL'), currentInput, evaluate,
    });

    expect(resolved).toMatchObject({ outcome: 'FAIL', reused: true });
    expect(evaluate).not.toHaveBeenCalled();
  });
});
