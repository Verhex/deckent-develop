import { describe, expect, it, vi } from 'vitest';

import {
  decideExecutionRecovery,
  type ExecutionRecoveryIdentity,
} from '../../src/core/execution-recovery.js';
import {
  applyFencedEffect,
  deriveFencedEffects,
  type ExecutionRecoveryFencedEffect,
} from '../../src/orchestra/execution-recovery-adapter.js';
import {
  createSprintRecoveryAdapter,
  type SprintNativeEvidence,
  type SprintSettleHousekeepingDependencies,
} from '../../src/orchestra/recovery-adapters/sprint-recovery-adapter.js';

const identity: ExecutionRecoveryIdentity = {
  taskId: 'sprint-480',
  attemptId: 'sprint-480',
  fenceToken: 'sprint-480',
};

function makeDeps(): {
  deps: SprintSettleHousekeepingDependencies;
  calls: { checkpoint: string[]; pid: string[]; sprintState: string[] };
} {
  const calls = { checkpoint: [] as string[], pid: [] as string[], sprintState: [] as string[] };
  const deps: SprintSettleHousekeepingDependencies = {
    clearCheckpoint: vi.fn((id: string) => { calls.checkpoint.push(id); }),
    clearPid: vi.fn((id: string) => { calls.pid.push(id); }),
    clearMatchingSprintState: vi.fn((id: string) => { calls.sprintState.push(id); }),
  };
  return { deps, calls };
}

function nativeEvidence(overrides: Partial<SprintNativeEvidence> = {}): SprintNativeEvidence {
  return {
    identity,
    evidenceRefs: ['sprint-checkpoint:sha256:abc'],
    dispatch: 'DISPATCHED',
    control: 'RUNNING',
    process: 'ABSENT',
    fence: 'INACTIVE',
    previousProgressSequence: 3,
    observedProgressSequence: 3,
    wallClockProjection: 'FRESH',
    completion: 'DURABLE',
    finalizePermitRef: 'finalize-permit:sha256:def',
    ...overrides,
  };
}

describe('createSprintRecoveryAdapter vocabulary', () => {
  it('declares only inspect + settle — resume/abort/terminate stay CLI-owned (async death-proof)', () => {
    const { deps } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);

    expect(adapter.mode).toBe('sprint');
    expect(adapter.platform).toBe('posix');
    expect(adapter.capabilities).toEqual({
      mode: 'sprint',
      platform: 'posix',
      supported: ['inspect', 'settle'],
    });
  });

  it('never hardcodes platform — honors whichever platform the caller passes', () => {
    const { deps } = makeDeps();
    const adapter = createSprintRecoveryAdapter('windows-native', deps);
    expect(adapter.platform).toBe('windows-native');
    expect(adapter.capabilities.platform).toBe('windows-native');
  });
});

describe('createSprintRecoveryAdapter.inspect', () => {
  it('is a pure mapping from native evidence to ExecutionRecoveryInput (no I/O, no deps call)', () => {
    const { deps, calls } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);
    const native = nativeEvidence();

    const result = adapter.inspect(identity, native);

    expect(result).toEqual({
      ok: true,
      value: {
        expectedIdentity: identity,
        evidence: {
          identity,
          evidenceRefs: native.evidenceRefs,
          dispatch: 'DISPATCHED',
          control: 'RUNNING',
          process: 'ABSENT',
          fence: 'INACTIVE',
          previousProgressSequence: 3,
          observedProgressSequence: 3,
          wallClockProjection: 'FRESH',
          completion: 'DURABLE',
          finalizePermitRef: 'finalize-permit:sha256:def',
        },
      },
    });
    expect(calls.checkpoint).toEqual([]);
    expect(calls.pid).toEqual([]);
    expect(calls.sprintState).toEqual([]);
  });

  it('omits resumePermitRef/finalizePermitRef when not present on the native evidence', () => {
    const { deps } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);
    const native = nativeEvidence({ completion: 'INCOMPLETE', finalizePermitRef: undefined });

    const result = adapter.inspect(identity, native);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidence).not.toHaveProperty('finalizePermitRef');
      expect(result.value.evidence).not.toHaveProperty('resumePermitRef');
    }
  });
});

