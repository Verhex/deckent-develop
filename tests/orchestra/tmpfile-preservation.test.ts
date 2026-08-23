// ═══ Sprint 156 Task 4: Tmpfile Preservation Discipline ════════════════════
// Verifies that .prompt-*.txt and .worker-*.sh tmpfiles are NOT deleted during
// sprint execution, and that they are archived to .tasks/archive/sprint-{id}/
// at sprint cleanup time.
//
// Background: previously, spawn-backend-docker.ts removed .worker-*.sh after
// each container exit (mid-sprint), and sprint-lifecycle.ts's cleanup() deleted
// both tmpfile classes unconditionally. This destroyed forensic evidence and
// rendered CLI archivePromptFiles() calls effectively no-op.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, rmSync, writeFileSync, existsSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { archivePromptFiles } from '../../src/orchestra/spawn-backend-docker.js';
import { archiveOrphanPromptFile } from '../../src/orchestra/tmux.js';
import { cleanup } from '../../src/orchestra/sprint-lifecycle.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `tmpfile-preserve-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeSprint(id = 'sprint-156'): Sprint {
  return {
    id,
    number: 156,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
  };
}

function seedTmpfiles(tasksDir: string): { promptFile: string; workerScript: string } {
  const promptFile = '.prompt-156-001-abcdef.txt';
  const workerScript = '.worker-156-001.sh';
  writeFileSync(join(tasksDir, promptFile), 'PROMPT CONTENT', 'utf-8');
  writeFileSync(join(tasksDir, workerScript), '#!/bin/sh\necho running', 'utf-8');
  return { promptFile, workerScript };
}

// ═══ archivePromptFiles — Worker Script Extension ═══════════════════════════

