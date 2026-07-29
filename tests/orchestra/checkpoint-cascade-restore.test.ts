// ═══ Checkpoint Restore — Reducer-Parity Cascade Tests (Sprint 427 Task 427-009) ═══
// SCHED6-CKPT (docs/analysis/scheduler-unify-design-2026-07-11.md, "Restore
// trigger.kind='restore' ile aynı reducer'a girer" + Sprint-6 table row "Cascade
// ve restore live"). `restoreSprintFromCheckpoint`'s private cascade-skip helper
// now DECIDES through `reduceSchedulerTick` (scheduler-reducer.ts) — the exact
// same pure reducer the live scheduler uses — instead of a separately
// hand-rolled predicate, and applies effects via a persist-before-commit
// contract mirroring `executeSchedulerDecision` (scheduler-effects.ts, task
// 427-008).
//
// This file does NOT duplicate the base MRR-survives / direct+transitive
// cascade-skip / v1-dual-reader fixtures already covered by
// checkpoint-mrr-restore.test.ts (Sprint 412 Task 412-004) — that suite stays
// green as a regression check by construction, since this change only touches
// the private `cascadeSkipPendingDescendants` helper's internals, never
// `restoreSprintFromCheckpoint`'s task-reconstruction/MRR-membership logic.
// Instead this file proves the NEW guarantees the reducer-parity refactor adds:
//   1. MRR-restore + descendant-skip fixture (goCriteria wording, verbatim),
//      with an unrelated fully-eligible PENDING task in the same snapshot to
//      prove the WHOLE restore decision contains zero spawns structurally —
//      not merely that no spawn call happened to be made.
//   2. A latent bug the old hand-rolled implementation had: a PENDING task
//      whose `.result` already existed on disk (crash between a prior
//      persist and its status commit) was skipped FOREVER, never reaching
//      NO_GO. The reducer-parity persist-before-commit contract finishes
//      that interrupted commit instead.
//   3. Idempotent replay — a second restore call is a true no-op.
//   4. checkpoint-v2 schema still round-trips untouched (this task's own
//      noGoCriteria: "checkpoint-v2 şeması kırılırsa NO_GO").
//   5. The v1 legacy dual-reader still cascade-skips correctly through the
//      new mechanism.

