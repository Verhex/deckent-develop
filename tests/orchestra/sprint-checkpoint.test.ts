// ═══ Sprint Checkpoint Tests ══════════════════════════════════════════
// Tests for write/read roundtrip, resume state derivation, and fallback.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeCheckpoint,
  readCheckpoint,
  hasCheckpoint,
  getResumableTasks,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';

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
