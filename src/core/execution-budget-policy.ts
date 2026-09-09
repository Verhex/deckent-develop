import { createHash } from 'node:crypto';
import type {
  ExecutionLandingPolicyConfig,
  ExecutionBudgetPolicyConfig,
  ExecutionBudgetRole,
  FinalOnlyUsagePolicyConfig,
  GoalPurposeAdmissionProfileConfig,
} from './config-types.js';
import { TASK_KINDS, type ExecutionBudget, type TaskKind } from './work-model.js';
import type { ProviderCommandSpec } from './provider-command-spec.js';

export interface ReachabilityProbePurposeProfile {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly maxUsd?: number;
}

/**
 * Owner-authored ceilings for a single non-reservable xverify adjudication (a
 * subscription verifier with no numeric reservation). Every field is a hard,
 * positive owner bound — never a code literal — carried into the execution
 * contract and enforced post-hoc from the provider-reported terminal usage.
 */
export interface XverifyAdjudicationPurposeProfile {
  readonly maxTokens: number;
  readonly maxWallClockSeconds: number;
  readonly maxVerificationsPerSprint: number;
}

// ─── NATIVE-AGENT-HORIZON-001: terminal/native-agent session budget ─────────

export interface ResolvedNativeAgentBudget {
  readonly maxPreambleShareOfContext: number;
  readonly minTranscriptShareOfContext: number;
  readonly contextHighWaterRatio: number;
  readonly maxToolResultShareOfContext: number;
  readonly maxTurnToolResultShareOfContext: number;
  readonly maxModelRounds: number;
  readonly maxToolCalls: number;
  readonly maxWallTimeMs: number;
  readonly maxCumulativeTokens: number;
  readonly maxNoProgressRounds: number;
  readonly checkpointEveryRounds: number;
  readonly checkpointEveryToolCalls: number;
  readonly outputReserveTokens: number;
  readonly contextSafetyReserveTokens: number;
  /** 7108: hidden-reasoning policy (see `NativeReasoningConfig`). */
  readonly reasoning: ResolvedNativeReasoningPolicy;
  /** 7108: bounded transient-transport retries per provider request (0..3). */
  readonly transportRetry: number;
  /** 7108: base backoff between transport retries, milliseconds. */
  readonly transportRetryBackoffMs: number;
}

export type NativeReasoningMode = 'auto' | 'off' | 'on';

export interface ResolvedNativeReasoningPolicy {
  readonly mode: NativeReasoningMode;
  /** Reasoning room added ON TOP of the visible reserve when the model's
   *  descriptor proves hidden reasoning shares the completion ceiling. */
  readonly budgetTokens: number;
  /** Headroom for the single exhaustion retry when thinking cannot be toggled off. */
  readonly exhaustedRetryBudgetTokens: number;
}

/** Hard upper bound for `transportRetry` — a transport hiccup is retried a
 *  bounded number of times, never looped. */
export const MAX_NATIVE_TRANSPORT_RETRY = 3;

/** Bounded deep/extended defaults. Rationale (owner RCA 2026-08-17): a healthy
 *  50-distinct-call analysis died at the fixed 25-round wall, so rounds/calls
 *  comfortably exceed that observed shape while every dimension stays a hard
 *  session-wide cap; wall time bounds a runaway loop even when rounds are
 *  cheap; noProgress ends semantic-repeat spirals long before the hard caps;
 *  checkpoint cadence forces synthesis well inside the budget so long analyses
 *  land instead of drowning. NO provider-name-keyed values — owner config is
 *  the only override authority. */
export const DEFAULT_NATIVE_AGENT_BUDGET: ResolvedNativeAgentBudget = Object.freeze({
  maxPreambleShareOfContext: 0.15,
  // Preserve transcript room independently of the output and safety reserves.
  minTranscriptShareOfContext: 0.10,
  contextHighWaterRatio: 0.75,
  maxToolResultShareOfContext: 0.05,
  maxTurnToolResultShareOfContext: 0.20,
  maxModelRounds: 120,
  maxToolCalls: 400,
  maxWallTimeMs: 45 * 60_000,
  maxCumulativeTokens: 2_000_000,
  maxNoProgressRounds: 8,
  checkpointEveryRounds: 20,
  checkpointEveryToolCalls: 60,
  outputReserveTokens: 4_096,
  contextSafetyReserveTokens: 2_048,
  // 7108 (owner RCA 2026-09-09): a thinking-mode local model burned the whole
  // 4,096-token wire ceiling on hidden reasoning four times in one window and
  // produced zero visible text. Reasoning room is now explicit and added ON TOP
  // of the visible reserve when the model's descriptor proves budget sharing;
  // the exhaustion retry may raise it once, bounded by exhaustedRetryBudgetTokens.
  reasoning: Object.freeze({ mode: 'auto' as const, budgetTokens: 8_192, exhaustedRetryBudgetTokens: 16_384 }),
  transportRetry: 1,
  transportRetryBackoffMs: 250,
});

const NATIVE_AGENT_BUDGET_FIELDS = Object.keys(DEFAULT_NATIVE_AGENT_BUDGET) as
  ReadonlyArray<keyof ResolvedNativeAgentBudget>;
const NATIVE_AGENT_RATIO_FIELDS: ReadonlySet<string> = new Set([
  'minTranscriptShareOfContext', 'maxPreambleShareOfContext',
  'contextHighWaterRatio', 'maxToolResultShareOfContext', 'maxTurnToolResultShareOfContext',
]);
const NATIVE_REASONING_MODES: ReadonlySet<string> = new Set(['auto', 'off', 'on']);
const NATIVE_REASONING_FIELDS = ['mode', 'budgetTokens', 'exhaustedRetryBudgetTokens'] as const;

