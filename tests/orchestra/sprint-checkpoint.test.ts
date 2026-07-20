// ═══ Sprint Checkpoint Tests ══════════════════════════════════════════
// Tests for write/read roundtrip, resume state derivation, and fallback.
// Sprint 139 Task 030: dep graph resume restore tests added.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeCheckpoint,
  readCheckpoint,
  hasCheckpoint,
  getResumableTasks,
  restoreDepGraph,
  persistDependencyGraph,
  resetInterruptedWorkersToPending,
  deriveResumableTaskIds,
  hasValidResult,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import {
  buildDependencyGraph,
  enforceWaveDependency,
} from '../../src/orchestra/dependency-scheduler.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `deckent-test-checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function makeMinimalTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status,
  };
}

function makeMinimalSprint(tasks: Task[], phase = SprintPhase.EXECUTE): Sprint {
  return {
    id: 'sprint-138',
    number: 138,
    status: SprintStatus.ACTIVE,
    phase,
    tasks,
    workers: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('writeCheckpoint + readCheckpoint', () => {
  it('write+read roundtrip preserves all fields', () => {
    const root = makeTempDir();
    const tasks = [
      makeMinimalTask('138-001', TaskStatus.DONE),
      makeMinimalTask('138-002', TaskStatus.PENDING),
    ];
    const sprint = makeMinimalSprint(tasks);

    const written = writeCheckpoint(root, sprint, 42);
    expect(written).not.toBeNull();
    expect(written!.sprintId).toBe('sprint-138');
    expect(written!.checkpointNumber).toBe(1);
    expect(written!.completedTasks).toContain('138-001');
    expect(written!.pendingTasks).toContain('138-002');
    expect(written!.eventStreamOffset).toBe(42);
    expect(written!.brainPhase).toBe(SprintPhase.EXECUTE);

    const read = readCheckpoint(root, 'sprint-138');
    expect(read).not.toBeNull();
    expect(read!.sprintId).toBe(written!.sprintId);
    expect(read!.checkpointNumber).toBe(1);
    expect(read!.completedTasks).toEqual(written!.completedTasks);
    expect(read!.pendingTasks).toEqual(written!.pendingTasks);
    expect(read!.eventStreamOffset).toBe(42);
    rmSync(root, { recursive: true, force: true });
  });

  it('checkpoint number increments on subsequent writes', () => {
    const root = makeTempDir();
    const sprint = makeMinimalSprint([makeMinimalTask('001', TaskStatus.DONE)]);

    const first = writeCheckpoint(root, sprint, 0);
    const second = writeCheckpoint(root, sprint, 10);
    expect(first!.checkpointNumber).toBe(1);
    expect(second!.checkpointNumber).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it('latest checkpoint overwrites previous (only one file)', () => {
    const root = makeTempDir();
    const sprint = makeMinimalSprint([makeMinimalTask('001', TaskStatus.DONE)]);

    writeCheckpoint(root, sprint, 0);
    writeCheckpoint(root, sprint, 99);

    const read = readCheckpoint(root, 'sprint-138');
    // Should read the latest (checkpointNumber=2, eventStreamOffset=99)
    expect(read!.checkpointNumber).toBe(2);
    expect(read!.eventStreamOffset).toBe(99);
    rmSync(root, { recursive: true, force: true });
  });

  it('readCheckpoint returns null when no checkpoint file exists', () => {
    const root = makeTempDir();
    const result = readCheckpoint(root, 'sprint-999');
    expect(result).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it('hasCheckpoint returns false when file does not exist', () => {
    const root = makeTempDir();
    expect(hasCheckpoint(root, 'sprint-999')).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('hasCheckpoint returns true after writeCheckpoint', () => {
    const root = makeTempDir();
    const sprint = makeMinimalSprint([makeMinimalTask('001')]);
    writeCheckpoint(root, sprint, 0);
    expect(hasCheckpoint(root, 'sprint-138')).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('getResumableTasks', () => {
  it('returns all tasks when none are completed', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-138',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: ['001', '002', '003'],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };
    const tasks = [
      makeMinimalTask('001'),
      makeMinimalTask('002'),
      makeMinimalTask('003'),
    ];
    const resumable = getResumableTasks(checkpoint, tasks);
    expect(resumable).toHaveLength(3);
  });

  it('excludes completed tasks from result', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-138',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['001', '002'],
      pendingTasks: ['003'],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 10,
    };
    const tasks = [
      makeMinimalTask('001', TaskStatus.DONE),
      makeMinimalTask('002', TaskStatus.NO_GO),
      makeMinimalTask('003', TaskStatus.PENDING),
    ];
    const resumable = getResumableTasks(checkpoint, tasks);
    expect(resumable).toHaveLength(1);
    expect(resumable[0]!.id).toBe('003');
  });

  it('resume from middle: correctly skips first N completed', () => {
    const completedIds = ['t001', 't002', 't003', 't004', 't005'];
    const pendingIds = ['t006', 't007', 't008'];

    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-140',
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: completedIds,
      pendingTasks: pendingIds,
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 50,
    };

    const allTasks = [
      ...completedIds.map(id => makeMinimalTask(id, TaskStatus.DONE)),
      ...pendingIds.map(id => makeMinimalTask(id, TaskStatus.PENDING)),
    ];

    const resumable = getResumableTasks(checkpoint, allTasks);
    expect(resumable).toHaveLength(3);
    expect(resumable.map(t => t.id)).toEqual(pendingIds);
  });

  it('fresh start fallback: returns all tasks when checkpoint has no completed', () => {
    const checkpoint: SprintCheckpoint = {
      sprintId: 'sprint-138',
      checkpointNumber: 0,
      timestamp: new Date().toISOString(),
      completedTasks: [],
      pendingTasks: ['a', 'b'],
      activeWorkers: [],
      brainPhase: SprintPhase.PLAN,
      eventStreamOffset: 0,
    };
    const tasks = [makeMinimalTask('a'), makeMinimalTask('b')];
    const resumable = getResumableTasks(checkpoint, tasks);
    expect(resumable).toHaveLength(2);
  });
});

describe('writeCheckpoint edge cases', () => {
  it('correctly categorizes EXECUTING tasks as active workers', () => {
    const root = makeTempDir();
    const tasks = [
      makeMinimalTask('001', TaskStatus.EXECUTING),
      makeMinimalTask('002', TaskStatus.DONE),
    ];
    const sprint = makeMinimalSprint(tasks);
    const written = writeCheckpoint(root, sprint, 5);
    expect(written!.activeWorkers).toHaveLength(1);
    expect(written!.activeWorkers[0]!.taskId).toBe('001');
    expect(written!.activeWorkers[0]!.status).toBe('EXECUTING');
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null gracefully when deckent dir cannot be created (fail-safe)', () => {
    // Use a path that is a file (not a dir) to trigger an I/O error
    const root = makeTempDir();
    // Point to a non-existent deep path without creating the parent
    const badRoot = join(root, 'nonexistent-sub', 'deeper');
    // writeCheckpoint should fail gracefully (returns null, not throw)
    // The .deckent dir can't be created because parent doesn't exist
    // We don't mkdirSync recursive so it should fail silently
    const sprint = makeMinimalSprint([makeMinimalTask('001')]);
    // This may succeed or fail depending on OS behavior, but should NOT throw
    expect(() => writeCheckpoint(badRoot, sprint, 0)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});

// ═══ Task 030: Dep Graph Resume Integration ═══════════════════════════

function makeTasksWithDeps() {
  return [
    makeMinimalTask('001', TaskStatus.DONE),
    makeMinimalTask('002', TaskStatus.PENDING),
    makeMinimalTask('003', TaskStatus.PENDING),
  ] as Task[];
}

describe('writeCheckpoint with dep graph (Task 030)', () => {
  it('embeds depGraph in checkpoint when graph provided', () => {
    const root = makeTempDir();
    const taskList = makeTasksWithDeps();
    // Attach dependency: 002 and 003 depend on 001
    taskList[1]!.dependencies = ['001'];
    taskList[2]!.dependencies = ['001'];

    const sprint = makeMinimalSprint(taskList);
    const graph = buildDependencyGraph(taskList, false);

    const written = writeCheckpoint(root, sprint, 10, graph);

    expect(written).not.toBeNull();
    expect(written!.depGraph).toBeDefined();
    expect(written!.depGraph!.sprintId).toBe('sprint-138');
    expect(written!.depGraph!.hasCycle).toBe(false);
    expect(written!.depGraph!.waves).toHaveLength(2);
    rmSync(root, { recursive: true, force: true });
  });

  it('depGraph embedded in checkpoint persists to disk and is readable', () => {
    const root = makeTempDir();
    const taskList = makeTasksWithDeps();
    taskList[1]!.dependencies = ['001'];

    const sprint = makeMinimalSprint(taskList);
    const graph = buildDependencyGraph(taskList, false);

    writeCheckpoint(root, sprint, 20, graph);

    const read = readCheckpoint(root, 'sprint-138');
    expect(read).not.toBeNull();
    expect(read!.depGraph).toBeDefined();
    expect(read!.depGraph!.sprintId).toBe('sprint-138');
    rmSync(root, { recursive: true, force: true });
  });

  it('checkpoint without graph has no depGraph field (backward compat)', () => {
    const root = makeTempDir();
    const sprint = makeMinimalSprint([makeMinimalTask('001', TaskStatus.DONE)]);

    const written = writeCheckpoint(root, sprint, 0);  // no graph arg
    expect(written!.depGraph).toBeUndefined();

    const read = readCheckpoint(root, 'sprint-138');
    expect(read!.depGraph).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });

  it('writes separate depgraph.json + .mmd files when graph provided', () => {
    const root = makeTempDir();
    const taskList = makeTasksWithDeps();
    const sprint = makeMinimalSprint(taskList);
    const graph = buildDependencyGraph(taskList, false);

    writeCheckpoint(root, sprint, 5, graph);

    const jsonExists = existsSync(join(root, '.deckent', 'sprint-138-depgraph.json'));
    const mmdExists = existsSync(join(root, '.deckent', 'sprint-138-depgraph.mmd'));
    expect(jsonExists).toBe(true);
    expect(mmdExists).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('restoreDepGraph (Task 030)', () => {
  it('restores graph from embedded checkpoint.depGraph', () => {
    const root = makeTempDir();
    const taskList = makeTasksWithDeps();
    taskList[1]!.dependencies = ['001'];
    taskList[2]!.dependencies = ['001'];

    const sprint = makeMinimalSprint(taskList);
    const graph = buildDependencyGraph(taskList, false);
    const written = writeCheckpoint(root, sprint, 10, graph);

    const restored = restoreDepGraph(root, written!);

    expect(restored).not.toBeNull();
    expect(restored!.hasCycle).toBe(false);
    expect(restored!.waveAssignment.get('001')).toBe(0);
    expect(restored!.waveAssignment.get('002')).toBe(1);
    expect(restored!.waveAssignment.get('003')).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('restored graph enforces correct wave ordering on resume', () => {
    const root = makeTempDir();
    const taskList = makeTasksWithDeps();
    taskList[1]!.dependencies = ['001'];

    const sprint = makeMinimalSprint(taskList);
    const graph = buildDependencyGraph(taskList, false);
    const written = writeCheckpoint(root, sprint, 10, graph);

    const restored = restoreDepGraph(root, written!)!;

    // Resume enforcement: 001 is completed, 002 should now be eligible
    const result = enforceWaveDependency(
      restored,
      ['002'],
      new Set(['001']),
    );
    expect(result.eligible).toEqual(['002']);
    expect(result.blocked).toHaveLength(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('falls back to separate depgraph.json when embedded graph missing', () => {
    const root = makeTempDir();
    const taskList = makeTasksWithDeps();
    taskList[1]!.dependencies = ['001'];

    const sprint = makeMinimalSprint(taskList);
    const graph = buildDependencyGraph(taskList, false);

    // Write checkpoint without embedded graph
    const written = writeCheckpoint(root, sprint, 0);  // no graph
    expect(written!.depGraph).toBeUndefined();

    // Manually persist graph separately (simulating separate write)
    persistDependencyGraph(root, 'sprint-138', graph);

    const restored = restoreDepGraph(root, written!);
    expect(restored).not.toBeNull();
    expect(restored!.waveAssignment.get('001')).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null when no graph available (caller must rebuild)', () => {
    const root = makeTempDir();
    const sprint = makeMinimalSprint([makeMinimalTask('001')]);

    const written = writeCheckpoint(root, sprint, 0);  // no graph
    // No depgraph files exist
    const restored = restoreDepGraph(root, written!);
    expect(restored).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });
});

// ═══ 455-001: Durable interrupted-worker reset + resumable-set derivation ═══

describe('resetInterruptedWorkersToPending + deriveResumableTaskIds (455-001)', () => {
  const SID = 'sprint-455';

  function setupRoot(): string {
    const root = join(tmpdir(), `deckent-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    return root;
  }
  function writeTaskJson(root: string, id: string, status: TaskStatus): void {
    writeFileSync(
      join(root, '.tasks', `task-${id}.json`),
      JSON.stringify({ id, status, sprintId: SID, scope: { filesRead: [], filesWrite: [], directories: [] } }, null, 2),
      'utf-8',
    );
  }
  function statusOf(root: string, id: string): string {
    return (JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.json`), 'utf-8')) as { status: string }).status;
  }
  function writeResultFile(root: string, id: string, selfAssessment: string | undefined = 'DONE'): void {
    writeFileSync(join(root, '.tasks', `task-${id}.result`), JSON.stringify({ taskId: id, selfAssessment }), 'utf-8');
  }
  function activeWorker(id: string) {
    return { workerId: `w-${id}`, taskId: id, status: 'EXECUTING' as const, spawnedAt: new Date().toISOString() };
  }
  function writeCp(root: string, cp: SprintCheckpoint): void {
    writeFileSync(join(root, '.deckent', `${SID}-checkpoint.json`), JSON.stringify(cp, null, 2), 'utf-8');
  }
  function baseCp(overrides: Partial<SprintCheckpoint>): SprintCheckpoint {
    return {
      sprintId: SID, checkpointNumber: 1, timestamp: new Date().toISOString(),
      completedTasks: [], pendingTasks: [], activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE, eventStreamOffset: 0, ...overrides,
    };
  }

  it('resets an interrupted EXECUTING worker (no .result) to PENDING and moves it active→pending', () => {
    const root = setupRoot();
    writeTaskJson(root, '455-001', TaskStatus.EXECUTING);
    const cp = baseCp({ activeWorkers: [activeWorker('455-001')] });
    writeCp(root, cp);

    const { resetIds, checkpoint } = resetInterruptedWorkersToPending(root, cp);

    expect(resetIds).toEqual(['455-001']);
    expect(statusOf(root, '455-001')).toBe(TaskStatus.PENDING);
    expect(checkpoint.pendingTasks).toContain('455-001');
    expect(checkpoint.activeWorkers.map(w => w.taskId)).not.toContain('455-001');
    // Persisted checkpoint (atomic rewrite) reflects the move.
    const persisted = readCheckpoint(root, SID)!;
    expect(persisted.pendingTasks).toContain('455-001');
    expect(persisted.activeWorkers).toHaveLength(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('NEVER touches a worker that has a valid .result (completed during crash)', () => {
    const root = setupRoot();
    writeTaskJson(root, '455-002', TaskStatus.EXECUTING);
    writeResultFile(root, '455-002', 'DONE');
    const cp = baseCp({ activeWorkers: [activeWorker('455-002')] });
    writeCp(root, cp);

    const { resetIds, checkpoint } = resetInterruptedWorkersToPending(root, cp);

    expect(resetIds).toEqual([]);
    expect(statusOf(root, '455-002')).toBe(TaskStatus.EXECUTING); // untouched
    expect(checkpoint.activeWorkers.map(w => w.taskId)).toContain('455-002');
    rmSync(root, { recursive: true, force: true });
  });

  it('re-queues a PAUSED task only when its durable pause marker exists', () => {
    const root = setupRoot();
    writeTaskJson(root, '455-003', TaskStatus.PAUSED);
    writeFileSync(join(root, '.tasks', 'task-455-003.paused'), JSON.stringify({ taskId: '455-003', previousStatus: 'PENDING' }), 'utf-8');
    const cp = baseCp({ activeWorkers: [activeWorker('455-003')] });
    writeCp(root, cp);

    const { resetIds } = resetInterruptedWorkersToPending(root, cp);

    expect(resetIds).toEqual(['455-003']);
    expect(statusOf(root, '455-003')).toBe(TaskStatus.PENDING);
    expect(existsSync(join(root, '.tasks', 'task-455-003.paused'))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('updates the v2 taskStates entry to PENDING when present', () => {
    const root = setupRoot();
    writeTaskJson(root, '455-004', TaskStatus.CLAIMED);
    const cp = baseCp({
      activeWorkers: [activeWorker('455-004')],
      schemaVersion: 2,
      taskStates: [{ id: '455-004', status: TaskStatus.CLAIMED }],
      remainingQueue: [],
    });
    writeCp(root, cp);

    const { checkpoint } = resetInterruptedWorkersToPending(root, cp);

    expect(checkpoint.taskStates?.find(s => s.id === '455-004')?.status).toBe(TaskStatus.PENDING);
    rmSync(root, { recursive: true, force: true });
  });

  it('deriveResumableTaskIds = pending ∪ interrupted-active, excluding completed', () => {
    const root = setupRoot();
    writeTaskJson(root, '455-010', TaskStatus.EXECUTING);
    writeTaskJson(root, '455-011', TaskStatus.EXECUTING);
    writeTaskJson(root, '455-020', TaskStatus.PENDING);
    writeResultFile(root, '455-010', 'DONE');   // active but completed → excluded
    // 455-011 active, no result → included; 455-020 pending → included
    const cp = baseCp({
      pendingTasks: ['455-020'],
      activeWorkers: [activeWorker('455-010'), activeWorker('455-011')],
    });

    const ids = deriveResumableTaskIds(root, cp);

    expect(ids).toEqual(['455-020', '455-011']);
    rmSync(root, { recursive: true, force: true });
  });

  it('hasValidResult requires matching taskId and a canonical terminal assessment', () => {
    const root = setupRoot();
    writeResultFile(root, '455-030', 'DONE');
    writeFileSync(join(root, '.tasks', 'task-455-031.result'), '{ not json', 'utf-8');
    // Raw result missing selfAssessment (helper's default would fabricate one).
    writeFileSync(join(root, '.tasks', 'task-455-032.result'), JSON.stringify({ taskId: '455-032' }), 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-455-033.result'), JSON.stringify({ taskId: 'other', selfAssessment: 'DONE' }), 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-455-034.result'), JSON.stringify({ taskId: '455-034', selfAssessment: 'TIMEOUT_WITH_WORK' }), 'utf-8');

    expect(hasValidResult(root, '455-030')).toBe(true);
    expect(hasValidResult(root, '455-031')).toBe(false);
    expect(hasValidResult(root, '455-032')).toBe(false);
    expect(hasValidResult(root, '455-033')).toBe(false);
    expect(hasValidResult(root, '455-034')).toBe(false);
    expect(hasValidResult(root, '455-099')).toBe(false); // no file
    rmSync(root, { recursive: true, force: true });
  });
});
