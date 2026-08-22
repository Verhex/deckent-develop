import { describe, expect, it } from 'vitest';
import {
  createSprintFinalizerGateAuthority, deriveSprintFinalizerGateInputDigest,
  invalidateSprintFinalizerGate, publishSprintFinalizerGate, resolveSprintFinalizerGate,
  type SprintFinalizerGateInput,
} from '../../src/core/sprint-finalizer-gate-authority.js';

const D = (character: string) => character.repeat(64);
const input = (overrides: Partial<SprintFinalizerGateInput> = {}): SprintFinalizerGateInput => ({
  runId: 'run-619', generation: 2, taskSetDigest: D('a'),
  attemptWinners: { '619-001': 'attempt-fix', '619-008': 'attempt-current' },
  codeDigest: D('b'), configDigest: D('c'), observedAt: '2026-08-22T10:00:00.000Z', ...overrides,
});

describe('sprint finalizer gate authority', () => {
  it('publishes a first-writer gate bound to the exact input and replays only that input', () => {
    const authority = createSprintFinalizerGateAuthority('619', 4);
    const exact = input(); const inputDigest = deriveSprintFinalizerGateInputDigest(exact);
    const written = publishSprintFinalizerGate(authority, { input: exact, inputDigest, outcome: 'PASS', expectedRevision: 4 });
    expect(written.decision).toBe('published');
    if (written.decision !== 'published') throw new Error('expected publish');
    expect(resolveSprintFinalizerGate(written.state, exact)).toEqual({ decision: 'authoritative', receipt: written.receipt });
    expect(publishSprintFinalizerGate(written.state, { input: exact, inputDigest, outcome: 'PASS', expectedRevision: 4 }).decision).toBe('idempotent');
    expect(publishSprintFinalizerGate(written.state, { input: exact, inputDigest, outcome: 'FAIL', expectedRevision: 5 })).toMatchObject({ decision: 'hold', reasonCode: 'gate-conflict' });
  });

  it('cannot use a Sprint-619 pre-fix TSC pass for fresh post-fix results', () => {
    const oldInput = input({ generation: 1, attemptWinners: { '619-001': 'attempt-prefx' }, codeDigest: D('d'), observedAt: '2026-08-22T09:00:00.000Z' });
    const oldDigest = deriveSprintFinalizerGateInputDigest(oldInput);
    const published = publishSprintFinalizerGate(createSprintFinalizerGateAuthority('619'), { input: oldInput, inputDigest: oldDigest, outcome: 'PASS', expectedRevision: 0 });
    if (published.decision !== 'published') throw new Error('expected publish');
    const fixed = input(); const fixedDigest = deriveSprintFinalizerGateInputDigest(fixed);
    expect(resolveSprintFinalizerGate(published.state, fixed)).toMatchObject({ decision: 'not-authoritative', reasonCode: 'stale-input' });
    expect(publishSprintFinalizerGate(published.state, { input: fixed, inputDigest: fixedDigest, outcome: 'PASS', expectedRevision: 1 })).toMatchObject({ decision: 'hold', reasonCode: 'stale-input' });
    const invalidated = invalidateSprintFinalizerGate(published.state, { expectedRevision: 1, invalidatedInputDigest: oldDigest, replacementInputDigest: fixedDigest, observedAt: '2026-08-22T10:01:00.000Z' });
    expect(invalidated).toMatchObject({ decision: 'invalidated', receipt: { kind: 'sprint-finalizer-gate-invalidation', reason: 'INPUT_CHANGED', priorRevision: 1, revision: 2 }, state: { gate: null, archivedGates: [published.receipt] } });
    if (invalidated.decision !== 'invalidated') throw new Error('expected invalidation');
    const fresh = publishSprintFinalizerGate(invalidated.state, { input: fixed, inputDigest: fixedDigest, outcome: 'PASS', expectedRevision: 2 });
    expect(fresh).toMatchObject({ decision: 'published', receipt: { priorRevision: 2, revision: 3, inputDigest: fixedDigest } });
  });

  it('digest binds run, generation, task set, winners, code, config, and observation', () => {
    const baseline = deriveSprintFinalizerGateInputDigest(input());
    const variants = [input({ runId: 'run-new' }), input({ generation: 3 }), input({ taskSetDigest: D('e') }), input({ attemptWinners: { '619-001': 'attempt-other' } }), input({ codeDigest: D('f') }), input({ configDigest: D('0') }), input({ observedAt: '2026-08-22T10:00:01.000Z' })];
    expect(variants.map(deriveSprintFinalizerGateInputDigest)).not.toContain(baseline);
    expect(deriveSprintFinalizerGateInputDigest(input({ attemptWinners: { '619-008': 'attempt-current', '619-001': 'attempt-fix' } }))).toBe(baseline);
  });

  it('fails closed on stale CAS, dishonest digest, and invalid invalidation', () => {
    const exact = input(); const inputDigest = deriveSprintFinalizerGateInputDigest(exact);
    expect(publishSprintFinalizerGate(createSprintFinalizerGateAuthority('619', 2), { input: exact, inputDigest, outcome: 'PASS', expectedRevision: 1 })).toMatchObject({ decision: 'hold', reasonCode: 'revision-conflict' });
    expect(publishSprintFinalizerGate(createSprintFinalizerGateAuthority('619'), { input: exact, inputDigest: D('9'), outcome: 'PASS', expectedRevision: 0 })).toMatchObject({ decision: 'hold', reasonCode: 'input-digest-mismatch' });
  });
});
