/**
 * Sprint 179 W1-2 — Re-plan orphan task file cleanup.
 *
 * Verifies the `cleanupOrphanTaskFiles()` helper added to `sprint-planner.ts`:
 *  - (a) unlink: files for the current sprint whose `task.id` is not in the
 *    new task ID set are removed (re-plan no longer leaves stale files behind).
 *  - (b) dryRun: returns the paths that would be removed but does not unlink
 *    any file (useful for previewing cleanup before commit).
 *  - (c) cross-sprint isolation: task files for OTHER sprints (different
 *    sprint number prefix) are never touched, even when their id-slot is
 *    not in the new task set.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanupOrphanTaskFiles } from '../../src/orchestra/sprint-planner.js';

function writeTaskFile(dir: string, id: string, status = 'PENDING'): string {
  const filePath = join(dir, `task-${id}.json`);
  writeFileSync(
    filePath,
    JSON.stringify({ id, sprintId: `sprint-${id.split('-')[0]}`, status }, null, 2),
    'utf-8',
  );
  return filePath;
}

describe('Sprint 179 W1-2 — cleanupOrphanTaskFiles', () => {
  let projectRoot: string;
  let tasksDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-orphan-cleanup-'));
    tasksDir = join(projectRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('(a) unlink: files for the current sprint not in newTaskIds are removed', () => {
    // Sprint 179 has 3 tasks on disk (001, 002, 003) and a stale orphan (099).
    writeTaskFile(tasksDir, '179-001');
    writeTaskFile(tasksDir, '179-002');
    writeTaskFile(tasksDir, '179-003');
    const orphanPath = writeTaskFile(tasksDir, '179-099');

    const newIds = new Set(['179-001', '179-002', '179-003']);
    const removed = cleanupOrphanTaskFiles(projectRoot, 'sprint-179', newIds);

    expect(removed).toEqual([orphanPath]);
    expect(existsSync(orphanPath)).toBe(false);

    // Survivors still present.
    expect(existsSync(join(tasksDir, 'task-179-001.json'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-179-002.json'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-179-003.json'))).toBe(true);
  });

  it('(b) dryRun: returns paths but does not unlink any file', () => {
    writeTaskFile(tasksDir, '179-001');
    const orphanPath = writeTaskFile(tasksDir, '179-099');

    const newIds = new Set(['179-001']);
    const previewed = cleanupOrphanTaskFiles(projectRoot, 'sprint-179', newIds, { dryRun: true });

    expect(previewed).toEqual([orphanPath]);
    // dryRun MUST preserve every file on disk.
    expect(existsSync(orphanPath)).toBe(true);
    expect(existsSync(join(tasksDir, 'task-179-001.json'))).toBe(true);
    expect(readdirSync(tasksDir).sort()).toEqual(['task-179-001.json', 'task-179-099.json']);
  });

  it('(c) cross-sprint isolation: files from other sprints are never touched', () => {
    // Sprint 178 leftovers must NOT be removed when cleaning sprint 179.
    const sprint178a = writeTaskFile(tasksDir, '178-001');
    const sprint178b = writeTaskFile(tasksDir, '178-042');
    writeTaskFile(tasksDir, '179-001');
    const orphan179 = writeTaskFile(tasksDir, '179-099');

    const newIds = new Set(['179-001']);
    const removed = cleanupOrphanTaskFiles(projectRoot, 'sprint-179', newIds);

    // Only the sprint-179 orphan is removed.
    expect(removed).toEqual([orphan179]);
    expect(existsSync(orphan179)).toBe(false);

    // Cross-sprint files untouched even though their id-slot isn't in newIds.
    expect(existsSync(sprint178a)).toBe(true);
    expect(existsSync(sprint178b)).toBe(true);
    expect(existsSync(join(tasksDir, 'task-179-001.json'))).toBe(true);
  });

  it('no-op when .tasks/ directory is missing (re-plan before any task write)', () => {
    rmSync(tasksDir, { recursive: true, force: true });

    const removed = cleanupOrphanTaskFiles(projectRoot, 'sprint-179', new Set(['179-001']));
    expect(removed).toEqual([]);
  });

  it('ignores non task-*.json files (e.g. .hb, .result) when scanning', () => {
    writeTaskFile(tasksDir, '179-001');
    // Sibling files for the same sprint that must not be unlinked even though
    // their id-slot is not in newIds.
    writeFileSync(join(tasksDir, 'task-179-001.hb'), '{}', 'utf-8');
    writeFileSync(join(tasksDir, 'task-179-002.result'), '{}', 'utf-8');

    const removed = cleanupOrphanTaskFiles(projectRoot, 'sprint-179', new Set(['179-001']));

    expect(removed).toEqual([]);
    expect(existsSync(join(tasksDir, 'task-179-001.hb'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-179-002.result'))).toBe(true);
  });
});
