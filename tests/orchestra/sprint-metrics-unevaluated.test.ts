// ─── tests/orchestra/sprint-metrics-unevaluated.test.ts ─────────────────────
//
// MASTER-PLAN 667. A run that ends before EVALUATE reaches every task used to
// close as "0/N DONE, 0 TECH_DEBT, 0 NO_GO" — because every counter was derived
// from the evaluations map alone. Measured 2026-07-25 on sprint-459: two workers
// had written real results to disk, the summary claimed zero.
//
// The fix does NOT promote a worker's own self-assessment into `completedTasks`
// (only Brain's evaluation may do that). It gives delivered-but-unjudged work an
// explicit bucket so the close is honest in both directions.

import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../../src/orchestra/sprint-metrics.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';

function task(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'x',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-459',
  } as Task;
}

function result(taskId: string, selfAssessment: TaskResult['selfAssessment'] = 'DONE'): TaskResult {
  return {
    taskId,
    workerId: `docker-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment,
    notes: '',
  } as TaskResult;
}

function sprint(ids: string[]): Sprint {
  return { id: 'sprint-459', number: 459, tasks: ids.map(task), workers: [] } as unknown as Sprint;
}

describe('sprint metrics — unevaluated delivered work (MASTER-PLAN 667)', () => {
  it('counts delivered-but-unjudged results instead of reporting them as nothing', () => {
    // The measured case: 3 planned tasks, 2 real results on disk, EVALUATE never ran.
    const metrics = calculateMetrics(
      sprint(['459-001', '459-002', '459-003']),
      new Map(),
      [result('459-001'), result('459-002')],
    );

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.unevaluatedTasks).toBe(2);
    // Still not successes — nobody judged them.
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.noGoTasks).toBe(0);
  });

  it('never promotes a worker self-assessment into the completed count', () => {
    const metrics = calculateMetrics(
      sprint(['t1']),
      new Map(),
      [result('t1', 'DONE')],
    );
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.unevaluatedTasks).toBe(1);
  });

  it('reports zero unevaluated when every result was judged', () => {
    const metrics = calculateMetrics(
      sprint(['t1', 't2']),
      new Map([['t1', TaskEvaluation.DONE], ['t2', TaskEvaluation.NO_GO]]),
      [result('t1'), result('t2', 'NO_GO')],
    );
    expect(metrics.completedTasks).toBe(1);
    expect(metrics.noGoTasks).toBe(1);
    expect(metrics.unevaluatedTasks).toBe(0);
  });

  it('counts only the unjudged subset on a partially evaluated run', () => {
    const metrics = calculateMetrics(
      sprint(['t1', 't2', 't3']),
      new Map([['t1', TaskEvaluation.GO_WITH_TECH_DEBT]]),
      [result('t1'), result('t2'), result('t3')],
    );
    expect(metrics.completedTasks).toBe(1);
    expect(metrics.techDebtTasks).toBe(1);
    expect(metrics.unevaluatedTasks).toBe(2);
  });
});
