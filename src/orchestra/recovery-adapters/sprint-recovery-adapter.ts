// ═══ Sprint Mode Recovery Adapter (480-004) ════════════════════════════════
//
// The first concrete `ExecutionRecoveryModeAdapter` (mode: 'sprint') over the
// boundary contract from 480-002 (`../execution-recovery-adapter.ts`). It
// gives Sprint containment (recover/finalize/cleanup) a single, shared,
// identity-fenced implementation of the local housekeeping effect instead of
// each CLI command re-implementing its own try/catch sequence.
//
// `inspect` stays a PURE mapping — exactly like every other mode's adapter,
// gathering the real canonical-status / checkpoint / PID evidence into a
// `SprintNativeEvidence` value is the caller's job (CLI command layer), not
// this adapter's. No I/O, no mutation, matches
// `ExecutionRecoveryModeAdapter.inspect`'s own contract.
//
// `apply` always supports inspect/settle and conditionally declares async
// resume/abort/terminate only when the caller injects the corresponding real
// operation. This keeps the proven SIGTERM → configured wait → ownership
// recheck → SIGKILL → death-proof contract intact: the adapter awaits that
// operation and never reports APPLIED before it finishes. Missing operations
// remain honestly unsupported.
//
// For Sprint mode, `ExecutionRecoveryIdentity` (taskId/attemptId/fenceToken)
// is populated from the one exact-attempt identity a sprint recovery run has:
// the sprint id itself. Sprint containment does not subdivide into separate
// task/attempt/fence identities the way a dispatched execution attempt does.

import type {
  ExecutionRecoveryEvidence,
  ExecutionRecoveryIdentity,
  ExecutionRecoveryInput,
} from '../../core/execution-recovery.js';
import type {
  ExecutionRecoveryAdapterCapability,
  ExecutionRecoveryAdapterResult,
  ExecutionRecoveryFencedEffect,
  ExecutionRecoveryModeAdapter,
  ExecutionRecoveryPlatform,
} from '../execution-recovery-adapter.js';

/** The exact evidence shape a Sprint-mode caller must gather before calling `inspect`. */
export interface SprintNativeEvidence {
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRefs: readonly string[];
  readonly dispatch: ExecutionRecoveryEvidence['dispatch'];
  readonly control: ExecutionRecoveryEvidence['control'];
  readonly process: ExecutionRecoveryEvidence['process'];
  readonly fence: ExecutionRecoveryEvidence['fence'];
  readonly previousProgressSequence: number;
  readonly observedProgressSequence: number;
  readonly wallClockProjection: ExecutionRecoveryEvidence['wallClockProjection'];
  readonly completion: ExecutionRecoveryEvidence['completion'];
  readonly resumePermitRef?: string;
  readonly finalizePermitRef?: string;
}

/**
 * Local, already-synchronous Sprint containment housekeeping — the exact
 * checkpoint/PID/sprint-state clearing steps `recover.ts` performed inline
 * pre-480-004. Every step is attempted so one failure does not prevent the
 * remaining containment work, while the aggregate result reports a typed
 * EFFECT_FAILED instead of silently claiming success.
 */
export interface SprintSettleHousekeepingDependencies {
  clearCheckpoint(sprintId: string): void;
  clearPid(sprintId: string): void;
  /** Caller decides "matching" (only clear sprint-state that still names this sprint). */
  clearMatchingSprintState(sprintId: string): void;
  /** Optional async continuation seam; capability is not declared when absent. */
  resumeExactAttempt?(sprintId: string): Promise<void>;
  /** Optional approval-bound abort seam; capability is not declared when absent. */
  abortExactAttempt?(sprintId: string): Promise<void>;
  /** Optional death-proof termination seam; capability is not declared when absent. */
  terminateExactAttempt?(sprintId: string): Promise<void>;
}

