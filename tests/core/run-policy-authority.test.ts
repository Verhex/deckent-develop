import { describe, expect, it } from 'vitest';

import {
  createRunPolicyPlanAuthority,
  RunPolicyAuthorityBoundsError,
  RUN_POLICY_MAX_AUTHORITY_CONSTRAINTS,
  type RunPolicyPlanAuthority,
} from '../../src/core/task-types.js';
import {
  settleRunPolicyResultEvidence,
} from '../../src/core/task-result-settlement.js';

const CONSTRAINTS = [
  'No build or repository-wide test run during the sprint.',
  'Effective concurrency is one; no parallel writer.',
];

describe('createRunPolicyPlanAuthority — digest-bound plan authority', () => {
  it('authors a version-1 snapshot with a deterministic canonical digest', () => {
    const a = createRunPolicyPlanAuthority({ constraints: CONSTRAINTS, sourceRef: 'DIRECTIVES.md#execution-contract' });
    const b = createRunPolicyPlanAuthority({ constraints: [...CONSTRAINTS], sourceRef: 'DIRECTIVES.md#execution-contract' });
    expect(a.version).toBe(1);
    expect(a.policyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(a.policyDigest).toBe(b.policyDigest);
    expect(a.constraints).toEqual(CONSTRAINTS);
  });

  it('different constraint bytes or sourceRef produce different digests', () => {
    const base = createRunPolicyPlanAuthority({ constraints: CONSTRAINTS });
    const other = createRunPolicyPlanAuthority({ constraints: [...CONSTRAINTS, 'extra'] });
    const refd = createRunPolicyPlanAuthority({ constraints: CONSTRAINTS, sourceRef: 'x' });
    expect(other.policyDigest).not.toBe(base.policyDigest);
    expect(refd.policyDigest).not.toBe(base.policyDigest);
  });

  it('fail-closed: empty set, blank constraint, blank sourceRef and cap breaches throw typed bounds errors', () => {
    expect(() => createRunPolicyPlanAuthority({ constraints: [] })).toThrow(RunPolicyAuthorityBoundsError);
    expect(() => createRunPolicyPlanAuthority({ constraints: ['ok', '   '] })).toThrow(RunPolicyAuthorityBoundsError);
    expect(() => createRunPolicyPlanAuthority({ constraints: CONSTRAINTS, sourceRef: '  ' })).toThrow(RunPolicyAuthorityBoundsError);
    expect(() => createRunPolicyPlanAuthority({
      constraints: Array.from({ length: RUN_POLICY_MAX_AUTHORITY_CONSTRAINTS + 1 }, (_, i) => `c${i}`),
    })).toThrow(RunPolicyAuthorityBoundsError);
    expect(() => createRunPolicyPlanAuthority({ constraints: ['x'.repeat(501)] })).toThrow(RunPolicyAuthorityBoundsError);
  });
});

describe('settleRunPolicyResultEvidence — expected == observed parity', () => {
  const plan = createRunPolicyPlanAuthority({ constraints: CONSTRAINTS, sourceRef: 'DIRECTIVES.md#execution-contract' });

  it('settles POLICY_PARITY when the worker echoes the exact plan digest', () => {
    const decision = settleRunPolicyResultEvidence({
      plan,
      workerEvidence: { version: 1, observedPolicyDigest: plan.policyDigest, observedBy: 'worker' },
    });
    expect(decision).toEqual({ state: 'POLICY_PARITY', policyDigest: plan.policyDigest });
  });

  it('missing worker evidence is a typed HOLD, never a silent pass', () => {
    expect(settleRunPolicyResultEvidence({ plan })).toEqual({
      state: 'HOLD',
      reason: 'missing-worker-policy-evidence',
    });
  });

  it('a different observed digest is a typed HOLD', () => {
    const decision = settleRunPolicyResultEvidence({
      plan,
      workerEvidence: { version: 1, observedPolicyDigest: 'a'.repeat(64), observedBy: 'worker' },
    });
    expect(decision).toEqual({ state: 'HOLD', reason: 'policy-digest-mismatch' });
  });

  it('malformed worker evidence is a typed HOLD', () => {
    const decision = settleRunPolicyResultEvidence({
      plan,
      workerEvidence: { version: 1, observedPolicyDigest: 'not-a-digest', observedBy: 'worker' },
    });
    expect(decision).toEqual({ state: 'HOLD', reason: 'invalid-worker-policy-evidence' });
  });

  it('a tampered plan snapshot (constraint bytes changed after digest) can never settle', () => {
    const tampered: RunPolicyPlanAuthority = {
      ...plan,
      constraints: [...plan.constraints, 'injected constraint'],
    };
    const decision = settleRunPolicyResultEvidence({
      plan: tampered,
      workerEvidence: { version: 1, observedPolicyDigest: tampered.policyDigest, observedBy: 'worker' },
    });
    expect(decision).toEqual({ state: 'HOLD', reason: 'invalid-plan-authority' });
  });
});
