import {
  TaskEvaluation,
  TaskStatus,
  type Task,
  type FixCircuitBreakerConfig,
} from './types.js';

const IN_FLIGHT_STATUSES = new Set<TaskStatus>([
  TaskStatus.PENDING,
  TaskStatus.CLAIMED,
  TaskStatus.EXECUTING,
  TaskStatus.TESTING,
  TaskStatus.DOCUMENTING,
]);

export interface TaskLineage {
  readonly rootId: string;
  readonly rootTask: Task;
  readonly resolvedTask: Task;
  readonly attempts: readonly Task[];
  readonly attemptIds: readonly string[];
}

export interface FixCircuitBreakerDecision {
  readonly shouldPause: boolean;
  readonly totalTasks: number;
  readonly unresolvedTasks: number;
  readonly unresolvedRatioPercent: number;
  readonly effectiveCountThreshold: number;
  readonly unresolvedTaskIds: readonly string[];
  readonly blockedDependentTaskIds: readonly string[];
  readonly forcedByBlockedDependents: boolean;
}

export interface LogicalTaskProgress {
  readonly done: number;
  readonly active: number;
  readonly blocked: number;
  readonly total: number;
}

export type TaskLineageSettlementState =
  | 'COMPLETED'
  | 'FAILED'
  | 'ACTIVE'
  | 'UNSETTLED'
  | 'RESUMABLE'
  | 'SKIPPED';

/**
 * Canonical lifecycle projection consumed by pause, finalization and receipt
 * publication paths. It deliberately contains no policy decision: callers may
 * decide whether a FAILED ratio pauses a run or whether terminal evidence is
 * cleanup-eligible, but they may not independently redefine the lineage tip.
 */
export interface TaskLineageSettlementProjection {
  readonly rootId: string;
  readonly rootTask: Task;
  readonly resolvedTask: Task;
  readonly attemptIds: readonly string[];
  readonly evaluation: TaskEvaluation | undefined;
  readonly notDispatchedSettlement: NotDispatchedSettlement | undefined;
  readonly state: TaskLineageSettlementState;
}

export type NotDispatchedSettlement =
  | { readonly state: 'RESUMABLE'; readonly reasonCode: 'DISPATCH_RETRY_AVAILABLE' }
  | { readonly state: 'FAILED'; readonly reasonCode: 'DISPATCH_EXHAUSTED' }
  | { readonly state: 'SKIPPED'; readonly reasonCode: 'DEPENDENCY_STARVED' };

/**
 * Project NOT_DISPATCHED from a transient observation into an explicit lifecycle
 * state. The projector is pure: callers supply the host-owned one-shot dispatch
 * evidence instead of letting core read ambient files.
 */
export function projectNotDispatchedSettlements(
  tasks: readonly Task[],
  evaluations: ReadonlyMap<string, TaskEvaluation>,
  redispatchAttemptedIds: ReadonlySet<string>,
): ReadonlyMap<string, NotDispatchedSettlement> {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const lineages = foldTaskLineages(tasks);
  const lineagesByRootId = new Map(lineages.map(lineage => [lineage.rootId, lineage]));
  const projected = new Map<string, NotDispatchedSettlement>();

  for (const lineage of lineages) {
    const attemptId = lineage.resolvedTask.id;
    if (evaluations.get(attemptId) !== TaskEvaluation.NOT_DISPATCHED) continue;
    projected.set(attemptId, redispatchAttemptedIds.has(attemptId)
      ? { state: 'FAILED', reasonCode: 'DISPATCH_EXHAUSTED' }
      : { state: 'RESUMABLE', reasonCode: 'DISPATCH_RETRY_AVAILABLE' });
  }

  // Dependency starvation is derived only from already-terminal dependency
  // authority. Iterate to a fixed point so chains remain deterministic.
  let changed = true;
  while (changed) {
    changed = false;
    for (const lineage of lineages) {
      const attemptId = lineage.resolvedTask.id;
      if (projected.get(attemptId)?.state !== 'RESUMABLE') continue;
      const dependencyStarved = (lineage.rootTask.dependencies ?? []).some((dependencyId) => {
        const dependency = tasksById.get(dependencyId);
        const dependencyRootId = dependency
          ? resolveTaskLineageRootId(dependency, tasksById)
          : dependencyId;
        const dependencyLineage = lineagesByRootId.get(dependencyRootId);
        if (!dependencyLineage) return false;
        const dependencySettlement = projected.get(dependencyLineage.resolvedTask.id);
        return dependencySettlement?.state === 'FAILED' || dependencySettlement?.state === 'SKIPPED';
      });
      if (!dependencyStarved) continue;
      projected.set(attemptId, { state: 'SKIPPED', reasonCode: 'DEPENDENCY_STARVED' });
      changed = true;
    }
  }

  return projected;
}

