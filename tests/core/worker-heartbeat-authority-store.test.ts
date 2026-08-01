import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  WorkerHeartbeatAuthorityStore,
  type WorkerHeartbeatAuthorityWrite,
} from '../../src/core/worker-heartbeat-authority-store.js';
import type { WorkerHeartbeatAuthorityIdentity } from '../../src/core/worker-heartbeat-authority.js';

const roots: string[] = [];
const identity: WorkerHeartbeatAuthorityIdentity = {
  runId: 'run-487',
  taskId: '487-011',
  attemptId: 'attempt-6',
  workerId: 'w-487-011',
  fence: 'host-fence-6',
};

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'heartbeat-authority-store-'));
  roots.push(value);
  return value;
}

function write(overrides: Partial<WorkerHeartbeatAuthorityWrite> = {}): WorkerHeartbeatAuthorityWrite {
  return {
    identity,
    expectedHostSequence: 0,
    hostProcessOutcome: { state: 'running', exitCode: null },
    workerTaskVerdict: 'pending',
    liveness: 'alive',
    ...overrides,
  };
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('WorkerHeartbeatAuthorityStore', () => {
  it('is the sole sequence and timestamp authority for an exact attempt', () => {
    const times = [new Date('2026-07-31T10:00:00.000Z'), new Date('2026-07-31T09:00:00.000Z')];
    const storeRoot = root();
    const store = new WorkerHeartbeatAuthorityStore(storeRoot, { hostNow: () => times.shift()! });
    expect(store.initialize(identity).state).toBe('READY');

    const first = store.observe(write());
    const second = store.observe(write({ expectedHostSequence: 1 }));

    expect(first.state).toBe('ACCEPTED');
    expect(second.state).toBe('ACCEPTED');
    expect(store.read(identity)?.latest).toMatchObject({
      hostSequence: 2,
      hostObservedAt: '2026-07-31T10:00:00.001Z',
    });
    expect(store.read(identity)?.holds).toEqual([]);
  });

  it('returns typed HOLD for stale and foreign writers without replacing accepted authority', () => {
    const store = new WorkerHeartbeatAuthorityStore(root(), {
      hostNow: () => new Date('2026-07-31T10:00:00.000Z'),
    });
    store.initialize(identity);
    expect(store.observe(write()).state).toBe('ACCEPTED');

    expect(store.observe(write())).toMatchObject({
      state: 'HOLD',
      reasonCode: 'stale-writer',
      currentHostSequence: 1,
    });
    expect(store.observe(write({
      identity: { ...identity, workerId: 'foreign-worker' },
      expectedHostSequence: 1,
    }))).toMatchObject({ state: 'HOLD', reasonCode: 'foreign-attempt' });
    expect(store.read(identity)?.latest?.hostSequence).toBe(1);
  });

  it('retains host process outcome separately from the worker verdict', () => {
    const store = new WorkerHeartbeatAuthorityStore(root());
    store.initialize(identity);
    const accepted = store.observe(write({
      hostProcessOutcome: { state: 'exited', exitCode: 7 },
      workerTaskVerdict: 'no-go',
      liveness: 'not-alive',
    }));

    expect(accepted.state).toBe('ACCEPTED');
    expect(store.read(identity)?.latest).toMatchObject({
      hostProcessOutcome: { state: 'exited', exitCode: 7 },
      workerTaskVerdict: 'no-go',
    });
  });

  it('persists immutable revisions across instances without a project-global singleton', () => {
    const firstRoot = root();
    const secondRoot = root();
    const first = new WorkerHeartbeatAuthorityStore(firstRoot);
    const independent = new WorkerHeartbeatAuthorityStore(secondRoot);
    first.initialize(identity);
    independent.initialize(identity);
    first.observe(write());

    expect(new WorkerHeartbeatAuthorityStore(firstRoot).read(identity)?.latest?.hostSequence).toBe(1);
    expect(independent.read(identity)?.latest).toBeNull();
  });

  it('holds an uninitialized attempt and a concurrent attempt-scoped writer', () => {
    const storeRoot = root();
    const store = new WorkerHeartbeatAuthorityStore(storeRoot);
    expect(store.observe(write())).toMatchObject({ state: 'HOLD', reasonCode: 'attempt-not-initialized' });
    store.initialize(identity);

    const key = readdirSingle(storeRoot);
    mkdirSync(join(storeRoot, key, 'write.lock'));
    expect(store.observe(write())).toMatchObject({ state: 'HOLD', reasonCode: 'write-in-progress' });
  });

  it('rejects contradictory process/verdict facts without allocating a sequence', () => {
    const store = new WorkerHeartbeatAuthorityStore(root());
    store.initialize(identity);
    const rejected = store.observe(write({
      hostProcessOutcome: { state: 'exited', exitCode: 0 },
      workerTaskVerdict: 'no-go',
      liveness: 'not-alive',
    }));

    expect(rejected).toMatchObject({ state: 'HOLD', reasonCode: 'invalid-observation', currentHostSequence: 0 });
    expect(store.read(identity)?.latest).toBeNull();
  });

  it('rejects a persisted revision whose payload sequence differs from its authority filename', () => {
    const storeRoot = root();
    const store = new WorkerHeartbeatAuthorityStore(storeRoot);
    store.initialize(identity);
    expect(store.observe(write()).state).toBe('ACCEPTED');

    const attemptDirectory = join(storeRoot, readdirSingle(storeRoot));
    const revisionPath = join(attemptDirectory, '0000000000000001.json');
    const revision = JSON.parse(readFileSync(revisionPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(revisionPath, JSON.stringify({ ...revision, hostSequence: 9 }));

    expect(() => new WorkerHeartbeatAuthorityStore(storeRoot).read(identity))
      .toThrow('Invalid worker heartbeat authority revision');
  });
});

function readdirSingle(path: string): string {
  const entries = readdirSync(path);
  expect(entries).toHaveLength(1);
  return entries[0]!;
}