function toRecoveryInput(
  expectedIdentity: ExecutionRecoveryIdentity,
  native: SprintNativeEvidence,
): ExecutionRecoveryInput {
  const evidence: ExecutionRecoveryEvidence = {
    identity: native.identity,
    evidenceRefs: native.evidenceRefs,
    dispatch: native.dispatch,
    control: native.control,
    process: native.process,
    fence: native.fence,
    previousProgressSequence: native.previousProgressSequence,
    observedProgressSequence: native.observedProgressSequence,
    wallClockProjection: native.wallClockProjection,
    completion: native.completion,
    ...(native.resumePermitRef !== undefined ? { resumePermitRef: native.resumePermitRef } : {}),
    ...(native.finalizePermitRef !== undefined ? { finalizePermitRef: native.finalizePermitRef } : {}),
  };
  return { expectedIdentity, evidence };
}

/** Applies all 'settle' housekeeping steps and reports aggregate failure honestly. */
function applySettleHousekeeping(
  sprintId: string,
  deps: SprintSettleHousekeepingDependencies,
): ExecutionRecoveryAdapterResult<void> {
  const failures: unknown[] = [];
  try { deps.clearCheckpoint(sprintId); } catch (error) { failures.push(error); }
  try { deps.clearPid(sprintId); } catch (error) { failures.push(error); }
  try { deps.clearMatchingSprintState(sprintId); } catch (error) { failures.push(error); }
  return failures.length === 0
    ? { ok: true, value: undefined }
    : {
        ok: false,
        code: 'EFFECT_FAILED',
        message: `Sprint settle housekeeping failed in ${failures.length} step(s).`,
      };
}

function supportedCapabilities(
  deps: SprintSettleHousekeepingDependencies,
): readonly ExecutionRecoveryAdapterCapability[] {
  return [
    'inspect',
    'settle',
    ...(deps.resumeExactAttempt ? ['resume' as const] : []),
    ...(deps.abortExactAttempt ? ['abort' as const] : []),
    ...(deps.terminateExactAttempt ? ['terminate' as const] : []),
  ];
}

async function applyAsyncOperation(
  effect: ExecutionRecoveryFencedEffect,
  deps: SprintSettleHousekeepingDependencies,
): Promise<ExecutionRecoveryAdapterResult<void>> {
  const operation = effect.capability === 'resume'
    ? deps.resumeExactAttempt
    : effect.capability === 'abort'
      ? deps.abortExactAttempt
      : effect.capability === 'terminate'
        ? deps.terminateExactAttempt
        : undefined;
  if (!operation) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      message: `Sprint recovery adapter does not implement capability "${effect.capability}".`,
    };
  }
  try {
    await operation(effect.identity.taskId);
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      code: 'EFFECT_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build the Sprint-mode adapter for one platform. `platform` is caller-
 * supplied (never hardcoded here) so a CLI command stays honest about which
 * process-identity primitive it actually observed (ADR-D-004 / Immutable Law 2).
 */
export function createSprintRecoveryAdapter(
  platform: ExecutionRecoveryPlatform,
  deps: SprintSettleHousekeepingDependencies,
): ExecutionRecoveryModeAdapter<SprintNativeEvidence> {
  const supported = supportedCapabilities(deps);
  return {
    mode: 'sprint',
    platform,
    capabilities: {
      mode: 'sprint',
      platform,
      supported,
    },
    inspect(expectedIdentity, native): ExecutionRecoveryAdapterResult<ExecutionRecoveryInput> {
      return { ok: true, value: toRecoveryInput(expectedIdentity, native) };
    },
    apply(
      effect: ExecutionRecoveryFencedEffect,
    ): ExecutionRecoveryAdapterResult<void> | Promise<ExecutionRecoveryAdapterResult<void>> {
      if (effect.capability === 'settle') {
        return applySettleHousekeeping(effect.identity.taskId, deps);
      }
      return applyAsyncOperation(effect, deps);
    },
  };
}
