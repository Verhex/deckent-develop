// ═══ Sprint 156 Task 10: Runtime Spawn-Time File Lock ════════════════════
// Covers the new `.spawnlock` API in src/core/file-lock.ts. These locks are
// acquired BEFORE a worker container starts, keyed by taskId (workerId is
// not yet known at that point). They are distinct from the worker-time
// `.lock` files exercised by tests/core/file-lock.test.ts.
//
// Canonical scenario: two workers attempt to spawn for the same file; the
// second one must fail with SpawnLockError carrying the conflicting taskId.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  acquireLock,
  acquireSpawnLock,
  releaseSpawnLock,
  acquireSpawnLocks,
  releaseSpawnLocks,
  releaseAllSpawnLocks,
  checkLocks,
  SpawnLockError,
  type SpawnLockInfo,
} from '../../src/core/file-lock.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `spawn-lock-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function listSpawnLocks(root: string): string[] {
  const dir = join(root, '.locks');
  if (!existsSync(dir)) return [];
  return (readdirSync(dir) as string[]).filter(f => f.endsWith('.spawnlock'));
}

// ═══ acquireSpawnLock ═════════════════════════════════════════════════════

describe('acquireSpawnLock', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('creates a .spawnlock file under .locks/ with taskId metadata', () => {
    const info = acquireSpawnLock(root, '156-010', 'src/core/file-lock.ts');

    expect(info.taskId).toBe('156-010');
    expect(info.filePath).toBe('src/core/file-lock.ts');
    expect(info.acquiredAt).toBeDefined();

    const files = listSpawnLocks(root);
    expect(files.length).toBe(1);

    const raw = readFileSync(join(root, '.locks', files[0]!), 'utf-8');
    const parsed = JSON.parse(raw) as SpawnLockInfo;
    expect(parsed.taskId).toBe('156-010');
    expect(parsed.filePath).toBe('src/core/file-lock.ts');
  });

  it('is idempotent: same taskId re-acquiring returns the existing lock', () => {
    const a = acquireSpawnLock(root, '156-010', 'src/foo.ts');
    const b = acquireSpawnLock(root, '156-010', 'src/foo.ts');

    expect(b.taskId).toBe(a.taskId);
    expect(b.acquiredAt).toBe(a.acquiredAt);
    expect(listSpawnLocks(root).length).toBe(1);
  });

  it('throws SpawnLockError when a different task already holds the lock', () => {
    acquireSpawnLock(root, '156-010', 'src/shared.ts');

    let caught: unknown;
    try {
      acquireSpawnLock(root, '156-011', 'src/shared.ts');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SpawnLockError);
    const lockErr = caught as SpawnLockError;
    expect(lockErr.filePath).toBe('src/shared.ts');
    expect(lockErr.conflictingTaskId).toBe('156-010');
    expect(lockErr.message).toContain('156-010');
  });

  it('canonical scenario: two workers spawn for the same file — second fails', () => {
    // Worker 1 spawns for task 156-010, claims src/orchestra/spawn-backend-docker.ts
    expect(() => acquireSpawnLock(root, '156-010', 'src/orchestra/spawn-backend-docker.ts'))
      .not.toThrow();

    // Worker 2 attempts to spawn for task 156-011, same target — must fail
    expect(() => acquireSpawnLock(root, '156-011', 'src/orchestra/spawn-backend-docker.ts'))
      .toThrow(SpawnLockError);
  });

  it('hash-based filename keeps long paths safely encoded', () => {
    const long = 'src/a/very/deeply/nested/path/with/several/segments/component.ts';
    acquireSpawnLock(root, '156-010', long);

    const files = listSpawnLocks(root);
    expect(files.length).toBe(1);
    // sha256.slice(0,32) → 32 hex chars + ".spawnlock"
    expect(files[0]!).toMatch(/^[0-9a-f]{32}\.spawnlock$/);
  });

  it('recovers from a corrupted spawnlock file (overwrites and acquires)', () => {
    // Simulate a corrupted spawnlock from a prior aborted run.
    mkdirSync(join(root, '.locks'), { recursive: true });
    // We don't know the exact hash, so seed by acquiring then corrupting it.
    acquireSpawnLock(root, '156-010', 'src/foo.ts');
    const files = listSpawnLocks(root);
    const lockPath = join(root, '.locks', files[0]!);
    writeFileSync(lockPath, '{ corrupted JSON', 'utf-8');

    // A new acquire should overwrite the corrupted file rather than crash.
    expect(() => acquireSpawnLock(root, '156-099', 'src/foo.ts')).not.toThrow();
    const after = JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
    expect(after.taskId).toBe('156-099');
  });
});

// ═══ releaseSpawnLock ═════════════════════════════════════════════════════

describe('releaseSpawnLock', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('removes the lock so a different task can acquire it', () => {
    acquireSpawnLock(root, '156-010', 'src/foo.ts');
    releaseSpawnLock(root, '156-010', 'src/foo.ts');

    expect(listSpawnLocks(root).length).toBe(0);

    // Different task acquires successfully now
    expect(() => acquireSpawnLock(root, '156-099', 'src/foo.ts')).not.toThrow();
  });

  it('is a no-op when the lock does not exist', () => {
    expect(() => releaseSpawnLock(root, '156-010', 'src/nonexistent.ts')).not.toThrow();
  });

  it('refuses to delete a lock owned by a different task', () => {
    acquireSpawnLock(root, '156-010', 'src/foo.ts');
    // Attempt to release as a different task — silently ignored
    releaseSpawnLock(root, '156-099', 'src/foo.ts');

    expect(listSpawnLocks(root).length).toBe(1);
    // Original owner can still release
    releaseSpawnLock(root, '156-010', 'src/foo.ts');
    expect(listSpawnLocks(root).length).toBe(0);
  });
});

