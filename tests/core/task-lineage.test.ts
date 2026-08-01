import { describe, expect, it } from 'vitest';
import {
  computeLogicalTaskProgress,
  evaluateFixCircuitBreaker,
  foldTaskLineages,
  projectNotDispatchedSettlements,
  projectTaskLineageSettlements,
  resolveFixAncestorIds,
  resolveFixAttemptDepth,
  selectPendingFixTasks,
} from '../../src/core/task-lineage.js';
import {
  TaskEvaluation,
  TaskStatus,
  type FixCircuitBreakerConfig,
  type Task,
} from '../../src/core/types.js';

function task(
  id: string,
  status: TaskStatus,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status,
    sprintId: 'sprint-lineage',
    ...overrides,
  };
}

const policy: FixCircuitBreakerConfig = {
  enabled: true,
  max_unresolved_tasks: 5,
  min_unresolved_ratio_percent: 50,
};

describe('task lineage authority', () => {
  it('folds original → fix → fix-fix into one logical task resolved by the leaf', () => {
    const tasks = [
      task('1', TaskStatus.NO_GO),
      task('1-fix', TaskStatus.NO_GO, {
        isPriorityFix: true,
        fixForTaskId: '1',
      }),
      task('1-fix-fix', TaskStatus.DONE, {
        isPriorityFix: true,
        fixForTaskId: '1-fix',
      }),
    ];

    const lineages = foldTaskLineages(tasks);

    expect(lineages).toHaveLength(1);
    expect(lineages[0]).toMatchObject({
      rootId: '1',
      resolvedTask: { id: '1-fix-fix', status: TaskStatus.DONE },
      attemptIds: ['1', '1-fix', '1-fix-fix'],
    });
    expect(computeLogicalTaskProgress(tasks)).toEqual({
      done: 1,
      active: 0,
      blocked: 0,
      total: 1,
    });
  });

  it('projects a pending fix as the root task current state, not a second task', () => {
    const tasks = [
      task('2', TaskStatus.NO_GO),
      task('2-fix', TaskStatus.PENDING, {
        isPriorityFix: true,
        fixForTaskId: '2',
      }),
    ];

    expect(foldTaskLineages(tasks)[0]).toMatchObject({
      rootId: '2',
      resolvedTask: { id: '2-fix', status: TaskStatus.PENDING },
    });
    expect(computeLogicalTaskProgress(tasks)).toEqual({
      done: 0,
      active: 0,
      blocked: 1,
      total: 1,
    });
  });

  it('selects each admitted fix depth exactly once and waits for its parent terminal state', () => {
    const original = task('3', TaskStatus.NO_GO);
    const direct = task('3-fix', TaskStatus.PENDING, {
      isPriorityFix: true,
      fixForTaskId: '3',
    });
    const child = task('3-fix-fix', TaskStatus.PENDING, {
      isPriorityFix: true,
      fixForTaskId: '3-fix',
    });

    expect(selectPendingFixTasks([original, direct, child], 2).map(item => item.id))
      .toEqual(['3-fix']);

    direct.status = TaskStatus.NO_GO;
    expect(selectPendingFixTasks([original, direct, child], 2, new Set(['3-fix'])).map(item => item.id))
      .toEqual(['3-fix-fix']);
    expect(selectPendingFixTasks([original, direct, child], 1, new Set(['3-fix'])))
      .toEqual([]);
  });

  it('derives attempt depth and bounded ancestors from explicit parent authority', () => {
    const tasks = [
      task('4', TaskStatus.NO_GO),
      task('4-fix', TaskStatus.NO_GO, {
        isPriorityFix: true,
        fixForTaskId: '4',
      }),
      task('4-fix-fix', TaskStatus.PENDING, {
        isPriorityFix: true,
        fixForTaskId: '4-fix',
      }),
    ];
    const byId = new Map(tasks.map(item => [item.id, item]));

    expect(resolveFixAttemptDepth(tasks[2]!, byId)).toBe(2);
    expect(resolveFixAncestorIds(tasks[2]!, byId)).toEqual(['4-fix', '4']);
  });

  it('uses one logical-tip settlement projection for repair and dispatch outcomes', () => {
    const tasks = [
      task('settled', TaskStatus.NO_GO),
      task('settled-fix', TaskStatus.DONE, {
        fixForTaskId: 'settled',
      }),
      task('dispatch', TaskStatus.PAUSED),
    ];
    const evaluations = new Map([
      ['settled', TaskEvaluation.NO_GO],
      ['settled-fix', TaskEvaluation.DONE],
      ['dispatch', TaskEvaluation.NOT_DISPATCHED],
    ]);
    const dispatchSettlements = new Map([
      ['dispatch', { state: 'FAILED', reasonCode: 'DISPATCH_EXHAUSTED' } as const],
    ]);

    expect(projectTaskLineageSettlements(tasks, evaluations, dispatchSettlements))
      .toMatchObject([
        { rootId: 'dispatch', resolvedTask: { id: 'dispatch' }, state: 'FAILED' },
        { rootId: 'settled', resolvedTask: { id: 'settled-fix' }, state: 'COMPLETED' },
      ]);
  });
});

