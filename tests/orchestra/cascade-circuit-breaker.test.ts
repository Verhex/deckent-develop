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
import { applyCascadeCircuitBreaker } from '../../src/orchestra/sprint-controller.js';
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
