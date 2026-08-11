// ═══ Canonical Task-Artifact Archive Authority Tests (row 3314) ═══
// Row 3314 measured three manual consolidation moves in one night: normal
// settlement archived task artifacts under the brain archive, the recover path
// archived under a DIFFERENT tasks-local directory and preserved non-terminal
// files in the tasks root, and hidden worker shell scripts were left behind by
// both paths.
//
// These tests pin the fix: ONE resolver owns the destination, every path
// consumes it, no path leaves residue in the tasks root, non-terminal
// preservation survives inside the canonical location behind a typed marker,
// and nothing is ever deleted.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  resolveTaskArtifactArchiveDir,
  archiveTaskArtifacts,
  TASK_ARTIFACT_PRESERVED_SUBDIR,
  TASK_ARTIFACT_PRESERVATION_MARKER_FILE,
  TASK_ARTIFACT_PRESERVATION_MARKER_KIND,
  type TaskArtifactPreservationMarker,
} from '../../src/orchestra/sprint-finalizer.js';
import { classifyTaskFiles } from '../../src/orchestra/task-restoration.js';
import {
  settleRecoveredTaskArtifacts,
  recoveredTaskArtifactDestination,
} from '../../src/cli/commands/recover-helpers.js';
import { BRAIN_DIR, TASKS_DIR } from '../../src/core/constants.js';

// ─── Fixture ─────────────────────────────────────────────────────────

const SPRINT_ID = 'sprint-903';

let root: string;

