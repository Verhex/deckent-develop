// born-562 — REPRODUCTION: does a circuit-breaker-PAUSED task survive resume?
//
// The cascade circuit-breaker (sprint-controller PAUSE_SPRINT) sets a task's
// on-disk status to PAUSED + drops a `.paused` marker. The most-recent phase
// checkpoint was written BEFORE the pause, so it captures that task in
// `pendingTasks` (by id) — but its on-disk task.json now says PAUSED.
// restoreSprintFromCheckpoint reads the task.json verbatim → rebuilds it PAUSED
// → spawnWorkers only dispatches PENDING → the task is STUCK on resume.
//
// This test constructs exactly that on-disk state and asserts the rebuilt
// status. It is the reachability discriminator (advisor): if the rebuilt task
// is PENDING, there is no bug; if PAUSED, the resume path silently strands it.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreSprintFromCheckpoint } from '../../src/orchestra/sprint-checkpoint.js';
import { TaskStatus } from '../../src/core/task-types.js';

const roots: string[] = [];
afterEach(() => { for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup(): { root: string; sprintId: string } {
  const root = mkdtempSync(join(tmpdir(), 'resume-paused-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  const sprintId = 'sprint-test';

  // Checkpoint written BEFORE the pause: task X is captured PENDING (by id).
  writeFileSync(
    join(root, '.deckent', `${sprintId}-checkpoint.json`),
    JSON.stringify({
      sprintId,
      checkpointNumber: 1,
      timestamp: '2026-07-09T00:00:00.000Z',
      completedTasks: [],
      pendingTasks: ['X'],
      activeWorkers: [],
      brainPhase: 'EVALUATE',
      eventStreamOffset: 0,
    }),
    'utf-8',
  );

  // On-disk task.json AFTER the pause: status is PAUSED (pauseSprint wrote it).
  writeFileSync(
    join(root, '.tasks', 'task-X.json'),
    JSON.stringify({
      id: 'X',
      title: 'paused task',
      status: 'PAUSED',
      scope: { filesRead: [], filesWrite: [], directories: [] },
    }),
    'utf-8',
  );
  // The `.paused` marker pauseSprint drops (carries the pre-pause status).
  writeFileSync(
    join(root, '.tasks', 'task-X.paused'),
    JSON.stringify({ taskId: 'X', previousStatus: 'PENDING', pausedAt: '2026-07-09T00:01:00.000Z' }),
    'utf-8',
  );
  return { root, sprintId };
}

describe('born-562 — circuit-breaker-paused task on resume', () => {
  it('rebuilds a checkpoint-pending task that is now PAUSED on disk as DISPATCHABLE (not stuck)', () => {
    const { root, sprintId } = setup();
    const result = restoreSprintFromCheckpoint(root, sprintId);

    expect(result.restored).toBe(true);
    const rebuilt = result.restoredSprint?.tasks.find(t => t.id === 'X');
    expect(rebuilt).toBeDefined();
    // A PAUSED status here means spawnWorkers (PENDING-only eligibility) will
    // NEVER dispatch it → the task is stranded. The resume path must un-pause it.
    expect(rebuilt!.status).toBe(TaskStatus.PENDING);
  });
});
