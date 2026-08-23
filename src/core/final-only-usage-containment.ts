import type { FinalOnlyUsageAuthorization } from './execution-budget-policy.js';
import { hasLiveUsageCeiling } from './live-execution-budget.js';
import type { ProviderCommandSpec } from './provider-command-spec.js';
import type { TaskExecutionBudgetPolicySnapshot } from './task-types.js';
import type { ExecutionBudget } from './work-model.js';

/** Effective executor after the caller has resolved any platform-specific `auto` backend. */
export interface ResolvedFinalOnlyUsageExecutor {
  readonly executor: 'docker';
  readonly finalOnlyUsageContainment: 'wall-clock';
}

export interface ResolveFinalOnlyUsageContainmentInput {
  readonly role: TaskExecutionBudgetPolicySnapshot['role'];
  readonly provider: string;
  readonly providerCommand: Pick<ProviderCommandSpec, 'liveUsage'> | null | undefined;
  readonly executor: ResolvedFinalOnlyUsageExecutor | null | undefined;
  readonly budget: Readonly<ExecutionBudget> | undefined;
  /** Canonical plan-time task projection; the resolver never creates or widens it. */
  readonly budgetPolicy: Readonly<TaskExecutionBudgetPolicySnapshot> | null | undefined;
}

export type FinalOnlyUsageContainmentNotRequiredReason =
  | 'live-ceiling-missing'
  | 'provider-live-usage-incremental';

export type FinalOnlyUsageContainmentHoldReason =
  | 'provider-live-usage-capability-unavailable'
  | 'executor-containment-unavailable'
  | 'budget-policy-missing'
  | 'budget-policy-not-allowed'
  | 'task-role-mismatch'
  | 'task-provider-mismatch'
  | 'owner-authorization-missing'
  | 'owner-authorization-mismatch';

export type FinalOnlyUsageContainmentDecision =
  | {
    readonly state: 'not-required';
    readonly reasonCode: FinalOnlyUsageContainmentNotRequiredReason;
  }
  | {
    readonly state: 'grant';
    /** The exact task-stamped owner grant; never a reconstructed copy. */
    readonly grant: Readonly<FinalOnlyUsageAuthorization>;
  }
  | {
    readonly state: 'hold';
    readonly reasonCode: FinalOnlyUsageContainmentHoldReason;
  };

/** Typed pre-dispatch failure shared by every task execution ingress. */
export class FinalOnlyUsageContainmentHoldError extends Error {
  readonly code = 'FINAL_ONLY_USAGE_CONTAINMENT_HOLD';

  constructor(readonly reasonCode: FinalOnlyUsageContainmentHoldReason) {
    super(`FINAL_ONLY_USAGE_CONTAINMENT_HOLD:${reasonCode}`);
    this.name = 'FinalOnlyUsageContainmentHoldError';
  }
}

/**
 * Intersect provider capability, live ceilings, resolved Docker containment,
 * and the canonical task-stamped owner policy. `maxUsd` deliberately remains
 * outside this decision: it needs incremental pricing evidence and is rejected
 * by the separate live-USD gate.
 */
export function resolveFinalOnlyUsageContainment(
  input: ResolveFinalOnlyUsageContainmentInput,
): FinalOnlyUsageContainmentDecision {
  if (!hasLiveUsageCeiling(input.budget)) {
    return { state: 'not-required', reasonCode: 'live-ceiling-missing' };
  }
  if (input.providerCommand?.liveUsage === 'incremental') {
    return { state: 'not-required', reasonCode: 'provider-live-usage-incremental' };
  }
  if (input.providerCommand?.liveUsage !== 'final-only') {
    return hold('provider-live-usage-capability-unavailable');
  }

  const policy = input.budgetPolicy;
  if (!policy) return hold('budget-policy-missing');
  if (policy.state !== 'allow') return hold('budget-policy-not-allowed');
  if (policy.role !== input.role) return hold('task-role-mismatch');
  if (policy.resolvedProvider !== input.provider) return hold('task-provider-mismatch');

  const authorization = policy.finalOnlyUsage;
  if (!authorization) return hold('owner-authorization-missing');
  if (!isExactPolicyAuthorization(authorization, policy)) {
    return hold('owner-authorization-mismatch');
  }
  if (!isDockerContainment(input.executor)) {
    return hold('executor-containment-unavailable');
  }

  return { state: 'grant', grant: authorization };
}

/** Return the exact grant, return undefined when unnecessary, or fail closed. */
export function requireFinalOnlyUsageContainment(
  input: ResolveFinalOnlyUsageContainmentInput,
): Readonly<FinalOnlyUsageAuthorization> | undefined {
  const decision = resolveFinalOnlyUsageContainment(input);
  if (decision.state === 'hold') {
    throw new FinalOnlyUsageContainmentHoldError(decision.reasonCode);
  }
  return decision.state === 'grant' ? decision.grant : undefined;
}

function hold(reasonCode: FinalOnlyUsageContainmentHoldReason): FinalOnlyUsageContainmentDecision {
  return { state: 'hold', reasonCode };
}

function isDockerContainment(
  executor: ResolvedFinalOnlyUsageExecutor | null | undefined,
): executor is ResolvedFinalOnlyUsageExecutor {
  return executor?.executor === 'docker'
    && executor.finalOnlyUsageContainment === 'wall-clock';
}

function isExactPolicyAuthorization(
  authorization: Readonly<FinalOnlyUsageAuthorization>,
  policy: Readonly<TaskExecutionBudgetPolicySnapshot>,
): boolean {
  return Number.isSafeInteger(authorization.maxWallClockSeconds)
    && authorization.maxWallClockSeconds > 0
    && authorization.profileRef === 'execution_budget.final_only_usage'
    && typeof policy.policyDigest === 'string'
    && policy.policyDigest.length > 0
    && authorization.policyDigest === policy.policyDigest;
}
