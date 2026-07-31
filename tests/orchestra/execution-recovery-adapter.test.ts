import { describe, expect, it, vi } from 'vitest';

import {
  decideExecutionRecovery,
  type ExecutionRecoveryEvidence,
  type ExecutionRecoveryIdentity,
  type ExecutionRecoveryInput,
} from '../../src/core/execution-recovery.js';
import {
  EXECUTION_RECOVERY_ADAPTER_CAPABILITIES,
  EXECUTION_RECOVERY_MODES,
  EXECUTION_RECOVERY_PLATFORMS,
  EXECUTION_RECOVERY_PROCESS_IDENTITY_PRIMITIVES,
  applyFencedEffect,
  declarationSupports,
  deriveFencedEffects,
  inspectWithIntegrityGuard,
  processIdentityPrimitiveFor,
  type ExecutionRecoveryAdapterResult,
  type ExecutionRecoveryFencedEffect,
  type ExecutionRecoveryModeAdapter,
} from '../../src/orchestra/execution-recovery-adapter.js';

const identity: ExecutionRecoveryIdentity = {
  taskId: 'task-480',
  attemptId: 'attempt-exact',
  fenceToken: 'fence-exact',
};

function evidence(
  overrides: Partial<ExecutionRecoveryEvidence> = {},
): ExecutionRecoveryEvidence {
  return {
    identity,
    evidenceRefs: ['recovery-observation:sha256:abc'],
    dispatch: 'DISPATCHED',
    control: 'RUNNING',
    process: 'ALIVE',
    fence: 'ACTIVE',
    previousProgressSequence: 4,
    observedProgressSequence: 5,
    wallClockProjection: 'FRESH',
    completion: 'INCOMPLETE',
    ...overrides,
  };
}

interface NativeSprintEvidence {
  sprintId: string;
  phase: string;
}

function makeAdapter(
  overrides: Partial<{
    supported: readonly (typeof EXECUTION_RECOVERY_ADAPTER_CAPABILITIES)[number][];
    inspectImpl: (
      expectedIdentity: ExecutionRecoveryIdentity,
      native: NativeSprintEvidence,
    ) => ExecutionRecoveryAdapterResult<ExecutionRecoveryInput>;
    applyImpl: (
      effect: ExecutionRecoveryFencedEffect,
    ) => ExecutionRecoveryAdapterResult<void>;
  }> = {},
): {
  adapter: ExecutionRecoveryModeAdapter<NativeSprintEvidence>;
  applySpy: ReturnType<typeof vi.fn>;
} {
  const applySpy = vi.fn(
    overrides.applyImpl ?? (() => ({ ok: true, value: undefined }) as const),
  );
  const adapter: ExecutionRecoveryModeAdapter<NativeSprintEvidence> = {
    mode: 'sprint',
    platform: 'posix',
    capabilities: {
      mode: 'sprint',
      platform: 'posix',
      supported: overrides.supported ?? ['inspect', 'resume', 'settle'],
    },
    inspect:
      overrides.inspectImpl
      ?? ((expectedIdentity, native) => ({
        ok: true,
        value: {
          expectedIdentity,
          evidence: evidence({ evidenceRefs: [`native:${native.sprintId}:${native.phase}`] }),
        },
      })),
    apply: applySpy,
  };
  return { adapter, applySpy };
}

describe('execution recovery adapter vocabulary', () => {
  it('exports exactly the canonical mode/platform/capability/primitive vocabularies', () => {
    expect(EXECUTION_RECOVERY_MODES).toEqual([
      'sprint', 'run', 'flow', 'do', 'autonomous', 'mission', 'process',
    ]);
    expect(EXECUTION_RECOVERY_PLATFORMS).toEqual([
      'posix', 'windows-native', 'wsl', 'oci',
    ]);
    expect(EXECUTION_RECOVERY_ADAPTER_CAPABILITIES).toEqual([
      'inspect', 'resume', 'settle', 'abort', 'terminate',
    ]);
    expect(EXECUTION_RECOVERY_PROCESS_IDENTITY_PRIMITIVES).toEqual([
      'pid-start-time-liveness', 'win32-handle-liveness', 'container-runtime-liveness',
    ]);
  });

  it('maps every platform to exactly one honest process identity primitive', () => {
    expect(processIdentityPrimitiveFor('posix')).toBe('pid-start-time-liveness');
    expect(processIdentityPrimitiveFor('wsl')).toBe('pid-start-time-liveness');
    expect(processIdentityPrimitiveFor('windows-native')).toBe('win32-handle-liveness');
    expect(processIdentityPrimitiveFor('oci')).toBe('container-runtime-liveness');
  });

  it('declarationSupports checks the exact declared capability list', () => {
    const declaration = { mode: 'sprint' as const, platform: 'posix' as const, supported: ['inspect' as const] };
    expect(declarationSupports(declaration, 'inspect')).toBe(true);
    expect(declarationSupports(declaration, 'resume')).toBe(false);
  });
});

