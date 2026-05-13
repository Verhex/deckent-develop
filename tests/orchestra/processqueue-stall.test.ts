/**
 * tests/orchestra/processqueue-stall.test.ts
 *
 * Sprint 165 Task 2 (Bug Y) — Brain processQueue Legacy FIFO Stall Fix.
 *
 * Covers the three Sprint 161/164/165 forensic dogfood replays of the
 * "hayalet PENDING task" regression by exercising the pure helpers that the
 * refactored processQueue in result-collector.ts now relies on:
 *
 *   - computeSlotsAvailable   — slot accounting honors EXECUTING/CLAIMED/TESTING
 *   - selectEligibleForSpawn  — PENDING scan with dependency_pipeline_enabled
 *                                semantics + assigned/collected idempotency
 *   - pickFromQueue           — FIFO queue drain with Bug F duplicate guard
 *
 * The 8 scenarios mirror the DIRECTIVES Sprint 165 spec for Task 2:
 *   (a) enabled:false + 3 no-dep + maxWorkers=3 → 3 paralel
 *   (b) enabled:false + 5 no-dep + maxWorkers=3 → 3 + queue cascade
 *   (c) enabled:false + 6 no-dep + maxWorkers=6 → 6 paralel (Sprint 164 happy)
 *   (d) enabled:false + 6 no-dep + maxWorkers=3 → 3 + 3 sequential (hayalet fix)
 *   (e) Force re-scan idle slot → orphan PENDING spawn
 *   (f) Duplicate spawn guard via pickFromQueue
 *   (g) currentlyExecuting=max + queue full + saturated → no spawn
 *   (h) processQueue idempotent — repeated call doesn't double-spawn
 */

import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';
import {
  countCurrentlyExecuting,
  computeSlotsAvailable,
  selectEligibleForSpawn,
  pickFromQueue,
} from '../../src/orchestra/sprint-spawner.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `desc ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-165',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-165',
    number: 165,
    status: 'planning' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

