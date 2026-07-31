import { describe, expect, it } from 'vitest';

import {
  planRunFlowRecoveryEffect,
  readRunFlowRecovery,
  type RunFlowRecoveryRead,
} from '../../src/orchestra/recovery-adapters/run-flow-recovery-adapter.js';

const identity = { taskId: 'flow-480', attemptId: 'attempt-1', fenceToken: 'fence-1' };
const base = (overrides: Partial<RunFlowRecoveryRead> = {}): RunFlowRecoveryRead => ({
  expectedIdentity: identity,
  state: 'DETACHED_RUNNING',
  evidenceRefs: ['flow-observation:sha256:abc'],
  previousProgressSequence: 4,
  observedProgressSequence: 5,
  wallClockProjection: 'FRESH',
  ...overrides,
});

describe('RunFlow recovery adapter', () => {
  it('treats DETACHED_RUNNING as live only with exact process authority', () => {
    const result = readRunFlowRecovery(base({ process: { state: 'ALIVE', identity, evidenceRef: 'process:sha256:live' } }));
    expect(result.decision.decision).toBe('HEALTHY');
    expect(planRunFlowRecoveryEffect(result)).toEqual({ action: 'OBSERVE_ONLY', reason: 'VERIFIED_LIVE' });
  });

  it('holds a raw detached-running claim with foreign process authority', () => {
    const result = readRunFlowRecovery(base({ process: { state: 'ALIVE', identity: { ...identity, attemptId: 'other' }, evidenceRef: 'process:foreign' } }));
    expect(result.input.evidence.process).toBe('UNKNOWN');
    expect(result.reconciliation).toEqual({ action: 'HOLD', reason: 'INSUFFICIENT_OR_CONFLICTING_EVIDENCE' });
  });

  it('turns exact stale/dead evidence into an approval request, never an automatic replay', () => {
    const result = readRunFlowRecovery(base({
      process: { state: 'DEAD', identity, evidenceRef: 'process:sha256:dead' },
      wallClockProjection: 'STALE', previousProgressSequence: 5, observedProgressSequence: 5,
      resumePermitRef: 'approval:resume',
    }));
    expect(result.decision.decision).toBe('SAFE_TO_RESUME');
    expect(result.reconciliation.action).toBe('REQUEST_RESUME_APPROVAL');
  });

  it('requires an exact terminal receipt before proposing finalization', () => {
    const result = readRunFlowRecovery(base({
      state: 'COMPLETED', previousProgressSequence: 5, observedProgressSequence: 5,
      process: { state: 'ALIVE', identity, evidenceRef: 'process:sha256:terminal' },
      terminalReceipt: { identity, evidenceRef: 'receipt:sha256:terminal' }, finalizePermitRef: 'approval:finalize',
    }));
    expect(result.decision.decision).toBe('SAFE_TO_FINALIZE');
    expect(result.reconciliation.action).toBe('REQUEST_FINALIZE_APPROVAL');
  });
});
