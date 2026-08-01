/**
 * Sprint 140 cost-cascade circuit-breaker WIRE (B11).
 *
 * The CascadeDetector + pauseSprint were both fully built and unit-tested, but the
 * detector had ZERO callers — the $42-disaster circuit-breaker (197 workers × 100%
 * NO_GO) was never connected to the sprint lifecycle. applyCascadeCircuitBreaker
 * now evaluates unresolved logical roots only AFTER the configured FIX budget.
 *
 * These tests assert the scale-aware count + ratio policy instead of pinning a
 * production-only magic number.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyCascadeCircuitBreaker,
  applyUnresolvedLineageOperatorHold,
} from '../../src/orchestra/sprint-controller.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/task-types.js';
import type { Task } from '../../src/core/task-types.js';
import { SprintStatus } from '../../src/core/sprint-types.js';
import type { Sprint } from '../../src/core/sprint-types.js';

const dirs: string[] = [];
function root(): string { const d = mkdtempSync(join(tmpdir(), 'cascade-cb-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function makeSprint(n: number): Sprint {
  const tasks = Array.from({ length: n }, (_, i) => ({
    id: `t-${i}`,
    status: TaskStatus.NO_GO, // already evaluated → not a pausable EXECUTING task
  } as Task));
  return { id: 'sprint-cascade', tasks, status: SprintStatus.EVALUATING } as Sprint;
}

function evalsFor(sprint: Sprint, seq: TaskEvaluation[]): Map<string, TaskEvaluation> {
  const m = new Map<string, TaskEvaluation>();
  sprint.tasks.forEach((t, i) => m.set(t.id, seq[i]!));
  return m;
}

const NG = TaskEvaluation.NO_GO;
const OK = TaskEvaluation.DONE;
const POLICY = {
  enabled: true,
  max_unresolved_tasks: 5,
  min_unresolved_ratio_percent: 50,
} as const;

describe('applyCascadeCircuitBreaker (Sprint 140 cost-cascade circuit-breaker wire)', () => {
  it('pauses a pure NOT_DISPATCHED lineage after its one re-dispatch authority is exhausted', () => {
    const r = root();
    mkdirSync(join(r, '.tasks'), { recursive: true });
    const sprint = makeSprint(1);
    sprint.tasks[0]!.status = TaskStatus.PAUSED;
    writeFileSync(
      join(r, '.tasks', 'task-t-0.redispatch-attempted'),
      JSON.stringify({ taskId: 't-0', attemptedAt: new Date().toISOString() }),
      'utf-8',
    );

    const paused = applyCascadeCircuitBreaker(
      r,
      sprint,
      evalsFor(sprint, [TaskEvaluation.NOT_DISPATCHED]),
      POLICY,
    );

    expect(paused).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('pauses when post-FIX unresolved roots meet both count and ratio gates', () => {
    const r = root();
    const sprint = makeSprint(6);
    const paused = applyCascadeCircuitBreaker(
      r,
      sprint,
      evalsFor(sprint, [NG, NG, NG, NG, NG, NG]),
      POLICY,
    );
    expect(paused).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('scales the absolute gate for a three-task sprint', () => {
    const r = root();
    const sprint = makeSprint(3);
    const paused = applyCascadeCircuitBreaker(
      r,
      sprint,
      evalsFor(sprint, [NG, NG, OK]),
      POLICY,
    );
    expect(paused).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('does not pause when the unresolved ratio is below policy', () => {
    const r = root();
    const sprint = makeSprint(8);
    const paused = applyCascadeCircuitBreaker(
      r,
      sprint,
      evalsFor(sprint, [NG, NG, NG, OK, OK, OK, OK, OK]),
      POLICY,
    );
    expect(paused).toBe(false);
    expect(sprint.status).toBe(SprintStatus.EVALUATING);
  });

  it('pauses when one exhausted root below the ratio gate blocks an unfinished dependant', () => {
    const r = root();
    const sprint = makeSprint(3);
    sprint.tasks[0]!.status = TaskStatus.NO_GO;
    sprint.tasks[1]!.status = TaskStatus.DONE;
    sprint.tasks[2]!.status = TaskStatus.PENDING;
    sprint.tasks[2]!.dependencies = ['t-0'];

    const paused = applyCascadeCircuitBreaker(
      r,
      sprint,
      evalsFor(sprint, [NG, OK, TaskEvaluation.NOT_DISPATCHED]),
      POLICY,
    );

    expect(paused).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('does not count cascade-skipped tasks that never consumed a provider attempt', () => {
    const r = root();
    const tasksDir = join(r, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const sprint = makeSprint(8);
    for (let index = 3; index < sprint.tasks.length; index += 1) {
      const task = sprint.tasks[index]!;
      writeFileSync(
        join(tasksDir, `task-${task.id}.result`),
        JSON.stringify({
          taskId: task.id,
          workerId: `cascade-skip-${task.id}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          selfAssessment: 'NO_GO',
          notes: 'dependency was never dispatched',
          cascadeSkipped: true,
        }),
        'utf-8',
      );
    }

    const paused = applyCascadeCircuitBreaker(
      r,
      sprint,
      evalsFor(sprint, [NG, OK, OK, NG, NG, NG, NG, NG]),
      POLICY,
    );

    expect(paused).toBe(false);
    expect(sprint.status).toBe(SprintStatus.EVALUATING);
  });
});

describe('applyUnresolvedLineageOperatorHold', () => {
  it('parks a below-threshold FAILED lineage instead of allowing receipt HOLD', () => {
    const r = root();
    const sprint = makeSprint(8);
    const evaluations = evalsFor(sprint, [NG, NG, NG, OK, OK, OK, OK, OK]);

    expect(applyCascadeCircuitBreaker(r, sprint, evaluations, POLICY)).toBe(false);
    expect(applyUnresolvedLineageOperatorHold(r, sprint, evaluations, POLICY)).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
    expect(sprint.phase).toBe('FIX');
  });

  it('does not park a fully completed lineage', () => {
    const r = root();
    const sprint = makeSprint(3);
    const evaluations = evalsFor(sprint, [OK, OK, OK]);

    expect(applyUnresolvedLineageOperatorHold(r, sprint, evaluations, POLICY)).toBe(false);
    expect(sprint.status).toBe(SprintStatus.EVALUATING);
  });
});