// ═══ acquireSpawnLocks (batch) ════════════════════════════════════════════

describe('acquireSpawnLocks (batch with rollback)', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('acquires all files when none conflict', () => {
    const out = acquireSpawnLocks(root, '156-010', ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(out.length).toBe(3);
    expect(listSpawnLocks(root).length).toBe(3);
  });

  it('rolls back previously-acquired locks when a later file conflicts', () => {
    // Pre-existing conflict on src/b.ts owned by a different task
    acquireSpawnLock(root, '156-099', 'src/b.ts');
    expect(listSpawnLocks(root).length).toBe(1);

    let caught: unknown;
    try {
      acquireSpawnLocks(root, '156-010', ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SpawnLockError);
    // Only the pre-existing 156-099 lock should remain; src/a.ts must
    // have been rolled back and src/c.ts never acquired.
    const remaining = listSpawnLocks(root);
    expect(remaining.length).toBe(1);
    const onlyLock = JSON.parse(
      readFileSync(join(root, '.locks', remaining[0]!), 'utf-8'),
    ) as SpawnLockInfo;
    expect(onlyLock.taskId).toBe('156-099');
  });

  it('empty file list returns empty array and creates no locks', () => {
    const out = acquireSpawnLocks(root, '156-010', []);
    expect(out).toEqual([]);
    expect(listSpawnLocks(root).length).toBe(0);
  });
});

// ═══ releaseSpawnLocks + releaseAllSpawnLocks ═════════════════════════════

describe('releaseSpawnLocks / releaseAllSpawnLocks', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('releaseSpawnLocks removes the specified batch', () => {
    acquireSpawnLocks(root, '156-010', ['src/a.ts', 'src/b.ts']);
    releaseSpawnLocks(root, '156-010', ['src/a.ts', 'src/b.ts']);
    expect(listSpawnLocks(root).length).toBe(0);
  });

  it('releaseAllSpawnLocks removes only the calling task\'s locks', () => {
    acquireSpawnLocks(root, '156-010', ['src/a.ts', 'src/b.ts']);
    acquireSpawnLocks(root, '156-099', ['src/c.ts']);

    const released = releaseAllSpawnLocks(root, '156-010');
    expect(released).toBe(2);

    const remaining = listSpawnLocks(root);
    expect(remaining.length).toBe(1);
    const onlyLock = JSON.parse(
      readFileSync(join(root, '.locks', remaining[0]!), 'utf-8'),
    ) as SpawnLockInfo;
    expect(onlyLock.taskId).toBe('156-099');
  });

  it('releaseAllSpawnLocks returns 0 when nothing matches the task', () => {
    acquireSpawnLock(root, '156-099', 'src/foo.ts');
    expect(releaseAllSpawnLocks(root, '156-010')).toBe(0);
    expect(listSpawnLocks(root).length).toBe(1);
  });

  it('releaseAllSpawnLocks tolerates a missing .locks/ directory', () => {
    expect(releaseAllSpawnLocks(root, '156-010')).toBe(0);
  });

  // Sprint 156 Task 10 (fix): regression for the docker-backend leak. If a
  // caller acquires spawn locks and then a downstream step (docker run,
  // prompt write, etc.) fails, releaseAllSpawnLocks must fully clear the
  // task's lock set so a different task can claim the same files on retry.
  it('cleanup-on-failure: releaseAllSpawnLocks unblocks a different task after a simulated failure', () => {
    // Step 1: original spawn attempt acquires a batch
    acquireSpawnLocks(root, '156-010', ['src/a.ts', 'src/b.ts']);
    expect(listSpawnLocks(root).length).toBe(2);

    // Step 2: simulate the docker-backend failure path — caller releases
    // every spawn lock owned by the failing task.
    const released = releaseAllSpawnLocks(root, '156-010');
    expect(released).toBe(2);
    expect(listSpawnLocks(root).length).toBe(0);

    // Step 3: a different task (e.g. the fix worker spawned in a new wave)
    // must now be able to claim the same files. Without the cleanup this
    // would throw SpawnLockError.
    expect(() => acquireSpawnLocks(root, '156-010-fix', ['src/a.ts', 'src/b.ts']))
      .not.toThrow();
    expect(listSpawnLocks(root).length).toBe(2);
  });
});

// ═══ Coexistence with worker-time `.lock` files ═══════════════════════════
//
// Existing helpers (checkLocks / clearStaleLocks / clearOrphanLocks) filter
// by `.endsWith('.lock')` and must NOT pick up `.spawnlock` files.

describe('coexistence with worker-time .lock files', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('checkLocks() does not surface .spawnlock entries', () => {
    acquireSpawnLock(root, '156-010', 'src/foo.ts');
    acquireLock(root, 'src/bar.ts', 'worker-1', '156-011');

    const workerLocks = checkLocks(root);
    expect(workerLocks.length).toBe(1);
    expect(workerLocks[0]!.filePath).toBe('src/bar.ts');
  });

  it('both lock kinds can coexist on the same file system entry', () => {
    // Spawn lock for task A on a file, worker lock for a different file —
    // they live side-by-side without interfering.
    acquireSpawnLock(root, '156-010', 'src/foo.ts');
    acquireLock(root, 'src/baz.ts', 'worker-2', '156-099');

    const allFiles = readdirSync(join(root, '.locks')) as string[];
    expect(allFiles.length).toBe(2);
    expect(allFiles.some(f => f.endsWith('.spawnlock'))).toBe(true);
    expect(allFiles.some(f => f.endsWith('.lock') && !f.endsWith('.spawnlock'))).toBe(true);
  });
});
