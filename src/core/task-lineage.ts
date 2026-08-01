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

function resolveRootId(task: Task, tasksById: ReadonlyMap<string, Task>): string {
  if (!task.isPriorityFix || !task.fixForTaskId) return task.id;
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
    const rootId = resolveRootId(task, tasksById);
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
    const rootId = resolveRootId(task, tasksById);
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
): FixCircuitBreakerDecision {
  const lineages = foldTaskLineages(rootTasks);
  const logicalRoots = lineages.map(lineage => lineage.rootTask);
  const totalTasks = lineages.length;
  const unresolvedTaskIds = lineages
    .filter((lineage) => {
      const latestEvaluation = evaluations.get(lineage.resolvedTask.id);
      const latestResolved = lineage.resolvedTask.status === TaskStatus.DONE
        || latestEvaluation === TaskEvaluation.DONE
        || latestEvaluation === TaskEvaluation.GO_WITH_TECH_DEBT;
      if (latestResolved) return false;
      return lineage.attemptIds.some(
        attemptId => evaluations.get(attemptId) === TaskEvaluation.NO_GO,
      );
    })
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