describe('createSprintRecoveryAdapter.apply', () => {
  const settleEffect: ExecutionRecoveryFencedEffect = {
    capability: 'settle',
    operation: 'FINALIZE_EXACT_ATTEMPT',
    decision: 'SAFE_TO_FINALIZE',
    identity,
    evidenceRefs: ['sprint-checkpoint:sha256:abc', 'finalize-permit:sha256:def'],
  };

  it('applies all three housekeeping steps for the exact sprint id and reports success', () => {
    const { deps, calls } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);

    const result = adapter.apply(settleEffect);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(calls.checkpoint).toEqual(['sprint-480']);
    expect(calls.pid).toEqual(['sprint-480']);
    expect(calls.sprintState).toEqual(['sprint-480']);
  });

  it('attempts every housekeeping step but reports a typed failure when one fails', () => {
    const { deps, calls } = makeDeps();
    (deps.clearCheckpoint as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('checkpoint archive locked');
    });
    const adapter = createSprintRecoveryAdapter('posix', deps);

    const result = adapter.apply(settleEffect);

    expect(result).toMatchObject({ ok: false, code: 'EFFECT_FAILED' });
    expect(calls.pid).toEqual(['sprint-480']);
    expect(calls.sprintState).toEqual(['sprint-480']);
  });

  it.each(['inspect', 'resume', 'abort', 'terminate'] as const)(
    'refuses the "%s" capability without calling any housekeeping dependency',
    async (capability) => {
      const { deps, calls } = makeDeps();
      const adapter = createSprintRecoveryAdapter('posix', deps);

      const result = await adapter.apply({ ...settleEffect, capability });

      expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
      expect(calls.checkpoint).toEqual([]);
      expect(calls.pid).toEqual([]);
      expect(calls.sprintState).toEqual([]);
    },
  );
});

describe('sprint adapter end-to-end through the shared decision + boundary-guard pipeline', () => {
  it('a real SAFE_TO_FINALIZE outcome derives exactly one settle effect the adapter can apply', () => {
    const { deps, calls } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);
    const native = nativeEvidence();

    const inspected = adapter.inspect(identity, native);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;

    const outcome = decideExecutionRecovery(inspected.value);
    expect(outcome.decision).toBe('SAFE_TO_FINALIZE');

    const effects = deriveFencedEffects(identity, outcome);
    expect(effects).toHaveLength(1);
    expect(effects[0]?.capability).toBe('settle');

    const applied = applyFencedEffect(adapter, identity, effects[0]!);

    expect(applied).toEqual({ ok: true, value: undefined });
    expect(calls.pid).toEqual(['sprint-480']);
  });

  it('applyFencedEffect rejects a foreign identity before ever invoking the housekeeping deps', () => {
    const { deps, calls } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);
    const foreignEffect: ExecutionRecoveryFencedEffect = {
      capability: 'settle',
      operation: 'FINALIZE_EXACT_ATTEMPT',
      decision: 'SAFE_TO_FINALIZE',
      identity: { taskId: 'sprint-OTHER', attemptId: 'sprint-OTHER', fenceToken: 'sprint-OTHER' },
      evidenceRefs: [],
    };

    const result = applyFencedEffect(adapter, identity, foreignEffect);

    expect(result).toMatchObject({ ok: false, code: 'IDENTITY_MISMATCH' });
    expect(calls.checkpoint).toEqual([]);
    expect(calls.pid).toEqual([]);
    expect(calls.sprintState).toEqual([]);
  });

  it('derives orphan inspection plus abort while a base adapter honestly leaves abort unsupported', () => {
    const { deps } = makeDeps();
    const adapter = createSprintRecoveryAdapter('posix', deps);
    const orphaned = decideExecutionRecovery({
      expectedIdentity: identity,
      evidence: {
        identity,
        evidenceRefs: ['obs:sha256:xyz'],
        dispatch: 'DISPATCHED',
        control: 'RUNNING',
        process: 'ABSENT',
        fence: 'INACTIVE',
        previousProgressSequence: 5,
        observedProgressSequence: 5,
        wallClockProjection: 'STALE',
        completion: 'INCOMPLETE',
      },
    });
    expect(orphaned.decision).toBe('ORPHANED');

    const effects = deriveFencedEffects(identity, orphaned);
    expect(effects.map(e => e.capability)).toEqual(['inspect', 'abort']);
    expect(applyFencedEffect(adapter, identity, effects[1]!)).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
    });
  });
});
