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
});
