// ═══ File Lock Tests ═══════════════════════════════════════════════
// Sprint 138 — Task 004: Core file lock system

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireLock,
  releaseLock,
  checkLock,
  checkLocks,
  releaseAllLocks,
  clearStaleLocks,
  clearOrphanLocks,
  LockError,
} from '../../src/core/file-lock.js';

describe('file-lock', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-file-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── acquireLock ───────────────────────────────────────────────

  it('should acquire a lock on a file', () => {
    const lock = acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    expect(lock.filePath).toBe('src/foo.ts');
    expect(lock.ownerWorkerId).toBe('w-001');
    expect(lock.taskId).toBe('001');
    expect(lock.acquiredAt).toBeDefined();
  });

  it('should be idempotent for same worker', () => {
    const lock1 = acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    const lock2 = acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    expect(lock1.ownerWorkerId).toBe(lock2.ownerWorkerId);
  });

  it('should throw LockError for different worker', () => {
    acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    expect(() => {
      acquireLock(testRoot, 'src/foo.ts', 'w-002', '002');
    }).toThrow(LockError);
  });

  it('should support optional TTL', () => {
    const lock = acquireLock(testRoot, 'src/bar.ts', 'w-001', '001', 5000);
    expect(lock.filePath).toBe('src/bar.ts');
    // TTL is stored in the lock file
    const lockDir = join(testRoot, '.locks');
    const lockFiles = require('node:fs').readdirSync(lockDir) as string[];
    const lockData = JSON.parse(readFileSync(join(lockDir, lockFiles[0]), 'utf-8'));
    expect(lockData.ttl).toBe(5000);
  });

  // ─── releaseLock ───────────────────────────────────────────────

  it('should release a lock', () => {
    acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    releaseLock(testRoot, 'src/foo.ts', 'w-001');
    expect(checkLock(testRoot, 'src/foo.ts')).toBeNull();
  });

  it('should be no-op for non-existent lock', () => {
    // Should not throw
    releaseLock(testRoot, 'src/nonexistent.ts', 'w-001');
  });

  it('should throw when releasing another worker\'s lock', () => {
    acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    expect(() => {
      releaseLock(testRoot, 'src/foo.ts', 'w-002');
    }).toThrow(LockError);
  });

  // ─── checkLock ─────────────────────────────────────────────────

  it('should return null for unlocked file', () => {
    expect(checkLock(testRoot, 'src/foo.ts')).toBeNull();
  });

  it('should return LockInfo for locked file', () => {
    acquireLock(testRoot, 'src/foo.ts', 'w-001', '001');
    const lock = checkLock(testRoot, 'src/foo.ts');
    expect(lock).not.toBeNull();
    expect(lock!.ownerWorkerId).toBe('w-001');
  });

  // ─── checkLocks (list all) ────────────────────────────────────

  it('should list all active locks', () => {
    acquireLock(testRoot, 'src/a.ts', 'w-001', '001');
    acquireLock(testRoot, 'src/b.ts', 'w-002', '002');

    const locks = checkLocks(testRoot);
    expect(locks).toHaveLength(2);
    const files = locks.map(l => l.filePath).sort();
    expect(files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('should return empty array when no locks exist', () => {
    expect(checkLocks(testRoot)).toEqual([]);
  });

  // ─── releaseAllLocks ──────────────────────────────────────────

  it('should release all locks for a worker', () => {
    acquireLock(testRoot, 'src/a.ts', 'w-001', '001');
    acquireLock(testRoot, 'src/b.ts', 'w-001', '001');
    acquireLock(testRoot, 'src/c.ts', 'w-002', '002');

    const released = releaseAllLocks(testRoot, 'w-001');
    expect(released).toBe(2);

    const remaining = checkLocks(testRoot);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].ownerWorkerId).toBe('w-002');
  });

  // ─── clearStaleLocks ──────────────────────────────────────────

  it('should clear stale locks older than maxAgeMs', () => {
    // Create a lock with old timestamp
    mkdirSync(join(testRoot, '.locks'), { recursive: true });
    const oldLock = {
      filePath: 'src/old.ts',
      ownerWorkerId: 'w-001',
      acquiredAt: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
      taskId: '001',
    };
    writeFileSync(
      join(testRoot, '.locks', 'src__old.ts.lock'),
      JSON.stringify(oldLock),
      'utf-8',
    );

    // Create a fresh lock
    acquireLock(testRoot, 'src/new.ts', 'w-002', '002');

    const removed = clearStaleLocks(testRoot, 300_000); // 5 min threshold
    expect(removed).toBe(1);

    const remaining = checkLocks(testRoot);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].filePath).toBe('src/new.ts');
  });

  it('should respect TTL over maxAgeMs', () => {
    // Create a lock with TTL that hasn't expired
    mkdirSync(join(testRoot, '.locks'), { recursive: true });
    const lockWithTTL = {
      filePath: 'src/ttl.ts',
      ownerWorkerId: 'w-001',
      acquiredAt: new Date(Date.now() - 10_000).toISOString(), // 10s ago
      taskId: '001',
      ttl: 60_000, // TTL is 60s, so not stale
    };
    writeFileSync(
      join(testRoot, '.locks', 'src__ttl.ts.lock'),
      JSON.stringify(lockWithTTL),
      'utf-8',
    );

    const removed = clearStaleLocks(testRoot, 5_000); // maxAge is 5s but TTL overrides
    expect(removed).toBe(0);
  });

  it('should return 0 when no locks directory exists', () => {
    expect(clearStaleLocks(testRoot, 300_000)).toBe(0);
  });

  // ─── clearOrphanLocks ─────────────────────────────────────────

  it('clearOrphanLocks: returns empty when no locks directory exists', () => {
    const released = clearOrphanLocks(testRoot, new Set(['w-001']));
    expect(released).toEqual([]);
  });

  it('clearOrphanLocks: returns empty when all locks belong to active workers', () => {
    acquireLock(testRoot, 'src/a.ts', 'w-001', '001');
    acquireLock(testRoot, 'src/b.ts', 'w-002', '002');

    const released = clearOrphanLocks(testRoot, new Set(['w-001', 'w-002']));
    expect(released).toEqual([]);
    // Both locks still exist
    expect(checkLock(testRoot, 'src/a.ts')).not.toBeNull();
    expect(checkLock(testRoot, 'src/b.ts')).not.toBeNull();
  });

  it('clearOrphanLocks: releases locks for dead workers', () => {
    acquireLock(testRoot, 'src/a.ts', 'w-001', '001');
    acquireLock(testRoot, 'src/dead.ts', 'w-dead', 'dead-001');

    // Only w-001 is active; w-dead is not
    const released = clearOrphanLocks(testRoot, new Set(['w-001']));

    expect(released).toHaveLength(1);
    expect(released[0]).toBe('src/dead.ts');
    // w-001's lock untouched
    expect(checkLock(testRoot, 'src/a.ts')).not.toBeNull();
    // w-dead's lock removed
    expect(checkLock(testRoot, 'src/dead.ts')).toBeNull();
  });

  it('clearOrphanLocks: releases all locks when active set is empty', () => {
    acquireLock(testRoot, 'src/x.ts', 'w-001', '001');
    acquireLock(testRoot, 'src/y.ts', 'w-002', '002');

    const released = clearOrphanLocks(testRoot, new Set());
    expect(released).toHaveLength(2);
    expect(checkLocks(testRoot)).toHaveLength(0);
  });

  it('clearOrphanLocks: skips corrupted lock files gracefully', () => {
    // Create a corrupted lock file manually
    const locksDir = join(testRoot, '.locks');
    mkdirSync(locksDir, { recursive: true });
    writeFileSync(join(locksDir, 'corrupt.lock'), 'not json', 'utf-8');

    // Should not throw — corrupted file is skipped
    const released = clearOrphanLocks(testRoot, new Set());
    expect(released).toEqual([]);
  });
});
