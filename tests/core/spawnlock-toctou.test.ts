// ═══ SpawnLock TOCTOU Regression (born-428, Sprint 355 Task 6) ═══════════
// Closes the race where a mid-write read of a `.spawnlock` file (visible
// but not yet fully written) was mistaken for corruption and unlinked,
// letting a second task silently steal the lock out from under the real
// owner. Fix: acquireSpawnLock now publishes lock content atomically via a
// private staging file + hard link (see src/core/file-lock.ts), so the
// shared lock path is never observable in a partially-written state.
//
// These tests intercept the real `node:fs.linkSync` (the exact publish
// instant) to prove the invariant directly, rather than relying on
// non-deterministic OS-thread timing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fsHooks = vi.hoisted(() => ({
  realLinkSync: null as unknown as (existingPath: string, newPath: string) => void,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  fsHooks.realLinkSync = actual.linkSync as unknown as (existingPath: string, newPath: string) => void;
  return {
    ...actual,
    // Default behaviour is a plain passthrough; individual tests install a
    // one-time override to observe/interleave around the real publish call.
    linkSync: vi.fn(actual.linkSync),
  };
});

import { acquireSpawnLock, SpawnLockError } from '../../src/core/file-lock.js';
import { linkSync } from 'node:fs';

const mockedLinkSync = vi.mocked(linkSync);

function makeRoot(): string {
  const dir = join(tmpdir(), `deckent-spawnlock-toctou-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function listSpawnLocks(root: string): string[] {
  const dir = join(root, '.locks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.spawnlock'));
}

describe('acquireSpawnLock TOCTOU hardening (born-428)', () => {
  let root: string;

  beforeEach(() => {
    root = makeRoot();
  });

  afterEach(() => {
    vi.clearAllMocks();
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('never exposes the lock path in a partial/empty state at publish time', () => {
    const observed: Array<{ existedBefore: boolean; parsedAfter: boolean }> = [];

    mockedLinkSync.mockImplementationOnce((target, dest) => {
      const destPath = dest.toString();
      const existedBefore = existsSync(destPath);
      fsHooks.realLinkSync(target.toString(), destPath);
      let parsedAfter = false;
      try {
        JSON.parse(readFileSync(destPath, 'utf-8'));
        parsedAfter = true;
      } catch { /* leave false */ }
      observed.push({ existedBefore, parsedAfter });
    });

    acquireSpawnLock(root, 'task-A', 'src/race.ts');

    expect(observed).toHaveLength(1);
    // Before the atomic publish, the shared path must not exist at all —
    // there is no intermediate "created but empty" state to misread.
    expect(observed[0]!.existedBefore).toBe(false);
    // The instant it becomes visible, it is already fully valid JSON.
    expect(observed[0]!.parsedAfter).toBe(true);
  });

  it('adversarial interleave at the exact publish instant: exactly one task wins, the loser gets a clean SpawnLockError (mid-write read no longer triggers a phantom unlink+steal)', () => {
    let interleaved = false;
    let bResult: 'won' | 'lost' | 'unexpected' = 'unexpected';

    mockedLinkSync.mockImplementationOnce((target, dest) => {
      if (!interleaved) {
        interleaved = true;
        // Task B races in at the instant Task A is about to publish — under
        // the pre-fix design this is precisely the window where A's
        // O_EXCL-created-but-not-yet-written file existed and a reader
        // would misdiagnose it as corrupted and unlink it. Under the fix,
        // the shared path does not exist yet at all at this point, so B
        // proceeds through its own independent atomic publish.
        try {
          acquireSpawnLock(root, 'task-B', 'src/race2.ts');
          bResult = 'won';
        } catch (err) {
          bResult = err instanceof SpawnLockError ? 'lost' : 'unexpected';
        }
      }
      fsHooks.realLinkSync(target.toString(), dest.toString());
    });

    let aResult: 'won' | 'lost' | 'unexpected' = 'unexpected';
    try {
      acquireSpawnLock(root, 'task-A', 'src/race2.ts');
      aResult = 'won';
    } catch (err) {
      aResult = err instanceof SpawnLockError ? 'lost' : 'unexpected';
    }

    // Exactly one side wins and the other gets a real, typed conflict error
    // — never both (double-acquire) and never neither (dropped lock).
    expect([aResult, bResult].filter(r => r === 'won')).toHaveLength(1);
    expect([aResult, bResult].filter(r => r === 'lost')).toHaveLength(1);

    // Persisted state reflects exactly the winner; the loser's attempt
    // never overwrote or deleted it.
    const files = listSpawnLocks(root);
    expect(files).toHaveLength(1);
    const persisted = JSON.parse(readFileSync(join(root, '.locks', files[0]!), 'utf-8')) as { taskId: string };
    expect(['task-A', 'task-B']).toContain(persisted.taskId);
  });

  it('still self-heals from a genuinely corrupted (0-byte) spawnlock file', () => {
    // 0 bytes is exactly the shape the historical TOCTOU race used to leave
    // behind — but here it is seeded directly (no concurrent acquirer
    // involved), i.e. genuine corruption, not a live in-flight publish.
    acquireSpawnLock(root, 'task-A', 'src/heal.ts');
    const files = listSpawnLocks(root);
    expect(files).toHaveLength(1);
    const lockPath = join(root, '.locks', files[0]!);
    writeFileSync(lockPath, '', 'utf-8');

    expect(() => acquireSpawnLock(root, 'task-B', 'src/heal.ts')).not.toThrow();
    const healed = JSON.parse(readFileSync(lockPath, 'utf-8')) as { taskId: string };
    expect(healed.taskId).toBe('task-B');
  });

  it('leaves no staging (.tmp-*) artifacts behind after a normal acquire', () => {
    acquireSpawnLock(root, 'task-A', 'src/clean.ts');
    const allFiles = readdirSync(join(root, '.locks'));
    expect(allFiles.some(f => f.includes('.tmp-'))).toBe(false);
    expect(allFiles.filter(f => f.endsWith('.spawnlock'))).toHaveLength(1);
  });
});