function makeTempRoot(): string {
  const dir = join(
    tmpdir(),
    `archive-path-authority-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function tasksDir(): string {
  return join(root, TASKS_DIR);
}

function write(relPath: string, content: string): void {
  const abs = join(root, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}

/**
 * A realistic post-sprint `.tasks/` directory:
 *  - task-903-001 → DONE (terminal, archivable)
 *  - task-903-002 → EXECUTING (non-terminal, preserved)
 *  - hidden worker artifacts nobody swept before (row 3314 residue)
 *  - a landing proposal, which no path used to move
 *  - a foreign sprint's task file, which must NOT be touched
 */
function seedTasksFixture(): void {
  write(`${TASKS_DIR}/task-903-001.json`, JSON.stringify({ id: '903-001', status: 'DONE' }));
  write(`${TASKS_DIR}/task-903-001.plan`, 'plan-001');
  write(`${TASKS_DIR}/task-903-001.result`, JSON.stringify({ taskId: '903-001' }));
  write(`${TASKS_DIR}/task-903-001.landing-proposal.json`, JSON.stringify({ sequence: 2 }));

  write(`${TASKS_DIR}/task-903-002.json`, JSON.stringify({ id: '903-002', status: 'EXECUTING' }));
  write(`${TASKS_DIR}/task-903-002.hb`, JSON.stringify({ sequence: 4 }));

  // Hidden worker artifacts — the residue class row 3314 caught.
  write(`${TASKS_DIR}/.worker-903-001.sh`, '#!/bin/sh\necho worker\n');
  write(`${TASKS_DIR}/.prompt-903-001.txt`, 'prompt body');

  // Foreign sprint — out of scope for this settlement.
  write(`${TASKS_DIR}/task-777-009.json`, JSON.stringify({ id: '777-009', status: 'DONE' }));
}

/** Filenames (not directories) left directly in the tasks root. */
function tasksRootFiles(): string[] {
  return readdirSync(tasksDir(), { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .sort();
}

function finalizeClassificationPlan(): { archive: string[]; preserve: string[] } {
  const prefix = 'task-903-';
  const sprintFiles = (readdirSync(tasksDir()) as string[]).filter(f => f.startsWith(prefix));
  const { archivable, preserved } = classifyTaskFiles(tasksDir(), prefix, sprintFiles);
  return { archive: archivable, preserve: preserved };
}

beforeEach(() => {
  root = makeTempRoot();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── Resolver: one destination, config-derived ───────────────────────

describe('resolveTaskArtifactArchiveDir — the single destination authority', () => {
  it('defaults to the established brain archive, not a fresh literal', () => {
    expect(resolveTaskArtifactArchiveDir(root, SPRINT_ID))
      .toBe(join(root, BRAIN_DIR, 'archive', 'sprints', `${SPRINT_ID}-tasks`));
  });

  it('resolves from the sprint_file_retention config family when archive_path is set', () => {
    write('.deckent/config.json', JSON.stringify({
      sprint_file_retention: { keep_last_n: 2, size_cap_mb: 500, archive_path: '.deckent/archive/sprints/' },
    }));

    expect(resolveTaskArtifactArchiveDir(root, SPRINT_ID))
      .toBe(join(root, '.deckent', 'archive', 'sprints', `${SPRINT_ID}-tasks`));
  });

  it('ignores a blank/absent archive_path instead of resolving to the project root', () => {
    write('.deckent/config.json', JSON.stringify({ sprint_file_retention: { archive_path: '   ' } }));

    expect(resolveTaskArtifactArchiveDir(root, SPRINT_ID))
      .toBe(join(root, BRAIN_DIR, 'archive', 'sprints', `${SPRINT_ID}-tasks`));
  });

  it('is the same destination the recover path reports — no second resolver', () => {
    write('.deckent/config.json', JSON.stringify({
      sprint_file_retention: { archive_path: '.deckent/archive/sprints/' },
    }));

    expect(recoveredTaskArtifactDestination(root, SPRINT_ID))
      .toBe(resolveTaskArtifactArchiveDir(root, SPRINT_ID));
  });
});

// ─── Settle path ─────────────────────────────────────────────────────

describe('archiveTaskArtifacts — settle path', () => {
  beforeEach(() => {
    seedTasksFixture();
  });

  it('archives terminal artifacts into the resolved destination and leaves zero residue', () => {
    const destination = resolveTaskArtifactArchiveDir(root, SPRINT_ID);

    const result = archiveTaskArtifacts(root, SPRINT_ID, finalizeClassificationPlan());

    expect(result.destination).toBe(destination);
    expect(result.failures).toEqual([]);

    const archived = readdirSync(destination).sort();
    expect(archived).toContain('task-903-001.json');
    expect(archived).toContain('task-903-001.plan');
    expect(archived).toContain('task-903-001.result');

    // Row 3314 residue: hidden worker artifacts + the landing proposal.
    expect(archived).toContain('.worker-903-001.sh');
    expect(archived).toContain('.prompt-903-001.txt');
    expect(archived).toContain('task-903-001.landing-proposal.json');

    // Nothing for this sprint stays behind; the foreign sprint is untouched.
    expect(tasksRootFiles()).toEqual(['task-777-009.json']);
  });

  it('preserves non-terminal artifacts INSIDE the canonical location with a typed marker', () => {
    const destination = resolveTaskArtifactArchiveDir(root, SPRINT_ID);
    const preservedDir = join(destination, TASK_ARTIFACT_PRESERVED_SUBDIR);

    const result = archiveTaskArtifacts(root, SPRINT_ID, finalizeClassificationPlan());

    expect(result.preserved.sort()).toEqual(['task-903-002.hb', 'task-903-002.json']);
    expect(existsSync(join(preservedDir, 'task-903-002.json'))).toBe(true);
    expect(existsSync(join(preservedDir, 'task-903-002.hb'))).toBe(true);

    const marker = JSON.parse(
      readFileSync(join(preservedDir, TASK_ARTIFACT_PRESERVATION_MARKER_FILE), 'utf-8'),
    ) as TaskArtifactPreservationMarker;
    expect(marker.kind).toBe(TASK_ARTIFACT_PRESERVATION_MARKER_KIND);
    expect(marker.version).toBe(1);
    expect(marker.sprintId).toBe(SPRINT_ID);
    expect(marker.reason).toBe('non-terminal');
    expect(marker.restorePath).toBe(TASKS_DIR);
    expect([...marker.entries].sort()).toEqual(['task-903-002.hb', 'task-903-002.json']);

    // Preservation is a HOLD, not an archive — the non-terminal artifacts never
    // land in the terminal archive root.
    expect(readdirSync(destination)).not.toContain('task-903-002.json');
  });

  it('moves rather than removes — every seeded artifact still exists afterwards', () => {
    const before = tasksRootFiles();
    const destination = resolveTaskArtifactArchiveDir(root, SPRINT_ID);

    archiveTaskArtifacts(root, SPRINT_ID, finalizeClassificationPlan());

    const after = [
      ...readdirSync(destination, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name),
      ...readdirSync(join(destination, TASK_ARTIFACT_PRESERVED_SUBDIR)).filter(
        n => n !== TASK_ARTIFACT_PRESERVATION_MARKER_FILE,
      ),
      ...tasksRootFiles(),
    ].sort();

    expect(after).toEqual(before.sort());
    expect(readFileSync(join(destination, 'task-903-001.plan'), 'utf-8')).toBe('plan-001');
  });

  it('is idempotent — a second settle finds nothing left and destroys nothing', () => {
    const destination = resolveTaskArtifactArchiveDir(root, SPRINT_ID);
    archiveTaskArtifacts(root, SPRINT_ID, finalizeClassificationPlan());
    const firstPass = readdirSync(destination).sort();

    const second = archiveTaskArtifacts(root, SPRINT_ID, { archive: [], preserve: [] });

    expect(second.archived).toEqual([]);
    expect(second.residueSwept).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(readdirSync(destination).sort()).toEqual(firstPass);
  });
});

// ─── Recover path ────────────────────────────────────────────────────

describe('settleRecoveredTaskArtifacts — recover path shares the single destination', () => {
  beforeEach(() => {
    seedTasksFixture();
  });

  it('lands recovered artifacts in the same directory the settle path uses', () => {
    const result = settleRecoveredTaskArtifacts(root, SPRINT_ID, {
      archivedFiles: [
        'task-903-001.json', 'task-903-001.plan', 'task-903-001.result',
      ],
      preservedFiles: ['task-903-002.json', 'task-903-002.hb'],
    });

    expect(result.destination).toBe(resolveTaskArtifactArchiveDir(root, SPRINT_ID));
    expect(result.failures).toEqual([]);
    expect(tasksRootFiles()).toEqual(['task-777-009.json']);
    expect(
      existsSync(join(result.preservedDestination, TASK_ARTIFACT_PRESERVATION_MARKER_FILE)),
    ).toBe(true);
  });

  it('consolidates a legacy tasks-local archive into the canonical destination', () => {
    // What the recover path wrote before the single authority existed.
    write(`${TASKS_DIR}/archive/${SPRINT_ID}/task-903-000.result`, 'legacy-result');

    const result = settleRecoveredTaskArtifacts(root, SPRINT_ID, {
      archivedFiles: ['task-903-001.json'],
      preservedFiles: [],
    });

    expect(result.consolidated).toEqual(['task-903-000.result']);
    expect(readFileSync(join(result.destination, 'task-903-000.result'), 'utf-8'))
      .toBe('legacy-result');
    expect(existsSync(join(tasksDir(), 'archive', SPRINT_ID))).toBe(false);
  });

  it('never clobbers existing archived evidence with a same-named artifact', () => {
    write(`${TASKS_DIR}/archive/${SPRINT_ID}/task-903-001.result`, 'legacy-copy');

    const result = settleRecoveredTaskArtifacts(root, SPRINT_ID, {
      archivedFiles: ['task-903-001.result'],
      preservedFiles: [],
    });

    const archived = readdirSync(result.destination);
    expect(archived).toContain('task-903-001.result');
    expect(archived).toContain('task-903-001.result.dup-1');

    const contents = archived
      .filter(n => n.startsWith('task-903-001.result'))
      .map(n => readFileSync(join(result.destination, n), 'utf-8'))
      .sort();
    expect(contents).toEqual([JSON.stringify({ taskId: '903-001' }), 'legacy-copy'].sort());
  });
});

// ─── Both paths agree ────────────────────────────────────────────────

describe('single-destination invariant', () => {
  it('settle and recover resolve byte-identically under a configured archive_path', () => {
    write('.deckent/config.json', JSON.stringify({
      sprint_file_retention: { archive_path: '.deckent/archive/sprints/' },
    }));
    seedTasksFixture();

    const settleDestination = archiveTaskArtifacts(root, SPRINT_ID, {
      archive: ['task-903-001.json'],
      preserve: [],
    }).destination;

    const recoverDestination = settleRecoveredTaskArtifacts(root, SPRINT_ID, {
      archivedFiles: ['task-903-001.plan'],
      preservedFiles: [],
    }).destination;

    expect(recoverDestination).toBe(settleDestination);
    expect(settleDestination)
      .toBe(join(root, '.deckent', 'archive', 'sprints', `${SPRINT_ID}-tasks`));
    expect(tasksRootFiles()).toEqual(['task-777-009.json']);
  });
});
