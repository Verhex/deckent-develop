// ═══ Checkpoint-v2 MRR Restore Tests (Sprint 412 Task 412-004) ════════
// SCHED2 checkpoint-v2 (born-634/635 dilim-2): proves the fix for
// "checkpoint anında zaten-MRR olan task restore'da kaybolur" and
// "stale-active→MRR dönüşümünün PENDING descendant'ları restore'da
// cascade-skip edilmez" (docs/analysis/scheduler-unify-design-2026-07-11.md,
// "Checkpoint-restore MRR semantiği").
//
// Covers: v2 schema write/read round-trip, restore membership (already-MRR
// task not lost), cascade-skip on restore (direct + transitive, both the
// no-disk-evidence NO_GO path and the real-disk-evidence MRR path), the v1
// legacy dual-reader, and the DECKENT_CHECKPOINT_V1=1 writer rollback.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import {
  mkdirSync, rmSync, existsSync, writeFileSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeCheckpoint,
  readCheckpoint,
  restoreSprintFromCheckpoint,
  getCheckpointDecisionSeq,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTempDir(prefix = 'checkpoint-mrr-restore'): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

// No `git commit` here (worker sandbox git-guard denylists it) — untracked-file
// detection (`git ls-files --others`) needs only `git init`, no HEAD/commit.
function initGitRepo(dir: string): void {
  execSync(
    'git init -q && git config user.email "test@test.com" && git config user.name "Test"',
    { cwd: dir, stdio: 'pipe' },
  );
}

function makeTask(id: string, sprintId: string, overrides: Partial<Task> = {}): Task {
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
    status: TaskStatus.PENDING,
    sprintId,
    ...overrides,
  } as Task;
}

function makeSprint(sprintId: string, tasks: Task[], phase = SprintPhase.EXECUTE): Sprint {
  const m = /sprint-(\d+)/.exec(sprintId);
  return {
    id: sprintId,
    number: m ? parseInt(m[1]!, 10) : 0,
    status: SprintStatus.ACTIVE,
    phase,
    tasks,
    workers: [],
  };
}

function writeTaskFile(root: string, task: Task): void {
  writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
}

