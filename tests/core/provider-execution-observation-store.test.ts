import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ProviderExecutionObservationStore,
  ProviderExecutionObservationStoreError,
} from '../../src/core/provider-execution-observation-store.js';
import type { ProviderExecutionObservationInput } from '../../src/core/provider-execution-observation.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(retention?: ConstructorParameters<typeof ProviderExecutionObservationStore>[1]['retention']) {
  const root = mkdtempSync(join(tmpdir(), 'deckent-provider-observation-'));
  roots.push(root);
  const dbPath = join(root, 'observations.db');
  return {
    dbPath,
    store: new ProviderExecutionObservationStore(root, { dbPath, retention }),
  };
}

function start(overrides: Partial<ProviderExecutionObservationInput> = {}): ProviderExecutionObservationInput {
  return {
    type: 'start', executionId: 'exec-1', taskId: 'task-1', attemptId: 'attempt-1',
    providerPrincipalDigest: 'principal-a', fence: 'fence-1', sequence: 1,
    observedAt: '2026-07-31T00:00:00.000Z', ...overrides,
  } as ProviderExecutionObservationInput;
}

function end(overrides: Partial<ProviderExecutionObservationInput> = {}): ProviderExecutionObservationInput {
  return {
    type: 'end', executionId: 'exec-1', taskId: 'task-1', attemptId: 'attempt-1',
    providerPrincipalDigest: 'principal-a', fence: 'fence-1', sequence: 2,
    observedAt: '2026-07-31T00:01:00.000Z', outcome: 'completed', ...overrides,
  } as ProviderExecutionObservationInput;
}

describe('ProviderExecutionObservationStore', () => {
  it('persists exact-principal start/end intervals across restart', () => {
    const { store, dbPath } = fixture();
    expect(store.put({ source: 'provider-runtime', observation: start() }).accepted).toBe(true);
    expect(store.put({ source: 'provider-runtime', observation: end() }).accepted).toBe(true);
    store.put({ source: 'provider-runtime', observation: start({
      executionId: 'exec-2', attemptId: 'attempt-2', providerPrincipalDigest: 'principal-b',
    }) });
    store.close();

    const reopened = new ProviderExecutionObservationStore('.', { dbPath });
    const intervals = reopened.listIntervals('principal-a');
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toMatchObject({ executionId: 'exec-1', fence: 'fence-1' });
    expect(intervals[0].end).toMatchObject({ type: 'end', outcome: 'completed' });
    expect(reopened.listIntervals('principal-b')).toHaveLength(1);
    expect(reopened.listProviderPrincipalDigests()).toEqual(['principal-a', 'principal-b']);
    reopened.close();
  });

  it('opens an existing store read-only without mutating its schema or accepting writes', () => {
    const { store, dbPath } = fixture();
    store.put({ source: 'provider-runtime', observation: start() });
    store.close();

    const reader = new ProviderExecutionObservationStore('.', { dbPath, readOnly: true });
    expect(reader.listProviderPrincipalDigests()).toEqual(['principal-a']);
    expect(() => reader.put({ source: 'provider-runtime', observation: start({ executionId: 'new' }) }))
      .toThrow();
    reader.close();
  });

  it('rejects container and worker lifecycle proxies', () => {
    const { store } = fixture();
    expect(() => store.put({ source: 'container', observation: start() })).toThrowError(
      ProviderExecutionObservationStoreError,
    );
    expect(() => store.put({ source: 'worker-claim', observation: start() })).toThrowError(
      /Only direct provider-runtime/,
    );
    expect(store.listIntervals('principal-a')).toEqual([]);
    store.close();
  });

  it('retains fence and conflicting replay evidence without altering the interval', () => {
    const { store } = fixture();
    store.put({ source: 'provider-runtime', observation: start() });
    const result = store.put({ source: 'provider-runtime', observation: end({ fence: 'stale-fence' }) });
    expect(result).toMatchObject({ accepted: false, duplicate: false });
    expect(result.contradiction?.reasonCode).toBe('foreign-attempt');
    expect(store.listIntervals('principal-a')[0].end).toBeNull();
    expect(store.listContradictions('principal-a')).toHaveLength(1);
    store.close();
  });

  it('enforces bounded open, closed, and contradiction retention', () => {
    const { store } = fixture({ maxOpenIntervals: 1, maxClosedIntervals: 1, maxContradictions: 1 });
    store.put({ source: 'provider-runtime', observation: start({ executionId: 'closed-1' }) });
    store.put({ source: 'provider-runtime', observation: end({ executionId: 'closed-1' }) });
    store.put({ source: 'provider-runtime', observation: start({ executionId: 'closed-2' }) });
    store.put({ source: 'provider-runtime', observation: end({ executionId: 'closed-2' }) });
    expect(store.listIntervals('principal-a').map(interval => interval.executionId)).toEqual(['closed-2']);

    store.put({ source: 'provider-runtime', observation: end({ executionId: 'missing-1' }) });
    store.put({ source: 'provider-runtime', observation: end({ executionId: 'missing-2' }) });
    expect(store.listContradictions('principal-a')).toHaveLength(1);

    store.put({ source: 'provider-runtime', observation: start({ executionId: 'open-1' }) });
    expect(() => store.put({ source: 'provider-runtime', observation: start({ executionId: 'open-2' }) }))
      .toThrowError(/retention bound/);
    store.close();
  });

  it('treats exact duplicate observations as idempotent', () => {
    const { store } = fixture();
    store.put({ source: 'provider-runtime', observation: start() });
    expect(store.put({ source: 'provider-runtime', observation: start() }))
      .toEqual({ accepted: true, duplicate: true, contradiction: null });
    expect(store.listIntervals('principal-a')).toHaveLength(1);
    store.close();
  });
});
