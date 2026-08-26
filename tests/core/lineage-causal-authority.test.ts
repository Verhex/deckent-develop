import { describe, expect, it } from 'vitest';
import {
  computeLogicalTaskProgress,
  evaluateFixCircuitBreaker,
  foldTaskLineages,
  projectTaskLineageSettlements,
} from '../../src/core/task-lineage.js';
import {
  TaskEvaluation,
  TaskStatus,
  type FixCircuitBreakerConfig,
  type Task,
} from '../../src/core/types.js';

function task(id: string, status: TaskStatus, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'causal-authority regression',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status,
    sprintId: 'sprint-lineage-causal-authority',
    ...overrides,
  };
}

const policy: FixCircuitBreakerConfig = {
  enabled: true,
  max_unresolved_tasks: 1,
  min_unresolved_ratio_percent: 1,
};

describe('foldTaskLineages causal settlement authority', () => {
  it('admits only the earliest repair born from the current unresolved head', () => {
    const tasks = [
      task('root', TaskStatus.NO_GO),
      task('parallel-success', TaskStatus.DONE, {
        isPriorityFix: true,
        fixForTaskId: 'root',
        createdAt: '2026-08-01T00:00:02Z',
      }),
      task('admitted-failure', TaskStatus.NO_GO, {
        isPriorityFix: true,
        fixForTaskId: 'root',
        createdAt: '2026-08-01T00:00:01Z',
      }),
    ];

    expect(foldTaskLineages(tasks)[0]).toMatchObject({
      rootId: 'root',
      resolvedTask: { id: 'admitted-failure', status: TaskStatus.NO_GO },
      attemptIds: ['root', 'admitted-failure', 'parallel-success'],
    });
    expect(computeLogicalTaskProgress(tasks)).toEqual({
      done: 0,
      active: 0,
      blocked: 0,
      total: 1,
    });
  });

  it('makes a successful admitted repair absorbing despite stale descendants', () => {
    const tasks = [
      task('root', TaskStatus.NO_GO),
      task('accepted-fix', TaskStatus.DONE, {
        isPriorityFix: true,
        fixForTaskId: 'root',
        createdAt: '2026-08-01T00:00:01Z',
      }),
      task('redundant-success', TaskStatus.DONE, {
        isPriorityFix: true,
        fixForTaskId: 'accepted-fix',
        createdAt: '2026-08-01T00:00:02Z',
      }),
      task('stale-failure', TaskStatus.NO_GO, {
        isPriorityFix: true,
        fixForTaskId: 'redundant-success',
        createdAt: '2026-08-01T00:00:03Z',
      }),
    ];
    const evaluations = new Map([
      ['root', TaskEvaluation.NO_GO],
      ['accepted-fix', TaskEvaluation.DONE],
      ['redundant-success', TaskEvaluation.DONE],
      ['stale-failure', TaskEvaluation.NO_GO],
    ]);

    expect(foldTaskLineages(tasks)[0]?.resolvedTask.id).toBe('accepted-fix');
    expect(projectTaskLineageSettlements(tasks, evaluations)[0]).toMatchObject({
      resolvedTask: { id: 'accepted-fix' },
      evaluation: TaskEvaluation.DONE,
      state: 'COMPLETED',
    });
    expect(computeLogicalTaskProgress(tasks)).toEqual({
      done: 1,
      active: 0,
      blocked: 0,
      total: 1,
    });
  });

  it('pins sprint-488 successful 001/010/013 against unnecessary XFIX leaves', () => {
    const tasks = ['001', '010', '013'].flatMap((id, index) => [
      task(id, TaskStatus.DONE),
      task(`${id}-XFIX`, index === 1 ? TaskStatus.DONE : TaskStatus.NO_GO, {
        isPriorityFix: true,
        fixForTaskId: id,
        createdAt: `2026-08-01T00:00:0${index + 1}Z`,
      }),
    ]);

    expect(foldTaskLineages(tasks).map(lineage => [
      lineage.rootId,
      lineage.resolvedTask.id,
      lineage.resolvedTask.status,
    ])).toEqual([
      ['001', '001', TaskStatus.DONE],
      ['010', '010', TaskStatus.DONE],
      ['013', '013', TaskStatus.DONE],
    ]);
    expect(computeLogicalTaskProgress(tasks)).toEqual({
      done: 3,
      active: 0,
      blocked: 0,
      total: 3,
    });
  });

  it('does not let forcedByBlockedDependents bypass settled-DONE authority', () => {
    const tasks = [
      task('settled-root', TaskStatus.DONE),
      task('settled-root-XFIX', TaskStatus.NO_GO, {
        isPriorityFix: true,
        fixForTaskId: 'settled-root',
        createdAt: '2026-08-01T00:00:01Z',
      }),
      task('dependent', TaskStatus.PENDING, { dependencies: ['settled-root'] }),
    ];
    const evaluations = new Map([
      ['settled-root', TaskEvaluation.DONE],
      ['settled-root-XFIX', TaskEvaluation.NO_GO],
      ['dependent', TaskEvaluation.NOT_DISPATCHED],
    ]);

    expect(evaluateFixCircuitBreaker(tasks, evaluations, policy)).toMatchObject({
      shouldPause: false,
      unresolvedTasks: 0,
      unresolvedTaskIds: [],
      blockedDependentTaskIds: [],
      blockedDependencyEdges: [],
      forcedByBlockedDependents: false,
    });
  });
});
