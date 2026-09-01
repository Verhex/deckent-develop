// ═══ KN3 (GR-2026-08-08-DOGFOOD-KN3-01) — spawn projection-parity guard ═════
// The 2026-08-07 smoke measured an in-memory plan diverging from on-disk task
// files: spawn "succeeded" vacuously and EXECUTE ran hollow. These pins hold
// the guard's three arms against a REAL tmpdir .tasks/ directory.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertTaskProjectionParity,
  TaskProjectionParityError,
} from '../../src/orchestra/sprint-spawner.js';
import { shouldDeferTaskArtifactProjection } from '../../src/orchestra/sprint-planner.js';
import type { Sprint } from '../../src/core/types.js';

function sprintOf(ids: string[]): Sprint {
  return { id: 'sprint-001', number: 1, tasks: ids.map((id) => ({ id })) } as unknown as Sprint;
}

function seed(root: string, ids: string[], extraFiles: string[] = []): void {
  const dir = join(root, '.tasks');
  mkdirSync(dir, { recursive: true });
  for (const id of ids) writeFileSync(join(dir, `task-${id}.json`), JSON.stringify({ id }));
  for (const f of extraFiles) writeFileSync(join(dir, f), '{}');
}

describe('KN3 — assertTaskProjectionParity', () => {
  it('defers the plan for either a run-level exact request or a task-level Docker pin', () => {
    expect(shouldDeferTaskArtifactProjection([{ backend: 'tmux' }], true)).toBe(true);
    expect(shouldDeferTaskArtifactProjection([{ backend: 'docker' }], false)).toBe(true);
    expect(shouldDeferTaskArtifactProjection([{ backend: 'subprocess' }], false)).toBe(false);
  });

  it('parity: plan == disk → silent (byte-identical behaviour)', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-'));
    try {
      seed(root, ['001-001', '001-002']);
      expect(() => assertTaskProjectionParity(root, sprintOf(['001-001', '001-002']))).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('planned-but-missing on disk fails CLOSED naming the exact ids (hollow-sprint arm)', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-'));
    try {
      seed(root, ['001-001']); // 001-002 planned, never written
      expect(() => assertTaskProjectionParity(root, sprintOf(['001-001', '001-002'])))
        .toThrowError(TaskProjectionParityError);
      try {
        assertTaskProjectionParity(root, sprintOf(['001-001', '001-002']));
      } catch (e) {
        expect(String(e)).toMatch(/MISSING on disk: \[001-002\]/u);
        expect(String(e)).toMatch(/re-plan through deckent/u);
        expect(String(e)).not.toMatch(/rm /u); // never advise hand-deletion
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('stray same-sprint file outside the plan fails CLOSED (abandoned-projection arm)', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-'));
    try {
      // the smoke's exact shape: an abandoned plan's 2 files vs a 3-task plan
      seed(root, ['001-001', '001-002', '001-999']);
      expect(() => assertTaskProjectionParity(root, sprintOf(['001-001', '001-002'])))
        .toThrowError(/NOT in this plan: \[001-999\]/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('cross-sprint files are ignored — same rule as the planner orphan cleanup', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-'));
    try {
      seed(root, ['001-001'], ['task-000-007.json', 'task-001-001.result']);
      expect(() => assertTaskProjectionParity(root, sprintOf(['001-001']))).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('an absent .tasks dir with a non-empty plan is the fully-hollow case — fail closed', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-'));
    try {
      expect(() => assertTaskProjectionParity(root, sprintOf(['001-001'])))
        .toThrowError(TaskProjectionParityError);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('exact pre-publication mode permits only explicitly deferred ids while retaining stray detection', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn3-'));
    try {
      seed(root, []);
      const sprint = sprintOf(['001-001', '001-002']);
      expect(() => assertTaskProjectionParity(
        root,
        sprint,
        new Set(['001-001', '001-002']),
      )).not.toThrow();

      writeFileSync(join(root, '.tasks', 'task-001-999.json'), JSON.stringify({ id: '001-999' }));
      expect(() => assertTaskProjectionParity(
        root,
        sprint,
        new Set(['001-001', '001-002']),
      )).toThrowError(/NOT in this plan: \[001-999\]/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
