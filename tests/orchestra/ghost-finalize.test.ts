// ═══ GHOST-FINALIZE Tests (Sprint 272 — Task 272-001) ═══════════════
// CANLI BUG (2026-06-10, twice): finalize/cleanup left
// `.deckent/<id>-checkpoint.json` + `-checkpoint-seq` behind, so the next
// `deckent start` read the stale checkpoint and ran a phantom 0/0 "complete"
// restore for the already-finished sprint — exiting before the new sprint
// started ("Sprint NNN Complete! 0/0 tasks", taskIds empty).
//
// Fix verified here:
//   - cleanupCheckpointFiles() purges .json + .json.tmp + -checkpoint-seq
//   - isSprintFinalized() detects an already-finalized sprint (state COMPLETE
//     / sprint-log present)
//   - restoreSprintFromCheckpoint() purges + reports 'fresh' for a finalized
//     leftover, while preserving genuine crash-recovery paths
//   - persistFinalSprintState() purges checkpoint artifacts on every finalize
//     (normal completion AND `finalize --force`)
//
// Hermetic: every fixture lives under os.tmpdir(); no gitignored local state
// is read; no spawnSync.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  cleanupCheckpointFiles,
  isSprintFinalized,
  restoreSprintFromCheckpoint,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { SprintCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { persistFinalSprintState } from '../../src/orchestra/sprint-finalizer.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(
    tmpdir(),
    `deckent-test-ghost-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function checkpointJsonPath(root: string, sprintId: string): string {
  return join(root, '.deckent', `${sprintId}-checkpoint.json`);
}
function checkpointSeqPath(root: string, sprintId: string): string {
  return join(root, '.deckent', `${sprintId}-checkpoint-seq`);
}

function writeCheckpointFile(root: string, cp: SprintCheckpoint): void {
  writeFileSync(checkpointJsonPath(root, cp.sprintId), JSON.stringify(cp, null, 2), 'utf-8');
}

function writeCheckpointSeq(root: string, sprintId: string, n: number): void {
  writeFileSync(checkpointSeqPath(root, sprintId), String(n), 'utf-8');
}

/** Write a `.deckent/sprint-state.json` for the given sprint + status. */
function writeSprintStateFile(root: string, sprintId: string, status: SprintStatus): void {
  writeFileSync(
    join(root, '.deckent', 'sprint-state.json'),
    JSON.stringify({
      sprintId,
      phase: SprintPhase.COMPLETE,
      status,
      startedAt: '2026-06-10T09:00:00.000Z',
      updatedAt: '2026-06-10T09:30:00.000Z',
      taskIds: [],
    }),
    'utf-8',
  );
}

/** Write a sprint-log markdown file (mirror of memory.db retro entry). */
function writeSprintLog(root: string, sprintId: string): void {
  const sprintsDir = join(root, '.brain', 'sprints');
  mkdirSync(sprintsDir, { recursive: true });
  writeFileSync(join(sprintsDir, `${sprintId}.md`), `# ${sprintId}\nfinalized\n`, 'utf-8');
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

function makeSprint(id: string): Sprint {
  return {
    id,
    number: parseInt(id.replace('sprint-', ''), 10) || 0,
    status: SprintStatus.RETROSPECTIVE,
    phase: SprintPhase.RETRO,
    tasks: [],
    workers: [],
    startedAt: '2026-06-10T09:00:00.000Z',
  };
}

function baseCheckpoint(sprintId: string, overrides: Partial<SprintCheckpoint> = {}): SprintCheckpoint {
  return {
    sprintId,
    checkpointNumber: 3,
    timestamp: '2026-06-10T09:30:00.000Z',
    completedTasks: [],
    pendingTasks: [],
    activeWorkers: [],
    brainPhase: SprintPhase.EVALUATE,
    eventStreamOffset: 10,
    ...overrides,
  };
}

// ─── cleanupCheckpointFiles ─────────────────────────────────────────────

describe('cleanupCheckpointFiles', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('1. removes checkpoint.json, .json.tmp and -checkpoint-seq', () => {
    writeCheckpointFile(root, baseCheckpoint('sprint-200'));
    writeCheckpointSeq(root, 'sprint-200', 3);
    writeFileSync(`${checkpointJsonPath(root, 'sprint-200')}.tmp`, '{}', 'utf-8');

    expect(existsSync(checkpointJsonPath(root, 'sprint-200'))).toBe(true);
    expect(existsSync(checkpointSeqPath(root, 'sprint-200'))).toBe(true);
    expect(existsSync(`${checkpointJsonPath(root, 'sprint-200')}.tmp`)).toBe(true);

    cleanupCheckpointFiles(root, 'sprint-200');

    expect(existsSync(checkpointJsonPath(root, 'sprint-200'))).toBe(false);
    expect(existsSync(checkpointSeqPath(root, 'sprint-200'))).toBe(false);
    expect(existsSync(`${checkpointJsonPath(root, 'sprint-200')}.tmp`)).toBe(false);
  });

  it('2. is idempotent / fail-safe when no checkpoint files exist', () => {
    expect(() => cleanupCheckpointFiles(root, 'sprint-999')).not.toThrow();
    // A second call is also a no-op.
    expect(() => cleanupCheckpointFiles(root, 'sprint-999')).not.toThrow();
  });

  it('3. only removes the targeted sprint, leaving other sprints intact', () => {
    writeCheckpointFile(root, baseCheckpoint('sprint-200'));
    writeCheckpointFile(root, baseCheckpoint('sprint-201'));

    cleanupCheckpointFiles(root, 'sprint-200');

    expect(existsSync(checkpointJsonPath(root, 'sprint-200'))).toBe(false);
    expect(existsSync(checkpointJsonPath(root, 'sprint-201'))).toBe(true);
  });
});

