/**
 * Sprint 140 cost-cascade circuit-breaker WIRE (B11).
 *
 * The CascadeDetector + pauseSprint were both fully built and unit-tested, but the
 * detector had ZERO callers — the $42-disaster circuit-breaker (197 workers × 100%
 * NO_GO) was never connected to the sprint lifecycle. applyCascadeCircuitBreaker
 * wires it into the EVALUATE→FIX seam: N consecutive NO_GO → auto-pause.
 *
 * These tests assert the protective contract (5 consecutive NO_GO pauses; fewer or a
 * reset streak do not) — a guard against the circuit-breaker silently regressing.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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

describe('applyCascadeCircuitBreaker (Sprint 140 cost-cascade circuit-breaker wire)', () => {
  it('pauses the sprint after 5 consecutive NO_GO (default threshold)', () => {
    const r = root();
    const sprint = makeSprint(6);
    const paused = applyCascadeCircuitBreaker(r, sprint, evalsFor(sprint, [NG, NG, NG, NG, NG, NG]));
    expect(paused).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('does NOT pause below the threshold (4 consecutive NO_GO)', () => {
    const r = root();
    const sprint = makeSprint(4);
    const paused = applyCascadeCircuitBreaker(r, sprint, evalsFor(sprint, [NG, NG, NG, NG]));
    expect(paused).toBe(false);
    expect(sprint.status).toBe(SprintStatus.EVALUATING);
  });

  it('a DONE resets the consecutive-NO_GO streak (no false pause)', () => {
    const r = root();
    const sprint = makeSprint(8);
    // 4 NO_GO, DONE (reset), then 3 NO_GO — never reaches 5 consecutive.
    const paused = applyCascadeCircuitBreaker(r, sprint, evalsFor(sprint, [NG, NG, NG, NG, OK, NG, NG, NG]));
    expect(paused).toBe(false);
    expect(sprint.status).toBe(SprintStatus.EVALUATING);
  });
});
