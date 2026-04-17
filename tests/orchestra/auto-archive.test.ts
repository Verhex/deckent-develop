// ═══ Auto-Archive Guard Tests (Sprint 143 Task 13) ════════════════
// Tests for pre-archive snapshot, status-aware filtering, hash verification,
// and restore functionality.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createPreArchiveSnapshot,
  computeFileHash,
  verifySnapshot,
  classifyTaskFiles,
  readTaskStatus,
  restoreFromSnapshot,
} from '../../src/orchestra/task-restoration.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `auto-archive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTaskJson(root: string, taskFile: string, status: string): void {
  writeFileSync(join(root, '.tasks', taskFile), JSON.stringify({ id: taskFile.replace('.json', ''), status }));
}

// ═══ createPreArchiveSnapshot ════════════════════════════════════════

describe('createPreArchiveSnapshot', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates a tar.gz snapshot with correct hash', () => {
    writeFileSync(join(root, '.tasks', 'task-143-001.json'), '{"status":"DONE"}');
    writeFileSync(join(root, '.tasks', 'task-143-001.result'), '{"taskId":"143-001"}');
    writeFileSync(join(root, '.tasks', 'task-143-002.json'), '{"status":"PENDING"}');

    const result = createPreArchiveSnapshot(root, 'sprint-143');

    expect(result).not.toBeNull();
    expect(result!.fileCount).toBe(3);
    expect(existsSync(result!.snapshotPath)).toBe(true);
    expect(existsSync(result!.hashPath)).toBe(true);
    expect(result!.hash).toMatch(/^[a-f0-9]{64}$/);

    // Verify hash file content
    const hashContent = readFileSync(result!.hashPath, 'utf-8');
    expect(hashContent).toContain(result!.hash);
  });

  it('returns null when .tasks/ does not exist', () => {
    rmSync(join(root, '.tasks'), { recursive: true, force: true });
    const result = createPreArchiveSnapshot(root, 'sprint-143');
    expect(result).toBeNull();
  });

  it('returns null when no task files match sprint', () => {
    writeFileSync(join(root, '.tasks', 'task-142-001.json'), '{}');
    const result = createPreArchiveSnapshot(root, 'sprint-143');
    expect(result).toBeNull();
  });

  it('returns null for invalid sprint ID format', () => {
    writeFileSync(join(root, '.tasks', 'task-143-001.json'), '{}');
    const result = createPreArchiveSnapshot(root, 'invalid-id');
    expect(result).toBeNull();
  });
});

// ═══ Hash Verification ══════════════════════════════════════════════

describe('verifySnapshot', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns true for valid hash', () => {
    const filePath = join(root, 'test-file.bin');
    writeFileSync(filePath, 'test content for hashing');

    const hash = computeFileHash(filePath);
    expect(verifySnapshot(filePath, hash)).toBe(true);
  });

  it('returns false for tampered file (hash mismatch)', () => {
    const filePath = join(root, 'test-file.bin');
    writeFileSync(filePath, 'original content');

    const hash = computeFileHash(filePath);

    // Tamper the file
    writeFileSync(filePath, 'tampered content');

    expect(verifySnapshot(filePath, hash)).toBe(false);
  });

  it('returns false for non-existent file', () => {
    expect(verifySnapshot(join(root, 'nonexistent.tar.gz'), 'abc123')).toBe(false);
  });
});

// ═══ classifyTaskFiles ══════════════════════════════════════════════

