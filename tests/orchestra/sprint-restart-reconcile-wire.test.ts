import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import { reconcileSpawnBackendBeforeRestore } from '../../src/orchestra/sprint-controller.js';

function backend(reconcilePendingAttempts?: SpawnBackend['reconcilePendingAttempts']): SpawnBackend {
  return {
    name: 'test',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
    ...(reconcilePendingAttempts ? { reconcilePendingAttempts } : {}),
  };
}

describe('runSprint restart reconciliation seam', () => {
  it('keeps recovery after project leadership and before checkpoint interpretation', () => {
    const source = readFileSync(join(process.cwd(), 'src/orchestra/sprint-controller.ts'), 'utf-8');
    // 2026-08-25: stale-lock reconciliation retry made the binding mutable
    // (`let lockAcquired`) so a cleared-stale lease can re-acquire; the ordering
    // contract (lock → backend reconcile → checkpoint restore) is unchanged.
    const lockIndex = source.indexOf('let lockAcquired = acquireSprintLock');
    const reconcileIndex = source.indexOf('await reconcileSpawnBackendBeforeRestore(recoveryBackend)');
    const restoreIndex = source.indexOf('const recovery = restoreSprintFromCheckpoint');

    expect(lockIndex).toBeGreaterThan(-1);
    expect(reconcileIndex).toBeGreaterThan(lockIndex);
    expect(restoreIndex).toBeGreaterThan(reconcileIndex);
  });

  it('propagates checkpoint execution-authority HOLD instead of falling through to PLAN', () => {
    const source = readFileSync(join(process.cwd(), 'src/orchestra/sprint-controller.ts'), 'utf-8');
    const restoreIndex = source.indexOf('const recovery = restoreSprintFromCheckpoint');
    const recoveryCatchIndex = source.indexOf('catch (e) {', restoreIndex);
    const recoveryCatchEnd = source.indexOf('// ─── Outer-scope variables', recoveryCatchIndex);
    const boundary = source.slice(recoveryCatchIndex, recoveryCatchEnd);

    expect(boundary).toContain("e instanceof DeckentError && e.code === 'DECKENT_E077'");
    expect(boundary).toContain('throw e');
  });

  it('awaits the backend recovery authority exactly once', async () => {
    const reconcile = vi.fn(async () => ({
      adopted: ['task-a'],
      closedNotDispatched: [],
      closedAbsentAfterExit: [],
      retiredLanded: [],
      resumedContinuations: [],
    }));

    await reconcileSpawnBackendBeforeRestore(backend(reconcile));

    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('propagates recovery HOLD/failure instead of continuing to checkpoint restore', async () => {
    const error = new Error('DECKENT_E091:ambiguous-dispatch-container-absent');
    const reconcile = vi.fn(async () => { throw error; });

    await expect(reconcileSpawnBackendBeforeRestore(backend(reconcile))).rejects.toBe(error);
  });

  it('is a no-op for backends without a durable attempt journal', async () => {
    await expect(reconcileSpawnBackendBeforeRestore(backend())).resolves.toBeUndefined();
  });
});
