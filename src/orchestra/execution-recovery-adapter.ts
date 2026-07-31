// ═══ Execution Recovery Adapter Boundary (480-002) ═══════════════════════════
//
// The mode/platform adapter boundary for src/core/execution-recovery.ts
// (480-001). A concrete adapter translates ONE native evidence source — Sprint,
// Run, Flow, Do, Autonomous, Mission or Process — into the canonical, provider-
// neutral `ExecutionRecoveryInput`. This module never decides recovery state
// itself: `ExecutionRecoveryModeAdapter.inspect` returns evidence only, never a
// decision, so no adapter can invent lifecycle state outside core's
// `ExecutionRecoveryDecision` vocabulary.
//
// Effects are symmetric: an adapter may only `apply` a fenced effect that was
// itself derived from a real `ExecutionRecoveryOutcome.allowedNextOperations`
// entry via `deriveFencedEffects`. `applyFencedEffect` rejects any effect whose
// identity does not exactly match the caller's expected identity (no clearing
// foreign authority) and any capability the adapter's own declaration does not
// list as supported (no silent unsupported fallback) — both before the adapter
// is ever invoked, and with exactly one delegation call (no adapter-owned retry).
//
// Pure module (no I/O, no spawn, no timers). Concrete per-mode/per-platform
// adapters (tmux/docker/native-process wiring) are follow-up slices; this file
// is the contract + boundary guards they must all satisfy.

import { canonicalJson } from '../core/audit-writer.js';
import type {
  ExecutionRecoveryDecision,
  ExecutionRecoveryIdentity,
  ExecutionRecoveryInput,
  ExecutionRecoveryOperation,
  ExecutionRecoveryOutcome,
} from '../core/execution-recovery.js';

// ─── Native mode vocabulary ──────────────────────────────────────────────────

export const EXECUTION_RECOVERY_MODES = [
  'sprint',
  'run',
  'flow',
  'do',
  'autonomous',
  'mission',
  'process',
] as const;

export type ExecutionRecoveryMode = (typeof EXECUTION_RECOVERY_MODES)[number];

// ─── Platform vocabulary ─────────────────────────────────────────────────────

export const EXECUTION_RECOVERY_PLATFORMS = [
  'posix',
  'windows-native',
  'wsl',
  'oci',
] as const;

export type ExecutionRecoveryPlatform =
  (typeof EXECUTION_RECOVERY_PLATFORMS)[number];

// ─── Adapter capability vocabulary ───────────────────────────────────────────
//
// `inspect` is read-only evidence collection. `resume` and `settle` are the
// only capabilities `deriveFencedEffects` can currently produce (they are the
// exact mirror of core's RESUME_EXACT_ATTEMPT / FINALIZE_EXACT_ATTEMPT
// operations). `abort` and `terminate` are declarable adapter capabilities for
// an explicit, separately-authorized exact-attempt effect that core's decision
// vocabulary does not yet grant automatically — declaring support for them is
// honest platform capability disclosure, not an invented lifecycle state; no
// boundary function in this file can currently construct an abort/terminate
// effect, so declaring the capability never grants anything by itself.

export const EXECUTION_RECOVERY_ADAPTER_CAPABILITIES = [
  'inspect',
  'resume',
  'settle',
  'abort',
  'terminate',
] as const;

export type ExecutionRecoveryAdapterCapability =
  (typeof EXECUTION_RECOVERY_ADAPTER_CAPABILITIES)[number];

// ─── Process identity primitives (platform-honest, fixed 1:1 mapping) ───────
//
// Each platform is mapped to exactly the process-identity primitive it can
// actually observe. The mapping is fixed and not caller-settable so a
// declaration can never claim a primitive its platform does not really have.

export const EXECUTION_RECOVERY_PROCESS_IDENTITY_PRIMITIVES = [
  /** POSIX & WSL: real Linux kernel PID + start-time, disambiguates PID reuse. */
  'pid-start-time-liveness',
  /** Windows-native: process/job-object handle liveness (PID reuse-safe). */
  'win32-handle-liveness',
  /** OCI: container id + engine-reported running state (no host PID access). */
  'container-runtime-liveness',
] as const;