function timestamp(task: Task): string {
  return task.updatedAt ?? task.createdAt ?? '';
}

/**
 * Resolve the attempt depth by following explicit `fixForTaskId` authority.
 * A priority fix whose parent is outside the supplied task set is a direct
 * attempt in this set, not an unbounded or guessed chain.
 */
export function resolveFixAttemptDepth(
  task: Task,
  tasksById: ReadonlyMap<string, Task>,
): number {
  if (!task.isPriorityFix) return 0;
  let depth = 1;
  let parentId = task.fixForTaskId;
  const seen = new Set<string>([task.id]);
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = tasksById.get(parentId);
    if (!parent?.isPriorityFix) break;
    depth += 1;
    parentId = parent.fixForTaskId;
  }
  return depth;
}

/** Return every known ancestor, immediate parent first, bounded against cycles. */
export function resolveFixAncestorIds(
  task: Task,
  tasksById: ReadonlyMap<string, Task>,
): readonly string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([task.id]);
  let parentId = task.fixForTaskId;
  while (parentId && !seen.has(parentId)) {
    ancestors.push(parentId);
    seen.add(parentId);
    parentId = tasksById.get(parentId)?.fixForTaskId;
  }
  return ancestors;
}

export function resolveTaskLineageRootId(
  task: Task,
  tasksById: ReadonlyMap<string, Task>,
): string {
  // `fixForTaskId` is the lineage edge. `isPriorityFix` is dispatch metadata
  // and legacy task records do not consistently persist it; making topology
  // depend on that flag caused finalizer and scheduler folds to disagree.
  if (!task.fixForTaskId) return task.id;
  const ancestors = resolveFixAncestorIds(task, tasksById);
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestorId = ancestors[index]!;
    if (tasksById.has(ancestorId)) return ancestorId;
  }
  return task.id;
}

/**
 * Fold raw task attempts into logical root-task lineages.
 *
 * Pending/running FIX attempts intentionally become the resolved projection:
 * a root that is currently being repaired is PENDING/FIXING, not a second task
 * beside an already terminal NO_GO parent.
 */
export function foldTaskLineages(tasks: readonly Task[]): readonly TaskLineage[] {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    const rootId = resolveTaskLineageRootId(task, tasksById);
    const group = grouped.get(rootId) ?? [];
    group.push(task);
    grouped.set(rootId, group);
  }

  const lineages: TaskLineage[] = [];
  for (const [rootId, attempts] of grouped) {
    const sorted = [...attempts].sort((left, right) => {
      const depthDelta =
        resolveFixAttemptDepth(left, tasksById) - resolveFixAttemptDepth(right, tasksById);
      if (depthDelta !== 0) return depthDelta;
      const timeDelta = timestamp(left).localeCompare(timestamp(right));
      return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id);
    });
    const rootTask = tasksById.get(rootId) ?? sorted[0]!;
    const resolvedTask = sorted.at(-1)!;
    lineages.push({
      rootId,
      rootTask,
      resolvedTask,
      attempts: Object.freeze(sorted),
      attemptIds: Object.freeze(sorted.map(task => task.id)),
    });
  }
  return Object.freeze(lineages.sort((left, right) => left.rootId.localeCompare(right.rootId)));
}