// ─── isSprintFinalized ──────────────────────────────────────────────────

describe('isSprintFinalized', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('4. true when sprint-state.json is COMPLETE for this sprint', () => {
    writeSprintStateFile(root, 'sprint-271', SprintStatus.COMPLETE);
    expect(isSprintFinalized(root, 'sprint-271')).toBe(true);
  });

  it('5. true when the sprint-log markdown exists (memory.db retro mirror)', () => {
    writeSprintLog(root, 'sprint-271');
    expect(isSprintFinalized(root, 'sprint-271')).toBe(true);
  });

  it('6. false when neither signal is present', () => {
    expect(isSprintFinalized(root, 'sprint-271')).toBe(false);
  });

  it('7. false when sprint-state COMPLETE but for a DIFFERENT sprint', () => {
    writeSprintStateFile(root, 'sprint-270', SprintStatus.COMPLETE);
    expect(isSprintFinalized(root, 'sprint-271')).toBe(false);
  });

  it('8. false when sprint-state exists but status is not COMPLETE (active)', () => {
    writeSprintStateFile(root, 'sprint-271', SprintStatus.ACTIVE);
    expect(isSprintFinalized(root, 'sprint-271')).toBe(false);
  });
});

// ─── persistFinalSprintState (finalize + finalize --force) ──────────────

describe('persistFinalSprintState — checkpoint purge', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('9. purges checkpoint artifacts during normal finalize', () => {
    const sprint = makeSprint('sprint-272');
    writeCheckpointFile(root, baseCheckpoint('sprint-272'));
    writeCheckpointSeq(root, 'sprint-272', 5);
    writeSprintStateFile(root, 'sprint-272', SprintStatus.ACTIVE);

    persistFinalSprintState(root, sprint);

    expect(existsSync(checkpointJsonPath(root, 'sprint-272'))).toBe(false);
    expect(existsSync(checkpointSeqPath(root, 'sprint-272'))).toBe(false);
    // And the sprint object is stamped COMPLETE/COMPLETE (existing contract).
    expect(sprint.status).toBe(SprintStatus.COMPLETE);
    expect(sprint.phase).toBe(SprintPhase.COMPLETE);
  });

  it('10. `finalize --force` on an older sprint purges that sprint checkpoint', () => {
    // Simulates `deckent finalize --force --sprint sprint-271` after the fact:
    // no sprint-state for it, checkpoint left behind from the live run.
    const sprint = makeSprint('sprint-271');
    writeCheckpointFile(root, baseCheckpoint('sprint-271'));
    writeCheckpointSeq(root, 'sprint-271', 4);

    persistFinalSprintState(root, sprint);

    expect(existsSync(checkpointJsonPath(root, 'sprint-271'))).toBe(false);
    expect(existsSync(checkpointSeqPath(root, 'sprint-271'))).toBe(false);
  });
});

