import { createHash } from 'node:crypto';
import { canonicalJson } from './audit-writer.js';
import type {
  ExecutionBudgetPolicyConfig,
  ProviderFallbackPolicyConfig,
  ResolvedConfig,
} from './config-types.js';
import { resolveExecutionBudgetPolicy } from './execution-budget-policy.js';
import { resolveProviderExecutionCostClass } from './provider-execution-profile.js';
import { providerRegistry } from './provider.js';
import { getProviderForModel } from './task-types.js';
import type {
  ProviderName,
  Sprint,
  Task,
  TaskExecutionBudgetPolicySnapshot,
} from './types.js';
import type { ExecutionBudget } from './work-model.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import type { AttendedExecutionProposalReference } from './attended-execution-proposal.js';
import {
  deriveExecutionTopology,
  type ExecutionTopology,
} from './execution-topology.js';
import { createExecutionAuthorityError } from './errors.js';

export const EXECUTION_PLAN_DIGEST_VERSION_V2 = 2 as const;
export const EXECUTION_PLAN_DIGEST_VERSION = 3 as const;
export type ExecutionPlanDigestVersion =
  | typeof EXECUTION_PLAN_DIGEST_VERSION_V2
  | typeof EXECUTION_PLAN_DIGEST_VERSION;

export type ExecutionPlanAuthMode = 'subscription' | 'api' | 'hybrid';

/** Stable environment/policy inputs that are not stored directly on a Task. */
export interface ExecutionPlanDigestContext {
  readonly configuredProvider: ProviderName | null;
  readonly configuredModel: string | null;
  readonly configuredBackend: 'docker' | 'tmux' | 'subprocess' | 'auto' | null;
  readonly configuredAuthMode: ExecutionPlanAuthMode;
  readonly fallbackProvider: ProviderName | null;
  readonly fallbackPolicy: ProviderFallbackPolicyConfig | null;
  readonly executionBudgetPolicy: ExecutionBudgetPolicyConfig | null;
  /** V3-only topology input. V2 projection deliberately excludes this field. */
  readonly configuredMaxWorkers?: number;
}

export interface ExecutionPlanDigestResult {
  readonly version: ExecutionPlanDigestVersion;
  readonly digest: string;
  /** Deep-frozen, JSON-safe approval envelope used to produce `digest`. */
  readonly projection: Readonly<Record<string, unknown>>;
  /** Canonical derived HOLDs in stable plan-slot order. */
  readonly budgetHolds: readonly ExecutionPlanBudgetHold[];
  /** Present only for digest v3. */
  readonly topology?: ExecutionTopology;
}

