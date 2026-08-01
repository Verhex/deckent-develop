// Tests for archiveOrphanTasks (extended with .log/.timeout) and cleanTasksArchive
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  archiveOrphanTasks,
  cleanTasksArchive,
} from '../../src/orchestra/sprint-docs-updater.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(filePath: string): void {
  mkdirSync(join(filePath, '..').replace(/[^/\\]+$/, '').replace(/\/$/, '') || '/', { recursive: true });
  writeFileSync(filePath, '');
}

// ─── archiveOrphanTasks — extended extensions ─────────────────────────

describe('archiveOrphanTasks — extended extension support', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.brain', 'archive'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('archives .log files belonging to the sprint', () => {
    writeFileSync(join(root, '.tasks', 'task-139-001.log'), 'log content');
    writeFileSync(join(root, '.tasks', 'task-139-001.json'), '{}');

    const count = archiveOrphanTasks(root, 'sprint-139');

    expect(count).toBe(2);
    const archiveDir = join(root, '.brain', 'archive', 'sprints', 'sprint-139-tasks');
    expect(existsSync(join(archiveDir, 'task-139-001.log'))).toBe(true);
    expect(existsSync(join(archiveDir, 'task-139-001.json'))).toBe(true);
    // Originals should be removed
    expect(existsSync(join(root, '.tasks', 'task-139-001.log'))).toBe(false);
    expect(existsSync(join(root, '.tasks', 'task-139-001.json'))).toBe(false);
  });

  it('archives .timeout files belonging to the sprint', () => {
    writeFileSync(join(root, '.tasks', 'task-139-002.timeout'), '');
    writeFileSync(join(root, '.tasks', 'task-139-002.hb'), '{}');

    const count = archiveOrphanTasks(root, 'sprint-139');

    expect(count).toBe(2);
    const archiveDir = join(root, '.brain', 'archive', 'sprints', 'sprint-139-tasks');
    expect(existsSync(join(archiveDir, 'task-139-002.timeout'))).toBe(true);
  });

  it('archives .prompt-* files alongside task files', () => {
    writeFileSync(join(root, '.tasks', 'task-139-003.json'), '{}');
    writeFileSync(join(root, '.tasks', '.prompt-abc123.txt'), 'prompt content');

    const count = archiveOrphanTasks(root, 'sprint-139');

    expect(count).toBe(2);
    const archiveDir = join(root, '.brain', 'archive', 'sprints', 'sprint-139-tasks');
    expect(existsSync(join(archiveDir, '.prompt-abc123.txt'))).toBe(true);
  });

  it('does not archive files from a different sprint', () => {
    writeFileSync(join(root, '.tasks', 'task-138-001.json'), '{}');
    writeFileSync(join(root, '.tasks', 'task-138-001.hb'), '{}');

    const count = archiveOrphanTasks(root, 'sprint-139');

    expect(count).toBe(0);
    // Files from sprint-138 should remain
    expect(existsSync(join(root, '.tasks', 'task-138-001.json'))).toBe(true);
  });

  it('preserves landing proposals and temporary result residue as non-task evidence', () => {
    writeFileSync(
      join(root, '.tasks', 'task-139-004.landing-proposal.json'),
      JSON.stringify({ taskId: '139-004', sequence: 1 }),
    );
    writeFileSync(join(root, '.tasks', 'task-139-004.result.tmp'), '{partial');

    const count = archiveOrphanTasks(root, 'sprint-139');

    expect(count).toBe(0);
    expect(existsSync(join(root, '.tasks', 'task-139-004.landing-proposal.json'))).toBe(true);
    expect(existsSync(join(root, '.tasks', 'task-139-004.result.tmp'))).toBe(true);
  });

  it('returns 0 when .tasks/ directory does not exist', () => {
    rmSync(join(root, '.tasks'), { recursive: true, force: true });

    const count = archiveOrphanTasks(root, 'sprint-139');

    expect(count).toBe(0);
  });

  it('returns 0 when no matching files exist for the sprint', () => {
    // .tasks/ exists but empty
    const count = archiveOrphanTasks(root, 'sprint-139');
    expect(count).toBe(0);
  });
});

// ─── cleanTasksArchive — retention policy ─────────────────────────────

describe('cleanTasksArchive — retention policy', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns 0 when .tasks/archive/ does not exist', () => {
    const removed = cleanTasksArchive(root, 5);
    expect(removed).toBe(0);
  });

  it('returns 0 when archive count is within retention limit', () => {
    mkdirSync(join(root, '.tasks', 'archive', 'sprint-137'), { recursive: true });
    mkdirSync(join(root, '.tasks', 'archive', 'sprint-138'), { recursive: true });
    mkdirSync(join(root, '.tasks', 'archive', 'sprint-139'), { recursive: true });

    const removed = cleanTasksArchive(root, 5);
    expect(removed).toBe(0);
  });

  it('removes oldest archive dirs when count exceeds retention', () => {
    // Create 7 sprint archive dirs
    for (let i = 133; i <= 139; i++) {
      mkdirSync(join(root, '.tasks', 'archive', `sprint-${i}`), { recursive: true });
    }

    const removed = cleanTasksArchive(root, 5);

    expect(removed).toBe(2); // sprint-133 and sprint-134 removed
    const remaining = readdirSync(join(root, '.tasks', 'archive'));
    expect(remaining).not.toContain('sprint-133');
    expect(remaining).not.toContain('sprint-134');
    expect(remaining).toContain('sprint-135');
    expect(remaining).toContain('sprint-139');
  });

  it('removes files inside old archive dirs before removing dir', () => {
    mkdirSync(join(root, '.tasks', 'archive', 'sprint-133'), { recursive: true });
    writeFileSync(join(root, '.tasks', 'archive', 'sprint-133', 'task-133-001.json'), '{}');
    writeFileSync(join(root, '.tasks', 'archive', 'sprint-133', 'task-133-001.hb'), '{}');

    for (let i = 134; i <= 139; i++) {
      mkdirSync(join(root, '.tasks', 'archive', `sprint-${i}`), { recursive: true });
    }

    const removed = cleanTasksArchive(root, 5);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(root, '.tasks', 'archive', 'sprint-133'))).toBe(false);
  });

  it('ignores non-sprint-NNN entries in archive dir', () => {
    mkdirSync(join(root, '.tasks', 'archive', 'sprint-139'), { recursive: true });
    mkdirSync(join(root, '.tasks', 'archive', 'misc-dir'), { recursive: true });

    // Only 1 sprint dir — within any reasonable retention
    const removed = cleanTasksArchive(root, 5);
    expect(removed).toBe(0);
    // misc-dir should be untouched
    expect(existsSync(join(root, '.tasks', 'archive', 'misc-dir'))).toBe(true);
  });
});

// ─── dry-run pattern match ────────────────────────────────────────────

describe('cleanup pattern matching — .timeout extension', () => {
  it('dry-run filter includes .timeout files', () => {
    const files = [
      'task-139-001.json',
      'task-139-001.hb',
      'task-139-001.result',
      'task-139-001.log',
      'task-139-001.timeout',
      '.prompt-abc.txt',
      'README.md',
    ];
    const taskFiles = files.filter(f => /\.(json|plan|hb|result|paused|log|timeout)$/.test(f));
    const promptFiles = files.filter(f => f.startsWith('.prompt-'));

    expect(taskFiles).toContain('task-139-001.timeout');
    expect(taskFiles).toContain('task-139-001.log');
    expect(taskFiles).not.toContain('README.md');
    expect(promptFiles).toContain('.prompt-abc.txt');
    expect(taskFiles.length).toBe(5);
  });
});
