import { TaskEvaluation } from './task-types.js';
import type { HostPreDispatchReasonCode } from './pre-dispatch-settlement.js';

/** All host-owned reasons that can terminate an attempt before dispatch. */
export const HOST_PRE_DISPATCH_REASON_CODES = [
  'PROVIDER_ADAPTER_UNAVAILABLE',
  'FORCED_SKILL_UNAVAILABLE',
  'ATTRIBUTION_BASELINE_CAPTURE_FAILED',
  'PROMPT_COMPILE_FAILED',
  'SCOPE_COMPILE_FAILED',
  'SCOPE_UNSATISFIABLE',
  'COORDINATOR_CRASHED_BEFORE_DOCKER_PREPARE',
  'LEGACY_HOST_PRE_DISPATCH_REJECTION',
] as const satisfies readonly HostPreDispatchReasonCode[];

export function isHostPreDispatchReasonCode(
  value: string,
): value is HostPreDispatchReasonCode {
  return (HOST_PRE_DISPATCH_REASON_CODES as readonly string[]).includes(value);
}

export interface FailureDisposition {
  readonly evaluation: TaskEvaluation.NOT_DISPATCHED;
  readonly fixEligible: boolean;
  readonly redispatchEligible: boolean;
  readonly cascadeDependents: boolean;
}

export interface FailureDispositionPolicyConfig {
  readonly failure_disposition?: {
    readonly pre_dispatch?: Partial<Record<
      HostPreDispatchReasonCode,
      Partial<FailureDisposition>
    >>;
  };
}

export const DEFAULT_HOST_PRE_DISPATCH_DISPOSITION: Readonly<FailureDisposition> =
  Object.freeze({
    evaluation: TaskEvaluation.NOT_DISPATCHED,
    fixEligible: false,
    redispatchEligible: false,
    cascadeDependents: true,
  });

const DEFAULT_DISPOSITIONS = Object.freeze(
  Object.fromEntries(
    HOST_PRE_DISPATCH_REASON_CODES.map(reasonCode => [
      reasonCode,
      DEFAULT_HOST_PRE_DISPATCH_DISPOSITION,
    ]),
  ) as Record<HostPreDispatchReasonCode, Readonly<FailureDisposition>>,
);

/** Resolve the effective, layered-config disposition for one authoritative reason. */
export function resolveHostPreDispatchFailureDisposition(
  reasonCode: HostPreDispatchReasonCode,
  config?: FailureDispositionPolicyConfig,
): Readonly<FailureDisposition> {
  const override = config?.failure_disposition?.pre_dispatch?.[reasonCode];
  if (!override) return DEFAULT_DISPOSITIONS[reasonCode];
  return Object.freeze({
    ...DEFAULT_DISPOSITIONS[reasonCode],
    ...override,
    // Host pre-dispatch settlements cannot be reclassified as worker outcomes.
    evaluation: TaskEvaluation.NOT_DISPATCHED,
  });
}