describe('deriveFencedEffects', () => {
  it('maps every allowed core operation to exactly one capability, never inventing a decision', () => {
    const outcome = decideExecutionRecovery({ expectedIdentity: identity, evidence: evidence() });
    const effects = deriveFencedEffects(identity, outcome);

    expect(effects).toEqual([
      {
        capability: 'inspect',
        operation: 'OBSERVE',
        decision: 'HEALTHY',
        identity,
        evidenceRefs: outcome.evidenceRefs,
      },
    ]);
  });

  it('maps RESUME_EXACT_ATTEMPT to the resume capability', () => {
    const outcome = decideExecutionRecovery({
      expectedIdentity: identity,
      evidence: evidence({
        process: 'ABSENT',
        fence: 'INACTIVE',
        previousProgressSequence: 5,
        observedProgressSequence: 5,
        resumePermitRef: 'resume-permit:sha256:def',
      }),
    });

    const effects = deriveFencedEffects(identity, outcome);
    expect(effects).toEqual([
      {
        capability: 'resume',
        operation: 'RESUME_EXACT_ATTEMPT',
        decision: 'SAFE_TO_RESUME',
        identity,
        evidenceRefs: outcome.evidenceRefs,
      },
    ]);
  });

  it('maps FINALIZE_EXACT_ATTEMPT to the settle capability', () => {
    const outcome = decideExecutionRecovery({
      expectedIdentity: identity,
      evidence: evidence({
        previousProgressSequence: 5,
        observedProgressSequence: 5,
        completion: 'DURABLE',
        finalizePermitRef: 'finalize-permit:sha256:ghi',
      }),
    });

    const effects = deriveFencedEffects(identity, outcome);
    expect(effects).toEqual([
      {
        capability: 'settle',
        operation: 'FINALIZE_EXACT_ATTEMPT',
        decision: 'SAFE_TO_FINALIZE',
        identity,
        evidenceRefs: outcome.evidenceRefs,
      },
    ]);
  });

  it('derives abort/terminate only when the canonical core outcome explicitly allows them', () => {
    const allDecisionOutcomes = [
      evidence(),
      evidence({ dispatch: 'NOT_DISPATCHED', process: 'ABSENT', fence: 'INACTIVE', previousProgressSequence: 0, observedProgressSequence: 0 }),
      evidence({ control: 'PAUSED', previousProgressSequence: 5, observedProgressSequence: 5 }),
      evidence({ control: 'HELD', previousProgressSequence: 5, observedProgressSequence: 5 }),
      evidence({ process: 'ABSENT', fence: 'INACTIVE', previousProgressSequence: 5, observedProgressSequence: 5 }),
      evidence({ previousProgressSequence: 5, observedProgressSequence: 5 }),
    ].map(ev => decideExecutionRecovery({ expectedIdentity: identity, evidence: ev }));

    const capabilities = allDecisionOutcomes
      .flatMap(outcome => deriveFencedEffects(identity, outcome))
      .map(effect => effect.capability);

    expect(capabilities).toContain('abort');
    expect(capabilities).toContain('terminate');
  });
});

describe('inspectWithIntegrityGuard', () => {
  it('returns the adapter evidence unchanged when native evidence is not mutated', () => {
    const { adapter } = makeAdapter();
    const native: NativeSprintEvidence = { sprintId: 'sprint-9', phase: 'RUN' };

    const result = inspectWithIntegrityGuard(adapter, identity, native);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidence.evidenceRefs).toEqual(['native:sprint-9:RUN']);
    }
  });

  it('rejects unsupported inspect capability without ever calling the adapter', () => {
    const inspectImpl = vi.fn();
    const { adapter } = makeAdapter({ supported: ['resume'], inspectImpl });

    const result = inspectWithIntegrityGuard(adapter, identity, { sprintId: 's', phase: 'p' });

    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    expect(inspectImpl).not.toHaveBeenCalled();
  });

  it('detects in-place mutation of native evidence during inspect and rejects it', () => {
    const { adapter } = makeAdapter({
      inspectImpl: (expectedIdentity, native) => {
        // Simulate a misbehaving adapter mutating the native evidence it was given.
        (native as { phase: string }).phase = 'MUTATED';
        return {
          ok: true,
          value: { expectedIdentity, evidence: evidence() },
        };
      },
    });
    const native: NativeSprintEvidence = { sprintId: 'sprint-9', phase: 'RUN' };

    const result = inspectWithIntegrityGuard(adapter, identity, native);

    expect(result).toMatchObject({ ok: false, code: 'INSPECTION_MUTATED_EVIDENCE' });
  });
});

describe('applyFencedEffect', () => {
  const effect: ExecutionRecoveryFencedEffect = {
    capability: 'resume',
    operation: 'RESUME_EXACT_ATTEMPT',
    decision: 'SAFE_TO_RESUME',
    identity,
    evidenceRefs: ['recovery-observation:sha256:abc', 'resume-permit:sha256:def'],
  };

  it('delegates to adapter.apply exactly once when identity and capability match', () => {
    const { adapter, applySpy } = makeAdapter();

    const result = applyFencedEffect(adapter, identity, effect);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith(effect);
  });

  it('rejects a foreign identity before ever calling adapter.apply (no clearing foreign authority)', () => {
    const { adapter, applySpy } = makeAdapter();
    const foreignIdentity: ExecutionRecoveryIdentity = {
      taskId: 'task-480',
      attemptId: 'attempt-OTHER',
      fenceToken: 'fence-exact',
    };

    const result = applyFencedEffect(adapter, foreignIdentity, effect);

    expect(result).toMatchObject({ ok: false, code: 'IDENTITY_MISMATCH' });
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('rejects an unsupported capability before ever calling adapter.apply (no silent fallback)', () => {
    const { adapter, applySpy } = makeAdapter({ supported: ['inspect'] });

    const result = applyFencedEffect(adapter, identity, effect);

    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('never retries: a failing adapter.apply is still called exactly once', () => {
    const { adapter, applySpy } = makeAdapter({
      applyImpl: () => ({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'adapter-level failure' }),
    });

    const result = applyFencedEffect(adapter, identity, effect);

    expect(result).toMatchObject({ ok: false });
    expect(applySpy).toHaveBeenCalledTimes(1);
  });
});