import { describe, it, expect } from 'vitest';
import {
  mkdirSync, rmSync, existsSync, writeFileSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeCheckpoint,
  readCheckpoint,
  restoreSprintFromCheckpoint,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

// ─── Helpers (mirrors checkpoint-mrr-restore.test.ts's fixture idiom) ────────

function makeTempDir(prefix = 'checkpoint-cascade-restore'): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
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

function hbPath(root: string, id: string): string {
  return join(root, '.tasks', `task-${id}.hb`);
}

// ─── 1. MRR-restore + descendant-skip fixture, whole-snapshot spawn-zero ─────

describe('restoreSprintFromCheckpoint — reducer-parity cascade-skip (MRR korunur)', () => {
  it('already-MRR task survives restore, direct+transitive PENDING descendants cascade-skip, zero spawn across the whole snapshot', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-1000';

    const t1 = makeTask('1000-001', sprintId, { status: TaskStatus.DONE });
    const t2 = makeTask('1000-002', sprintId, { status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    const t3 = makeTask('1000-003', sprintId, { status: TaskStatus.PENDING, dependencies: ['1000-002'] });
    const t4 = makeTask('1000-004', sprintId, { status: TaskStatus.PENDING, dependencies: ['1000-003'] });
    // Fully spawn-eligible task: no dependencies at all. A live continuous
    // tick with free slots WOULD spawn this. Proves slotBudget=0 makes
    // restore's decision spawn zero structurally, not merely for the
    // cascade-skip chain.
    const t5 = makeTask('1000-005', sprintId, { status: TaskStatus.PENDING, dependencies: [] });
    [t1, t2, t3, t4, t5].forEach(t => writeTaskFile(root, t));
    writeCheckpoint(root, makeSprint(sprintId, [t1, t2, t3, t4, t5]), 0);

    const out = restoreSprintFromCheckpoint(root, sprintId);
    expect(out.restored).toBe(true);

    // Nothing lost — MRR task still present with its status intact.
    const ids = out.restoredSprint!.tasks.map(t => t.id).sort();
    expect(ids).toEqual(['1000-001', '1000-002', '1000-003', '1000-004', '1000-005']);
    expect(out.restoredSprint!.tasks.find(t => t.id === '1000-002')?.status).toBe(TaskStatus.MANUAL_REVIEW_REQUIRED);

    // Direct + transitive descendants cascade-skipped.
    expect(out.cascadeSkippedTasks.sort()).toEqual(['1000-003', '1000-004']);
    expect(readTaskFile(root, '1000-003').status).toBe(TaskStatus.NO_GO);
    expect(readTaskFile(root, '1000-004').status).toBe(TaskStatus.NO_GO);
    const r3 = readResultFile(root, '1000-003');
    expect(r3.cascadeSkipped).toBe(true);
    expect(r3.notes).toContain('1000-002');
    const r4 = readResultFile(root, '1000-004');
    expect(r4.cascadeSkipped).toBe(true);
    expect(r4.notes).toContain('1000-003'); // transitive: blamed on its immediate (now-NO_GO) parent

    // The unrelated, fully-eligible task is left completely untouched.
    expect(readTaskFile(root, '1000-005').status).toBe(TaskStatus.PENDING);
    expect(existsSync(join(root, '.tasks', 'task-1000-005.result'))).toBe(false);

    // Spawn-zero: no heartbeat file for ANY task, including the eligible one.
    for (const id of ['1000-003', '1000-004', '1000-005']) {
      expect(existsSync(hbPath(root, id))).toBe(false);
    }

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── 2. Interrupted-commit finish (bug fix vs. the old hand-rolled skip) ─────

describe('restoreSprintFromCheckpoint — finishes an interrupted persist-before-commit', () => {
  it('a PENDING task whose .result already exists on disk is committed to NO_GO without rewriting the result', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-1001';

    const a = makeTask('1001-001', sprintId, { status: TaskStatus.NO_GO });
    const b = makeTask('1001-002', sprintId, { status: TaskStatus.PENDING, dependencies: ['1001-001'] });
    [a, b].forEach(t => writeTaskFile(root, t));

    // Simulate a crash that persisted the cascade-skip result for `b` but
    // never reached the status-commit step — task-1001-002.json still says
    // PENDING (written above), yet its .result already exists with a
    // distinguishing marker that must NOT be overwritten.
    const preExisting: TaskResult = {
      taskId: '1001-002',
      workerId: 'w-1001-002',
      filesChanged: [],
      linesAdded: 999, // sentinel — a fresh persist would always write 0
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      cascadeSkipped: true,
      notes: 'PRE-EXISTING-MARKER-DO-NOT-OVERWRITE',
      tokenUsage: {
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'sonnet',
      },
    };
    writeFileSync(join(root, '.tasks', 'task-1001-002.result'), JSON.stringify(preExisting, null, 2), 'utf-8');

    writeCheckpoint(root, makeSprint(sprintId, [a, b]), 0);
    const out = restoreSprintFromCheckpoint(root, sprintId);

    // Commit finishes THIS call — the old implementation left this stuck PENDING forever.
    expect(out.cascadeSkippedTasks).toEqual(['1001-002']);
    expect(readTaskFile(root, '1001-002').status).toBe(TaskStatus.NO_GO);

    // The pre-existing result content is untouched — no re-persist happened.
    const result = readResultFile(root, '1001-002');
    expect(result.notes).toBe('PRE-EXISTING-MARKER-DO-NOT-OVERWRITE');
    expect(result.linesAdded).toBe(999);

    // No .tmp artifact left behind (persist step was skipped entirely, not
    // attempted-then-renamed).
    expect(existsSync(join(root, '.tasks', 'task-1001-002.result.tmp'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

describe('restoreSprintFromCheckpoint — host settlement fence for cascade commit', () => {
  it('does not overwrite or commit a cascade target while its Docker settlement is pending', () => {
    const root = makeTempDir();
    const hostRoot = makeTempDir('checkpoint-cascade-host');
    const originalDeckentHome = process.env.DECKENT_HOME;
    process.env.DECKENT_HOME = hostRoot;
    try {
      const sprintId = 'sprint-1006';
      const upstream = makeTask('1006-001', sprintId, { status: TaskStatus.NO_GO });
      const dependent = makeTask('1006-002', sprintId, {
        status: TaskStatus.PENDING,
        dependencies: [upstream.id],
      });
      [upstream, dependent].forEach(task => writeTaskFile(root, task));
      const rawResultPath = join(root, '.tasks', `task-${dependent.id}.result`);
      const rawClaim = {
        taskId: dependent.id,
        selfAssessment: 'DONE',
        notes: 'worker-writable pending claim',
      };
      writeFileSync(rawResultPath, JSON.stringify(rawClaim), 'utf-8');
      const ref = createTaskResultSettlementRef(root, dependent.id);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeCheckpoint(root, makeSprint(sprintId, [upstream, dependent]), 0);

      let thrown: unknown;
      try {
        restoreSprintFromCheckpoint(root, sprintId);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: 'DECKENT_E077' });
      expect(readTaskFile(root, dependent.id).status).toBe(TaskStatus.PENDING);
      expect(JSON.parse(readFileSync(rawResultPath, 'utf-8'))).toEqual(rawClaim);
    } finally {
      if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
      else process.env.DECKENT_HOME = originalDeckentHome;
      rmSync(root, { recursive: true, force: true });
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });
});

describe('restoreSprintFromCheckpoint — all-task terminal authority sync', () => {
  it('projects a closed NO_GO outside activeWorkers before cascading descendants', () => {
    const root = makeTempDir();
    const hostRoot = makeTempDir('checkpoint-terminal-sync-host');
    const originalDeckentHome = process.env.DECKENT_HOME;
    process.env.DECKENT_HOME = hostRoot;
    try {
      const sprintId = 'sprint-1007';
      const upstream = makeTask('1007-001', sprintId, { status: TaskStatus.PENDING });
      const dependent = makeTask('1007-002', sprintId, {
        status: TaskStatus.PENDING,
        dependencies: [upstream.id],
      });
      [upstream, dependent].forEach(task => writeTaskFile(root, task));

      const ref = createTaskResultSettlementRef(root, upstream.id);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 137,
        result: {
          taskId: upstream.id,
          selfAssessment: 'NO_GO',
          testsPassed: false,
        },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });

      const checkpoint: SprintCheckpoint = {
        schemaVersion: 2,
        sprintId,
        checkpointNumber: 1,
        timestamp: new Date().toISOString(),
        completedTasks: [],
        pendingTasks: [upstream.id, dependent.id],
        activeWorkers: [],
        taskStates: [
          { id: upstream.id, status: TaskStatus.PENDING },
          { id: dependent.id, status: TaskStatus.PENDING },
        ],
        brainPhase: SprintPhase.EXECUTE,
        eventStreamOffset: 0,
      };
      writeFileSync(
        join(root, '.deckent', `${sprintId}-checkpoint.json`),
        JSON.stringify(checkpoint, null, 2),
        'utf-8',
      );

      const restored = restoreSprintFromCheckpoint(root, sprintId);
      expect(readTaskFile(root, upstream.id).status).toBe(TaskStatus.NO_GO);
      expect(restored.cascadeSkippedTasks).toEqual([dependent.id]);
      expect(readTaskFile(root, dependent.id).status).toBe(TaskStatus.NO_GO);
    } finally {
      if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
      else process.env.DECKENT_HOME = originalDeckentHome;
      rmSync(root, { recursive: true, force: true });
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });
});

// ─── 3. Idempotent replay ─────────────────────────────────────────────────

describe('restoreSprintFromCheckpoint — idempotent replay', () => {
  it('a second restore call is a true no-op: no re-decision, no result rewrite', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-1002';

    const x = makeTask('1002-001', sprintId, { status: TaskStatus.NO_GO });
    const y = makeTask('1002-002', sprintId, { status: TaskStatus.PENDING, dependencies: ['1002-001'] });
    [x, y].forEach(t => writeTaskFile(root, t));
    writeCheckpoint(root, makeSprint(sprintId, [x, y]), 0);

    const first = restoreSprintFromCheckpoint(root, sprintId);
    expect(first.cascadeSkippedTasks).toEqual(['1002-002']);
    const resultAfterFirst = readResultFile(root, '1002-002');

    const second = restoreSprintFromCheckpoint(root, sprintId);
    // Already NO_GO on disk — reducer's own PENDING filter excludes it, so
    // it is never re-decided, let alone re-committed.
    expect(second.cascadeSkippedTasks).toEqual([]);
    const resultAfterSecond = readResultFile(root, '1002-002');
    expect(resultAfterSecond).toEqual(resultAfterFirst);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── 4. checkpoint-v2 schema untouched ─────────────────────────────────────

describe('SprintCheckpoint v2 schema — unaffected by the reducer-parity refactor', () => {
  it('writeCheckpoint/readCheckpoint still round-trip schemaVersion=2 + taskStates', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-1003';
    const tasks = [
      makeTask('1003-001', sprintId, { status: TaskStatus.DONE }),
      makeTask('1003-002', sprintId, { status: TaskStatus.MANUAL_REVIEW_REQUIRED }),
      makeTask('1003-003', sprintId, { status: TaskStatus.PENDING, dependencies: ['1003-002'] }),
    ];
    const written = writeCheckpoint(root, makeSprint(sprintId, tasks), 4);
    expect(written).not.toBeNull();
    expect(written!.schemaVersion).toBe(2);
    expect(written!.taskStates).toEqual([
      { id: '1003-001', status: TaskStatus.DONE },
      { id: '1003-002', status: TaskStatus.MANUAL_REVIEW_REQUIRED },
      { id: '1003-003', status: TaskStatus.PENDING },
    ]);

    const read: SprintCheckpoint | null = readCheckpoint(root, sprintId);
    expect(read).not.toBeNull();
    expect(read!.schemaVersion).toBe(2);
    expect(read!.taskStates).toEqual(written!.taskStates);

    rmSync(root, { recursive: true, force: true });
  });
});

// ─── 5. v1 legacy dual-reader still cascade-skips via the new mechanism ────

describe('restoreSprintFromCheckpoint — v1 legacy checkpoint still cascade-skips through the reducer', () => {
  it('recovers an already-MRR task missing from v1 buckets and cascade-skips its PENDING dependent', () => {
    const root = makeTempDir();
    const sprintId = 'sprint-1004';
    const x = makeTask('1004-001', sprintId, { status: TaskStatus.DONE });
    const y = makeTask('1004-002', sprintId, { status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    const z = makeTask('1004-003', sprintId, { status: TaskStatus.PENDING, dependencies: ['1004-002'] });
    [x, y, z].forEach(t => writeTaskFile(root, t));

    // Hand-write a raw v1-shaped checkpoint (no schemaVersion/taskStates) —
    // 1004-002 (MRR) deliberately absent from all three legacy buckets.
    const cp: SprintCheckpoint = {
      sprintId,
      checkpointNumber: 1,
      timestamp: new Date().toISOString(),
      completedTasks: ['1004-001'],
      pendingTasks: ['1004-003'],
      activeWorkers: [],
      brainPhase: SprintPhase.EXECUTE,
      eventStreamOffset: 0,
    };
    writeFileSync(join(root, '.deckent', `${sprintId}-checkpoint.json`), JSON.stringify(cp, null, 2), 'utf-8');

    const out = restoreSprintFromCheckpoint(root, sprintId);
    expect(out.restored).toBe(true);
    const ids = out.restoredSprint!.tasks.map(t => t.id).sort();
    expect(ids).toEqual(['1004-001', '1004-002', '1004-003']);

    expect(out.cascadeSkippedTasks).toEqual(['1004-003']);
    expect(readTaskFile(root, '1004-003').status).toBe(TaskStatus.NO_GO);
    expect(readResultFile(root, '1004-003').cascadeSkipped).toBe(true);
    expect(existsSync(hbPath(root, '1004-003'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