export type ExecutionRecoveryProcessIdentityPrimitive =
  (typeof EXECUTION_RECOVERY_PROCESS_IDENTITY_PRIMITIVES)[number];

const PLATFORM_PROCESS_IDENTITY_PRIMITIVE: Readonly<
  Record<ExecutionRecoveryPlatform, ExecutionRecoveryProcessIdentityPrimitive>
> = {
  posix: 'pid-start-time-liveness',
  wsl: 'pid-start-time-liveness',
  'windows-native': 'win32-handle-liveness',
  oci: 'container-runtime-liveness',
};

/** Pure, fixed lookup — the only source of platform -> primitive truth. */
export function processIdentityPrimitiveFor(
  platform: ExecutionRecoveryPlatform,
): ExecutionRecoveryProcessIdentityPrimitive {
  return PLATFORM_PROCESS_IDENTITY_PRIMITIVE[platform];
}

// ─── Capability declaration ──────────────────────────────────────────────────

export interface ExecutionRecoveryCapabilityDeclaration {
  readonly mode: ExecutionRecoveryMode;
  readonly platform: ExecutionRecoveryPlatform;
  readonly supported: readonly ExecutionRecoveryAdapterCapability[];
}

export function declarationSupports(
  declaration: ExecutionRecoveryCapabilityDeclaration,
  capability: ExecutionRecoveryAdapterCapability,
): boolean {
  return declaration.supported.includes(capability);
}

// ─── Typed result (unsupported operations fail honestly, never throw) ──────

export type ExecutionRecoveryAdapterFailureCode =
  | 'UNSUPPORTED_CAPABILITY'
  | 'IDENTITY_MISMATCH'
  | 'INSPECTION_MUTATED_EVIDENCE'
  | 'EFFECT_FAILED';

export type ExecutionRecoveryAdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: ExecutionRecoveryAdapterFailureCode;
      readonly message: string;
    };

function unsupported(
  capability: ExecutionRecoveryAdapterCapability,
  mode: ExecutionRecoveryMode,
  platform: ExecutionRecoveryPlatform,
): ExecutionRecoveryAdapterResult<never> {
  return {
    ok: false,
    code: 'UNSUPPORTED_CAPABILITY',
    message: `Capability "${capability}" is not supported by mode "${mode}" on platform "${platform}"`,
  };
}

// ─── Fenced effects — the ONLY thing an adapter may apply ───────────────────

export interface ExecutionRecoveryFencedEffect {
  readonly capability: ExecutionRecoveryAdapterCapability;
  readonly operation: ExecutionRecoveryOperation;
  readonly decision: ExecutionRecoveryDecision;
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRefs: readonly string[];
}

function capabilityForOperation(
  operation: ExecutionRecoveryOperation,
): ExecutionRecoveryAdapterCapability {
  switch (operation) {
    case 'OBSERVE':
    case 'WAIT':
    case 'REQUEST_EVIDENCE':
    case 'REQUEST_RESUME_AUTHORIZATION':
      return 'inspect';
    case 'RESUME_EXACT_ATTEMPT':
      return 'resume';
    case 'FINALIZE_EXACT_ATTEMPT':
      return 'settle';
    case 'ABORT_EXACT_ATTEMPT':
      return 'abort';
    case 'TERMINATE_EXACT_ATTEMPT':
      return 'terminate';
    default: {
      const exhaustive: never = operation;
      throw new Error(
        `Unhandled ExecutionRecoveryOperation in capabilityForOperation: ${String(exhaustive)}`,
      );
    }
  }
}

/**
 * Derive fenced effects strictly from a real core outcome's
 * `allowedNextOperations` — this is the only constructor for
 * {@link ExecutionRecoveryFencedEffect} in this module, so no caller can
 * fabricate an effect the application service (core's decision function)
 * never actually authorized.
 */
