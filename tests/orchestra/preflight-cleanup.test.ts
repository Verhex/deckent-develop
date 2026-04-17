// ═══ Preflight Cleanup Integration Tests ═══════════════════════════
// Sprint 144 Task 018: Integration tests for pre-flight + post-finalize
// orchestration wiring.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  postFinalizeCleanup,
  preflightOrphanCleanup,
} from '../../src/core/orphan-cleaner.js';

function createProjectRoot(): string {
  const root = join(tmpdir(), `deckent-preflight-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  return root;
}

function writeTask(root: string, taskId: string, status: string): void {
  const json = { id: taskId, status, title: `Test task ${taskId}` };
  writeFileSync(join(root, '.tasks', `${taskId}.json`), JSON.stringify(json));
  writeFileSync(join(root, '.tasks', `${taskId}.hb`), JSON.stringify({ taskId }));
  if (status === 'DONE' || status === 'NO_GO') {
    writeFileSync(join(root, '.tasks', `${taskId}.result`), JSON.stringify({ taskId, selfAssessment: status }));
  }
}

function writeLock(root: string, filePath: string, workerId: string, ageMs: number): void {
  const lock = {
    filePath,
    ownerWorkerId: workerId,
    acquiredAt: new Date(Date.now() - ageMs).toISOString(),
    taskId: '001',
  };
  const lockName = filePath.replace(/[/\\]/g, '__') + '.lock';
  writeFileSync(join(root, '.locks', lockName), JSON.stringify(lock));
}

// ─── Integration Tests ─────────────────────────────────────────────

describe('preflight-cleanup integration', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createProjectRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('should simulate full sprint lifecycle: finalize sprint-143, then preflight sprint-144', () => {
    // Sprint 143 ran — tasks DONE
    writeTask(testRoot, 'task-143-001', 'DONE');
    writeTask(testRoot, 'task-143-002', 'NO_GO');
    writeTask(testRoot, 'task-143-003', 'EXECUTING'); // Still active

    // Post-finalize: archive terminal, preserve active
    const postReport = postFinalizeCleanup(testRoot, 'sprint-143');
    expect(postReport.archivedFiles.length).toBeGreaterThan(0);
    expect(postReport.preservedFiles.length).toBeGreaterThan(0);

    // task-143-003 should still be in .tasks/
    expect(existsSync(join(testRoot, '.tasks', 'task-143-003.json'))).toBe(true);

    // Now sprint-144 starts — preflight should clean remaining task-143-003
    const preReport = preflightOrphanCleanup(testRoot, 'sprint-144');
    expect(preReport.performed).toBe(true);
    expect(preReport.archivedFiles.length).toBeGreaterThan(0);

    // .tasks/ should only have archive dirs, no orphan files
    const remaining = readdirSync(join(testRoot, '.tasks'))
      .filter(f => f.startsWith('task-') && !f.startsWith('task-144'));
    expect(remaining.length).toBe(0);
  });

  it('should preserve fresh locks and clean stale ones during post-finalize', () => {
    writeTask(testRoot, 'task-144-001', 'DONE');

    // Stale lock (10 min old)
    writeLock(testRoot, 'src/old.ts', 'w-dead', 10 * 60 * 1000);
    // Fresh lock (1 min old)
    writeLock(testRoot, 'src/fresh.ts', 'w-alive', 1 * 60 * 1000);

    const report = postFinalizeCleanup(testRoot, 'sprint-144');

    expect(report.staleLocksCleaned).toBe(1);
    // Fresh lock should survive
    expect(existsSync(join(testRoot, '.locks', 'src__fresh.ts.lock'))).toBe(true);
    // Stale lock should be gone
    expect(existsSync(join(testRoot, '.locks', 'src__old.ts.lock'))).toBe(false);
  });

  it('should handle empty .tasks/ during preflight', () => {
    const report = preflightOrphanCleanup(testRoot, 'sprint-145');
    expect(report.performed).toBe(true);
    expect(report.archivedFiles.length).toBe(0);
  });

  it('should create separate archive dirs per sprint', () => {
    writeTask(testRoot, 'task-141-001', 'DONE');
    writeTask(testRoot, 'task-142-001', 'DONE');
    writeTask(testRoot, 'task-143-001', 'DONE');

    const report = preflightOrphanCleanup(testRoot, 'sprint-144');

    expect(report.cleanedSprintIds.length).toBe(3);

    const archiveDir = join(testRoot, '.tasks', 'archive');
    const dirs = readdirSync(archiveDir);
    expect(dirs).toContain('sprint-141');
    expect(dirs).toContain('sprint-142');
    expect(dirs).toContain('sprint-143');
  });
});