describe('archivePromptFiles (.worker-*.sh extension)', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempRoot();
    tasksDir = join(root, '.tasks');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('archives BOTH .prompt-*.txt AND .worker-*.sh into the canonical sprint archive', () => {
    const { promptFile, workerScript } = seedTmpfiles(tasksDir);

    const result = archivePromptFiles(tasksDir, 'sprint-156');

    expect(result.archived).toBe(2);
    const archiveDir = join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks');
    expect(existsSync(join(archiveDir, promptFile))).toBe(true);
    expect(existsSync(join(archiveDir, workerScript))).toBe(true);
    // Source files must be moved (not copied)
    expect(existsSync(join(tasksDir, promptFile))).toBe(false);
    expect(existsSync(join(tasksDir, workerScript))).toBe(false);
  });

  it('archives only .worker-*.sh when no prompt files exist', () => {
    writeFileSync(join(tasksDir, '.worker-156-002.sh'), '#!/bin/sh', 'utf-8');

    const result = archivePromptFiles(tasksDir, 'sprint-156');

    expect(result.archived).toBe(1);
    expect(existsSync(join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks', '.worker-156-002.sh'))).toBe(true);
  });

  it('archives only .prompt-*.txt when no worker scripts exist', () => {
    writeFileSync(join(tasksDir, '.prompt-156-003-aaa.txt'), 'PROMPT', 'utf-8');

    const result = archivePromptFiles(tasksDir, 'sprint-156');

    expect(result.archived).toBe(1);
    expect(existsSync(join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks', '.prompt-156-003-aaa.txt'))).toBe(true);
  });

  it('does NOT archive unrelated files (e.g. .worker- without .sh suffix)', () => {
    writeFileSync(join(tasksDir, '.worker-156-004.log'), 'log', 'utf-8');
    writeFileSync(join(tasksDir, '.prompt-156-005.json'), '{}', 'utf-8');

    const result = archivePromptFiles(tasksDir, 'sprint-156');

    expect(result.archived).toBe(0);
    expect(existsSync(join(tasksDir, '.worker-156-004.log'))).toBe(true);
    expect(existsSync(join(tasksDir, '.prompt-156-005.json'))).toBe(true);
  });

  it('archives only the requested sprint prefix when one is supplied', () => {
    writeFileSync(join(tasksDir, '.prompt-156-001-owned.txt'), 'owned', 'utf-8');
    writeFileSync(join(tasksDir, '.prompt-xv-independent.txt'), 'foreign', 'utf-8');

    const result = archivePromptFiles(tasksDir, 'sprint-156', 5, '156-');

    expect(result.archived).toBe(1);
    expect(existsSync(join(
      root,
      '.deckent', 'archive', 'sprints',
      'sprint-156',
      'tasks',
      '.prompt-156-001-owned.txt',
    ))).toBe(true);
    expect(existsSync(join(tasksDir, '.prompt-xv-independent.txt'))).toBe(true);
  });
});

// ═══ cleanup() — cleanupPhase Gating ════════════════════════════════════════

describe('cleanup() — tmpfile gating by cleanupPhase', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempRoot();
    tasksDir = join(root, '.tasks');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("sprint-end (default): archives .prompt-*.txt and .worker-*.sh to the canonical sprint archive", () => {
    const { promptFile, workerScript } = seedTmpfiles(tasksDir);
    const sprint = makeSprint('sprint-156');

    cleanup(root, sprint);

    const archiveDir = join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks');
    expect(existsSync(join(archiveDir, promptFile))).toBe(true);
    expect(existsSync(join(archiveDir, workerScript))).toBe(true);
    expect(existsSync(join(tasksDir, promptFile))).toBe(false);
    expect(existsSync(join(tasksDir, workerScript))).toBe(false);
  });

  it("sprint-end (explicit): archives tmpfiles (same behavior as default)", () => {
    const { promptFile, workerScript } = seedTmpfiles(tasksDir);
    const sprint = makeSprint('sprint-156');

    cleanup(root, sprint, undefined, 'sprint-end');

    expect(existsSync(join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks', promptFile))).toBe(true);
    expect(existsSync(join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks', workerScript))).toBe(true);
  });

  it("spawn-fail: PRESERVES tmpfiles in-place (NOT archived, NOT deleted)", () => {
    const { promptFile, workerScript } = seedTmpfiles(tasksDir);
    const sprint = makeSprint('sprint-156');

    cleanup(root, sprint, undefined, 'spawn-fail');

    // Tmpfiles remain in .tasks/ for post-mortem debugging
    expect(existsSync(join(tasksDir, promptFile))).toBe(true);
    expect(existsSync(join(tasksDir, workerScript))).toBe(true);
    // No archive dir created for this sprint
    const archiveDir = join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks');
    expect(existsSync(archiveDir)).toBe(false);
  });
});

// ═══ Mid-Sprint Execution Preservation (Spawn Backend Behavior) ═══════════════
//
// This test simulates the post-container-exit behavior without invoking Docker.
// Sprint 156 Task 4 removed the inline deletion block in spawn-backend-docker.ts:567-581
// so that .worker-*.sh files persist throughout sprint execution. Here we verify
// that simply running cleanup() with cleanupPhase='spawn-fail' (a stand-in for the
// mid-sprint preservation contract) leaves tmpfiles intact.

describe('Mid-sprint tmpfile preservation contract', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempRoot();
    tasksDir = join(root, '.tasks');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('tmpfiles exist mid-sprint, then move to archive after sprint-end cleanup', () => {
    // Simulate spawn-backend creating tmpfiles for two workers
    seedTmpfiles(tasksDir);
    writeFileSync(join(tasksDir, '.prompt-156-002-xyz.txt'), 'PROMPT 2', 'utf-8');
    writeFileSync(join(tasksDir, '.worker-156-002.sh'), '#!/bin/sh', 'utf-8');

    // Mid-sprint snapshot (e.g. one container exited) — files MUST still be present
    const midSprintFiles = readdirSync(tasksDir).filter(
      (f) => f.startsWith('.prompt-') || (f.startsWith('.worker-') && f.endsWith('.sh')),
    );
    expect(midSprintFiles.length).toBe(4);

    // Sprint cleanup phase fires → tmpfiles archived
    const sprint = makeSprint('sprint-156');
    cleanup(root, sprint);

    const postCleanupTmpfiles = readdirSync(tasksDir).filter(
      (f) => f.startsWith('.prompt-') || (f.startsWith('.worker-') && f.endsWith('.sh')),
    );
    expect(postCleanupTmpfiles.length).toBe(0);

    const archived = readdirSync(join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks'));
    expect(archived.sort()).toEqual([
      '.prompt-156-001-abcdef.txt',
      '.prompt-156-002-xyz.txt',
      '.worker-156-001.sh',
      '.worker-156-002.sh',
    ]);
  });
});

// ═══ F0.3: orphan-prompt preservation (training-trace) ══════════════════════
// Mid-sprint cleanup (kill()/health-check) must ARCHIVE orphan prompts, not
// delete them — the (prompt → result) pair is the training-trace unit. Prompts
// task-bound prompts are written directly into the canonical sprint archive;
// legacy `_orphaned` staging is still reconciled at sprint end.

describe('F0.3 archiveOrphanPromptFile — preserves instead of deleting', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempRoot();
    tasksDir = join(root, '.tasks');
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('moves a task-bound orphan prompt directly into the canonical sprint archive', () => {
    const promptFile = '.prompt-156-009-deadbeef.txt';
    writeFileSync(join(tasksDir, promptFile), 'PROMPT CONTENT', 'utf-8');

    archiveOrphanPromptFile(join(tasksDir, promptFile), tasksDir);

    // Source removed from the active dir…
    expect(existsSync(join(tasksDir, promptFile))).toBe(false);
    // …but preserved in the canonical archive (not destroyed).
    expect(existsSync(join(
      root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks', promptFile,
    ))).toBe(true);
  });

  it('sprint-end archivePromptFiles drains _orphaned/ into the sprint archive', () => {
    // A prompt was staged mid-sprint…
    const staged = '.prompt-156-010-cafe.txt';
    mkdirSync(join(tasksDir, 'archive', '_orphaned'), { recursive: true });
    writeFileSync(join(tasksDir, 'archive', '_orphaned', staged), 'STAGED', 'utf-8');
    // …plus a live top-level prompt at sprint-end.
    const live = '.prompt-156-011-babe.txt';
    writeFileSync(join(tasksDir, live), 'LIVE', 'utf-8');

    const result = archivePromptFiles(tasksDir, 'sprint-156');

    const archiveDir = join(root, '.deckent', 'archive', 'sprints', 'sprint-156', 'tasks');
    // Both the live prompt AND the drained staged prompt land in the sprint archive.
    expect(existsSync(join(archiveDir, live))).toBe(true);
    expect(existsSync(join(archiveDir, staged))).toBe(true);
    // Staging bucket is emptied.
    expect(existsSync(join(tasksDir, 'archive', '_orphaned'))).toBe(false);
    expect(result.archived).toBe(2);
  });
});