/**
 * Resolve every raw attempt through the same logical-tip and settlement-state
 * classifier. Host-authored NOT_DISPATCHED evidence wins over task status;
 * otherwise the resolving attempt's Brain evaluation is authoritative.
 */
export function projectTaskLineageSettlements(
  tasks: readonly Task[],
  evaluations: ReadonlyMap<string, TaskEvaluation>,
  notDispatchedSettlements: ReadonlyMap<string, NotDispatchedSettlement> = new Map(),
): readonly TaskLineageSettlementProjection[] {
  return Object.freeze(foldTaskLineages(tasks).map((lineage) => {
    const evaluation = evaluations.get(lineage.resolvedTask.id);
    const notDispatchedSettlement = notDispatchedSettlements.get(lineage.resolvedTask.id);
    let state: TaskLineageSettlementState;
    if (evaluation === TaskEvaluation.NOT_DISPATCHED && notDispatchedSettlement) {
      state = notDispatchedSettlement.state === 'RESUMABLE'
        ? 'RESUMABLE'
        : notDispatchedSettlement.state === 'SKIPPED'
          ? 'SKIPPED'
          : 'FAILED';
    } else if (
      lineage.resolvedTask.status === TaskStatus.DONE
      || evaluation === TaskEvaluation.DONE
      || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT
    ) {
      state = 'COMPLETED';
    } else if (
      lineage.resolvedTask.status === TaskStatus.NO_GO
      || evaluation === TaskEvaluation.NO_GO
    ) {
      state = 'FAILED';
    } else if (IN_FLIGHT_STATUSES.has(lineage.resolvedTask.status)) {
      state = 'ACTIVE';
    } else {
      state = 'UNSETTLED';
    }
    return Object.freeze({
      rootId: lineage.rootId,
      rootTask: lineage.rootTask,
      resolvedTask: lineage.resolvedTask,
      attemptIds: lineage.attemptIds,
      evaluation,
      notDispatchedSettlement,
      state,
    });
  }));
}

export function computeLogicalTaskProgress(tasks: readonly Task[]): LogicalTaskProgress {
  const lineages = foldTaskLineages(tasks);
  let done = 0;
  let active = 0;
  let blocked = 0;
  for (const lineage of lineages) {
    const status = lineage.resolvedTask.status;
    if (status === TaskStatus.DONE) done += 1;
    else if (
      status === TaskStatus.CLAIMED
      || status === TaskStatus.EXECUTING
      || status === TaskStatus.TESTING
      || status === TaskStatus.DOCUMENTING
    ) active += 1;
    else if (status === TaskStatus.PENDING || status === TaskStatus.PAUSED) blocked += 1;
  }
  return { done, active, blocked, total: lineages.length };
}

/**
 * Select one next pending FIX attempt per logical root.
 *
 * The parent must already be terminal; this prevents a stale child from racing
 * its still-pending ancestor. `attemptedIds` prevents an in-memory test/re-read
 * of a stale PENDING JSON from dispatching the same attempt twice.
 */
export function selectPendingFixTasks(
  tasks: readonly Task[],
  maxFixRetries: number,
  attemptedIds: ReadonlySet<string> = new Set<string>(),
): readonly Task[] {
  if (maxFixRetries <= 0) return [];
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const candidates = tasks
    .filter(task =>
      task.isPriorityFix === true
      && task.status === TaskStatus.PENDING
      && !attemptedIds.has(task.id)
      && resolveFixAttemptDepth(task, tasksById) <= maxFixRetries
      && (
        !task.fixForTaskId
        || !tasksById.has(task.fixForTaskId)
        || !IN_FLIGHT_STATUSES.has(tasksById.get(task.fixForTaskId)!.status)
      ),
    )
    .sort((left, right) => {
      const depthDelta =
        resolveFixAttemptDepth(left, tasksById) - resolveFixAttemptDepth(right, tasksById);
      if (depthDelta !== 0) return depthDelta;
      return left.id.localeCompare(right.id);
    });

  const selected: Task[] = [];
  const selectedRoots = new Set<string>();
  for (const task of candidates) {
    const rootId = resolveTaskLineageRootId(task, tasksById);
    if (selectedRoots.has(rootId)) continue;
    selectedRoots.add(rootId);
    selected.push(task);
  }
  return Object.freeze(selected);
}

