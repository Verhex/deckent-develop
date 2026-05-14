// ═══ SpawnLock Orphan Cleanup Tests ═══════════════════════════════════
// Sprint 168 C0b — RC4 Bug E SpawnLock symmetric cleanup
// Phase 2 §141 5-helper gap (Cluster B Locking Asymmetry).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireSpawnLock,
  checkSpawnLock,
  checkSpawnLocks,
  clearOrphanSpawnLocks,
  releaseStaleSpawnLocksForTask,
} from '../../src/core/file-lock.js';

describe('SpawnLock orphan cleanup (Sprint 168 C0b)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-spawn-lock-orphan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('cleans orphan spawn locks for tasks not in activeTaskIds', () => {
    acquireSpawnLock(testRoot, '168-001', './test1.ts');
    acquireSpawnLock(testRoot, '168-002', './test2.ts');

    // Only 168-001 active, 168-002 is orphan
    const cleared = clearOrphanSpawnLocks(testRoot, ['168-001']);

    expect(cleared).toBe(1);
    // After cleanup only the 168-001 spawnlock remains
    const spawnlocks = readdirSync(join(testRoot, '.locks')).filter(f => f.endsWith('.spawnlock'));
    expect(spawnlocks.length).toBe(1);
  });

  it('preserves all locks if all tasks active', () => {
    acquireSpawnLock(testRoot, '168-001', './test1.ts');
    acquireSpawnLock(testRoot, '168-002', './test2.ts');
    const cleared = clearOrphanSpawnLocks(testRoot, ['168-001', '168-002']);
    expect(cleared).toBe(0);
    const spawnlocks = readdirSync(join(testRoot, '.locks')).filter(f => f.endsWith('.spawnlock'));
    expect(spawnlocks.length).toBe(2);
  });

  it('clears all if activeTaskIds empty', () => {
    acquireSpawnLock(testRoot, '168-001', './test1.ts');
    acquireSpawnLock(testRoot, '168-002', './test2.ts');
    const cleared = clearOrphanSpawnLocks(testRoot, []);
    expect(cleared).toBe(2);
    const spawnlocks = existsSync(join(testRoot, '.locks'))
      ? readdirSync(join(testRoot, '.locks')).filter(f => f.endsWith('.spawnlock'))
      : [];
    expect(spawnlocks.length).toBe(0);
  });

  it('returns 0 when no spawnlocks exist', () => {
    const cleared = clearOrphanSpawnLocks(testRoot, ['168-001']);
    expect(cleared).toBe(0);
  });

  it('checkSpawnLock returns lock info when held, null otherwise', () => {
    expect(checkSpawnLock(testRoot, './foo.ts')).toBeNull();
    acquireSpawnLock(testRoot, '168-001', './foo.ts');
    const info = checkSpawnLock(testRoot, './foo.ts');
    expect(info).not.toBeNull();
    expect(info?.taskId).toBe('168-001');
    expect(info?.filePath).toBe('./foo.ts');
  });

  it('checkSpawnLocks lists every held spawn lock', () => {
    expect(checkSpawnLocks(testRoot)).toEqual([]);
    acquireSpawnLock(testRoot, '168-001', './a.ts');
    acquireSpawnLock(testRoot, '168-002', './b.ts');
    const locks = checkSpawnLocks(testRoot);
    expect(locks.length).toBe(2);
    const ids = locks.map(l => l.taskId).sort();
    expect(ids).toEqual(['168-001', '168-002']);
  });

  it('releaseStaleSpawnLocksForTask releases every lock owned by the task', () => {
    acquireSpawnLock(testRoot, '168-001', './a.ts');
    acquireSpawnLock(testRoot, '168-001', './b.ts');
    acquireSpawnLock(testRoot, '168-002', './c.ts');

    releaseStaleSpawnLocksForTask(testRoot, '168-001');

    const remaining = checkSpawnLocks(testRoot);
    expect(remaining.length).toBe(1);
    expect(remaining[0].taskId).toBe('168-002');
  });

  it('releaseStaleSpawnLocksForTask is no-op for unknown taskId', () => {
    acquireSpawnLock(testRoot, '168-001', './a.ts');
    releaseStaleSpawnLocksForTask(testRoot, '168-999');
    const remaining = checkSpawnLocks(testRoot);
    expect(remaining.length).toBe(1);
  });
});
