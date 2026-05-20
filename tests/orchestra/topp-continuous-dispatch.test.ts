/**
 * Sprint 178 Task 005 (continued by 178-007-fix) — TOPP B+C Continuous Dispatch
 *
 * Tests the G1-G10 matrix for the unified `planDispatch()` function that
 * supersedes the dual `processQueue` + `maybeRespawn` spawn paths in
 * result-collector.ts. See ADR-064 for the architectural rationale.
 *
 * G-matrix:
 *   G1: empty queue + no PENDING → no spawn
 *   G2: eligible PENDING with slots → spawn
 *   G3: PENDING blocked by unmet deps → no spawn (dep_pipeline=on)
 *   G4: predecessor DONE → eligible spawned
 *   G5: max_workers boundary respected (slotsAvailable=0 → no spawn)
 *   G6: task already in assignedTaskIds → skipped (Bug F idempotency)
 *   G7: predecessor digest reaches buildDependenciesBlock (TOPP C)
 *   G8: flag-agnostic — works whether dep_pipeline on/off
 *   G9: DECKENT_LEGACY_FIFO=1 → legacy one-completion-per-drain
 *   G10: multi-wave smoke — two-step chain T1 → T2 → T3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';
import { planDispatch } from '../../src/orchestra/result-collector.js';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-178',
    createdAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-178',
    number: 178,
    status: 'executing' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

function makeConfig(opts: { depPipeline: boolean; maxWorkers?: number }): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: opts.maxWorkers ?? 2,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    dependency_pipeline_enabled: opts.depPipeline,
  } as ResolvedConfig;
}

// ═════════════════════════════════════════════════════════════════════
// G1: empty queue + no PENDING → no spawn (no-op)
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G1: empty state', () => {
  it('returns empty plan when sprint has no PENDING tasks and queue is empty', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { status: TaskStatus.DONE }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: true }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1', 't2']),
      remainingQueue: [],
      completedTaskIds: ['t1', 't2'],
    });
    expect(plan.toSpawn).toHaveLength(0);
    expect(plan.toKill).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// G2: eligible PENDING with slots → spawn
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G2: eligible PENDING + slots free', () => {
  it('spawns a PENDING task when slots are available', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { status: TaskStatus.PENDING }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: true }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1']),
      remainingQueue: [],
      completedTaskIds: ['t1'],
    });
    expect(plan.toSpawn.map(t => t.id)).toContain('t2');
    expect(plan.mode).toBe('continuous');
  });
});

// ═════════════════════════════════════════════════════════════════════
// G3: PENDING blocked by unmet deps (dep_pipeline=on) → no spawn
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G3: deps unmet (dep_pipeline=on)', () => {
  it('does not spawn a task whose dependency is still PENDING', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.PENDING }),
      makeTask('t2', { status: TaskStatus.PENDING, dependencies: ['t1'] }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: true }),
      maxWorkers: 2,
      assignedTaskIds: new Set(['t1']),  // t1 already spawned
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    });
    // t2 must NOT be in toSpawn because t1 is not DONE yet
    expect(plan.toSpawn.map(t => t.id)).not.toContain('t2');
  });
});

// ═════════════════════════════════════════════════════════════════════
// G4: dep resolved → eligible spawned
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G4: dep resolved → eligible', () => {
  it('spawns a task once its dependency reaches DONE', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { status: TaskStatus.PENDING, dependencies: ['t1'] }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: true }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1']),
      remainingQueue: [],
      completedTaskIds: ['t1'],
    });
    expect(plan.toSpawn.map(t => t.id)).toContain('t2');
  });
});

// ═════════════════════════════════════════════════════════════════════
// G5: max_workers boundary — slotsAvailable=0 → no spawn
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G5: max_workers boundary', () => {
  it('returns no toSpawn when all worker slots are full', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.EXECUTING }),
      makeTask('t2', { status: TaskStatus.EXECUTING }),
      makeTask('t3', { status: TaskStatus.PENDING }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: true, maxWorkers: 2 }),
      maxWorkers: 2,
      assignedTaskIds: new Set(['t1', 't2']),
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    });
    expect(plan.toSpawn).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// G6: collision-edge — task already in assignedTaskIds → skipped
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G6: assignedTaskIds idempotency', () => {
  it('does not re-spawn a task already in assignedTaskIds (Bug F guard)', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { status: TaskStatus.PENDING }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: false }),
      maxWorkers: 4,
      assignedTaskIds: new Set(['t2']),  // already assigned
      collectedIds: new Set(['t1']),
      remainingQueue: [],
      completedTaskIds: ['t1'],
    });
    expect(plan.toSpawn.map(t => t.id)).not.toContain('t2');
  });
});

// ═════════════════════════════════════════════════════════════════════
// G7: predecessor digest reaches buildDependenciesBlock (TOPP C)
// ═════════════════════════════════════════════════════════════════════

describe('TOPP C — predecessor digest in dependency block', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-topp-c-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('embeds selfAssessment, filesChanged, and notes from predecessor .result', () => {
    const predecessorResult: TaskResult = {
      taskId: 'pred-1',
      workerId: 'w-pred-1',
      filesChanged: ['src/foo.ts', 'src/bar.ts'],
      linesAdded: 42,
      linesRemoved: 7,
      testsPassed: true,
      coverage: 92,
      selfAssessment: 'DONE',
      notes: 'Refactored foo to use the new bar helper.',
    };
    writeFileSync(
      join(root, '.tasks', 'task-pred-1.result'),
      JSON.stringify(predecessorResult, null, 2),
    );

    const task = makeTask('t-current', { dependencies: ['pred-1'] });
    const artifact = buildTaskPrompt(task, {
      tasksDir: join(root, '.tasks'),
      dependencies: ['pred-1'],
    });

    expect(artifact.prompt).toContain('pred-1');
    expect(artifact.prompt).toContain('DONE');
    expect(artifact.prompt).toContain('src/foo.ts');
    expect(artifact.prompt).toContain('Refactored foo');
    expect(artifact.prompt).toContain('+42/-7');
  });

  it('renders pending placeholder when predecessor result missing', () => {
    const task = makeTask('t-current', { dependencies: ['pred-missing'] });
    const artifact = buildTaskPrompt(task, {
      tasksDir: join(root, '.tasks'),
      dependencies: ['pred-missing'],
    });
    expect(artifact.prompt).toContain('Pending (not yet complete)');
  });
});

// ═════════════════════════════════════════════════════════════════════
// G8: flag-agnostic — same dispatch contract whether dep_pipeline on/off
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G8: flag-agnostic contract', () => {
  it('returns a continuous DispatchPlan whether depPipeline=true or false', () => {
    const tasks = [
      makeTask('t1', { status: TaskStatus.PENDING }),
      makeTask('t2', { status: TaskStatus.PENDING }),
    ];

    const planOn = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: true }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    });
    const planOff = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: false }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    });

    // Both modes are "continuous" (no DECKENT_LEGACY_FIFO override).
    expect(planOn.mode).toBe('continuous');
    expect(planOff.mode).toBe('continuous');
    // Both spawn the same two PENDING tasks (no deps in either case).
    expect(planOn.toSpawn).toHaveLength(2);
    expect(planOff.toSpawn).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════
// G9: DECKENT_LEGACY_FIFO=1 → legacy FIFO mode
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G9: DECKENT_LEGACY_FIFO escape hatch', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.DECKENT_LEGACY_FIFO;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DECKENT_LEGACY_FIFO;
    else process.env.DECKENT_LEGACY_FIFO = original;
  });

  it('drains one queued task per completedTaskId when DECKENT_LEGACY_FIFO=1', () => {
    process.env.DECKENT_LEGACY_FIFO = '1';
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { status: TaskStatus.DONE }),
      makeTask('t3', { status: TaskStatus.PENDING }),
      makeTask('t4', { status: TaskStatus.PENDING }),
    ];
    const queue: Task[] = [tasks[2], tasks[3]];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: false }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1', 't2']),
      remainingQueue: queue,
      completedTaskIds: ['t1', 't2'],
    });

    expect(plan.mode).toBe('legacy-fifo');
    expect(plan.toSpawn).toHaveLength(2);
    expect(plan.toSpawn.map(t => t.id)).toEqual(['t3', 't4']);
    expect(plan.toKill).toEqual(['t1', 't2']);
    // queue was drained
    expect(queue).toHaveLength(0);
  });

  it('does not spawn beyond queue depth (legacy contract)', () => {
    process.env.DECKENT_LEGACY_FIFO = '1';
    const tasks = [
      makeTask('t1', { status: TaskStatus.DONE }),
      makeTask('t2', { status: TaskStatus.DONE }),
    ];
    const plan = planDispatch({
      sprint: makeSprint(tasks),
      config: makeConfig({ depPipeline: false }),
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1', 't2']),
      remainingQueue: [],  // empty
      completedTaskIds: ['t1', 't2'],
    });
    expect(plan.toSpawn).toHaveLength(0);
    expect(plan.toKill).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// G10: multi-wave smoke — chain T1 → T2 → T3 across two ticks
// ═════════════════════════════════════════════════════════════════════

describe('TOPP B — planDispatch G10: multi-wave chain', () => {
  it('unblocks the chain step-by-step across multiple ticks', () => {
    // Initial state: t1 PENDING, t2 depends on t1, t3 depends on t2.
    const tasks = [
      makeTask('t1', { status: TaskStatus.PENDING }),
      makeTask('t2', { status: TaskStatus.PENDING, dependencies: ['t1'] }),
      makeTask('t3', { status: TaskStatus.PENDING, dependencies: ['t2'] }),
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig({ depPipeline: true, maxWorkers: 2 });

    // Tick 0: nothing assigned. Only t1 is eligible (no deps).
    let plan = planDispatch({
      sprint,
      config,
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      remainingQueue: [],
      completedTaskIds: [],
    });
    expect(plan.toSpawn.map(t => t.id)).toEqual(['t1']);

    // Simulate t1 completion.
    tasks[0].status = TaskStatus.DONE;

    // Tick 1: t1 DONE, t2 eligible (slot free), t3 still blocked by t2.
    plan = planDispatch({
      sprint,
      config,
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1']),
      remainingQueue: [],
      completedTaskIds: ['t1'],
    });
    expect(plan.toSpawn.map(t => t.id)).toEqual(['t2']);
    expect(plan.toSpawn.map(t => t.id)).not.toContain('t3');

    // Simulate t2 completion.
    tasks[1].status = TaskStatus.DONE;

    // Tick 2: t2 DONE, t3 eligible.
    plan = planDispatch({
      sprint,
      config,
      maxWorkers: 2,
      assignedTaskIds: new Set(),
      collectedIds: new Set(['t1', 't2']),
      remainingQueue: [],
      completedTaskIds: ['t2'],
    });
    expect(plan.toSpawn.map(t => t.id)).toEqual(['t3']);
  });
});
