import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getSprintStateSnapshot,
  IDLE_SNAPSHOT,
} from '../../src/orchestra/sprint-state-tracker.js';

describe('sprint-state-tracker (Sprint 180 W1-1)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sst-'));
    mkdirSync(join(tmp, '.deckent'), { recursive: true });
    mkdirSync(join(tmp, '.tasks'), { recursive: true });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('(a) returns IDLE_SNAPSHOT when no sprint-state.json', () => {
    const snap = getSprintStateSnapshot(tmp);
    expect(snap.sprintId).toBe(IDLE_SNAPSHOT.sprintId);
    expect(snap.currentPhase).toBe(IDLE_SNAPSHOT.currentPhase);
    expect(snap.activeWorkers).toEqual([]);
    expect(snap.totalTasks).toBe(0);
  });

  it('(b) reads active sprint snapshot', () => {
    const state = {
      sprintId: 'sprint-test-001',
      phase: 'EXECUTE',
      status: 'ACTIVE',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskIds: ['001-001', '001-002', '001-003'],
    };
    writeFileSync(
      join(tmp, '.deckent/sprint-state.json'),
      JSON.stringify(state, null, 2),
    );
    const snap = getSprintStateSnapshot(tmp);
    expect(snap.sprintId).toBe('sprint-test-001');
    expect(snap.totalTasks).toBe(3);
  });

  it('(c) idempotent across calls (frozen IDLE_SNAPSHOT)', () => {
    const a = getSprintStateSnapshot(tmp);
    const b = getSprintStateSnapshot(tmp);
    expect(a.sprintId).toBe(b.sprintId);
    expect(a.currentPhase).toBe(b.currentPhase);
  });

  it('(d) excludes a FINISHED worker (.result present) from activeWorkers — stale-worker false-positive fix', () => {
    writeFileSync(
      join(tmp, '.deckent/sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-x', phase: 'EXECUTE', taskIds: ['x-001', 'x-002'] }),
    );
    // Worker A: still running — only a heartbeat, no result.
    // A live worker always has its task JSON on disk — it is the claim surface the
    // worker operates on, and cleanup removes it when the sprint settles. The
    // snapshot now requires that evidence, so a residue heartbeat cannot pose as
    // an active worker (measured 2026-08-10: a leftover .hb drove two spurious
    // WORKER_RESPAWN actions on an already-settled sprint).
    writeFileSync(
      join(tmp, '.tasks/task-x-001.json'),
      JSON.stringify({ id: 'x-001', title: 'x-001', scope: {} }),
    );
    writeFileSync(
      join(tmp, '.tasks/task-x-002.json'),
      JSON.stringify({ id: 'x-002', title: 'x-002', scope: {} }),
    );
    writeFileSync(
      join(tmp, '.tasks/task-x-001.hb'),
      JSON.stringify({ workerId: 'w-x-001', taskId: 'x-001', timestamp: new Date().toISOString() }),
    );
    // Worker B: finished — heartbeat AND a .result (its .hb is never deleted).
    writeFileSync(
      join(tmp, '.tasks/task-x-002.hb'),
      JSON.stringify({ workerId: 'w-x-002', taskId: 'x-002', timestamp: new Date(0).toISOString() }),
    );
    writeFileSync(join(tmp, '.tasks/task-x-002.result'), JSON.stringify({ taskId: 'x-002', selfAssessment: 'DONE' }));

    const snap = getSprintStateSnapshot(tmp);
    const ids = snap.activeWorkers.map((w) => w.id);
    expect(ids).toContain('w-x-001'); // active worker stays
    expect(ids).not.toContain('w-x-002'); // finished worker is excluded (not "stale")
    expect(snap.activeWorkers).toHaveLength(1);
  });
});