/** 7108: validate + merge `execution_budget.native_agent.reasoning`. */
function resolveNativeReasoningPolicy(authored: unknown): ResolvedNativeReasoningPolicy {
  const defaults = DEFAULT_NATIVE_AGENT_BUDGET.reasoning;
  if (authored === undefined) return defaults;
  if (!isPlainObject(authored)) {
    throw new ExecutionBudgetPolicyError('execution_budget.native_agent.reasoning must be an object');
  }
  assertKnownKeys(authored, NATIVE_REASONING_FIELDS, 'execution_budget.native_agent.reasoning');
  const mode = authored['mode'] ?? defaults.mode;
  if (typeof mode !== 'string' || !NATIVE_REASONING_MODES.has(mode)) {
    throw new ExecutionBudgetPolicyError(
      `execution_budget.native_agent.reasoning.mode must be one of ${[...NATIVE_REASONING_MODES].join('|')}`,
    );
  }
  const positiveInt = (field: 'budgetTokens' | 'exhaustedRetryBudgetTokens'): number => {
    const value = authored[field];
    if (value === undefined) return defaults[field];
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new ExecutionBudgetPolicyError(
        `execution_budget.native_agent.reasoning.${field} must be a positive safe integer`,
      );
    }
    return value as number;
  };
  const budgetTokens = positiveInt('budgetTokens');
  const exhaustedRetryBudgetTokens = positiveInt('exhaustedRetryBudgetTokens');
  if (exhaustedRetryBudgetTokens < budgetTokens) {
    throw new ExecutionBudgetPolicyError(
      'execution_budget.native_agent.reasoning.exhaustedRetryBudgetTokens must be >= budgetTokens',
    );
  }
  return Object.freeze({ mode: mode as NativeReasoningMode, budgetTokens, exhaustedRetryBudgetTokens });
}

/** Merge owner-authored execution_budget.native_agent over the defaults with
 *  loud validation — unknown keys and non-positive/non-integer values fail. */
export function resolveNativeAgentBudget(input: {
  policy?: ExecutionBudgetPolicyConfig | undefined;
}): ResolvedNativeAgentBudget {
  const authored = (input.policy as { native_agent?: Record<string, unknown> } | undefined)?.native_agent;
  if (authored === undefined) return DEFAULT_NATIVE_AGENT_BUDGET;
  if (!isPlainObject(authored)) {
    throw new ExecutionBudgetPolicyError('execution_budget.native_agent must be an object');
  }
  assertKnownKeys(authored, NATIVE_AGENT_BUDGET_FIELDS as readonly string[], 'execution_budget.native_agent');
  const merged: Record<string, number | ResolvedNativeReasoningPolicy> = { ...DEFAULT_NATIVE_AGENT_BUDGET };
  for (const field of NATIVE_AGENT_BUDGET_FIELDS) {
    const value = authored[field];
    if (value === undefined) continue;
    if (field === 'reasoning') {
      merged[field] = resolveNativeReasoningPolicy(value);
      continue;
    }
    if (NATIVE_AGENT_RATIO_FIELDS.has(field)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 1) {
        throw new ExecutionBudgetPolicyError(`execution_budget.native_agent.${field} must be a ratio strictly between 0 and 1`);
      }
      merged[field] = value;
      continue;
    }
    if (field === 'transportRetry') {
      // Zero is a legitimate owner choice ("never retry"); the cap is hard.
      if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_NATIVE_TRANSPORT_RETRY) {
        throw new ExecutionBudgetPolicyError(
          `execution_budget.native_agent.transportRetry must be an integer between 0 and ${MAX_NATIVE_TRANSPORT_RETRY}`,
        );
      }
      merged[field] = value as number;
      continue;
    }
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new ExecutionBudgetPolicyError(
        `execution_budget.native_agent.${field} must be a positive safe integer`,
      );
    }
    merged[field] = value as number;
  }
  if ((merged.maxToolResultShareOfContext as number) > (merged.maxTurnToolResultShareOfContext as number)
    || (merged.maxTurnToolResultShareOfContext as number) >= (merged.contextHighWaterRatio as number)) {
    throw new ExecutionBudgetPolicyError('execution_budget.native_agent requires single tool share <= retained turn share < context high-water ratio');
  }
  return Object.freeze(merged) as unknown as ResolvedNativeAgentBudget;
}

type ExecutionBudgetPolicyWithPurposeProfiles = ExecutionBudgetPolicyConfig & {
  readonly purposes?: {
    readonly 'reachability-probe'?: ReachabilityProbePurposeProfile;
    readonly 'xverify-adjudication'?: XverifyAdjudicationPurposeProfile;
    readonly 'goal-authoring'?: import('./work-model.js').ExecutionBudget;
    readonly 'goal-acceptance'?: import('./work-model.js').ExecutionBudget;
  };
  readonly purpose_admission?: ExecutionBudgetPolicyConfig['purpose_admission'];
};

const GOAL_PURPOSE_ADMISSION_PURPOSES = ['goal-authoring', 'goal-acceptance'] as const;
type GoalPurposeAdmissionPurpose = typeof GOAL_PURPOSE_ADMISSION_PURPOSES[number];
/** Canonical purpose→role binding; callers must not transpose purpose/role at resolve time. */
export const GOAL_PURPOSE_ADMISSION_ROLE: Record<
  GoalPurposeAdmissionPurpose,
  Extract<ExecutionBudgetRole, 'brain' | 'auditor'>
> = {
  'goal-authoring': 'brain',
  'goal-acceptance': 'auditor',
};

export interface GoalPurposeAdmissionProfile {
  readonly maxTokens: number;
  readonly maxWallClockSeconds: number;
  readonly nonReservableSubscription: 'hold' | 'allow-role-ceiling';
}

