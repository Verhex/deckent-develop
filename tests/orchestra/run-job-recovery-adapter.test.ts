import { describe, expect, it } from 'vitest';

import {
  planRunJobRecoveryEffect,
  readRunJobRecovery,
  type RunJobRecoveryRead,
} from '../../src/orchestra/recovery-adapters/run-job-recovery-adapter.js';

const identity = { taskId: 'job-480', attemptId: 'attempt-1', fenceToken: 'fence-1' };
const base = (overrides: Partial<RunJobRecoveryRead> = {}): RunJobRecoveryRead => ({
  expectedIdentity: identity,
  state: 'RUNNING',
  evidenceRefs: ['job-observation:sha256:abc'],
  previousProgressSequence: 4,
  observedProgressSequence: 5,
  wallClockProjection: 'FRESH',
  ...overrides,
});

describe('RunJob recovery adapter', () => {
  it('accepts RUNNING as live only when exact process identity verifies it', () => {
    const result = readRunJobRecovery(base({ process: { state: 'ALIVE', identity, evidenceRef: 'process:sha256:live' } }));
    expect(result.decision.decision).toBe('HEALTHY');
    expect(planRunJobRecoveryEffect(result)).toEqual({ action: 'OBSERVE_ONLY', reason: 'VERIFIED_LIVE' });
  });

  it('does not convert a raw running flag or mismatched process into liveness', () => {
    const result = readRunJobRecovery(base({ process: { state: 'ALIVE', identity: { ...identity, fenceToken: 'foreign' }, evidenceRef: 'process:foreign' } }));
    expect(result.input.evidence.process).toBe('UNKNOWN');
    expect(result.reconciliation.action).toBe('HOLD');
  });

  it('retains dead evidence as a resume proposal without invoking a provider', () => {
    const result = readRunJobRecovery(base({
      process: { state: 'DEAD', identity, evidenceRef: 'process:sha256:dead' },
      wallClockProjection: 'STALE', previousProgressSequence: 5, observedProgressSequence: 5,
      resumePermitRef: 'approval:resume',
    }));
    expect(result.decision.decision).toBe('SAFE_TO_RESUME');
    expect(result.reconciliation.action).toBe('REQUEST_RESUME_APPROVAL');
  });

  it('does not trust a foreign terminal receipt', () => {
    const result = readRunJobRecovery(base({
      state: 'COMPLETED', previousProgressSequence: 5, observedProgressSequence: 5,
      terminalReceipt: { identity: { ...identity, attemptId: 'other' }, evidenceRef: 'receipt:foreign' }, finalizePermitRef: 'approval:finalize',
    }));
    expect(result.input.evidence.completion).toBe('INCOMPLETE');
    expect(result.reconciliation.action).toBe('HOLD');
  });
});