// ─── restoreSprintFromCheckpoint — ghost-finalize guard + regressions ───

describe('restoreSprintFromCheckpoint — ghost-finalize guard', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('11. leftover + finalized (sprint-state COMPLETE) → cleaned + fresh, no ghost-complete', () => {
    // The exact CANLI scenario: finalize stamped state COMPLETE but left the
    // checkpoint behind; task.json files were archived (so they are absent).
    writeSprintStateFile(root, 'sprint-271', SprintStatus.COMPLETE);
    writeCheckpointFile(root, baseCheckpoint('sprint-271', {
      completedTasks: ['271-001', '271-002'],
    }));
    writeCheckpointSeq(root, 'sprint-271', 6);

    const result = restoreSprintFromCheckpoint(root, 'sprint-271');

    // NOT a phantom 'complete' — caller proceeds fresh to plan a NEW sprint.
    expect(result.restored).toBe(false);
    expect(result.action).toBe('fresh');
    expect(result.restoredSprint).toBeUndefined();
    // Stale checkpoint artifacts purged so it cannot recur next start.
    expect(existsSync(checkpointJsonPath(root, 'sprint-271'))).toBe(false);
    expect(existsSync(checkpointSeqPath(root, 'sprint-271'))).toBe(false);
  });

  it('12. leftover + finalized (sprint-log present) → cleaned + fresh', () => {
    writeSprintLog(root, 'sprint-271');
    writeCheckpointFile(root, baseCheckpoint('sprint-271', { completedTasks: ['271-001'] }));

    const result = restoreSprintFromCheckpoint(root, 'sprint-271');

    expect(result.restored).toBe(false);
    expect(result.action).toBe('fresh');
    expect(existsSync(checkpointJsonPath(root, 'sprint-271'))).toBe(false);
  });

  it('13. leftover + NOT finalized + all terminal → resume-evaluate for authoritative finalization', () => {
    // Brain crashed AFTER all tasks DONE but BEFORE finalize: no sprint-state
    // COMPLETE, no sprint-log. Evaluation/finalization must be replayed rather
    // than trusting the checkpoint's derived terminal projection.
    writeTaskJson(root, makeTask('260-001', TaskStatus.DONE));
    writeTaskJson(root, makeTask('260-002', TaskStatus.DONE));
    writeCheckpointFile(root, baseCheckpoint('sprint-260', {
      completedTasks: ['260-001', '260-002'],
    }));

    const result = restoreSprintFromCheckpoint(root, 'sprint-260');

    expect(result.restored).toBe(true);
    expect(result.action).toBe('resume-evaluate');
    expect(result.restoredSprint).toBeDefined();
    expect(result.restoredSprint!.tasks).toHaveLength(2);
    // Checkpoint untouched — runSprint still owns finalization of this sprint.
    expect(existsSync(checkpointJsonPath(root, 'sprint-260'))).toBe(true);
  });

  it('14. leftover + NOT finalized + pending tasks → "resume-evaluate" preserved', () => {
    writeTaskJson(root, makeTask('261-001', TaskStatus.DONE));
    writeTaskJson(root, makeTask('261-002', TaskStatus.PENDING));
    writeCheckpointFile(root, baseCheckpoint('sprint-261', {
      completedTasks: ['261-001'],
      pendingTasks: ['261-002'],
      brainPhase: SprintPhase.EXECUTE,
    }));

    const result = restoreSprintFromCheckpoint(root, 'sprint-261');

    expect(result.restored).toBe(true);
    expect(result.action).toBe('resume-evaluate');
    expect(existsSync(checkpointJsonPath(root, 'sprint-261'))).toBe(true);
  });

  it('15. no checkpoint → "fresh" (existing behavior unchanged)', () => {
    const result = restoreSprintFromCheckpoint(root, 'sprint-262');
    expect(result.restored).toBe(false);
    expect(result.action).toBe('fresh');
  });

  it('16. finalized sprint with NO leftover checkpoint → "fresh" without spurious work', () => {
    // sprint-state COMPLETE but checkpoint already cleaned (normal happy path).
    writeSprintStateFile(root, 'sprint-271', SprintStatus.COMPLETE);
    const result = restoreSprintFromCheckpoint(root, 'sprint-271');
    expect(result.restored).toBe(false);
    expect(result.action).toBe('fresh');
  });
});
