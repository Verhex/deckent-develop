import { createHash } from 'node:crypto';
import type {
  ExecutionBudgetPolicyConfig,
  ExecutionBudgetRole,
} from './config-types.js';
import { TASK_KINDS, type ExecutionBudget, type TaskKind } from './work-model.js';

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
  | 'role-profile-missing';

export interface ExecutionBudgetPolicyAllowDecision {
  state: 'allow';
  budget?: Readonly<ExecutionBudget>;
  profileRef: string;
  policyDigest: string;
  requestedNarrowing: boolean;
}

export interface ExecutionBudgetPolicyHoldDecision {
  state: 'hold';
  reasonCode: ExecutionBudgetPolicyHoldReason;
  profileRef: string;
  policyDigest?: string;
}

export type ExecutionBudgetPolicyDecision =
  | ExecutionBudgetPolicyAllowDecision
  | ExecutionBudgetPolicyHoldDecision;

export class ExecutionBudgetPolicyError extends Error {
  readonly code = 'EXECUTION_BUDGET_POLICY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ExecutionBudgetPolicyError';
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

/** Runtime validation for JSON-authored policy. Unknown keys always fail loudly. */
export function assertExecutionBudgetPolicyConfig(
  value: unknown,
): asserts value is ExecutionBudgetPolicyConfig {
  if (!isPlainObject(value)) {
    throw new ExecutionBudgetPolicyError('execution_budget must be an object');
  }
  assertKnownKeys(value, ['roles', 'unmetered_backend'], 'execution_budget');
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

function cloneBudget(value: ExecutionBudget): ExecutionBudget {
  return Object.fromEntries(
    BUDGET_FIELDS.flatMap(field => value[field] === undefined ? [] : [[field, value[field]]]),
  ) as ExecutionBudget;
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
}): ExecutionBudgetPolicyDecision {
  if (input.executionCostClass === 'local') {
    if (input.requestedBudget) assertBudget(input.requestedBudget, 'requested execution budget');
    const budget = input.requestedBudget ? Object.freeze(cloneBudget(input.requestedBudget)) : undefined;
    return {
      state: 'allow',
      ...(budget ? { budget } : {}),
      profileRef: 'local-exempt',
      policyDigest: createHash('sha256').update('local-exempt').digest('hex'),
      requestedNarrowing: budget !== undefined,
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
  return {
    state: 'allow',
    budget,
    profileRef: kindBudget
      ? `execution_budget.roles.${input.role}.by_task_kind.${input.taskKind}`
      : `execution_budget.roles.${input.role}.default`,
    policyDigest,
    requestedNarrowing: input.requestedBudget !== undefined,
  };
}