export function deriveFencedEffects(
  identity: ExecutionRecoveryIdentity,
  outcome: ExecutionRecoveryOutcome,
): readonly ExecutionRecoveryFencedEffect[] {
  return outcome.allowedNextOperations.map(operation => ({
    capability: capabilityForOperation(operation),
    operation,
    decision: outcome.decision,
    identity,
    evidenceRefs: outcome.evidenceRefs,
  }));
}

function identityMatches(
  a: ExecutionRecoveryIdentity,
  b: ExecutionRecoveryIdentity,
): boolean {
  return (
    a.taskId === b.taskId
    && a.attemptId === b.attemptId
    && a.fenceToken === b.fenceToken
  );
}

// ─── Mode adapter contract ───────────────────────────────────────────────────

export interface ExecutionRecoveryModeAdapter<TNativeEvidence> {
  readonly mode: ExecutionRecoveryMode;
  readonly platform: ExecutionRecoveryPlatform;
  readonly capabilities: ExecutionRecoveryCapabilityDeclaration;
  /**
   * Pure, read-only translation of native mode evidence into the canonical
   * decision input. MUST NOT mutate `native`, perform I/O, or return anything
   * but evidence — deciding recovery state is core's job alone.
   */
  inspect(
    expectedIdentity: ExecutionRecoveryIdentity,
    native: TNativeEvidence,
  ): ExecutionRecoveryAdapterResult<ExecutionRecoveryInput>;
  /**
   * Apply exactly the one fenced effect it is given. MUST NOT retry, loop, or
   * widen the effect beyond what {@link ExecutionRecoveryFencedEffect} states.
   */
  apply(
    effect: ExecutionRecoveryFencedEffect,
  ): ExecutionRecoveryAdapterResult<void> | Promise<ExecutionRecoveryAdapterResult<void>>;
}

/**
 * Inspect through the mutation guard: snapshots `native` before calling
 * `adapter.inspect`, then structurally compares it against the post-call
 * value. A mismatch means the adapter mutated evidence during inspection,
 * which is rejected as a typed failure rather than silently accepted.
 * Also enforces the `inspect` capability is declared before ever calling in.
 */
export function inspectWithIntegrityGuard<TNativeEvidence>(
  adapter: ExecutionRecoveryModeAdapter<TNativeEvidence>,
  expectedIdentity: ExecutionRecoveryIdentity,
  native: TNativeEvidence,
): ExecutionRecoveryAdapterResult<ExecutionRecoveryInput> {
  if (!declarationSupports(adapter.capabilities, 'inspect')) {
    return unsupported('inspect', adapter.mode, adapter.platform);
  }
  const before = canonicalJson(native);
  const result = adapter.inspect(expectedIdentity, native);
  if (canonicalJson(native) !== before) {
    return {
      ok: false,
      code: 'INSPECTION_MUTATED_EVIDENCE',
      message: `Mode "${adapter.mode}" adapter mutated native evidence during inspect()`,
    };
  }
  return result;
}

/**
 * Apply a fenced effect through the authority guard: rejects any effect whose
 * identity does not exactly match the caller's expected identity (no clearing
 * foreign authority) and any capability the adapter does not declare support
 * for (no silent unsupported fallback) — both checked before the adapter is
 * ever invoked. Delegates to `adapter.apply` exactly once; this function never
 * loops, retries, or re-invokes on failure.
 */
export function applyFencedEffect<TNativeEvidence>(
  adapter: ExecutionRecoveryModeAdapter<TNativeEvidence>,
  expectedIdentity: ExecutionRecoveryIdentity,
  effect: ExecutionRecoveryFencedEffect,
): ExecutionRecoveryAdapterResult<void> | Promise<ExecutionRecoveryAdapterResult<void>> {
  if (!identityMatches(expectedIdentity, effect.identity)) {
    return {
      ok: false,
      code: 'IDENTITY_MISMATCH',
      message: 'Fenced effect identity does not match the expected exact attempt/fence — refusing to clear foreign authority',
    };
  }
  if (!declarationSupports(adapter.capabilities, effect.capability)) {
    return unsupported(effect.capability, adapter.mode, adapter.platform);
  }
  return adapter.apply(effect);
}
