import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  RepairQueueAuthorityError,
  admitRepairQueueRecord,
  createRepairQueueId,
  readRepairQueueAuthority,
  repairQueueAuthorityPath,
  transitionRepairQueueRecord,
} from '../../src/orchestra/repair-queue-authority.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-repair-authority-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'));
  return root;
}

const admission = {
  taskId: '704-root-fix',
  sprintId: 'sprint-704',
  birthClass: 'FIX' as const,
  admittedAt: '2026-08-28T12:00:00.000Z',
  attempt: {
    attemptId: '704-root-fix',
    ordinal: 2,
    parentTaskId: '704-root',
  },
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('repair queue durable authority', () => {
  it('round-trips the versioned schema and every lifecycle state', () => {
    const root = makeRoot();
    const queued = admitRepairQueueRecord(root, admission);

    expect(readRepairQueueAuthority(root)).toEqual({
      schemaVersion: 1,
      records: [queued],
    });
    expect(transitionRepairQueueRecord(root, queued.queueId, 'dispatched'))
      .toMatchObject({ dispatchStatus: 'dispatched' });
    expect(transitionRepairQueueRecord(root, queued.queueId, 'settled'))
      .toMatchObject({ dispatchStatus: 'settled' });
    expect(readRepairQueueAuthority(root).records[0]).toMatchObject({
      queueId: createRepairQueueId(admission),
      taskId: admission.taskId,
      sprintId: admission.sprintId,
      birthClass: 'FIX',
      dispatchStatus: 'settled',
      attempt: admission.attempt,
    });
  });

  it('admits the same queueId idempotently without adding a second record', () => {
    const root = makeRoot();
    const first = admitRepairQueueRecord(root, admission);
    const second = admitRepairQueueRecord(root, {
      ...admission,
      admittedAt: '2026-08-28T12:00:01.000Z',
    });

    expect(second).toEqual(first);
    expect(readRepairQueueAuthority(root).records).toHaveLength(1);
  });

  it('ignores a same-directory partial temp file and publishes only by rename', () => {
    const root = makeRoot();
    const finalPath = repairQueueAuthorityPath(root);
    writeFileSync(`${finalPath}.interrupted.tmp`, '{"schemaVersion":1,"records":[');

    expect(readRepairQueueAuthority(root).records).toEqual([]);
    admitRepairQueueRecord(root, admission);
    expect(readRepairQueueAuthority(root).records).toHaveLength(1);
    expect(readdirSync(join(root, '.tasks'))).toContain('repair-queue-authority.json');
  });

  it('rejects corrupt or partial final authority with a typed error', () => {
    const root = makeRoot();
    writeFileSync(repairQueueAuthorityPath(root), '{"schemaVersion":1,"records":[');

    expect(() => readRepairQueueAuthority(root)).toThrowError(
      expect.objectContaining<Partial<RepairQueueAuthorityError>>({
        name: 'RepairQueueAuthorityError',
        code: 'MALFORMED_AUTHORITY',
      }),
    );
  });

  it('rejects queueId rebinding and non-monotonic state transitions', () => {
    const root = makeRoot();
    const queued = admitRepairQueueRecord(root, { ...admission, queueId: 'fixed-id' });

    expect(() => admitRepairQueueRecord(root, {
      ...admission,
      queueId: 'fixed-id',
      taskId: 'different-task',
    })).toThrowError(expect.objectContaining({ code: 'QUEUE_ID_CONFLICT' }));
    expect(() => transitionRepairQueueRecord(root, queued.queueId, 'settled'))
      .toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });
});
