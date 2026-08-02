// ─── Provider Execution Observation — evidence schema + pure reducers tests ──
import { describe, it, expect } from 'vitest';
import {
  PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION,
  createInitialProviderExecutionObservationState,
  foldProviderExecutionObservation,
  foldProviderExecutionObservations,
  getProviderExecutionAttainedConcurrency,
  listProviderExecutionIncompleteIntervals,
  parseProviderExecutionObservationInput,
  computeProviderExecutionObservationEventId,
  pruneProviderExecutionObservationState,
  type ProviderExecutionObservationInput,
} from '../../src/core/provider-execution-observation.js';

function start(overrides: Partial<ProviderExecutionObservationInput> = {}): ProviderExecutionObservationInput {
  return {
    type: 'start',
    executionId: 'exec-1',
    runId: 'run-1',
    taskId: 'task-1',
    attemptId: 'attempt-1',
    providerPrincipalDigest: 'digest-1',
    fence: 'fence-1',
    sequence: 1,
    observedAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  } as ProviderExecutionObservationInput;
}

function end(overrides: Partial<ProviderExecutionObservationInput> = {}): ProviderExecutionObservationInput {
  return {
    type: 'end',
    executionId: 'exec-1',
    runId: 'run-1',
    taskId: 'task-1',
    attemptId: 'attempt-1',
    providerPrincipalDigest: 'digest-1',
    fence: 'fence-1',
    sequence: 2,
    observedAt: '2026-07-31T00:01:00.000Z',
    outcome: 'completed',
    ...overrides,
  } as ProviderExecutionObservationInput;
}

describe('provider-execution-observation schema', () => {
  it('parses a valid start/end input and rejects a malformed shape', () => {
    expect(() => parseProviderExecutionObservationInput(start())).not.toThrow();
    expect(() => parseProviderExecutionObservationInput(end())).not.toThrow();
    expect(() => parseProviderExecutionObservationInput({ type: 'start' })).toThrow();
    expect(() => parseProviderExecutionObservationInput(start({ observedAt: 'not-a-date' }))).toThrow();
  });

  it('computes a deterministic content-addressable event id', () => {
    const a = computeProviderExecutionObservationEventId(parseProviderExecutionObservationInput(start()));
    const b = computeProviderExecutionObservationEventId(parseProviderExecutionObservationInput(start()));
    const c = computeProviderExecutionObservationEventId(parseProviderExecutionObservationInput(start({ sequence: 2 })));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('provider-execution-observation reducer — golden path', () => {
  it('tracks attained concurrency, peak overlap and closes intervals cleanly', () => {
    let state = createInitialProviderExecutionObservationState();
    expect(state.schemaVersion).toBe(PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION);

    state = foldProviderExecutionObservation(state, start({ executionId: 'exec-1', sequence: 1 }));
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(1);
    expect(state.peakOverlap).toBe(1);

    state = foldProviderExecutionObservation(
      state,
      start({ executionId: 'exec-2', attemptId: 'attempt-2', sequence: 1 }),
    );
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(2);
    expect(state.peakOverlap).toBe(2);

    state = foldProviderExecutionObservation(state, end({ executionId: 'exec-1', sequence: 2 }));
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(1);
    expect(state.peakOverlap).toBe(2); // peak is retained even after closing

    const incomplete = listProviderExecutionIncompleteIntervals(state);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0].executionId).toBe('exec-2');

    expect(state.holds).toHaveLength(0);
  });

  it('foldProviderExecutionObservations applies an ordered batch identically to repeated folds', () => {
    const events = [
      start({ executionId: 'exec-1', sequence: 1 }),
      start({ executionId: 'exec-2', attemptId: 'attempt-2', sequence: 1 }),
      end({ executionId: 'exec-1', sequence: 2 }),
    ];
    const batched = foldProviderExecutionObservations(createInitialProviderExecutionObservationState(), events);
    const manual = events.reduce(foldProviderExecutionObservation, createInitialProviderExecutionObservationState());
    expect(getProviderExecutionAttainedConcurrency(batched)).toBe(getProviderExecutionAttainedConcurrency(manual));
    expect(batched.peakOverlap).toBe(manual.peakOverlap);
    expect(batched.holds).toEqual(manual.holds);
  });
});

describe('provider-execution-observation reducer — idempotency', () => {
  it('accepts an exact duplicate start as a no-op returning the same state reference', () => {
    const s1 = foldProviderExecutionObservation(createInitialProviderExecutionObservationState(), start());
    const s2 = foldProviderExecutionObservation(s1, start());
    expect(s2).toBe(s1);
    expect(s2.holds).toHaveLength(0);
  });

  it('accepts an exact duplicate end as a no-op returning the same state reference', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start());
    const s1 = foldProviderExecutionObservation(state, end());
    const s2 = foldProviderExecutionObservation(s1, end());
    expect(s2).toBe(s1);
    expect(s2.holds).toHaveLength(0);
  });
});