/**
 * Decide whether exhausted logical task lineages warrant a PAUSED settlement.
 *
 * Both the absolute and proportional gates must be satisfied. The absolute
 * gate scales down for small runs: with a 50% ratio policy, a three-task run
 * needs two unresolved roots rather than an impossible hardcoded five.
 */
export function evaluateFixCircuitBreaker(
  rootTasks: readonly Task[],
  evaluations: ReadonlyMap<string, TaskEvaluation>,
  policy: FixCircuitBreakerConfig,
  notDispatchedSettlements: ReadonlyMap<string, NotDispatchedSettlement> = new Map(),
): FixCircuitBreakerDecision {
  const lineages = projectTaskLineageSettlements(
    rootTasks,
    evaluations,
    notDispatchedSettlements,
  );
  const logicalRoots = lineages.map(lineage => lineage.rootTask);
  const totalTasks = lineages.length;
  const unresolvedTaskIds = lineages
    .filter(lineage => lineage.state === 'FAILED')
    .map(lineage => lineage.rootId);
  const unresolvedTasks = unresolvedTaskIds.length;
  const unresolvedRatioPercent =
    totalTasks > 0 ? (unresolvedTasks / totalTasks) * 100 : 0;
  const ratioCount = totalTasks > 0
    ? Math.max(1, Math.ceil(totalTasks * (policy.min_unresolved_ratio_percent / 100)))
    : 0;
  const effectiveCountThreshold =
    totalTasks > 0 ? Math.min(policy.max_unresolved_tasks, ratioCount) : 0;
  const unresolvedSet = new Set(unresolvedTaskIds);
  const rootsById = new Map(logicalRoots.map(task => [task.id, task]));
  const dependsOnUnresolvedLineage = (task: Task): boolean => {
    const pending = [...(task.dependencies ?? [])];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const dependencyId = pending.pop();
      if (!dependencyId || seen.has(dependencyId)) continue;
      seen.add(dependencyId);
      if (unresolvedSet.has(dependencyId)) return true;
      const dependency = rootsById.get(dependencyId);
      if (dependency?.dependencies) pending.push(...dependency.dependencies);
    }
    return false;
  };
  const blockedDependentTaskIds = logicalRoots
    .filter(task =>
      (
        task.status === TaskStatus.PENDING
        || task.status === TaskStatus.PAUSED
        || evaluations.get(task.id) === TaskEvaluation.DEFERRED
        || evaluations.get(task.id) === TaskEvaluation.NOT_DISPATCHED
      )
      && dependsOnUnresolvedLineage(task),
    )
    .map(task => task.id);
  const forcedByBlockedDependents =
    unresolvedTasks > 0 && blockedDependentTaskIds.length > 0;
  const shouldPause = forcedByBlockedDependents || (
    policy.enabled
    && unresolvedTasks > 0
    && unresolvedTasks >= effectiveCountThreshold
    && unresolvedRatioPercent >= policy.min_unresolved_ratio_percent
  );

  return {
    shouldPause,
    totalTasks,
    unresolvedTasks,
    unresolvedRatioPercent,
    effectiveCountThreshold,
    unresolvedTaskIds: Object.freeze(unresolvedTaskIds),
    blockedDependentTaskIds: Object.freeze(blockedDependentTaskIds),
    forcedByBlockedDependents,
  };
}