function readTaskFile(root: string, id: string): Task {
  return JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.json`), 'utf-8')) as Task;
}

function readResultFile(root: string, id: string): TaskResult {
  return JSON.parse(readFileSync(join(root, '.tasks', `task-${id}.result`), 'utf-8')) as TaskResult;
}

// ─── v2 schema: write/read round-trip ──────────────────────────────────

describe('SprintCheckpoint v2 — write/read round-trip', () => {
  it('writes schemaVersion=2, full taskStates (incl. fixForTaskId), remainingQueue, lastDecisionSeq=0', () => {
    const root = makeTempDir();
    const tasks = [
      makeTask('501-001', 'sprint-501', { status: TaskStatus.DONE }),
      makeTask('501-002', 'sprint-501', { status: TaskStatus.MANUAL_REVIEW_REQUIRED }),
      makeTask('501-003', 'sprint-501', { status: TaskStatus.PENDING, dependencies: ['501-002'] }),
      makeTask('501-004', 'sprint-501', { status: TaskStatus.DONE, fixForTaskId: '501-001' }),
    ];
    const sprint = makeSprint('sprint-501', tasks);

    const written = writeCheckpoint(root, sprint, 7);
    expect(written).not.toBeNull();
    expect(written!.schemaVersion).toBe(2);
    expect(written!.taskStates).toEqual([
      { id: '501-001', status: TaskStatus.DONE },
      { id: '501-002', status: TaskStatus.MANUAL_REVIEW_REQUIRED },
      { id: '501-003', status: TaskStatus.PENDING },
      { id: '501-004', status: TaskStatus.DONE, fixForTaskId: '501-001' },
    ]);
    expect(written!.remainingQueue).toEqual(['501-003']);
    expect(written!.lastDecisionSeq).toBe(0);
    expect(getCheckpointDecisionSeq(written!)).toBe(0);
    // Existing v1 fields stay byte-identical for existing consumers (resume.ts et al.)
    expect(written!.completedTasks.sort()).toEqual(['501-001', '501-004']);
    expect(written!.pendingTasks).toEqual(['501-003']);

    const read = readCheckpoint(root, 'sprint-501');
    expect(read).not.toBeNull();
    expect(read!.schemaVersion).toBe(2);
    expect(read!.taskStates).toEqual(written!.taskStates);
    expect(read!.remainingQueue).toEqual(written!.remainingQueue);
    expect(getCheckpointDecisionSeq(read!)).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('SprintCheckpoint v2 — DECKENT_CHECKPOINT_V1 rollback', () => {
  it('writer reverts to the exact pre-v2 shape when DECKENT_CHECKPOINT_V1=1', () => {
    const root = makeTempDir();
    const tasks = [
      makeTask('502-001', 'sprint-502', { status: TaskStatus.DONE }),
      makeTask('502-002', 'sprint-502', { status: TaskStatus.PENDING }),
    ];
    const sprint = makeSprint('sprint-502', tasks);

    const prev = process.env.DECKENT_CHECKPOINT_V1;
    process.env.DECKENT_CHECKPOINT_V1 = '1';
    let written: SprintCheckpoint | null;
    try {
      written = writeCheckpoint(root, sprint, 3);
    } finally {
      if (prev === undefined) delete process.env.DECKENT_CHECKPOINT_V1;
      else process.env.DECKENT_CHECKPOINT_V1 = prev;
    }

    expect(written).not.toBeNull();
    expect(written!.schemaVersion).toBeUndefined();
    expect(written!.taskStates).toBeUndefined();
    expect(written!.remainingQueue).toBeUndefined();
    expect(written!.lastDecisionSeq).toBeUndefined();
    // v1 shape is otherwise unaffected
    expect(written!.completedTasks).toEqual(['502-001']);
    expect(written!.pendingTasks).toEqual(['502-002']);

    const read = readCheckpoint(root, 'sprint-502');
    expect(read!.schemaVersion).toBeUndefined();
    expect(read!.taskStates).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});

// ─── Restore: already-MRR task is not lost, its PENDING dependents cascade-skip ─

describe('restoreSprintFromCheckpoint — v2 already-MRR task survives restore', () => {
  it('MRR task present in restoredSprint.tasks; PENDING dependent cascade-skipped', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-600';
    const t1 = makeTask('600-001', sprintId, { status: TaskStatus.DONE });
    const t2 = makeTask('600-002', sprintId, { status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    const t3 = makeTask('600-003', sprintId, { status: TaskStatus.PENDING, dependencies: ['600-002'] });
    [t1, t2, t3].forEach(t => writeTaskFile(root, t));
    const sprint = makeSprint(sprintId, [t1, t2, t3]);
    writeCheckpoint(root, sprint, 0);

    const out = restoreSprintFromCheckpoint(root, sprintId);
    expect(out.restored).toBe(true);
    expect(out.action).toBe('resume-evaluate');

    const ids = out.restoredSprint!.tasks.map(t => t.id).sort();
    expect(ids).toEqual(['600-001', '600-002', '600-003']); // nothing lost

    const restoredMrr = out.restoredSprint!.tasks.find(t => t.id === '600-002');
    expect(restoredMrr?.status).toBe(TaskStatus.MANUAL_REVIEW_REQUIRED);

    // The PENDING dependent of the (already-)MRR task is cascade-skipped.
    expect(out.cascadeSkippedTasks).toEqual(['600-003']);
    expect(readTaskFile(root, '600-003').status).toBe(TaskStatus.NO_GO);
    const skipResult = readResultFile(root, '600-003');
    expect(skipResult.cascadeSkipped).toBe(true);
    expect(skipResult.selfAssessment).toBe('NO_GO');
    expect(skipResult.notes).toContain('600-002');
    // Spawn-zero evidence: no heartbeat was ever written for the skipped task.
    expect(existsSync(join(root, '.tasks', 'task-600-003.hb'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── Restore: stale-active worker → MRR (real disk evidence) → transitive cascade ─

describe('restoreSprintFromCheckpoint — interrupted active work is resumable', () => {
  it('preserves interrupted work as PENDING even when its scoped tree has untracked files', () => {
    const root = makeTempDir();
    initGitRepo(root); // no commit — worker sandbox denylists `git commit`
    mkdirSync(join(root, 'src', 'orchestra'), { recursive: true });

    const sprintId = 'sprint-700';
    const scope = { directories: ['src/orchestra/'], filesRead: [], filesWrite: [] };
    const a = makeTask('700-001', sprintId, { status: TaskStatus.EXECUTING, scope });
    const b = makeTask('700-002', sprintId, { status: TaskStatus.PENDING, dependencies: ['700-001'] });
    const c = makeTask('700-003', sprintId, { status: TaskStatus.PENDING, dependencies: ['700-002'] });
    [a, b, c].forEach(t => writeTaskFile(root, t));
    const sprint = makeSprint(sprintId, [a, b, c]);
    writeCheckpoint(root, sprint, 0);

    // Worker A wrote a brand-new (untracked) file inside its scope directory
    // before crashing (no .result, no .hb). No commit exists in this repo, so
    // `git diff --numstat HEAD` fails open (0) — the untracked-file detector
    // (`git ls-files --others`, needs only `git init`) alone must drive the gate.
    writeFileSync(join(root, 'src', 'orchestra', 'new-work.ts'), 'export const y = 2;\n');

    const out = restoreSprintFromCheckpoint(root, sprintId);
    expect(out.restored).toBe(true);

    expect(out.staleTasksMarkedNoGo).toEqual([]);
    expect(readTaskFile(root, '700-001').status).toBe(TaskStatus.PENDING);
    expect(out.cascadeSkippedTasks).toEqual([]);
    expect(readTaskFile(root, '700-002').status).toBe(TaskStatus.PENDING);
    expect(readTaskFile(root, '700-003').status).toBe(TaskStatus.PENDING);

    // Spawn-zero: no worker was ever spawned for the descendants during restore.
    expect(existsSync(join(root, '.tasks', 'task-700-002.hb'))).toBe(false);
    expect(existsSync(join(root, '.tasks', 'task-700-003.hb'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── Restore: stale-active worker → NO_GO (no disk evidence) → cascade-skip ────

describe('restoreSprintFromCheckpoint — interrupted active work without disk evidence', () => {
  it('returns the interrupted task and dependent to the resumable PENDING queue', () => {
    const root = makeTempDir(); // not a git repo — disk-verify fails open (no evidence)
    const sprintId = 'sprint-800';
    const a = makeTask('800-001', sprintId, { status: TaskStatus.EXECUTING });
    const b = makeTask('800-002', sprintId, { status: TaskStatus.PENDING, dependencies: ['800-001'] });
    [a, b].forEach(t => writeTaskFile(root, t));
    const sprint = makeSprint(sprintId, [a, b]);
    writeCheckpoint(root, sprint, 0);

    const out = restoreSprintFromCheckpoint(root, sprintId);
    expect(out.restored).toBe(true);
    expect(out.staleTasksMarkedNoGo).toEqual([]);
    expect(readTaskFile(root, '800-001').status).toBe(TaskStatus.PENDING);
    expect(out.cascadeSkippedTasks).toEqual([]);
    expect(readTaskFile(root, '800-002').status).toBe(TaskStatus.PENDING);
    expect(existsSync(join(root, '.tasks', 'task-800-002.hb'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── v1 legacy dual-reader ──────────────────────────────────────────────

describe('restoreSprintFromCheckpoint — v1 legacy checkpoint dual-reader', () => {
  it('recovers an already-MRR task the v1 buckets never captured, from persisted task-*.json records', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-900';
    const x = makeTask('900-001', sprintId, { status: TaskStatus.DONE });
    const y = makeTask('900-002', sprintId, { status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    const z = makeTask('900-003', sprintId, { status: TaskStatus.PENDING, dependencies: ['900-002'] });
    [x, y, z].forEach(t => writeTaskFile(root, t));

    // Hand-write a RAW v1-shaped checkpoint (no schemaVersion/taskStates) — the
    // exact pre-v2 writer shape. 900-002 (MRR) is deliberately absent from all
    // three buckets, reproducing the bug a genuinely old checkpoint has.
    const cp: SprintCheckpoint = {
      sprintId,
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['900-001'],
      pendingTasks: ['900-003'],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };
    writeFileSync(join(root, '.deckent', `${sprintId}-checkpoint.json`), JSON.stringify(cp, null, 2), 'utf-8');

    const out = restoreSprintFromCheckpoint(root, sprintId);
    expect(out.restored).toBe(true);

    const ids = out.restoredSprint!.tasks.map(t => t.id).sort();
    expect(ids).toEqual(['900-001', '900-002', '900-003']); // dual-reader recovered 900-002

    const recoveredMrr = out.restoredSprint!.tasks.find(t => t.id === '900-002');
    expect(recoveredMrr?.status).toBe(TaskStatus.MANUAL_REVIEW_REQUIRED);

    // Cascade-skip works through the dual-reader-recovered task too.
    expect(out.cascadeSkippedTasks).toEqual(['900-003']);
    expect(readTaskFile(root, '900-003').status).toBe(TaskStatus.NO_GO);
    expect(readResultFile(root, '900-003').cascadeSkipped).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('does not pull in a task-*.json belonging to a different sprintId', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-901';
    const mine = makeTask('901-001', sprintId, { status: TaskStatus.DONE });
    const foreign = makeTask('901-002', 'sprint-999', { status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    [mine, foreign].forEach(t => writeTaskFile(root, t));

    const cp: SprintCheckpoint = {
      sprintId,
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['901-001'],
      pendingTasks: [],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };
    writeFileSync(join(root, '.deckent', `${sprintId}-checkpoint.json`), JSON.stringify(cp, null, 2), 'utf-8');

    const out = restoreSprintFromCheckpoint(root, sprintId);
    const ids = out.restoredSprint!.tasks.map(t => t.id);
    expect(ids).toEqual(['901-001']);
    expect(ids).not.toContain('901-002');

    rmSync(root, { recursive: true, force: true });
  });
});
