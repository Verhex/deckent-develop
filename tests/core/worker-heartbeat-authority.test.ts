import { describe, expect, it } from 'vitest';

import {
  WORKER_HEARTBEAT_AUTHORITY_SCHEMA_VERSION,
  createInitialWorkerHeartbeatAuthorityState,
  foldWorkerHeartbeatAuthority,
  foldWorkerHeartbeatAuthorities,
  parseWorkerHeartbeatAuthorityObservation,
  type WorkerHeartbeatAuthorityIdentity,
  type WorkerHeartbeatAuthorityObservationInput,
} from '../../src/core/worker-heartbeat-authority.js';

const identity: WorkerHeartbeatAuthorityIdentity = {
  runId: 'run-486',
  taskId: '486-005',
  attemptId: 'attempt-3',
  workerId: 'worker-486-005',
  fence: 'host-fence-3',
};

function heartbeat(
  overrides: Partial<WorkerHeartbeatAuthorityObservationInput> = {},
): WorkerHeartbeatAuthorityObservationInput {
  return {
    ...identity,
    hostSequence: 1,
    hostObservedAt: '2026-07-31T10:00:00.000Z',
    hostProcessOutcome: { state: 'running', exitCode: null },
    workerTaskVerdict: 'pending',
    liveness: 'alive',
    ...overrides,
  } as WorkerHeartbeatAuthorityObservationInput;
}

describe('worker-heartbeat-authority schema', () => {
  it('accepts host-observed timing fields and rejects malformed clock input', () => {
    expect(() => parseWorkerHeartbeatAuthorityObservation(heartbeat())).not.toThrow();
    expect(() => parseWorkerHeartbeatAuthorityObservation({ ...heartbeat(), hostObservedAt: 'worker-clock' })).toThrow();
    expect(() => parseWorkerHeartbeatAuthorityObservation({ ...heartbeat(), hostSequence: -1 })).toThrow();
  });
});

describe('worker-heartbeat-authority reducer', () => {
  it('advances only host-observed sequence and time while retaining separate process, verdict, and liveness facts', () => {
    const initial = createInitialWorkerHeartbeatAuthorityState(identity);
    const first = foldWorkerHeartbeatAuthority(initial, heartbeat());
    const completed = foldWorkerHeartbeatAuthority(first, heartbeat({
      hostSequence: 2,
      hostObservedAt: '2026-07-31T10:01:00.000Z',
      hostProcessOutcome: { state: 'exited', exitCode: 0 },
      workerTaskVerdict: 'done',
      liveness: 'not-alive',
    }));

    expect(completed.schemaVersion).toBe(WORKER_HEARTBEAT_AUTHORITY_SCHEMA_VERSION);
    expect(completed.latest).toMatchObject({
      hostSequence: 2,
      hostProcessOutcome: { state: 'exited', exitCode: 0 },
      workerTaskVerdict: 'done',
      liveness: 'not-alive',
    });
    expect(completed.holds).toEqual([]);
  });

  it('is idempotent for an exact duplicate and folds ordered batches equivalently', () => {
    const first = foldWorkerHeartbeatAuthority(createInitialWorkerHeartbeatAuthorityState(identity), heartbeat());
    expect(foldWorkerHeartbeatAuthority(first, heartbeat())).toBe(first);

    const updates = [
      heartbeat(),
      heartbeat({ hostSequence: 2, hostObservedAt: '2026-07-31T10:01:00.000Z' }),
    ];
    const batched = foldWorkerHeartbeatAuthorities(createInitialWorkerHeartbeatAuthorityState(identity), updates);
    const repeated = updates.reduce(foldWorkerHeartbeatAuthority, createInitialWorkerHeartbeatAuthorityState(identity));
    expect(batched).toEqual(repeated);
  });

  it('holds stale dual-writer updates and preserves the last accepted snapshot', () => {
    let state = foldWorkerHeartbeatAuthority(createInitialWorkerHeartbeatAuthorityState(identity), heartbeat());
    state = foldWorkerHeartbeatAuthority(state, heartbeat({
      hostSequence: 1,
      hostObservedAt: '2026-07-31T10:01:00.000Z',
      workerTaskVerdict: 'hold',
    }));
    expect(state.holds.at(-1)?.reasonCode).toBe('stale-sequence');
    expect(state.latest?.workerTaskVerdict).toBe('pending');

    state = foldWorkerHeartbeatAuthority(state, heartbeat({
      hostSequence: 2,
      hostObservedAt: '2026-07-31T09:59:00.000Z',
    }));
    expect(state.holds.at(-1)?.reasonCode).toBe('stale-timestamp');
    expect(state.latest?.hostSequence).toBe(1);
  });

  it('holds an observation from a foreign exact attempt', () => {
    const state = foldWorkerHeartbeatAuthority(
      createInitialWorkerHeartbeatAuthorityState(identity),
      heartbeat({ attemptId: 'attempt-intruder' }),
    );
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0]?.reasonCode).toBe('foreign-attempt');
    expect(state.latest).toBeNull();
  });

  it('holds process/liveness and exit-code/task-verdict contradictions without conflating their fields', () => {
    let state = foldWorkerHeartbeatAuthority(createInitialWorkerHeartbeatAuthorityState(identity), heartbeat({
      liveness: 'not-alive',
    }));
    expect(state.holds[0]?.reasonCode).toBe('process-liveness-contradiction');

    state = foldWorkerHeartbeatAuthority(createInitialWorkerHeartbeatAuthorityState(identity), heartbeat({
      hostProcessOutcome: { state: 'exited', exitCode: 0 },
      workerTaskVerdict: 'no-go',
      liveness: 'not-alive',
    }));
    expect(state.holds[0]?.reasonCode).toBe('exit-code-task-verdict-contradiction');

    state = foldWorkerHeartbeatAuthority(createInitialWorkerHeartbeatAuthorityState(identity), heartbeat({
      hostProcessOutcome: { state: 'exited', exitCode: 1 },
      workerTaskVerdict: 'done',
      liveness: 'not-alive',
    }));
    expect(state.holds[0]?.reasonCode).toBe('exit-code-task-verdict-contradiction');
  });
});
