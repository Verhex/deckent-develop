// ═══ State Recovery on Brain Restart Tests (Sprint 162 — Task T-004) ═
// Tests restoreSprintFromCheckpoint() across the 4 recovery action
// dimensions (fresh, complete, resume with .result, resume without .result),
// plus startedAt preservation and sprint-state.json sync side effect.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readResumeTaskResultAuthority,
  restoreSprintFromCheckpoint,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `deckent-test-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test',
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

function writeTaskJson(root: string, task: Task): void {
  writeFileSync(
    join(root, '.tasks', `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8',
  );
}

function writeCheckpointFile(root: string, cp: SprintCheckpoint & { sprintStartedAt?: string }): void {
  writeFileSync(
    join(root, '.deckent', `${cp.sprintId}-checkpoint.json`),
    JSON.stringify(cp, null, 2),
    'utf-8',
  );
}

function readTaskJson(root: string, id: string): Task | null {
  const p = join(root, '.tasks', `task-${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8')) as Task;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('restoreSprintFromCheckpoint (Sprint 162 T-004)', () => {
  let root: string;
  let hostRoot: string;
  let originalDeckentHome: string | undefined;

  beforeEach(() => {
    root = makeTempRoot();
    hostRoot = makeTempRoot();
    originalDeckentHome = process.env.DECKENT_HOME;
    process.env.DECKENT_HOME = hostRoot;
  });

  afterEach(() => {
    if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
    else process.env.DECKENT_HOME = originalDeckentHome;
    rmSync(root, { recursive: true, force: true });
    rmSync(hostRoot, { recursive: true, force: true });
  });

  it('1. no checkpoint → returns action:"fresh"', () => {
    const result = restoreSprintFromCheckpoint(root, 'sprint-160');
    expect(result.restored).toBe(false);
    expect(result.action).toBe('fresh');
    expect(result.staleTasksWithResult).toEqual([]);
    expect(result.staleTasksMarkedNoGo).toEqual([]);
    expect(result.restoredSprint).toBeUndefined();
  });

  it('2. all DONE and no active workers → action:"complete"', () => {
    writeTaskJson(root, makeTask('160-001', TaskStatus.DONE));
    writeTaskJson(root, makeTask('160-002', TaskStatus.DONE));

    const cp: SprintCheckpoint = {
      sprintId: 'sprint-160',
      checkpointNumber: 3,
      timestamp: '2026-05-12T10:00:00.000Z',
      completedTasks: ['160-001', '160-002'],
      pendingTasks: [],
      activeWorkers: [],
      brainPhase: SprintPhase.EVALUATE,
      eventStreamOffset: 12,
    };
    writeCheckpointFile(root, cp);

    const result = restoreSprintFromCheckpoint(root, 'sprint-160');
    expect(result.restored).toBe(true);
    expect(result.action).toBe('complete');
    expect(result.restoredSprint).toBeDefined();
    expect(result.restoredSprint!.tasks).toHaveLength(2);
    expect(result.restoredSprint!.phase).toBe(SprintPhase.COMPLETE);
    expect(result.restoredSprint!.status).toBe(SprintStatus.COMPLETE);
  });

  it('3. stale EXECUTING with .result on disk → staleTasksWithResult populated, action:"resume-evaluate"', () => {
    writeTaskJson(root, makeTask('161-001', TaskStatus.DONE));
    writeTaskJson(root, makeTask('161-002', TaskStatus.EXECUTING));
    // Worker wrote .result before the crash
    writeFileSync(
      join(root, '.tasks', 'task-161-002.result'),
      JSON.stringify({ taskId: '161-002', selfAssessment: 'DONE' }),
      'utf-8',
    );

    const cp: SprintCheckpoint = {
      sprintId: 'sprint-161',
      checkpointNumber: 2,
      timestamp: '2026-05-12T11:00:00.000Z',
      completedTasks: ['161-001'],
      pendingTasks: [],
      activeWorkers: [
        { workerId: 'w-161-002', taskId: '161-002', status: 'EXECUTING', spawnedAt: '2026-05-12T10:55:00.000Z' },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 25,
    };
    writeCheckpointFile(root, cp);

    const result = restoreSprintFromCheckpoint(root, 'sprint-161');
    expect(result.restored).toBe(true);
    expect(result.action).toBe('resume-evaluate');
    expect(result.staleTasksWithResult).toEqual(['161-002']);
    expect(result.staleTasksMarkedNoGo).toEqual([]);
    // Task status NOT overwritten when .result already exists
    const t = readTaskJson(root, '161-002');
    expect(t!.status).toBe(TaskStatus.EXECUTING);
  });

  it('4. stale EXECUTING without .result → task.json overwritten to NO_GO, action:"resume-evaluate"', () => {
    writeTaskJson(root, makeTask('162-001', TaskStatus.DONE));
    writeTaskJson(root, makeTask('162-002', TaskStatus.EXECUTING));
    // NOTE: no .result file written — simulates worker crash mid-execution

    const cp: SprintCheckpoint = {
      sprintId: 'sprint-162',
      checkpointNumber: 1,
      timestamp: '2026-05-12T12:00:00.000Z',
      completedTasks: ['162-001'],
      pendingTasks: [],
      activeWorkers: [
        { workerId: 'w-162-002', taskId: '162-002', status: 'EXECUTING', spawnedAt: '2026-05-12T11:50:00.000Z' },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 18,
    };
    writeCheckpointFile(root, cp);

    const result = restoreSprintFromCheckpoint(root, 'sprint-162');
    expect(result.restored).toBe(true);
    expect(result.action).toBe('resume-evaluate');
    expect(result.staleTasksWithResult).toEqual([]);
    expect(result.staleTasksMarkedNoGo).toEqual(['162-002']);
    // Task status overwritten on disk
    const t = readTaskJson(root, '162-002');
    expect(t!.status).toBe(TaskStatus.NO_GO);
    // And reflected in the rebuilt in-memory Sprint
    const inMemTask = result.restoredSprint!.tasks.find(x => x.id === '162-002');
    expect(inMemTask!.status).toBe(TaskStatus.NO_GO);
  });

  it('holds restore when a raw DONE is backed by a pending Docker settlement', () => {
    const taskId = '162-010';
    writeTaskJson(root, makeTask(taskId, TaskStatus.EXECUTING));
    const rawResultPath = join(root, '.tasks', `task-${taskId}.result`);
    writeFileSync(
      rawResultPath,
      JSON.stringify({ taskId, selfAssessment: 'DONE', notes: 'worker-writable claim' }),
      'utf-8',
    );
    const cp: SprintCheckpoint = {
      sprintId: 'sprint-162',
      checkpointNumber: 1,
      timestamp: '2026-05-12T12:00:00.000Z',
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: `w-${taskId}`, taskId, status: 'EXECUTING', spawnedAt: '2026-05-12T11:50:00.000Z' },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 18,
    };
    writeCheckpointFile(root, cp);
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    let thrown: unknown;
    try {
      restoreSprintFromCheckpoint(root, cp.sprintId);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'DECKENT_E077' });
    expect(readTaskJson(root, taskId)?.status).toBe(TaskStatus.EXECUTING);
    expect(JSON.parse(readFileSync(rawResultPath, 'utf-8'))).toMatchObject({
      selfAssessment: 'DONE',
      notes: 'worker-writable claim',
    });
    expect(existsSync(join(root, '.deckent', 'sprint-state.json'))).toBe(false);
  });

  it('uses a closed host NO_GO instead of a contradictory raw DONE on restore', () => {
    const taskId = '162-011';
    writeTaskJson(root, makeTask(taskId, TaskStatus.EXECUTING));
    writeFileSync(
      join(root, '.tasks', `task-${taskId}.result`),
      JSON.stringify({ taskId, selfAssessment: 'DONE', notes: 'contradictory raw claim' }),
      'utf-8',
    );
    const cp: SprintCheckpoint = {
      sprintId: 'sprint-162',
      checkpointNumber: 1,
      timestamp: '2026-05-12T12:00:00.000Z',
      completedTasks: [],
      pendingTasks: [],
      activeWorkers: [
        { workerId: `w-${taskId}`, taskId, status: 'EXECUTING', spawnedAt: '2026-05-12T11:50:00.000Z' },
      ],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 18,
    };
    writeCheckpointFile(root, cp);
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: { taskId, selfAssessment: 'NO_GO', notes: 'host settlement truth' },
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    const restored = restoreSprintFromCheckpoint(root, cp.sprintId);
    expect(restored.staleTasksWithResult).toEqual([taskId]);
    expect(readResumeTaskResultAuthority(root, taskId)).toMatchObject({
      state: 'terminal',
      result: { selfAssessment: 'NO_GO', notes: 'host settlement truth' },
    });
  });

  it('5. startedAt preserved from checkpoint (sprintStartedAt > timestamp fallback)', () => {
    writeTaskJson(root, makeTask('163-001', TaskStatus.PENDING));

    // First case: explicit sprintStartedAt takes precedence
    const cpWithStartedAt: SprintCheckpoint & { sprintStartedAt?: string } = {
      sprintId: 'sprint-163',
      checkpointNumber: 1,
      timestamp: '2026-05-12T13:30:00.000Z',
      sprintStartedAt: '2026-05-12T09:00:00.000Z',
      completedTasks: [],
      pendingTasks: ['163-001'],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 5,
    };
    writeCheckpointFile(root, cpWithStartedAt);

    const result = restoreSprintFromCheckpoint(root, 'sprint-163');
    expect(result.restoredSprint!.startedAt).toBe('2026-05-12T09:00:00.000Z');

    // Second case: fall back to cp.timestamp when sprintStartedAt missing
    const root2 = makeTempRoot();
    try {
      writeTaskJson(root2, makeTask('164-001', TaskStatus.PENDING));
      const cpNoStartedAt: SprintCheckpoint = {
        sprintId: 'sprint-164',
        checkpointNumber: 1,
        timestamp: '2026-05-12T14:45:00.000Z',
        completedTasks: [],
        pendingTasks: ['164-001'],
        activeWorkers: [],
        brainPhase: SprintPhase.EXECUTE,
        eventStreamOffset: 7,
      };
      writeCheckpointFile(root2, cpNoStartedAt);

      const result2 = restoreSprintFromCheckpoint(root2, 'sprint-164');
      expect(result2.restoredSprint!.startedAt).toBe('2026-05-12T14:45:00.000Z');
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('6. state.json synced after restore — phase EVALUATE, sprintId set', () => {
    writeTaskJson(root, makeTask('165-001', TaskStatus.DONE));
    writeTaskJson(root, makeTask('165-002', TaskStatus.PENDING));

    const cp: SprintCheckpoint = {
      sprintId: 'sprint-165',
      checkpointNumber: 4,
      timestamp: '2026-05-12T15:00:00.000Z',
      completedTasks: ['165-001'],
      pendingTasks: ['165-002'],
      activeWorkers: [],
      brainPhase: SprintPhase.SPAWN,
      eventStreamOffset: 9,
    };
    writeCheckpointFile(root, cp);

    const result = restoreSprintFromCheckpoint(root, 'sprint-165');
    expect(result.action).toBe('resume-evaluate');

    // Verify .deckent/sprint-state.json reflects resumed phase
    const statePath = join(root, '.deckent', 'sprint-state.json');
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
      sprintId: string;
      phase: string;
      status: string;
    };
    expect(state.sprintId).toBe('sprint-165');
    expect(state.phase).toBe(SprintPhase.EVALUATE);
    expect(state.status).toBe(SprintStatus.EVALUATING);
  });
});