function makeConfig(enabled: boolean): Pick<ResolvedConfig, 'dependency_pipeline_enabled'> {
  return { dependency_pipeline_enabled: enabled };
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

// ═══════════════════════════════════════════════════════════════════════
// (a) enabled:false + 3 no-dep + maxWorkers=3 → 3 paralel (legacy baseline)
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (a) — 3 no-dep + maxWorkers=3 → 3 parallel spawn', () => {
  it('selects all 3 PENDING tasks when slots=3 and dependency_pipeline_enabled=false', () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask(`165-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);

    // All slots empty initially — no EXECUTING tasks
    const slots = computeSlotsAvailable(sprint, 3);
    expect(slots).toBe(3);

    const eligible = selectEligibleForSpawn(sprint, config, slots, EMPTY_SET, EMPTY_SET);
    expect(eligible).toHaveLength(3);
    expect(eligible.map(t => t.id)).toEqual(['165-001', '165-002', '165-003']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (b) enabled:false + 5 no-dep + maxWorkers=3 → 3 + queue cascade
//     ilk DONE → 4. spawn; ikinci DONE → 5. spawn (Sprint 161 fix)
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (b) — 5 no-dep + maxWorkers=3 → queue cascade', () => {
  it('after 1st DONE, slot=1 opens and 4th task becomes eligible via queue', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(`165-00${i + 1}`));
    // Initial spawn: first 3 active, last 2 queued
    tasks[0].status = TaskStatus.EXECUTING;
    tasks[1].status = TaskStatus.EXECUTING;
    tasks[2].status = TaskStatus.EXECUTING;
    // Queue holds the FIFO tail
    const remainingQueue: Task[] = [tasks[3], tasks[4]];
    const assigned = new Set<string>(['165-001', '165-002', '165-003']);
    const collected = new Set<string>();

    // 1st DONE → mark task1 DONE, slot frees
    tasks[0].status = TaskStatus.DONE;
    collected.add('165-001');
    const slots1 = computeSlotsAvailable(makeSprint(tasks), 3);
    expect(slots1).toBe(1); // task2 + task3 still EXECUTING

    // pickFromQueue drains FIFO head (task4)
    const next1 = pickFromQueue(remainingQueue, assigned);
    expect(next1?.id).toBe('165-004');
    expect(remainingQueue).toHaveLength(1);

    // Simulate spawn — assignedTaskIds.add(next1.id)
    assigned.add(next1!.id);
    tasks[3].status = TaskStatus.EXECUTING;

    // 2nd DONE → task2 DONE
    tasks[1].status = TaskStatus.DONE;
    collected.add('165-002');
    const slots2 = computeSlotsAvailable(makeSprint(tasks), 3);
    expect(slots2).toBe(1);

    const next2 = pickFromQueue(remainingQueue, assigned);
    expect(next2?.id).toBe('165-005');
    expect(remainingQueue).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (c) enabled:false + 6 no-dep + maxWorkers=6 → 6 paralel (Sprint 164 happy)
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (c) — 6 no-dep + maxWorkers=6 → 6 parallel spawn', () => {
  it('selects all 6 PENDING tasks when slots=6 (Sprint 164 happy path)', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask(`165-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);

    const slots = computeSlotsAvailable(sprint, 6);
    expect(slots).toBe(6);

    const eligible = selectEligibleForSpawn(sprint, config, slots, EMPTY_SET, EMPTY_SET);
    expect(eligible).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (d) enabled:false + 6 no-dep + maxWorkers=3 → 3 + 3 sequential (hayalet fix)
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (d) — 6 no-dep + maxWorkers=3 → hayalet fix (3+3 sequential)', () => {
  it('first wave selects 3, second wave selects 3 after first wave done', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask(`165-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);

    // Wave 1: slots=3 — pick first 3 PENDING
    const slots1 = computeSlotsAvailable(sprint, 3);
    expect(slots1).toBe(3);
    const wave1 = selectEligibleForSpawn(sprint, config, slots1, EMPTY_SET, EMPTY_SET);
    expect(wave1).toHaveLength(3);
    expect(wave1.map(t => t.id)).toEqual(['165-001', '165-002', '165-003']);

    // Simulate spawn — Wave 1 tasks EXECUTING
    for (const t of wave1) t.status = TaskStatus.EXECUTING;
    const assigned = new Set<string>(wave1.map(t => t.id));

    // Wave 1 still running: slots=0, no new eligible
    expect(computeSlotsAvailable(sprint, 3)).toBe(0);
    const wave1Mid = selectEligibleForSpawn(sprint, config, 0, assigned, EMPTY_SET);
    expect(wave1Mid).toHaveLength(0);

    // Wave 1 all DONE — slots free
    for (const t of wave1) t.status = TaskStatus.DONE;
    const collected = new Set<string>(wave1.map(t => t.id));
    const slots2 = computeSlotsAvailable(sprint, 3);
    expect(slots2).toBe(3);

    // Wave 2: selectEligibleForSpawn picks the hayalet PENDING tasks
    // (this is the legacy FIFO bug — without the force re-scan,
    // these would never have been picked up.)
    const wave2 = selectEligibleForSpawn(sprint, config, slots2, assigned, collected);
    expect(wave2).toHaveLength(3);
    expect(wave2.map(t => t.id)).toEqual(['165-004', '165-005', '165-006']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (e) Force re-scan idle slot → orphan PENDING spawn
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (e) — force re-scan finds orphan PENDING task', () => {
  it('after a worker silently dies (status not progressed), PENDING task is detected', () => {
    // Scenario: 4 tasks, maxWorkers=4 — all spawned (Wave 1)
    // task1, task2, task3 finished and are DONE
    // task4 *silently died* — never went EXECUTING (or transitioned out),
    // so it's still PENDING on disk. Legacy processQueue never re-picks it.
    const tasks = [
      makeTask('165-001', { status: TaskStatus.DONE }),
      makeTask('165-002', { status: TaskStatus.DONE }),
      makeTask('165-003', { status: TaskStatus.DONE }),
      makeTask('165-004', { status: TaskStatus.PENDING }), // orphan
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);

    // No worker is EXECUTING → all slots free
    expect(countCurrentlyExecuting(sprint)).toBe(0);
    const slots = computeSlotsAvailable(sprint, 4);
    expect(slots).toBe(4);

    // assignedTaskIds tracks the original three completed workers,
    // but the orphan task4 was never marked assigned (or got unmarked
    // by a spawn failure).
    const assigned = new Set<string>(['165-001', '165-002', '165-003']);
    const collected = new Set<string>(['165-001', '165-002', '165-003']);

    const eligible = selectEligibleForSpawn(sprint, config, slots, assigned, collected);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('165-004'); // orphan recovered
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (f) Duplicate spawn guard via pickFromQueue
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (f) — duplicate spawn guard (Bug F)', () => {
  it('pickFromQueue skips tasks already in assignedTaskIds', () => {
    const tasks = [makeTask('165-001'), makeTask('165-002'), makeTask('165-003')];
    const remainingQueue: Task[] = [...tasks];

    // task1 was already TASK_ASSIGN'd elsewhere (e.g. force re-scan raced)
    const assigned = new Set<string>(['165-001']);

    // First pick should skip task1 (already assigned) and return task2
    const first = pickFromQueue(remainingQueue, assigned);
    expect(first?.id).toBe('165-002');

    // Queue should still hold task3 (task1 was shifted+discarded, task2 returned)
    expect(remainingQueue).toHaveLength(1);
    expect(remainingQueue[0].id).toBe('165-003');
  });

  it('selectEligibleForSpawn skips tasks already in collectedIds (defensive)', () => {
    const tasks = [
      makeTask('165-001', { status: TaskStatus.PENDING }),
      makeTask('165-002', { status: TaskStatus.PENDING }),
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);
    // task1 is in collected (defensive: never picked even if status drift)
    const collected = new Set<string>(['165-001']);

    const eligible = selectEligibleForSpawn(sprint, config, 5, EMPTY_SET, collected);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('165-002');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (g) currentlyExecuting=max + queue full + saturated → no spawn
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (g) — saturated slots prevent spawn', () => {
  it('returns 0 slots and 0 eligible when all workers EXECUTING', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask(`165-00${i + 1}`, {
        status: i < 3 ? TaskStatus.EXECUTING : TaskStatus.PENDING,
      }),
    );
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);

    expect(countCurrentlyExecuting(sprint)).toBe(3);
    const slots = computeSlotsAvailable(sprint, 3);
    expect(slots).toBe(0);

    // slotsAvailable=0 → no eligible tasks (even though 2 PENDING exist)
    const eligible = selectEligibleForSpawn(sprint, config, slots, EMPTY_SET, EMPTY_SET);
    expect(eligible).toHaveLength(0);
  });

  it('counts CLAIMED and TESTING as occupying a slot', () => {
    const tasks = [
      makeTask('165-001', { status: TaskStatus.EXECUTING }),
      makeTask('165-002', { status: TaskStatus.CLAIMED }),
      makeTask('165-003', { status: TaskStatus.TESTING }),
      makeTask('165-004', { status: TaskStatus.PENDING }),
    ];
    const sprint = makeSprint(tasks);
    expect(countCurrentlyExecuting(sprint)).toBe(3);
    expect(computeSlotsAvailable(sprint, 4)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (h) processQueue idempotent — repeated call doesn't double-spawn
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y (h) — processQueue idempotent', () => {
  it('pickFromQueue+assignedTaskIds prevents double-pick on repeated calls', () => {
    const tasks = [makeTask('165-001'), makeTask('165-002')];
    const remainingQueue: Task[] = [...tasks];
    const assigned = new Set<string>();

    // First call: get task1
    const first = pickFromQueue(remainingQueue, assigned);
    expect(first?.id).toBe('165-001');
    assigned.add(first!.id);

    // Simulate processQueue re-entry (e.g. race with force re-scan):
    // the same `completedTaskIds` triggers another iteration. The queue
    // head is now task2 — but if task1 *was* re-inserted somehow, the
    // assignedTaskIds guard would still skip it. We assert by re-pushing
    // task1 to the queue and confirming pickFromQueue skips it.
    remainingQueue.unshift(tasks[0]); // simulate accidental re-queue
    const second = pickFromQueue(remainingQueue, assigned);
    // task1 is skipped (assigned), task2 is returned
    expect(second?.id).toBe('165-002');
  });

  it('selectEligibleForSpawn never returns a task already in assignedTaskIds', () => {
    const tasks = [
      makeTask('165-001', { status: TaskStatus.PENDING }),
      makeTask('165-002', { status: TaskStatus.PENDING }),
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig(false);
    const assigned = new Set<string>(['165-001']); // already spawned

    const eligible = selectEligibleForSpawn(sprint, config, 5, assigned, EMPTY_SET);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('165-002'); // task1 skipped, task2 returned
  });

  it('returns empty list when queue is drained even on repeated invocation', () => {
    const remainingQueue: Task[] = [makeTask('165-001')];
    const assigned = new Set<string>();

    expect(pickFromQueue(remainingQueue, assigned)?.id).toBe('165-001');
    expect(pickFromQueue(remainingQueue, assigned)).toBeUndefined();
    expect(pickFromQueue(remainingQueue, assigned)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Bonus: dependency_pipeline_enabled semantics preserved
// ═══════════════════════════════════════════════════════════════════════

describe('Bug Y bonus — dependency_pipeline_enabled semantics', () => {
  it('legacy FIFO mode ignores task.dependencies (Sprint 165 freeze)', () => {
    const tasks = [
      makeTask('165-001', { status: TaskStatus.PENDING }),
      makeTask('165-002', { status: TaskStatus.PENDING, dependencies: ['165-001'] }),
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig(false); // legacy

    // Even though task2 depends on task1 (still PENDING), legacy mode picks it
    const eligible = selectEligibleForSpawn(sprint, config, 2, EMPTY_SET, EMPTY_SET);
    expect(eligible).toHaveLength(2);
    expect(eligible.map(t => t.id)).toEqual(['165-001', '165-002']);
  });

  it('dependency pipeline mode enforces deps must be DONE', () => {
    const tasks = [
      makeTask('165-001', { status: TaskStatus.PENDING }),
      makeTask('165-002', { status: TaskStatus.PENDING, dependencies: ['165-001'] }),
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig(true); // pipeline

    // task2 blocked because dep 165-001 is still PENDING (not DONE)
    const eligible = selectEligibleForSpawn(sprint, config, 2, EMPTY_SET, EMPTY_SET);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('165-001');
  });
});
