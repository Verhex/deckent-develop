/**
 * tests/orchestra/finalize-orphan-cleanup.test.ts
 *
 * Sprint 223 Task 013 — finalize sprint-state COMPLETED + pids cleanup
 * (orphan bırakma fix).
 *
 * Hermetic: every test runs in its own tmpdir; no fixture writes to the
 * project root or HOME. Targets `persistFinalSprintState` directly so we
 * don't drag in the rest of `finalizeSprint`'s heavyweight pipeline
 * (memory.db, sprint-reporter, doc updaters …).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistFinalSprintState } from '../../src/orchestra/sprint-finalizer.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint } from '../../src/core/types.js';

function makeSprint(sprintId = 'sprint-223'): Sprint {
  return {
    id: sprintId,
    number: 223,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks: [],
    workers: [],
    startedAt: new Date('2026-06-01T00:00:00.000Z').toISOString(),
  } as Sprint;
}

function seedState(root: string, sprintId: string, body: Record<string, unknown>): string {
  const dir = join(root, '.deckent');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'sprint-state.json');
  writeFileSync(p, JSON.stringify({
    sprintId,
    phase: 'EXECUTE',
    status: 'ACTIVE',
    startedAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    taskIds: [],
    ...body,
  }, null, 2), 'utf-8');
  return p;
}

function seedPidArtifacts(root: string, sprintId: string): { pid: string; snap: string } {
  const dir = join(root, '.deckent', 'pids');
  mkdirSync(dir, { recursive: true });
  const pid = join(dir, `${sprintId}.pid`);
  const snap = join(dir, `${sprintId}.snapshot.json`);
  writeFileSync(pid, JSON.stringify({ pid: 99999, sprintId, startedAt: '2026-06-01T00:00:00.000Z' }), 'utf-8');
  writeFileSync(snap, JSON.stringify({ sprintId, pid: 99999, currentWave: 0, taskStatuses: {}, metricsJsonlSize: 0, lastHeartbeat: '2026-06-01T00:00:00.000Z', startedAt: '2026-06-01T00:00:00.000Z' }), 'utf-8');
  return { pid, snap };
}

describe('persistFinalSprintState — Sprint 223 Task 013', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-223-013-'));
  });

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* non-fatal */ }
  });

  it('finalize → sprint-state.json status COMPLETE / phase COMPLETE', () => {
    const sprintId = 'sprint-223';
    const statePath = seedState(root, sprintId, {});
    const sprint = makeSprint(sprintId);

    persistFinalSprintState(root, sprint);

    expect(existsSync(statePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, string>;
    expect(parsed.status).toBe(SprintStatus.COMPLETE);
    expect(parsed.phase).toBe(SprintPhase.COMPLETE);
    expect(parsed.sprintId).toBe(sprintId);
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('pids — .pid and .snapshot.json are removed', () => {
    const sprintId = 'sprint-223';
    seedState(root, sprintId, {});
    const { pid, snap } = seedPidArtifacts(root, sprintId);

    expect(existsSync(pid)).toBe(true);
    expect(existsSync(snap)).toBe(true);

    persistFinalSprintState(root, makeSprint(sprintId));

    expect(existsSync(pid)).toBe(false);
    expect(existsSync(snap)).toBe(false);
  });

  it('state-yok → no-op (does not materialize a fresh sprint-state.json)', () => {
    const sprintId = 'sprint-223';
    const statePath = join(root, '.deckent', 'sprint-state.json');
    expect(existsSync(statePath)).toBe(false);
    // No .pid either — both branches should be silent no-ops.

    expect(() => persistFinalSprintState(root, makeSprint(sprintId))).not.toThrow();

    expect(existsSync(statePath)).toBe(false);
  });

  it('--force idempotent — second call produces the same terminal state', () => {
    const sprintId = 'sprint-223';
    const statePath = seedState(root, sprintId, {});
    const { pid, snap } = seedPidArtifacts(root, sprintId);

    persistFinalSprintState(root, makeSprint(sprintId));
    const firstSnapshot = readFileSync(statePath, 'utf-8');
    expect(existsSync(pid)).toBe(false);
    expect(existsSync(snap)).toBe(false);

    // Second call against the already-cleaned state must not throw or regress.
    expect(() => persistFinalSprintState(root, makeSprint(sprintId))).not.toThrow();

    // sprint-state.json is overwritten by writeSprintState — content stays terminal.
    const secondParsed = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, string>;
    expect(secondParsed.status).toBe(SprintStatus.COMPLETE);
    expect(secondParsed.phase).toBe(SprintPhase.COMPLETE);
    // PID artifacts stay gone — no resurrection.
    expect(existsSync(pid)).toBe(false);
    expect(existsSync(snap)).toBe(false);
    // First-call status was already terminal; second-call diff (if any) is just
    // the updatedAt timestamp — both snapshots must remain valid JSON.
    expect(() => JSON.parse(firstSnapshot)).not.toThrow();
  });

  it('state preserved without .pid — clearPid silently no-ops', () => {
    // Extra coverage: only state file present, no pid artifacts. Verifies the
    // two cleanup branches are independent — clearPid must not throw on
    // missing files.
    const sprintId = 'sprint-223';
    const statePath = seedState(root, sprintId, {});

    expect(() => persistFinalSprintState(root, makeSprint(sprintId))).not.toThrow();

    const parsed = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, string>;
    expect(parsed.status).toBe(SprintStatus.COMPLETE);
    expect(parsed.phase).toBe(SprintPhase.COMPLETE);
  });
});