export type GoalPurposeAdmissionUnavailableReason =
  | 'goal-purpose-admission-missing'
  | 'goal-purpose-admission-hold'
  | 'goal-purpose-admission-exceeds-role-ceiling';

export type GoalPurposeAdmissionDecision =
  | {
    readonly state: 'available';
    readonly profile: Readonly<GoalPurposeAdmissionProfile>;
    readonly profileRef: `execution_budget.purpose_admission.${GoalPurposeAdmissionPurpose}`;
    readonly policyDigest: string;
    readonly ceiling: Readonly<{ maxTokens: number; maxWallClockSeconds: number }>;
  }
  | {
    readonly state: 'unavailable';
    readonly reasonCode: GoalPurposeAdmissionUnavailableReason;
    readonly profileRef: `execution_budget.purpose_admission.${GoalPurposeAdmissionPurpose}`;
    readonly policyDigest?: string;
  };

/**
 * Provider-declared usage-reporting granularity (`ProviderCommandSpec.liveUsage`),
 * re-exported here so budget-policy resolution can become provider-aware without
 * duplicating the literal union.
 */
export type ExecutionBudgetLiveUsageMode = ProviderCommandSpec['liveUsage'];

const BUDGET_FIELDS = [
  'maxUsd',
  'maxTokens',
  'maxTurns',
  'maxInputTokens',
  'maxOutputTokens',
  'maxCacheReadTokens',
  'maxCacheCreationTokens',
  'maxContextTokens',
] as const satisfies readonly (keyof ExecutionBudget)[];

const ROLES = ['brain', 'worker', 'auditor'] as const satisfies readonly ExecutionBudgetRole[];
const BACKENDS = ['docker', 'subprocess', 'tmux'] as const;

export type ExecutionBudgetPolicyHoldReason =
  | 'budget-policy-missing'
  | 'role-profile-missing'
  | 'landing-policy-missing'
  | 'landing-turn-reserve-insufficient'
  | 'final-only-usage-authorization-missing';

export type ReachabilityProbePurposeProfileUnavailableReason =
  | 'reachability-probe-profile-missing'
  | 'metered-api-usd-ceiling-missing';

export type ReachabilityProbePurposeProfileDecision =
  | {
    readonly state: 'available';
    readonly profile: Readonly<ReachabilityProbePurposeProfile>;
    readonly profileRef: 'execution_budget.purposes.reachability-probe';
    readonly policyDigest: string;
  }
  | {
    readonly state: 'unavailable';
    readonly reasonCode: ReachabilityProbePurposeProfileUnavailableReason;
    readonly profileRef: 'execution_budget.purposes.reachability-probe';
    readonly policyDigest?: string;
  };

/**
 * Owner authorization to run a final-only-usage provider under host wall-clock
 * containment. Present only when the owner explicitly authorized this role;
 * absence is the fail-closed hold, never an implicit allowance.
 */
export interface FinalOnlyUsageAuthorization {
  readonly maxWallClockSeconds: number;
  readonly profileRef: string;
  readonly policyDigest: string;
}

export interface ExecutionBudgetPolicyAllowDecision {
  state: 'allow';
  budget?: Readonly<ExecutionBudget>;
  profileRef: string;
  policyDigest: string;
  requestedNarrowing: boolean;
  landingPolicy?: Readonly<ExecutionLandingPolicyConfig>;
  /** Absent unless the owner authorized final-only usage for this role. */
  finalOnlyUsage?: Readonly<FinalOnlyUsageAuthorization>;
}

export interface ExecutionBudgetPolicyHoldDecision {
  state: 'hold';
  reasonCode: ExecutionBudgetPolicyHoldReason;
  profileRef: string;
  policyDigest?: string;
  requiredContinuationTurns?: number;
  guaranteedContinuationTurns?: number;
}

export type ExecutionBudgetPolicyDecision =
  | ExecutionBudgetPolicyAllowDecision
  | ExecutionBudgetPolicyHoldDecision;

export function resolveGoalInvocationBudgetPolicy(input: {
  policy?: ExecutionBudgetPolicyConfig;
  role: Extract<ExecutionBudgetRole, 'brain' | 'auditor'>;
  purpose: 'goal-authoring' | 'goal-acceptance';
  liveUsageMode: ExecutionBudgetLiveUsageMode;
  executionCostClass?: 'remote' | 'local';
}): ExecutionBudgetPolicyDecision {
  const purposeBudget = input.policy?.purposes?.[input.purpose];
  if (!purposeBudget) {
    return { state: 'hold', reasonCode: 'role-profile-missing', profileRef: `execution_budget.purposes.${input.purpose}` };
  }
  return resolveExecutionBudgetPolicy({
    policy: input.policy,
    role: input.role,
    requestedBudget: purposeBudget,
    liveUsageMode: input.liveUsageMode,
    ...(input.executionCostClass ? { executionCostClass: input.executionCostClass } : {}),
  });
}

export class ExecutionBudgetPolicyError extends Error {
  readonly code = 'EXECUTION_BUDGET_POLICY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ExecutionBudgetPolicyError';
  }
}

export interface ExecutionLandingTurnAllocation {
  workTurns: number;
  reservedTurns: number;
}

/**
 * Allocate a discrete turn ceiling without rounding the owner-authored reserve
 * down. Token ceilings are continuous; turns are indivisible provider calls.
 */
export function deriveExecutionLandingTurnAllocation(
  maxTurns: number,
  reserveRatio: number,
): ExecutionLandingTurnAllocation {
  if (!Number.isInteger(maxTurns) || maxTurns < 0) {
    throw new ExecutionBudgetPolicyError('maxTurns must be a non-negative integer');
  }
  assertExecutionLandingPolicyConfig({ reserve_ratio: reserveRatio });
  const reservedTurns = Math.ceil(maxTurns * reserveRatio);
  return {
    workTurns: Math.max(0, maxTurns - reservedTurns),
    reservedTurns,
  };
}

