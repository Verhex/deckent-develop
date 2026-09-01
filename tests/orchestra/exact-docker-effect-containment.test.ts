import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireProjectMaintenanceLock,
  beginExecutionLockIrreversibleBoundary,
  checkProjectMaintenanceLock,
  completeExecutionLockIrreversibleBoundary,
  readCompletedExecutionLockBoundary,
  releaseExecutionLock,
} from '../../src/core/file-lock.js';

describe('exact Docker effect containment authority', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function projectRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'deckent-effect-lock-'));
    roots.push(root);
    return root;
  }

  it('rereads an exact completed maintenance boundary after terminal cleanup and successor acquisition', () => {
    const root = projectRoot();
    const boundaryId = 'b89dd93b-20b4-51e4-9cd8-ff2dafd9f496';
    const lock = acquireProjectMaintenanceLock(root);
    const boundary = beginExecutionLockIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundaryId,
        evidenceRefs: [
          'effect-transaction:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'prepared-journal:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ],
      },
    );
    expect(boundary.quarantineId).toBe(boundaryId);

    const completion = completeExecutionLockIrreversibleBoundary(
      root,
      lock,
      {
        quarantineId: boundaryId,
        evidenceRefs: [
          'committed-journal:sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          'effect-transaction:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ],
      },
    );
    expect(completion.completed.quarantineId).toBe(boundaryId);
    expect(checkProjectMaintenanceLock(root)).toEqual({ state: 'absent' });

    const terminal = readCompletedExecutionLockBoundary(root, boundaryId);
    expect(terminal).not.toBeNull();
    expect(terminal?.action).toBe('completed');
    expect(terminal?.quarantineId).toBe(boundaryId);
    expect(terminal?.fencingToken).toEqual(lock.fencingToken);

    const successor = acquireProjectMaintenanceLock(root);
    expect(successor.fencingToken).not.toEqual(lock.fencingToken);
    expect(readCompletedExecutionLockBoundary(root, boundaryId)).toEqual(terminal);
    expect(releaseExecutionLock(root, successor.taskId, successor.ownerId)).toBe(true);
  });

  it('rejects an invalid caller-derived boundary identity before durable mutation', () => {
    const root = projectRoot();
    const lock = acquireProjectMaintenanceLock(root);
    expect(() => beginExecutionLockIrreversibleBoundary(
      root,
      lock,
      { quarantineId: 'not-a-uuid' },
    )).toThrow(/boundary id is invalid/iu);
    expect(checkProjectMaintenanceLock(root)).toMatchObject({
      state: 'held',
      lock: { ownerId: lock.ownerId },
    });
    expect(releaseExecutionLock(root, lock.taskId, lock.ownerId)).toBe(true);
  });

  it('accepts only an exact idempotent in-flight boundary replay', () => {
    const root = projectRoot();
    const lock = acquireProjectMaintenanceLock(root);
    const request = {
      quarantineId: '2dd8a1fc-6b07-5fd9-a8a5-aeea8557b3f9',
      evidenceRefs: [
        'effect-transaction:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      ],
    } as const;
    const first = beginExecutionLockIrreversibleBoundary(root, lock, request);
    expect(beginExecutionLockIrreversibleBoundary(root, lock, request)).toEqual(first);
    expect(() => beginExecutionLockIrreversibleBoundary(root, lock, {
      ...request,
      quarantineId: '9d58ca62-2413-53cf-89fe-e0dbe7d2e1da',
    })).toThrow(/boundary replay conflicts/iu);
    expect(() => beginExecutionLockIrreversibleBoundary(root, lock, {
      ...request,
      evidenceRefs: [
        'effect-transaction:sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      ],
    })).toThrow(/boundary replay conflicts/iu);
    expect(checkProjectMaintenanceLock(root)).toMatchObject({
      state: 'quarantined',
      quarantine: {
        quarantineId: request.quarantineId,
        evidenceRefs: request.evidenceRefs,
      },
    });
  });
});