describe('provider-execution-observation reducer — typed HOLD', () => {
  it('holds on a blank fence', () => {
    const state = foldProviderExecutionObservation(
      createInitialProviderExecutionObservationState(),
      start({ fence: '   ' }),
    );
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('missing-fence');
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(0);
  });

  it('holds on an end with no prior start', () => {
    const state = foldProviderExecutionObservation(createInitialProviderExecutionObservationState(), end());
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('end-before-start');
  });

  it('holds when the end sequence does not follow the recorded start sequence', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start({ sequence: 5 }));
    state = foldProviderExecutionObservation(state, end({ sequence: 5 }));
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('end-before-start');
    // the interval is still open — the invalid end was rejected, not applied
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(1);
  });

  it('holds when an end claims a different attempt than the recorded start (foreign attempt)', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start());
    state = foldProviderExecutionObservation(state, end({ attemptId: 'attempt-intruder' }));
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('foreign-attempt');
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(1);
  });

  it('holds when an end claims a different exact run than the recorded start', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start());
    state = foldProviderExecutionObservation(state, end({ runId: 'run-intruder' }));
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('foreign-attempt');
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(1);
  });

  it('holds when a second start for the same execution claims a different attempt (foreign attempt)', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start());
    state = foldProviderExecutionObservation(state, start({ attemptId: 'attempt-intruder', sequence: 2 }));
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('foreign-attempt');
  });

  it('holds on a conflicting (non-identical) replay of the same start', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start({ sequence: 1 }));
    state = foldProviderExecutionObservation(state, start({ sequence: 2 }));
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('conflicting-replay');
  });

  it('holds on a conflicting (non-identical) replay of the same end', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start({ sequence: 1 }));
    state = foldProviderExecutionObservation(state, end({ sequence: 2, outcome: 'completed' }));
    state = foldProviderExecutionObservation(state, end({ sequence: 2, outcome: 'failed' }));
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0].reasonCode).toBe('conflicting-replay');
  });
});

describe('provider-execution-observation reducer — bounded retention', () => {
  it('prunes closed executions not explicitly retained, and always keeps open ones', () => {
    let state = createInitialProviderExecutionObservationState();
    state = foldProviderExecutionObservation(state, start({ executionId: 'exec-open', sequence: 1 }));
    state = foldProviderExecutionObservation(
      state,
      start({ executionId: 'exec-closed', attemptId: 'attempt-2', sequence: 1 }),
    );
    state = foldProviderExecutionObservation(
      state,
      end({ executionId: 'exec-closed', attemptId: 'attempt-2', sequence: 2 }),
    );
    expect(state.executions.size).toBe(2);

    const pruned = pruneProviderExecutionObservationState(state, { clearHolds: true });
    expect(pruned.executions.size).toBe(1);
    expect(pruned.executions.has('exec-open')).toBe(true);
    expect(pruned.executions.has('exec-closed')).toBe(false);

    const retained = pruneProviderExecutionObservationState(state, {
      retainClosedExecutionIds: new Set(['exec-closed']),
    });
    expect(retained.executions.size).toBe(2);
  });
});