export function assertExecutionLandingPolicyConfig(
  value: unknown,
  path = 'execution_budget.landing',
): asserts value is ExecutionLandingPolicyConfig {
  if (!isPlainObject(value)) {
    throw new ExecutionBudgetPolicyError(`${path} must be an object`);
  }
  assertKnownKeys(value, ['reserve_ratio', 'attended_unsupported'], path);
  const reserveRatio = value.reserve_ratio;
  if (
    typeof reserveRatio !== 'number'
    || !Number.isFinite(reserveRatio)
    || reserveRatio <= 0
    || reserveRatio >= 1
  ) {
    throw new ExecutionBudgetPolicyError(
      `${path}.reserve_ratio must be a finite number greater than 0 and less than 1`,
    );
  }
  const attendedUnsupported = value.attended_unsupported;
  if (
    attendedUnsupported !== undefined
    && attendedUnsupported !== 'hold'
    && attendedUnsupported !== 'allow-hard-stop'
  ) {
    throw new ExecutionBudgetPolicyError(
      `${path}.attended_unsupported must be 'hold' or 'allow-hard-stop'`,
    );
  }
}

/**
 * Validate the owner's final-only-usage authorization.
 *
 * `hold` (or an absent block) is the fail-closed default and may not carry
 * allowance fields. `allow-wall-clock-containment` must name the roles it covers
 * and a finite host-enforced wall clock — an authorization without a bounded
 * containment window would be an unbounded spend grant, never a policy.
 */
export function assertFinalOnlyUsagePolicyConfig(
  value: unknown,
  path = 'execution_budget.final_only_usage',
): asserts value is FinalOnlyUsagePolicyConfig {
  if (!isPlainObject(value)) {
    throw new ExecutionBudgetPolicyError(`${path} must be an object`);
  }
  assertKnownKeys(value, ['action', 'roles', 'max_wall_clock_seconds'], path);
  if (value.action !== 'hold' && value.action !== 'allow-wall-clock-containment') {
    throw new ExecutionBudgetPolicyError(
      `${path}.action must be 'hold' or 'allow-wall-clock-containment'`,
    );
  }
  if (value.action === 'hold') {
    if (value.roles !== undefined || value.max_wall_clock_seconds !== undefined) {
      throw new ExecutionBudgetPolicyError(
        `${path}.roles and ${path}.max_wall_clock_seconds are not allowed when action is hold`,
      );
    }
    return;
  }
  if (!Array.isArray(value.roles) || value.roles.length === 0) {
    throw new ExecutionBudgetPolicyError(
      `${path}.roles must be a non-empty array for allow-wall-clock-containment`,
    );
  }
  const seen = new Set<string>();
  for (const role of value.roles) {
    if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
      throw new ExecutionBudgetPolicyError(`Invalid role '${String(role)}' in ${path}.roles`);
    }
    if (seen.has(role)) {
      throw new ExecutionBudgetPolicyError(`Duplicate role '${role}' in ${path}.roles`);
    }
    seen.add(role);
  }
  const wallClock = value.max_wall_clock_seconds;
  if (typeof wallClock !== 'number' || !Number.isInteger(wallClock) || wallClock <= 0) {
    throw new ExecutionBudgetPolicyError(
      `${path}.max_wall_clock_seconds must be a positive integer for allow-wall-clock-containment`,
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ExecutionBudgetPolicyError(`Unknown field '${path}.${key}'`);
    }
  }
}

function assertBudget(value: unknown, path: string): asserts value is ExecutionBudget {
  if (!isPlainObject(value)) {
    throw new ExecutionBudgetPolicyError(`${path} must be an object`);
  }
  assertKnownKeys(value, BUDGET_FIELDS, path);
  if (Object.keys(value).length === 0) {
    throw new ExecutionBudgetPolicyError(`${path} must contain at least one explicit ceiling`);
  }
  for (const [field, ceiling] of Object.entries(value)) {
    if (typeof ceiling !== 'number' || !Number.isFinite(ceiling) || ceiling < 0) {
      throw new ExecutionBudgetPolicyError(`${path}.${field} must be a non-negative finite number`);
    }
  }
}

function assertXverifyAdjudicationPurposeProfile(
  value: unknown,
): asserts value is XverifyAdjudicationPurposeProfile {
  const path = 'execution_budget.purposes.xverify-adjudication';
  if (!isPlainObject(value)) throw new ExecutionBudgetPolicyError(`${path} must be an object`);
  assertKnownKeys(value, ['maxTokens', 'maxWallClockSeconds', 'maxVerificationsPerSprint'], path);
  for (const field of ['maxTokens', 'maxWallClockSeconds', 'maxVerificationsPerSprint'] as const) {
    if (!Number.isSafeInteger(value[field]) || (value[field] as number) <= 0) {
      throw new ExecutionBudgetPolicyError(`${path}.${field} must be a positive safe integer`);
    }
  }
}

function assertGoalPurposeAdmissionProfile(
  value: unknown,
  path: string,
): asserts value is GoalPurposeAdmissionProfileConfig {
  if (!isPlainObject(value)) {
    throw new ExecutionBudgetPolicyError(`${path} must be an object`);
  }
  assertKnownKeys(value, ['non_reservable_subscription', 'max_tokens', 'max_wall_clock_seconds'], path);
  if (value.non_reservable_subscription !== 'hold' && value.non_reservable_subscription !== 'allow-role-ceiling') {
    throw new ExecutionBudgetPolicyError(
      `${path}.non_reservable_subscription must be 'hold' or 'allow-role-ceiling'`,
    );
  }
  if (!Number.isSafeInteger(value.max_tokens) || (value.max_tokens as number) <= 0) {
    throw new ExecutionBudgetPolicyError(`${path}.max_tokens must be a positive safe integer`);
  }
  if (!Number.isSafeInteger(value.max_wall_clock_seconds) || (value.max_wall_clock_seconds as number) <= 0) {
    throw new ExecutionBudgetPolicyError(`${path}.max_wall_clock_seconds must be a positive safe integer`);
  }
}