describe('post-FIX circuit breaker', () => {
  it('projects NOT_DISPATCHED into resumable, exhausted, and dependency-starved states', () => {
    const tasks = [
      task('retry-open', TaskStatus.PAUSED),
      task('retry-spent', TaskStatus.PAUSED),
      task('starved', TaskStatus.PAUSED, { dependencies: ['retry-spent'] }),
    ];
    const evaluations = new Map(tasks.map(item => [item.id, TaskEvaluation.NOT_DISPATCHED]));

    expect([...projectNotDispatchedSettlements(
      tasks,
      evaluations,
      new Set(['retry-spent']),
    )]).toEqual([
      ['retry-open', { state: 'RESUMABLE', reasonCode: 'DISPATCH_RETRY_AVAILABLE' }],
      ['retry-spent', { state: 'FAILED', reasonCode: 'DISPATCH_EXHAUSTED' }],
      ['starved', { state: 'SKIPPED', reasonCode: 'DEPENDENCY_STARVED' }],
    ]);
  });

  it('scales the count threshold for a three-task run', () => {
    const tasks = [
      task('small-1', TaskStatus.NO_GO),
      task('small-2', TaskStatus.NO_GO),
      task('small-3', TaskStatus.DONE),
    ];
    const evaluations = new Map([
      ['small-1', TaskEvaluation.NO_GO],
      ['small-2', TaskEvaluation.NO_GO],
      ['small-3', TaskEvaluation.DONE],
    ]);

    expect(evaluateFixCircuitBreaker(tasks, evaluations, policy)).toMatchObject({
      shouldPause: true,
      totalTasks: 3,
      unresolvedTasks: 2,
      effectiveCountThreshold: 2,
    });
  });

  it('does not pause a three-task run for one unresolved root below the ratio gate', () => {
    const tasks = [
      task('small-1', TaskStatus.NO_GO),
      task('small-2', TaskStatus.DONE),
      task('small-3', TaskStatus.DONE),
    ];
    const evaluations = new Map([
      ['small-1', TaskEvaluation.NO_GO],
      ['small-2', TaskEvaluation.DONE],
      ['small-3', TaskEvaluation.DONE],
    ]);

    expect(evaluateFixCircuitBreaker(tasks, evaluations, policy).shouldPause).toBe(false);
  });

  it('pauses below the ratio gate when an exhausted lineage still blocks unfinished dependants', () => {
    const tasks = [
      task('blocked-root', TaskStatus.NO_GO),
      task('independent', TaskStatus.DONE),
      task('dependent', TaskStatus.PENDING, { dependencies: ['blocked-root'] }),
    ];
    const evaluations = new Map([
      ['blocked-root', TaskEvaluation.NO_GO],
      ['independent', TaskEvaluation.DONE],
      ['dependent', TaskEvaluation.NOT_DISPATCHED],
    ]);

    expect(evaluateFixCircuitBreaker(tasks, evaluations, policy)).toMatchObject({
      shouldPause: true,
      unresolvedTasks: 1,
      blockedDependentTaskIds: ['dependent'],
      forcedByBlockedDependents: true,
    });
  });

  it('does not pause a large run merely because five roots failed when the ratio is low', () => {
    const tasks = Array.from({ length: 50 }, (_, index) =>
      task(`large-${index + 1}`, index < 5 ? TaskStatus.NO_GO : TaskStatus.DONE),
    );
    const evaluations = new Map(tasks.map((item, index) => [
      item.id,
      index < 5 ? TaskEvaluation.NO_GO : TaskEvaluation.DONE,
    ]));

    expect(evaluateFixCircuitBreaker(tasks, evaluations, policy)).toMatchObject({
      shouldPause: false,
      unresolvedTasks: 5,
      unresolvedRatioPercent: 10,
      effectiveCountThreshold: 5,
    });
  });

  it('uses effective-config thresholds rather than a fixed five', () => {
    const tasks = Array.from({ length: 10 }, (_, index) =>
      task(`configured-${index + 1}`, index < 2 ? TaskStatus.NO_GO : TaskStatus.DONE),
    );
    const evaluations = new Map(tasks.map((item, index) => [
      item.id,
      index < 2 ? TaskEvaluation.NO_GO : TaskEvaluation.DONE,
    ]));

    expect(evaluateFixCircuitBreaker(tasks, evaluations, {
      enabled: true,
      max_unresolved_tasks: 2,
      min_unresolved_ratio_percent: 20,
    }).shouldPause).toBe(true);
  });

  it('excludes repaired roots while retaining an unresolved FIX lineage and its blocked dependant', () => {
    const tasks = [
      task('repaired', TaskStatus.NO_GO),
      task('repaired-fix', TaskStatus.DONE, {
        isPriorityFix: true,
        fixForTaskId: 'repaired',
      }),
      task('unresolved', TaskStatus.NO_GO),
      task('unresolved-fix', TaskStatus.PAUSED, {
        isPriorityFix: true,
        fixForTaskId: 'unresolved',
      }),
      task('dependent', TaskStatus.PENDING, { dependencies: ['unresolved'] }),
    ];
    const evaluations = new Map([
      ['repaired', TaskEvaluation.NO_GO],
      ['repaired-fix', TaskEvaluation.DONE],
      ['unresolved', TaskEvaluation.NO_GO],
      ['unresolved-fix', TaskEvaluation.NOT_DISPATCHED],
      ['dependent', TaskEvaluation.NOT_DISPATCHED],
    ]);
    const dispatchSettlements = new Map([
      ['unresolved-fix', { state: 'FAILED', reasonCode: 'DISPATCH_EXHAUSTED' } as const],
      ['dependent', { state: 'SKIPPED', reasonCode: 'DEPENDENCY_STARVED' } as const],
    ]);

    expect(evaluateFixCircuitBreaker(
      tasks,
      evaluations,
      policy,
      dispatchSettlements,
    )).toMatchObject({
      totalTasks: 3,
      unresolvedTasks: 1,
      unresolvedTaskIds: ['unresolved'],
      blockedDependentTaskIds: ['dependent'],
      forcedByBlockedDependents: true,
      shouldPause: true,
    });
  });
});
