import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createHeartbeat,
  submitInProcessWorkerHeartbeatObservation,
  writeHeartbeat,
  type InProcessWorkerHeartbeatObservation,
} from '../../src/agents/worker.js';
import { AgentStatus } from '../../src/core/types.js';
import type { WorkerHeartbeatAuthorityIdentity } from '../../src/core/worker-heartbeat-authority.js';
import { WorkerHeartbeatAuthorityStore } from '../../src/core/worker-heartbeat-authority-store.js';

const roots: string[] = [];

function projectRoot(): string {
  const value = mkdtempSync(join(tmpdir(), 'worker-heartbeat-authority-wire-'));
  roots.push(value);
  return value;
}

const identity: WorkerHeartbeatAuthorityIdentity = {
  runId: 'run-487',
  taskId: '487-013',
  attemptId: '9e8a6e7b-dfa7-4f6e-aa4a-f891ae2c0583',
  workerId: 'w-487-013',
  fence: 'host-fence-487-013',
};

function observation(overrides: Partial<InProcessWorkerHeartbeatObservation> = {}): InProcessWorkerHeartbeatObservation {
  return {
    hostProcessOutcome: { state: 'running', exitCode: null },
    workerTaskVerdict: 'pending',
    liveness: 'alive',
    ...overrides,
  };
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('submitInProcessWorkerHeartbeatObservation', () => {
  it('auto-assigns the first host sequence without the caller supplying one', () => {
    const root = projectRoot();
    const result = submitInProcessWorkerHeartbeatObservation(root, identity, observation());

    expect(result.state).toBe('ACCEPTED');
    expect(result.state === 'ACCEPTED' && result.authority.latest?.hostSequence).toBe(1);
  });

  it('advances the sequence itself across repeated in-process observations for the same attempt', () => {
    const root = projectRoot();
    const first = submitInProcessWorkerHeartbeatObservation(root, identity, observation());
    const second = submitInProcessWorkerHeartbeatObservation(
      root,
      identity,
      observation({ workerTaskVerdict: 'done', hostProcessOutcome: { state: 'exited', exitCode: 0 }, liveness: 'not-alive' }),
    );

    expect(first.state).toBe('ACCEPTED');
    expect(second.state).toBe('ACCEPTED');
    expect(second.state === 'ACCEPTED' && second.authority.latest?.hostSequence).toBe(2);
    expect(second.state === 'ACCEPTED' && second.authority.latest?.workerTaskVerdict).toBe('done');
  });

  it('has no sequence field on its bounded observation input — the store, not the worker, owns sequencing', () => {
    const bounded = observation();
    expect('expectedHostSequence' in bounded).toBe(false);
    expect('hostSequence' in bounded).toBe(false);
    expect('hostObservedAt' in bounded).toBe(false);
  });

  it('returns a typed HOLD for a foreign identity instead of overwriting the fenced attempt', () => {
    const root = projectRoot();
    expect(submitInProcessWorkerHeartbeatObservation(root, identity, observation()).state).toBe('ACCEPTED');

    const foreign: WorkerHeartbeatAuthorityIdentity = { ...identity, workerId: 'w-foreign' };
    const result = submitInProcessWorkerHeartbeatObservation(root, foreign, observation());

    expect(result).toMatchObject({ state: 'HOLD', reasonCode: 'foreign-attempt' });
  });

  it('round-trips the exact attempt identity unchanged through the authority store', () => {
    const root = projectRoot();
    submitInProcessWorkerHeartbeatObservation(root, identity, observation());

    const store = new WorkerHeartbeatAuthorityStore(join(root, '.deckent', 'runtime', 'worker-heartbeat-authority'));
    const state = store.read(identity);

    expect(state?.identity).toEqual(identity);
  });

  it('does not touch the legacy IPC heartbeat file path', () => {
    const root = projectRoot();
    submitInProcessWorkerHeartbeatObservation(root, identity, observation());

    expect(existsSync(join(root, '.tasks', `task-${identity.taskId}.hb`))).toBe(false);
  });
});

describe('legacy IPC heartbeat path (writeHeartbeat/createHeartbeat) — unchanged', () => {
  it('still writes the .hb file directly with a worker-supplied sequence', () => {
    const root = projectRoot();
    const hb = createHeartbeat('w-487-013', '487-013', AgentStatus.EXECUTING, 'testing', undefined, 3);
    writeHeartbeat(root, hb);

    const hbPath = join(root, '.tasks', 'task-487-013.hb');
    expect(existsSync(hbPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(hbPath, 'utf-8')) as { sequence: number };
    expect(persisted.sequence).toBe(3);
  });
});