function goalPurposeAdmissionCeilingUnavailable(
  policy: Pick<ExecutionBudgetPolicyConfig, 'roles' | 'purposes' | 'final_only_usage'>,
  purpose: GoalPurposeAdmissionPurpose,
  block: GoalPurposeAdmissionProfileConfig,
): GoalPurposeAdmissionUnavailableReason | null {
  const role = GOAL_PURPOSE_ADMISSION_ROLE[purpose];
  const purposeBudget = policy.purposes?.[purpose]?.maxTokens;
  const roleBudget = policy.roles?.[role]?.default?.maxTokens;
  const finalOnly = policy.final_only_usage;
  if (purposeBudget === undefined
    || roleBudget === undefined
    || block.max_tokens > purposeBudget
    || purposeBudget > roleBudget
    || block.max_tokens > roleBudget
    || finalOnly?.action !== 'allow-wall-clock-containment'
    || !finalOnly.roles?.includes(role)
    || block.max_wall_clock_seconds > (finalOnly.max_wall_clock_seconds ?? 0)) {
    return 'goal-purpose-admission-exceeds-role-ceiling';
  }
  return null;
}

function assertReachabilityProbePurposeProfile(
  value: unknown,
): asserts value is ReachabilityProbePurposeProfile {
  const path = 'execution_budget.purposes.reachability-probe';
  if (!isPlainObject(value)) throw new ExecutionBudgetPolicyError(`${path} must be an object`);
  assertKnownKeys(value, ['maxInputTokens', 'maxOutputTokens', 'maxTokens', 'timeoutMs', 'maxUsd'], path);
  for (const field of ['maxInputTokens', 'maxOutputTokens', 'maxTokens', 'timeoutMs'] as const) {
    if (!Number.isSafeInteger(value[field]) || (value[field] as number) <= 0) {
      throw new ExecutionBudgetPolicyError(`${path}.${field} must be a positive safe integer`);
    }
  }
  if ((value.maxTokens as number) < (value.maxInputTokens as number) + (value.maxOutputTokens as number)) {
    throw new ExecutionBudgetPolicyError(`${path}.maxTokens must cover input plus output ceilings`);
  }
  if (value.maxUsd !== undefined && (typeof value.maxUsd !== 'number' || !Number.isFinite(value.maxUsd) || value.maxUsd <= 0)) {
    throw new ExecutionBudgetPolicyError(`${path}.maxUsd must be a positive finite number when provided`);
  }
}

