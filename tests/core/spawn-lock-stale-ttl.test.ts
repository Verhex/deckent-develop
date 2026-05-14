// ═══ SpawnLock Stale TTL Tests ═══════════════════════════════════════
// Sprint 168 C0b — RC4 Bug E SpawnLock symmetric cleanup
// TTL-based stale cleanup helper (5-min default).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireSpawnLock,
  clearStaleSpawnLocks,
  checkSpawnLocks,
} from '../../src/core/file-lock.js';

/**
 * Helper: rewrite the spawnlock file's acquiredAt timestamp to simulate aging
 * without needing to wait wall-clock time.
 */
function ageSpawnLock(testRoot: string, ageMs: number): number {
  const locksDir = join(testRoot, '.locks');
  if (!existsSync(locksDir)) return 0;
  const files = readdirSync(locksDir).filter(f => f.endsWith('.spawnlock'));
  let mutated = 0;
  const fakePast = new Date(Date.now() - ageMs).toISOString();
  for (const file of files) {
    const p = join(locksDir, file);
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as { acquiredAt: string };
      raw.acquiredAt = fakePast;
      writeFileSync(p, JSON.stringify(raw, null, 2), 'utf-8');
      mutated++;
    } catch { /* best-effort */ }
  }
  return mutated;
}

describe('SpawnLock stale TTL cleanup (Sprint 168 C0b)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-spawn-lock-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('removes spawn locks older than maxAgeMs', () => {
    acquireSpawnLock(testRoot, '168-001', './aged.ts');
    acquireSpawnLock(testRoot, '168-002', './fresh.ts');

    // Age only 168-001 beyond 5min TTL (10 minutes back)
    const locksDir = join(testRoot, '.locks');
    const files = readdirSync(locksDir).filter(f => f.endsWith('.spawnlock'));
    expect(files.length).toBe(2);
    // Age the FIRST spawnlock only (deterministic by sort order)
    const sortedFiles = [...files].sort();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const path1 = join(locksDir, sortedFiles[0]);
    const raw = JSON.parse(readFileSync(path1, 'utf-8'));
    raw.acquiredAt = tenMinAgo;
    writeFileSync(path1, JSON.stringify(raw, null, 2), 'utf-8');

    const cleared = clearStaleSpawnLocks(testRoot, 5 * 60 * 1000);
    expect(cleared).toBe(1);
    const remaining = checkSpawnLocks(testRoot);
    expect(remaining.length).toBe(1);
  });

  it('preserves spawn locks newer than maxAgeMs', () => {
    acquireSpawnLock(testRoot, '168-001', './fresh.ts');
    // Don't age — acquiredAt is "now"
    const cleared = clearStaleSpawnLocks(testRoot, 5 * 60 * 1000);
    expect(cleared).toBe(0);
    expect(checkSpawnLocks(testRoot).length).toBe(1);
  });

  it('default TTL of 5 minutes triggers removal for old locks', () => {
    acquireSpawnLock(testRoot, '168-001', './old.ts');
    // Age beyond 5 minutes (6 minutes back)
    ageSpawnLock(testRoot, 6 * 60 * 1000);

    // Default maxAgeMs = 300000 (5min)
    const cleared = clearStaleSpawnLocks(testRoot);
    expect(cleared).toBe(1);
  });

  it('returns 0 when no spawnlocks exist', () => {
    const cleared = clearStaleSpawnLocks(testRoot, 1000);
    expect(cleared).toBe(0);
  });

  it('handles missing .locks directory gracefully', () => {
    // testRoot exists but no .locks subdirectory
    const cleared = clearStaleSpawnLocks(testRoot, 1000);
    expect(cleared).toBe(0);
  });
});