export interface ExecutionPlanBudgetHold {
  readonly slot: number;
  readonly title: string;
  readonly reasonCode: string;
  readonly profileRef: string;
  readonly resolvedProvider: string;
  readonly executionCostClass: 'remote' | 'local';
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function sortedUnique(values: readonly string[], normalize: (value: string) => string = value => value): string[] {
  return [...new Set(values.map(normalize))].sort((a, b) => a.localeCompare(b));
}

function cloneBudget(value: Readonly<ExecutionBudget> | undefined): ExecutionBudget | null {
  return value ? cloneJson(value) : null;
}

function resolveProvider(task: Task, configuredProvider?: ProviderName | null): ProviderName | 'unknown' {
  if (task.provider) return task.provider;
  try {
    return getProviderForModel(task.model);
  } catch (error) {
    // Digesting a legacy persisted plan must remain possible after catalog
    // alias removal. The configured primary is explicit provenance, not a
    // runtime fallback; final admission still fails unknown model reachability.
    if (configuredProvider) return configuredProvider;
    return 'unknown';
  }
}

function budgetSnapshotFor(
  task: Task,
  policy: ExecutionBudgetPolicyConfig | undefined,
  configuredProvider?: ProviderName | null,
  admission?: {
    mode?: ExecutionAdmissionMode;
    approvalEvidenceRef?: string;
    approvalProposal?: AttendedExecutionProposalReference;
  },
): TaskExecutionBudgetPolicySnapshot {
  const resolvedProvider = resolveProvider(task, configuredProvider);
  const adapterDeclaration = providerRegistry.hasProvider(resolvedProvider)
    ? providerRegistry.getProvider(resolvedProvider).executionCostClass
    : undefined;
  const executionCostClass = resolveProviderExecutionCostClass(resolvedProvider, adapterDeclaration);
  const requestedBudget = task.budgetPolicy?.requestedBudget ?? task.budget;
  const decision = resolveExecutionBudgetPolicy({
    policy,
    role: 'worker',
    taskKind: task.type,
    requestedBudget,
    executionCostClass,
  });
  return deepFreeze({
    state: decision.state,
    role: 'worker',
    ...(task.type ? { taskKind: task.type } : {}),
    resolvedProvider,
    executionCostClass,
    profileRef: decision.profileRef,
    admissionMode: admission?.mode ?? 'unattended',
    ...(decision.policyDigest ? { policyDigest: decision.policyDigest } : {}),
    ...(decision.state === 'hold' ? { reasonCode: decision.reasonCode } : {}),
    ...(decision.state === 'hold' && decision.requiredContinuationTurns !== undefined
      ? { requiredContinuationTurns: decision.requiredContinuationTurns }
      : {}),
    ...(decision.state === 'hold' && decision.guaranteedContinuationTurns !== undefined
      ? { guaranteedContinuationTurns: decision.guaranteedContinuationTurns }
      : {}),
    ...(decision.state === 'allow' && decision.landingPolicy
      ? { landingPolicy: cloneJson(decision.landingPolicy) }
      : {}),
    ...(admission?.approvalEvidenceRef
      ? { approvalEvidenceRef: admission.approvalEvidenceRef }
      : {}),
    ...(admission?.approvalProposal
      ? { approvalProposal: cloneJson(admission.approvalProposal) }
      : {}),
    ...(requestedBudget ? { requestedBudget: cloneJson(requestedBudget) } : {}),
  });
}

/**
 * Apply the owner-authored worker budget to finalized plan tasks. This runs at
 * the common dry-run/persist boundary; it never performs reachability, limit,
 * provider, or spawn side effects and therefore never manufactures a permit.
 */
export function applyWorkerExecutionBudgetPolicy(
  tasks: Task[],
  policy?: ExecutionBudgetPolicyConfig,
  configuredProvider?: ProviderName,
  admission?: {
    mode?: ExecutionAdmissionMode;
    approvalEvidenceRef?: string;
    approvalProposal?: AttendedExecutionProposalReference;
  },
): readonly TaskExecutionBudgetPolicySnapshot[] {
  return tasks.map((task) => {
    const requestedBudget = task.budgetPolicy?.requestedBudget ?? task.budget;
    const snapshot = budgetSnapshotFor(task, policy, configuredProvider, admission);
    const decision = resolveExecutionBudgetPolicy({
      policy,
      role: 'worker',
      taskKind: task.type,
      requestedBudget,
      executionCostClass: snapshot.executionCostClass,
    });
    if (decision.state === 'allow') {
      if (decision.budget) task.budget = cloneJson(decision.budget);
      else delete task.budget;
    } else {
      // A caller-authored request is evidence, not authority. Preserve it only
      // inside the HOLD snapshot so downstream code cannot mistake it for an
      // executable ceiling before admission is wired.
      delete task.budget;
    }
    task.budgetPolicy = snapshot;
    return snapshot;
  });
}

export function buildExecutionPlanDigestContext(
  config: ResolvedConfig,
  configuredAuthMode: ExecutionPlanAuthMode,
  configuredMaxWorkers?: number,
): ExecutionPlanDigestContext {
  return deepFreeze({
    configuredProvider: config.worker_provider ?? null,
    configuredModel: config.activeModeConfig.default_model ?? null,
    configuredBackend: config.spawn_backend ?? null,
    configuredAuthMode,
    fallbackProvider: config.fallback_provider ?? null,
    fallbackPolicy: config.provider_fallback ? cloneJson(config.provider_fallback) : null,
    executionBudgetPolicy: config.execution_budget ? cloneJson(config.execution_budget) : null,
    ...(configuredMaxWorkers !== undefined ? { configuredMaxWorkers } : {}),
  });
}

/** Exact seven-field context shape used by persisted digest-v2 snapshots. */
function projectDigestContextV2(context: ExecutionPlanDigestContext): Record<string, unknown> {
  return {
    configuredProvider: context.configuredProvider,
    configuredModel: context.configuredModel,
    configuredBackend: context.configuredBackend,
    configuredAuthMode: context.configuredAuthMode,
    fallbackProvider: context.fallbackProvider,
    fallbackPolicy: cloneJson(context.fallbackPolicy),
    executionBudgetPolicy: cloneJson(context.executionBudgetPolicy),
  };
}

function normalizeTaskRef(ref: string, idToSlot: ReadonlyMap<string, number>): Record<string, unknown> {
  const slot = idToSlot.get(ref);
  return slot === undefined ? { kind: 'external', ref } : { kind: 'plan-task', slot };
}

function normalizeGateFinding(
  finding: NonNullable<Sprint['promptGate']>['findings'][number],
  idToSlot: ReadonlyMap<string, number>,
): Record<string, unknown> {
  return {
    task: normalizeTaskRef(finding.taskId, idToSlot),
    lint: finding.lint,
    level: finding.level,
    agentId: finding.agentId,
    message: normalizeText(finding.message),
    suggestion: finding.suggestion ? normalizeText(finding.suggestion) : null,
  };
}

function buildTaskProjection(
  task: Task,
  slot: number,
  idToSlot: ReadonlyMap<string, number>,
  context: ExecutionPlanDigestContext,
): Record<string, unknown> {
  const resolvedProvider = resolveProvider(task, context.configuredProvider);
  const budgetPolicy = budgetSnapshotFor(
    task,
    context.executionBudgetPolicy ?? undefined,
    context.configuredProvider,
  );
  const budgetDecision = resolveExecutionBudgetPolicy({
    policy: context.executionBudgetPolicy ?? undefined,
    role: 'worker',
    taskKind: task.type,
    requestedBudget: budgetPolicy.requestedBudget,
    executionCostClass: budgetPolicy.executionCostClass,
  });
  const effectiveBudget = budgetDecision.state === 'allow'
    ? (task.budget ?? budgetDecision.budget)
    : undefined;

  return {
    slot,
    title: normalizeText(task.title),
    description: normalizeText(task.description),
    reason: normalizeText(task.reason),
    kind: task.type ?? null,
    effort: task.effort,
    priority: task.priority,
    routing: {
      configuredProvider: context.configuredProvider,
      requestedProvider: task.provider ?? null,
      resolvedProvider,
      configuredModel: context.configuredModel,
      requestedModel: task.forceModel ?? null,
      resolvedModel: task.model,
      configuredBackend: context.configuredBackend,
      requestedBackend: task.backend ?? null,
      effectiveBackend: task.backend ?? context.configuredBackend,
      configuredAuthMode: context.configuredAuthMode,
      requestedAuthMode: task.authMode ?? null,
      effectiveAuthMode: task.authMode ?? context.configuredAuthMode,
      fallbackProvider: context.fallbackProvider,
      fallbackPolicy: context.fallbackPolicy,
      modelEffort: task.modelEffort ?? null,
    },
    assignment: {
      forceAgent: task.forceAgent ?? null,
      assignedAgent: task.assignedAgent ?? null,
      forceSkills: sortedUnique(task.forceSkills ?? []),
      assignedSkills: sortedUnique(task.assignedSkills ?? []),
      excludeAgent: sortedUnique(task.excludeAgent ?? []),
      excludeSkills: sortedUnique(task.excludeSkills ?? []),
    },
    scope: {
      directories: sortedUnique(task.scope.directories, normalizePath),
      filesRead: sortedUnique(task.scope.filesRead, normalizePath),
      filesWrite: sortedUnique(task.scope.filesWrite, normalizePath),
    },
    dependencies: task.dependencies
      .map(ref => normalizeTaskRef(ref, idToSlot))
      .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    acceptance: {
      goCriteria: normalizeText(task.goNogo.goCriteria),
      noGoCriteria: normalizeText(task.goNogo.noGoCriteria),
      techDebtAcceptable: normalizeText(task.goNogo.techDebtAcceptable),
    },
    budget: {
      requested: cloneBudget(budgetPolicy.requestedBudget),
      effective: cloneBudget(effectiveBudget),
      state: budgetPolicy.state,
      profileRef: budgetPolicy.profileRef,
      policyDigest: budgetPolicy.policyDigest ?? null,
      reasonCode: budgetPolicy.reasonCode ?? null,
      executionCostClass: budgetPolicy.executionCostClass,
    },
    smoke: task.smoke
      ? { command: normalizeText(task.smoke.command), expect: normalizeText(task.smoke.expect) }
      : null,
    fix: {
      isPriorityFix: task.isPriorityFix === true,
      fixFor: task.fixForTaskId ? normalizeTaskRef(task.fixForTaskId, idToSlot) : null,
      mode: task.fixMode ?? null,
    },
    actor: task.actor ? cloneJson(task.actor) : null,
  };
}

export function computeExecutionPlanDigestV2(
  sprint: Sprint,
  context: ExecutionPlanDigestContext,
): ExecutionPlanDigestResult {
  const idToSlot = new Map(sprint.tasks.map((task, index) => [task.id, index + 1] as const));
  const findings = sprint.promptGate?.findings.map(finding => normalizeGateFinding(finding, idToSlot)) ?? [];
  const taskProjections = sprint.tasks.map((task, index) => buildTaskProjection(task, index + 1, idToSlot, context));
  const budgetHolds = deepFreeze(taskProjections.flatMap((task): ExecutionPlanBudgetHold[] => {
    const budget = task.budget as Record<string, unknown>;
    if (budget.state !== 'hold') return [];
    const routing = task.routing as Record<string, unknown>;
    return [{
      slot: task.slot as number,
      title: task.title as string,
      reasonCode: typeof budget.reasonCode === 'string' ? budget.reasonCode : 'unspecified-hold',
      profileRef: budget.profileRef as string,
      resolvedProvider: routing.resolvedProvider as string,
      executionCostClass: budget.executionCostClass as 'remote' | 'local',
    }];
  }));
  const projection = deepFreeze({
    version: EXECUTION_PLAN_DIGEST_VERSION_V2,
    context: projectDigestContextV2(context),
    tasks: taskProjections,
    promptGate: sprint.promptGate
      ? {
          result: sprint.promptGate.ok ? 'pass' : 'fail',
          overrideApplied: sprint.promptGate.overrideApplied === true,
          findings,
        }
      : { result: 'skipped', overrideApplied: false, findings: [] },
  }) as Readonly<Record<string, unknown>>;
  return {
    version: EXECUTION_PLAN_DIGEST_VERSION_V2,
    digest: createHash('sha256').update(canonicalJson(projection)).digest('hex'),
    projection,
    budgetHolds,
  };
}

/**
 * Compatibility export: callers that have not opted into a versioned
 * topology input continue to produce frozen digest-v2 bytes.
 */
export const computeExecutionPlanDigest = computeExecutionPlanDigestV2;

export function computeExecutionPlanDigestV3(
  sprint: Sprint,
  context: ExecutionPlanDigestContext,
): ExecutionPlanDigestResult & {
  readonly version: typeof EXECUTION_PLAN_DIGEST_VERSION;
  readonly topology: ExecutionTopology;
} {
  const maxWorkers = context.configuredMaxWorkers;
  if (!Number.isFinite(maxWorkers) || (maxWorkers ?? 0) < 1) {
    throw createExecutionAuthorityError(
      'execution-plan-digest: v3 requires configuredMaxWorkers >= 1',
    );
  }
  const v2 = computeExecutionPlanDigestV2(sprint, context);
  const topology = deriveExecutionTopology(sprint.tasks, { maxWorkers: maxWorkers! });
  const projection = deepFreeze({
    version: EXECUTION_PLAN_DIGEST_VERSION,
    context: {
      ...projectDigestContextV2(context),
      configuredMaxWorkers: topology.configuredMaxWorkers,
    },
    tasks: (v2.projection.tasks as readonly unknown[]).map(item => cloneJson(item)),
    promptGate: cloneJson(v2.projection.promptGate),
    topology: cloneJson(topology),
  }) as Readonly<Record<string, unknown>>;
  return {
    version: EXECUTION_PLAN_DIGEST_VERSION,
    digest: createHash('sha256').update(canonicalJson(projection)).digest('hex'),
    projection,
    budgetHolds: v2.budgetHolds,
    topology,
  };
}

export function computeExecutionPlanDigestByVersion(
  version: number,
  sprint: Sprint,
  context: ExecutionPlanDigestContext,
): ExecutionPlanDigestResult {
  if (version === EXECUTION_PLAN_DIGEST_VERSION_V2) {
    return computeExecutionPlanDigestV2(sprint, context);
  }
  if (version === EXECUTION_PLAN_DIGEST_VERSION) {
    return computeExecutionPlanDigestV3(sprint, context);
  }
  throw createExecutionAuthorityError(
    `execution-plan-digest: unsupported version ${version}`,
  );
}