/** Runtime validation for JSON-authored policy. Unknown keys always fail loudly. */
export function assertExecutionBudgetPolicyConfig(
  value: unknown,
): asserts value is ExecutionBudgetPolicyConfig {
  if (!isPlainObject(value)) {
    throw new ExecutionBudgetPolicyError('execution_budget must be an object');
  }
  assertKnownKeys(
    value,
    ['roles', 'landing', 'unmetered_backend', 'final_only_usage', 'purposes', 'purpose_admission', 'native_agent'],
    'execution_budget',
  );
  if (!isPlainObject(value.roles)) {
    throw new ExecutionBudgetPolicyError('execution_budget.roles must be an object');
  }
  assertKnownKeys(value.roles, ROLES, 'execution_budget.roles');
  if (Object.keys(value.roles).length === 0) {
    throw new ExecutionBudgetPolicyError('execution_budget.roles must define at least one role');
  }

  for (const role of ROLES) {
    const rawRole = value.roles[role];
    if (rawRole === undefined) continue;
    const rolePath = `execution_budget.roles.${role}`;
    if (!isPlainObject(rawRole)) {
      throw new ExecutionBudgetPolicyError(`${rolePath} must be an object`);
    }
    assertKnownKeys(rawRole, ['default', 'by_task_kind'], rolePath);
    if (rawRole.default === undefined && rawRole.by_task_kind === undefined) {
      throw new ExecutionBudgetPolicyError(`${rolePath} must define default or by_task_kind`);
    }
    if (rawRole.default !== undefined) assertBudget(rawRole.default, `${rolePath}.default`);
    if (rawRole.by_task_kind !== undefined) {
      if (!isPlainObject(rawRole.by_task_kind)) {
        throw new ExecutionBudgetPolicyError(`${rolePath}.by_task_kind must be an object`);
      }
      assertKnownKeys(rawRole.by_task_kind, TASK_KINDS, `${rolePath}.by_task_kind`);
      if (Object.keys(rawRole.by_task_kind).length === 0) {
        throw new ExecutionBudgetPolicyError(`${rolePath}.by_task_kind must not be empty`);
      }
      for (const [kind, budget] of Object.entries(rawRole.by_task_kind)) {
        assertBudget(budget, `${rolePath}.by_task_kind.${kind}`);
      }
    }
  }

  if (value.landing !== undefined) {
    assertExecutionLandingPolicyConfig(value.landing);
  }

  if (value.final_only_usage !== undefined) {
    assertFinalOnlyUsagePolicyConfig(value.final_only_usage);
  }

  if (value.purposes !== undefined) {
    if (!isPlainObject(value.purposes)) {
      throw new ExecutionBudgetPolicyError('execution_budget.purposes must be an object');
    }
    assertKnownKeys(
      value.purposes,
      ['reachability-probe', 'xverify-adjudication', 'goal-authoring', 'goal-acceptance'],
      'execution_budget.purposes',
    );
    if (value.purposes['reachability-probe'] !== undefined) {
      assertReachabilityProbePurposeProfile(value.purposes['reachability-probe']);
    }
    if (value.purposes['xverify-adjudication'] !== undefined) {
      assertXverifyAdjudicationPurposeProfile(value.purposes['xverify-adjudication']);
    }
    for (const purpose of ['goal-authoring', 'goal-acceptance'] as const) {
      if (value.purposes[purpose] !== undefined) {
        assertBudget(value.purposes[purpose], `execution_budget.purposes.${purpose}`);
      }
    }
  }

  if (value.purpose_admission !== undefined) {
    if (!isPlainObject(value.purpose_admission)) {
      throw new ExecutionBudgetPolicyError('execution_budget.purpose_admission must be an object');
    }
    assertKnownKeys(
      value.purpose_admission,
      GOAL_PURPOSE_ADMISSION_PURPOSES,
      'execution_budget.purpose_admission',
    );
    for (const purpose of GOAL_PURPOSE_ADMISSION_PURPOSES) {
      const block = value.purpose_admission[purpose];
      if (block === undefined) continue;
      assertGoalPurposeAdmissionProfile(block, `execution_budget.purpose_admission.${purpose}`);
    }
  }

  const unmetered = value.unmetered_backend;
  if (unmetered !== undefined) {
    if (!isPlainObject(unmetered)) {
      throw new ExecutionBudgetPolicyError('execution_budget.unmetered_backend must be an object');
    }
    assertKnownKeys(unmetered, ['action', 'ordered_backends'], 'execution_budget.unmetered_backend');
    if (unmetered.action !== 'hold' && unmetered.action !== 'reroute-or-hold') {
      throw new ExecutionBudgetPolicyError("execution_budget.unmetered_backend.action must be 'hold' or 'reroute-or-hold'");
    }
    if (unmetered.ordered_backends !== undefined) {
      if (!Array.isArray(unmetered.ordered_backends)) {
        throw new ExecutionBudgetPolicyError('execution_budget.unmetered_backend.ordered_backends must be an array');
      }
      const seen = new Set<string>();
      for (const backend of unmetered.ordered_backends) {
        if (typeof backend !== 'string' || !(BACKENDS as readonly string[]).includes(backend)) {
          throw new ExecutionBudgetPolicyError(`Invalid backend '${String(backend)}' in execution_budget.unmetered_backend.ordered_backends`);
        }
        if (seen.has(backend)) {
          throw new ExecutionBudgetPolicyError(`Duplicate backend '${backend}' in execution_budget.unmetered_backend.ordered_backends`);
        }
        seen.add(backend);
      }
      if (unmetered.action === 'reroute-or-hold' && seen.size === 0) {
        throw new ExecutionBudgetPolicyError('execution_budget.unmetered_backend.ordered_backends must not be empty for reroute-or-hold');
      }
    }
    if (unmetered.action === 'reroute-or-hold' && unmetered.ordered_backends === undefined) {
      throw new ExecutionBudgetPolicyError('execution_budget.unmetered_backend.ordered_backends is required for reroute-or-hold');
    }
    if (unmetered.action === 'hold' && unmetered.ordered_backends !== undefined) {
      throw new ExecutionBudgetPolicyError('execution_budget.unmetered_backend.ordered_backends is not allowed when action is hold');
    }
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function executionBudgetPolicyDigest(policy: ExecutionBudgetPolicyConfig): string {
  assertExecutionBudgetPolicyConfig(policy);
  return createHash('sha256').update(canonicalJson(policy)).digest('hex');
}

/** Resolve the owner-authored probe purpose profile; absence is a typed HOLD. */
export function resolveReachabilityProbePurposeProfile(input: {
  readonly policy?: ExecutionBudgetPolicyConfig;
  readonly billingMode: 'subscription' | 'free' | 'local' | 'metered-api';
}): ReachabilityProbePurposeProfileDecision {
  const profileRef = 'execution_budget.purposes.reachability-probe' as const;
  if (!input.policy) return { state: 'unavailable', reasonCode: 'reachability-probe-profile-missing', profileRef };
  assertExecutionBudgetPolicyConfig(input.policy);
  const policyDigest = executionBudgetPolicyDigest(input.policy);
  const profile = (input.policy as ExecutionBudgetPolicyWithPurposeProfiles).purposes?.['reachability-probe'];
  if (!profile) {
    return { state: 'unavailable', reasonCode: 'reachability-probe-profile-missing', profileRef, policyDigest };
  }
  if (input.billingMode === 'metered-api' && profile.maxUsd === undefined) {
    return { state: 'unavailable', reasonCode: 'metered-api-usd-ceiling-missing', profileRef, policyDigest };
  }
  return { state: 'available', profile: Object.freeze({ ...profile }), profileRef, policyDigest };
}

export type XverifyAdjudicationPurposeProfileUnavailableReason =
  | 'xverify-adjudication-profile-missing'
  | 'xverify-adjudication-token-ceiling-missing';

export type XverifyAdjudicationPurposeProfileDecision =
  | {
      readonly state: 'available';
      readonly profile: Readonly<XverifyAdjudicationPurposeProfile>;
      readonly profileRef: 'execution_budget.purposes.xverify-adjudication';
      readonly policyDigest: string;
    }
  | {
      readonly state: 'unavailable';
      readonly reasonCode: XverifyAdjudicationPurposeProfileUnavailableReason;
      readonly profileRef: 'execution_budget.purposes.xverify-adjudication';
      readonly policyDigest?: string;
    };

/**
 * Resolve owner-authored Goal purpose admission. Role is derived from purpose
 * ({@link GOAL_PURPOSE_ADMISSION_ROLE}); callers must not transpose them.
 * Ceiling cross-checks run here (not at config assert time) so
 * `goal-purpose-admission-exceeds-role-ceiling` is a reachable runtime outcome.
 * A purpose_admission block additionally requires matching
 * `final_only_usage.action === allow-wall-clock-containment` with the mapped role
 * listed — fail-closed vs bare spec, documented in configuration-schema.
 */
export function resolveGoalPurposeAdmissionPolicy(input: {
  readonly policy?: ExecutionBudgetPolicyConfig;
  readonly purpose: GoalPurposeAdmissionPurpose;
}): GoalPurposeAdmissionDecision {
  const profileRef = `execution_budget.purpose_admission.${input.purpose}` as const;
  if (!input.policy) {
    return { state: 'unavailable', reasonCode: 'goal-purpose-admission-missing', profileRef };
  }
  assertExecutionBudgetPolicyConfig(input.policy);
  const policyDigest = executionBudgetPolicyDigest(input.policy);
  const block = input.policy.purpose_admission?.[input.purpose];
  if (!block) {
    return { state: 'unavailable', reasonCode: 'goal-purpose-admission-missing', profileRef, policyDigest };
  }
  if (block.non_reservable_subscription === 'hold') {
    return { state: 'unavailable', reasonCode: 'goal-purpose-admission-hold', profileRef, policyDigest };
  }
  const ceilingUnavailable = goalPurposeAdmissionCeilingUnavailable(input.policy, input.purpose, block);
  if (ceilingUnavailable) {
    return { state: 'unavailable', reasonCode: ceilingUnavailable, profileRef, policyDigest };
  }
  return {
    state: 'available',
    profile: Object.freeze({
      maxTokens: block.max_tokens,
      maxWallClockSeconds: block.max_wall_clock_seconds,
      nonReservableSubscription: block.non_reservable_subscription,
    }),
    profileRef,
    policyDigest,
    ceiling: Object.freeze({
      maxTokens: block.max_tokens,
      maxWallClockSeconds: block.max_wall_clock_seconds,
    }),
  };
}

/**
 * Resolve the owner-authored xverify-adjudication purpose profile. Absence, or a
 * non-positive total-token ceiling, is a typed HOLD: the non-reservable
 * subscription adjudication arm must never dispatch without an owner-authored
 * maxTokens ceiling.
 */
export function resolveXverifyAdjudicationPurposeProfile(input: {
  readonly policy?: ExecutionBudgetPolicyConfig;
}): XverifyAdjudicationPurposeProfileDecision {
  const profileRef = 'execution_budget.purposes.xverify-adjudication' as const;
  if (!input.policy) {
    return { state: 'unavailable', reasonCode: 'xverify-adjudication-profile-missing', profileRef };
  }
  assertExecutionBudgetPolicyConfig(input.policy);
  const policyDigest = executionBudgetPolicyDigest(input.policy);
  const profile = (input.policy as ExecutionBudgetPolicyWithPurposeProfiles)
    .purposes?.['xverify-adjudication'];
  if (!profile) {
    return { state: 'unavailable', reasonCode: 'xverify-adjudication-profile-missing', profileRef, policyDigest };
  }
  if (!(Number.isSafeInteger(profile.maxTokens) && profile.maxTokens > 0)) {
    return { state: 'unavailable', reasonCode: 'xverify-adjudication-token-ceiling-missing', profileRef, policyDigest };
  }
  return { state: 'available', profile: Object.freeze({ ...profile }), profileRef, policyDigest };
}

function cloneBudget(value: ExecutionBudget): ExecutionBudget {
  return Object.fromEntries(
    BUDGET_FIELDS.flatMap(field => value[field] === undefined ? [] : [[field, value[field]]]),
  ) as ExecutionBudget;
}

function cloneLandingPolicy(
  value: ExecutionLandingPolicyConfig,
): ExecutionLandingPolicyConfig {
  return {
    reserve_ratio: value.reserve_ratio,
    attended_unsupported: value.attended_unsupported ?? 'hold',
  };
}

/**
 * `maxUsd` is excluded: live USD enforcement needs an immutable pricing snapshot
 * (a separate, already fail-closed concern — see `assertLiveUsageBudgetSupport` in
 * `live-execution-budget.ts`), not incremental provider usage reporting.
 */
const LIVE_CEILING_FIELDS = BUDGET_FIELDS.filter(field => field !== 'maxUsd');

function hasLiveCeiling(budget: ExecutionBudget): boolean {
  return LIVE_CEILING_FIELDS.some(field => typeof budget[field] === 'number');
}

function narrowBudget(authority: ExecutionBudget, requested?: ExecutionBudget): ExecutionBudget {
  const result = cloneBudget(authority);
  if (!requested) return result;
  assertBudget(requested, 'requested execution budget');
  for (const field of BUDGET_FIELDS) {
    const requestValue = requested[field];
    if (requestValue === undefined) continue;
    const authorityValue = result[field];
    result[field] = authorityValue === undefined
      ? requestValue
      : Math.min(authorityValue, requestValue);
  }
  return result;
}

/**
 * Resolve an owner-authored role/kind policy without inventing numerical defaults.
 * A request is never authority: it may add/narrow ceilings but cannot widen policy.
 */
export function resolveExecutionBudgetPolicy(input: {
  policy?: ExecutionBudgetPolicyConfig;
  role: ExecutionBudgetRole;
  taskKind?: TaskKind;
  requestedBudget?: ExecutionBudget;
  executionCostClass?: 'remote' | 'local';
  minimumContinuationTurns?: number;
  /**
   * The resolved provider's usage-reporting granularity. Absent (all pre-existing
   * callers) preserves current behavior exactly. When present and not
   * `'incremental'`, a live ceiling requires an owner `finalOnlyUsage` grant for
   * this role or the route resolves to `hold` before any budget is authorized.
   */
  liveUsageMode?: ExecutionBudgetLiveUsageMode;
}): ExecutionBudgetPolicyDecision {
  if (
    input.minimumContinuationTurns !== undefined
    && (!Number.isInteger(input.minimumContinuationTurns) || input.minimumContinuationTurns < 1)
  ) {
    throw new ExecutionBudgetPolicyError(
      'minimumContinuationTurns must be a positive integer',
    );
  }
  if (input.executionCostClass === 'local') {
    if (input.requestedBudget) assertBudget(input.requestedBudget, 'requested execution budget');
    const budget = input.requestedBudget ? Object.freeze(cloneBudget(input.requestedBudget)) : undefined;
    const localPolicyDigest = createHash('sha256').update('local-exempt').digest('hex');
    // The local-exempt shortcut still carries a live-ceiling budget, and a
    // local OpenAI-compatible worker cannot meter usage incrementally — so the
    // owner's final-only wall-clock grant must ride THIS branch too, or the
    // spawn admission gate correctly refuses the worker (the sprint-550/551/552
    // SPAWN failure class, 2026-08-18). Same three-condition rule as the
    // standard branch below; no policy → no grant, never fabricated.
    const localFinalOnly = input.policy?.final_only_usage;
    const localFinalOnlyUsage = localFinalOnly?.action === 'allow-wall-clock-containment'
      && localFinalOnly.roles?.includes(input.role)
      && localFinalOnly.max_wall_clock_seconds !== undefined
      ? Object.freeze({
        maxWallClockSeconds: localFinalOnly.max_wall_clock_seconds,
        profileRef: 'execution_budget.final_only_usage',
        policyDigest: localPolicyDigest,
      })
      : undefined;
    return {
      state: 'allow',
      ...(budget ? { budget } : {}),
      profileRef: 'local-exempt',
      policyDigest: localPolicyDigest,
      requestedNarrowing: budget !== undefined,
      ...(localFinalOnlyUsage ? { finalOnlyUsage: localFinalOnlyUsage } : {}),
    };
  }
  if (!input.policy) {
    return {
      state: 'hold',
      reasonCode: 'budget-policy-missing',
      profileRef: `execution_budget.roles.${input.role}`,
    };
  }

  assertExecutionBudgetPolicyConfig(input.policy);
  const policyDigest = executionBudgetPolicyDigest(input.policy);
  if (!input.policy.landing) {
    return {
      state: 'hold',
      reasonCode: 'landing-policy-missing',
      profileRef: 'execution_budget.landing',
      policyDigest,
    };
  }
  const rolePolicy = input.policy.roles[input.role];
  const kindBudget = input.taskKind ? rolePolicy?.by_task_kind?.[input.taskKind] : undefined;
  const authority = kindBudget ?? rolePolicy?.default;
  if (!authority) {
    return {
      state: 'hold',
      reasonCode: 'role-profile-missing',
      profileRef: input.taskKind
        ? `execution_budget.roles.${input.role}.by_task_kind.${input.taskKind}`
        : `execution_budget.roles.${input.role}.default`,
      policyDigest,
    };
  }

  const budget = Object.freeze(narrowBudget(authority, input.requestedBudget));
  const landingPolicy = Object.freeze(cloneLandingPolicy(input.policy.landing));
  const profileRef = kindBudget
    ? `execution_budget.roles.${input.role}.by_task_kind.${input.taskKind}`
    : `execution_budget.roles.${input.role}.default`;
  if (
    input.minimumContinuationTurns !== undefined
    && budget.maxTurns !== undefined
  ) {
    const guaranteedContinuationTurns = deriveExecutionLandingTurnAllocation(
      budget.maxTurns,
      landingPolicy.reserve_ratio,
    ).reservedTurns;
    if (guaranteedContinuationTurns < input.minimumContinuationTurns) {
      return {
        state: 'hold',
        reasonCode: 'landing-turn-reserve-insufficient',
        profileRef: `${profileRef}.maxTurns`,
        policyDigest,
        requiredContinuationTurns: input.minimumContinuationTurns,
        guaranteedContinuationTurns,
      };
    }
  }
  const finalOnly = input.policy.final_only_usage;
  const finalOnlyUsage = finalOnly?.action === 'allow-wall-clock-containment'
    && finalOnly.roles?.includes(input.role)
    && finalOnly.max_wall_clock_seconds !== undefined
    ? Object.freeze({
      maxWallClockSeconds: finalOnly.max_wall_clock_seconds,
      profileRef: 'execution_budget.final_only_usage',
      policyDigest,
    })
    : undefined;
  // A route with a live ceiling and no incremental usage reporting has no in-flight
  // enforcement mechanism unless the owner explicitly authorized wall-clock
  // containment for THIS role. Never fabricate the grant or silently drop the
  // ceiling — hold before any budget is authorized (ADR-G-037 final-only-usage gap,
  // closed here for every role instead of per call-site).
  if (
    input.liveUsageMode !== undefined
    && input.liveUsageMode !== 'incremental'
    && hasLiveCeiling(budget)
    && !finalOnlyUsage
  ) {
    return {
      state: 'hold',
      reasonCode: 'final-only-usage-authorization-missing',
      profileRef: 'execution_budget.final_only_usage',
      policyDigest,
    };
  }
  return {
    state: 'allow',
    budget,
    landingPolicy,
    profileRef,
    policyDigest,
    requestedNarrowing: input.requestedBudget !== undefined,
    ...(finalOnlyUsage ? { finalOnlyUsage } : {}),
  };
}
