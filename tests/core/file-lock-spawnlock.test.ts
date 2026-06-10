// ═══ Spawn-Lock Stale Cleanup Tests ═══════════════════════════════
// Covers clearStaleSpawnLocks, clearOrphanSpawnLocks, checkSpawnLocks.
// All I/O uses tmpdir — hermetic, no project-root state.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireSpawnLock,
  releaseSpawnLock,
  checkSpawnLocks,
  clearStaleSpawnLocks,
  clearOrphanSpawnLocks,
  releaseStaleSpawnLocksForTask,
} from '../../src/core/file-lock.js';
import { LOCKS_DIR } from '../../src/core/constants.js';

function makeRoot(): string {
  return join(tmpdir(), `deckent-sl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function writeStaleSpawnLock(root: string, file: string, taskId: string, ageMs: number): void {
  // Acquire normally, then overwrite acquiredAt with a past timestamp
  const info = acquireSpawnLock(root, taskId, file);
  const locksDir = join(root, LOCKS_DIR);
  // Re-read the lock file path via acquireSpawnLock (idempotent) and overwrite
  // We can't call spawnLockPathFor (private), so we list the dir and find the new file
  const { readdirSync, readFileSync } = require('node:fs');
  const files = readdirSync(locksDir).filter((f: string) => f.endsWith('.spawnlock'));
  for (const f of files) {
    const p = join(locksDir, f);
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8'));
      if (parsed.taskId === taskId && parsed.filePath === file) {
        const staleTs = new Date(Date.now() - ageMs).toISOString();
        writeFileSync(p, JSON.stringify({ ...parsed, acquiredAt: staleTs }, null, 2));
        return;
      }
    } catch { /* skip */ }
  }
}

describe('clearStaleSpawnLocks', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeRoot();
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('removes a stale spawn lock older than maxAgeMs', () => {
    writeStaleSpawnLock(testRoot, 'src/foo.ts', 't-001', 10 * 60 * 1000); // 10 min old
    const before = checkSpawnLocks(testRoot);
    expect(before).toHaveLength(1);

    const cleared = clearStaleSpawnLocks(testRoot, 5 * 60 * 1000); // 5 min threshold
    expect(cleared).toBe(1);
    expect(checkSpawnLocks(testRoot)).toHaveLength(0);
  });

  it('keeps a fresh spawn lock younger than maxAgeMs', () => {
    acquireSpawnLock(testRoot, 't-002', 'src/bar.ts'); // just acquired = fresh
    const cleared = clearStaleSpawnLocks(testRoot, 5 * 60 * 1000);
    expect(cleared).toBe(0);
    expect(checkSpawnLocks(testRoot)).toHaveLength(1);
  });

  it('removes only stale locks in a mixed set', () => {
    writeStaleSpawnLock(testRoot, 'src/stale1.ts', 't-stale-1', 10 * 60 * 1000);
    writeStaleSpawnLock(testRoot, 'src/stale2.ts', 't-stale-2', 10 * 60 * 1000);
    acquireSpawnLock(testRoot, 't-fresh', 'src/fresh.ts');

    const cleared = clearStaleSpawnLocks(testRoot, 5 * 60 * 1000);
    expect(cleared).toBe(2);
    const remaining = checkSpawnLocks(testRoot);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].taskId).toBe('t-fresh');
  });

  it('returns 0 when no locks directory exists', () => {
    const emptyRoot = makeRoot(); // never created
    const cleared = clearStaleSpawnLocks(emptyRoot, 5 * 60 * 1000);
    expect(cleared).toBe(0);
  });

  it('skips corrupted spawnlock files without throwing', () => {
    mkdirSync(join(testRoot, LOCKS_DIR), { recursive: true });
    writeFileSync(join(testRoot, LOCKS_DIR, 'corrupted.spawnlock'), 'not-valid-json');
    expect(() => clearStaleSpawnLocks(testRoot, 5 * 60 * 1000)).not.toThrow();
    expect(clearStaleSpawnLocks(testRoot, 5 * 60 * 1000)).toBe(0);
  });
});

describe('clearOrphanSpawnLocks', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeRoot();
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('removes a spawn lock whose taskId is not in the active set', () => {
    acquireSpawnLock(testRoot, 't-dead', 'src/orphan.ts');
    const cleared = clearOrphanSpawnLocks(testRoot, ['t-active']);
    expect(cleared).toBe(1);
    expect(checkSpawnLocks(testRoot)).toHaveLength(0);
  });

  it('keeps a spawn lock whose taskId is in the active set', () => {
    acquireSpawnLock(testRoot, 't-active', 'src/active.ts');
    const cleared = clearOrphanSpawnLocks(testRoot, ['t-active']);
    expect(cleared).toBe(0);
    expect(checkSpawnLocks(testRoot)).toHaveLength(1);
  });

  it('handles mixed active and orphan locks correctly', () => {
    acquireSpawnLock(testRoot, 't-active', 'src/active.ts');
    acquireSpawnLock(testRoot, 't-dead-1', 'src/dead1.ts');
    acquireSpawnLock(testRoot, 't-dead-2', 'src/dead2.ts');

    const cleared = clearOrphanSpawnLocks(testRoot, ['t-active']);
    expect(cleared).toBe(2);
    const remaining = checkSpawnLocks(testRoot);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].taskId).toBe('t-active');
  });
});

describe('checkSpawnLocks', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeRoot();
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('lists all active spawn locks', () => {
    acquireSpawnLock(testRoot, 't-001', 'src/a.ts');
    acquireSpawnLock(testRoot, 't-002', 'src/b.ts');
    const locks = checkSpawnLocks(testRoot);
    expect(locks).toHaveLength(2);
    const taskIds = locks.map(l => l.taskId).sort();
    expect(taskIds).toEqual(['t-001', 't-002']);
  });

  it('returns empty array when no locks exist', () => {
    expect(checkSpawnLocks(testRoot)).toHaveLength(0);
  });
});

describe('releaseStaleSpawnLocksForTask', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeRoot();
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('releases all spawn locks for the given taskId only', () => {
    acquireSpawnLock(testRoot, 't-target', 'src/x.ts');
    acquireSpawnLock(testRoot, 't-target', 'src/y.ts');
    acquireSpawnLock(testRoot, 't-other', 'src/z.ts');

    releaseStaleSpawnLocksForTask(testRoot, 't-target');
    const remaining = checkSpawnLocks(testRoot);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].taskId).toBe('t-other');
  });
});