describe('classifyTaskFiles', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempDir();
    tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('preserves PENDING task files', () => {
    writeTaskJson(root, 'task-143-001.json', 'PENDING');
    writeFileSync(join(tasksDir, 'task-143-001.hb'), '{}');

    const { archivable, preserved } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-001.json',
      'task-143-001.hb',
    ]);

    expect(preserved).toContain('task-143-001.json');
    expect(preserved).toContain('task-143-001.hb');
    expect(archivable).toHaveLength(0);
  });

  it('preserves EXECUTING task files', () => {
    writeTaskJson(root, 'task-143-002.json', 'EXECUTING');
    writeFileSync(join(tasksDir, 'task-143-002.hb'), '{}');
    writeFileSync(join(tasksDir, 'task-143-002.plan'), 'plan content');

    const { archivable, preserved } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-002.json',
      'task-143-002.hb',
      'task-143-002.plan',
    ]);

    expect(preserved).toHaveLength(3);
    expect(archivable).toHaveLength(0);
  });

  it('archives DONE task files', () => {
    writeTaskJson(root, 'task-143-003.json', 'DONE');
    writeFileSync(join(tasksDir, 'task-143-003.result'), '{}');

    const { archivable, preserved } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-003.json',
      'task-143-003.result',
    ]);

    expect(archivable).toContain('task-143-003.json');
    expect(archivable).toContain('task-143-003.result');
    expect(preserved).toHaveLength(0);
  });

  it('archives NO_GO task files', () => {
    writeTaskJson(root, 'task-143-004.json', 'NO_GO');

    const { archivable } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-004.json',
    ]);

    expect(archivable).toContain('task-143-004.json');
  });

  it('handles mixed statuses correctly', () => {
    writeTaskJson(root, 'task-143-001.json', 'DONE');
    writeTaskJson(root, 'task-143-002.json', 'PENDING');
    writeTaskJson(root, 'task-143-003.json', 'EXECUTING');
    writeTaskJson(root, 'task-143-004.json', 'NO_GO');

    const { archivable, preserved } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-001.json',
      'task-143-002.json',
      'task-143-003.json',
      'task-143-004.json',
    ]);

    expect(archivable).toEqual(expect.arrayContaining(['task-143-001.json', 'task-143-004.json']));
    expect(preserved).toEqual(expect.arrayContaining(['task-143-002.json', 'task-143-003.json']));
    expect(archivable).toHaveLength(2);
    expect(preserved).toHaveLength(2);
  });

  it('archives orphan files without JSON (unknown status)', () => {
    // Only .hb file, no .json — treat as orphan and archive
    writeFileSync(join(tasksDir, 'task-143-005.hb'), '{}');

    const { archivable } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-005.hb',
    ]);

    expect(archivable).toContain('task-143-005.hb');
  });

  it('preserves all file types for active tasks', () => {
    writeTaskJson(root, 'task-143-006.json', 'TESTING');
    writeFileSync(join(tasksDir, 'task-143-006.hb'), '{}');
    writeFileSync(join(tasksDir, 'task-143-006.plan'), 'plan');
    writeFileSync(join(tasksDir, 'task-143-006.result'), '{}');

    const { preserved } = classifyTaskFiles(tasksDir, 'task-143-', [
      'task-143-006.json',
      'task-143-006.hb',
      'task-143-006.plan',
      'task-143-006.result',
    ]);

    expect(preserved).toHaveLength(4);
  });

  it('treats .prompt-* files as always archivable', () => {
    const { archivable } = classifyTaskFiles(tasksDir, 'task-143-', [
      '.prompt-abc123.txt',
    ]);

    expect(archivable).toContain('.prompt-abc123.txt');
  });
});

// ═══ readTaskStatus ═════════════════════════════════════════════════

describe('readTaskStatus', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads status from valid task JSON', () => {
    const filePath = join(root, 'task.json');
    writeFileSync(filePath, JSON.stringify({ id: '143-001', status: 'EXECUTING' }));
    expect(readTaskStatus(filePath)).toBe('EXECUTING');
  });

  it('returns null for invalid JSON', () => {
    const filePath = join(root, 'bad.json');
    writeFileSync(filePath, 'not json');
    expect(readTaskStatus(filePath)).toBeNull();
  });

  it('returns null for missing file', () => {
    expect(readTaskStatus(join(root, 'nonexistent.json'))).toBeNull();
  });
});

// ═══ Restore Roundtrip ══════════════════════════════════════════════

describe('restoreFromSnapshot', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('restores files from a valid snapshot', () => {
    // Create task files
    writeFileSync(join(root, '.tasks', 'task-143-001.json'), '{"status":"DONE"}');
    writeFileSync(join(root, '.tasks', 'task-143-001.result'), '{"taskId":"143-001"}');

    // Create snapshot
    const snapshot = createPreArchiveSnapshot(root, 'sprint-143');
    expect(snapshot).not.toBeNull();

    // Delete originals (simulate archive)
    rmSync(join(root, '.tasks', 'task-143-001.json'));
    rmSync(join(root, '.tasks', 'task-143-001.result'));

    // Restore
    const result = restoreFromSnapshot(root, 'sprint-143');

    expect(result.success).toBe(true);
    expect(result.restoredFiles).toHaveLength(2);
    expect(existsSync(join(root, '.tasks', 'task-143-001.json'))).toBe(true);
    expect(existsSync(join(root, '.tasks', 'task-143-001.result'))).toBe(true);
  });

  it('fails when snapshot does not exist', () => {
    const result = restoreFromSnapshot(root, 'sprint-999');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Snapshot not found');
  });

  it('fails when snapshot hash is corrupted', () => {
    // Create task files and snapshot
    writeFileSync(join(root, '.tasks', 'task-143-001.json'), '{"status":"DONE"}');
    const snapshot = createPreArchiveSnapshot(root, 'sprint-143');
    expect(snapshot).not.toBeNull();

    // Tamper with hash file
    writeFileSync(snapshot!.hashPath, 'badhash000000  sprint-143-pre-archive.tar.gz\n');

    const result = restoreFromSnapshot(root, 'sprint-143');
    expect(result.success).toBe(false);
    expect(result.error).toContain('hash verification failed');
  });
});
