// ═══ Orphan Cleaner Tests ══════════════════════════════════════════
// Sprint 144 Task 018: Post-finalize + Pre-flight orphan cleanup

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  postFinalizeCleanup,
  preflightOrphanCleanup,
} from '../../src/core/orphan-cleaner.js';

function createTestRoot(): string {
  const root = join(tmpdir(), `deckent-orphan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  return root;
}

function writeTaskJson(root: string, taskId: string, status: string): void {
  writeFileSync(
    join(root, '.tasks', `${taskId}.json`),
    JSON.stringify({ id: taskId, status }),
  );
}

function writeTaskHb(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `${taskId}.hb`),
    JSON.stringify({ taskId, timestamp: new Date().toISOString() }),
  );
}

function writeTaskResult(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `${taskId}.result`),
    JSON.stringify({ taskId, selfAssessment: 'DONE' }),
  );
}

// ─── Post-Finalize Tests ───────────────────────────────────────────

describe('postFinalizeCleanup', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('should archive DONE task files to .tasks/archive/sprint-NNN/', () => {
    writeTaskJson(testRoot, 'task-144-001', 'DONE');
    writeTaskHb(testRoot, 'task-144-001');
    writeTaskResult(testRoot, 'task-144-001');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(3);
    expect(report.preservedFiles.length).toBe(0);

    const archiveDir = join(testRoot, '.tasks', 'archive', 'sprint-144');
    expect(existsSync(join(archiveDir, 'task-144-001.json'))).toBe(true);
    expect(existsSync(join(archiveDir, 'task-144-001.hb'))).toBe(true);
    expect(existsSync(join(archiveDir, 'task-144-001.result'))).toBe(true);

    // Original files should be gone
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(false);
  });

  it('should archive NO_GO task files', () => {
    writeTaskJson(testRoot, 'task-144-002', 'NO_GO');
    writeTaskResult(testRoot, 'task-144-002');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(2);
    expect(report.preservedFiles.length).toBe(0);
  });

  it('should preserve EXECUTING task files', () => {
    writeTaskJson(testRoot, 'task-144-003', 'EXECUTING');
    writeTaskHb(testRoot, 'task-144-003');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(0);
    expect(report.preservedFiles.length).toBe(2);

    // Original files should still exist
    expect(existsSync(join(testRoot, '.tasks', 'task-144-003.json'))).toBe(true);
    expect(existsSync(join(testRoot, '.tasks', 'task-144-003.hb'))).toBe(true);
  });

  it('should preserve PENDING task files', () => {
    writeTaskJson(testRoot, 'task-144-004', 'PENDING');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(0);
    expect(report.preservedFiles.length).toBe(1);
  });

  it('should clean stale locks (>5min)', () => {
    // Create a stale lock (timestamp in the past)
    const staleLock = {
      filePath: 'src/foo.ts',
      ownerWorkerId: 'w-dead',
      acquiredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10min ago
      taskId: '144-001',
    };
    writeFileSync(
      join(testRoot, '.locks', 'src__foo.ts.lock'),
      JSON.stringify(staleLock),
    );

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.staleLocksCleaned).toBe(1);
    expect(existsSync(join(testRoot, '.locks', 'src__foo.ts.lock'))).toBe(false);
  });

  it('should handle missing .tasks/ gracefully', () => {
    rmSync(join(testRoot, '.tasks'), { recursive: true });
    const report = postFinalizeCleanup(testRoot, 'sprint-144');
    expect(report.archivedFiles.length).toBe(0);
  });

  it('should handle invalid sprintId gracefully', () => {
    const report = postFinalizeCleanup(testRoot, 'invalid-id');
    expect(report.archivedFiles.length).toBe(0);
  });

  it('should archive tasks with unknown status (missing .json)', () => {
    // Only .hb file, no .json — unknown status → archive
    writeTaskHb(testRoot, 'task-144-005');

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.archivedFiles.length).toBe(1);
  });
});

// ─── Pre-flight Tests ──────────────────────────────────────────────

describe('preflightOrphanCleanup', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('should move previous sprint files to archive', () => {
    // Sprint 143 leftover files
    writeTaskJson(testRoot, 'task-143-001', 'DONE');
    writeTaskHb(testRoot, 'task-143-001');
    // Sprint 144 current files (should be kept)
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(2);
    expect(report.cleanedSprintIds).toContain('sprint-143');

    // Sprint 143 files archived
    const archiveDir = join(testRoot, '.tasks', 'archive', 'sprint-143');
    expect(existsSync(join(archiveDir, 'task-143-001.json'))).toBe(true);

    // Sprint 144 files preserved
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(true);
  });

  it('should skip cleanup if another live sprint pid exists', () => {
    // Create a PID file for sprint-143 with our own PID (alive)
    mkdirSync(join(testRoot, '.deckent', 'pids'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'pids', 'sprint-143.pid'),
      JSON.stringify({ pid: process.pid, sprintId: 'sprint-143' }),
    );

    writeTaskJson(testRoot, 'task-143-001', 'DONE');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(false);
    expect(report.skipReason).toContain('Live sprint detected');
    // Files should NOT be moved
    expect(existsSync(join(testRoot, '.tasks', 'task-143-001.json'))).toBe(true);
  });

  it('should proceed if pid file references a dead process', () => {
    // Create a PID file with a dead PID (99999999)
    mkdirSync(join(testRoot, '.deckent', 'pids'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'pids', 'sprint-143.pid'),
      JSON.stringify({ pid: 99999999, sprintId: 'sprint-143' }),
    );

    writeTaskJson(testRoot, 'task-143-001', 'DONE');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(1);
  });

  it('should handle no orphan files gracefully', () => {
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(0);
  });

  it('should handle invalid sprintId', () => {
    const report = preflightOrphanCleanup(testRoot, 'bad-id');
    expect(report.performed).toBe(false);
    expect(report.skipReason).toContain('Cannot extract sprint number');
  });

  it('should clean files from multiple previous sprints', () => {
    writeTaskJson(testRoot, 'task-142-001', 'DONE');
    writeTaskJson(testRoot, 'task-143-001', 'DONE');
    writeTaskJson(testRoot, 'task-144-001', 'PENDING');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(2);
    expect(report.cleanedSprintIds).toContain('sprint-142');
    expect(report.cleanedSprintIds).toContain('sprint-143');
    expect(existsSync(join(testRoot, '.tasks', 'task-144-001.json'))).toBe(true);
  });
});
