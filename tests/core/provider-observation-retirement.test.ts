// Row 3296 — terminal retirement closes the provider execution intervals the
// settling generation OWNS, and scopes everything else as forensic history.
// A settled run's own open intervals used to survive cleanup and reappear as
// `unresolved-provider-observation` holds against an unrelated IDLE or next
// run; foreign and historical intervals must stay open, untouched and harmless.
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION,
  ProviderExecutionObservationStore,
} from '../../src/core/provider-execution-observation-store.js';
import type { ProviderExecutionObservationInput } from '../../src/core/provider-execution-observation.js';
import {
  reconcileSettledProviderExecutionObservations,
  resolveProviderExecutionObservationRunId,
} from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-observation-retirement-'));
  roots.push(root);
  return root;
}

interface IntervalIdentity {
  readonly executionId: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly providerPrincipalDigest?: string;
}

function startObservation(identity: IntervalIdentity): ProviderExecutionObservationInput {
  return {
    type: 'start',
    executionId: identity.executionId,
    runId: identity.runId ?? 'run-a',
    taskId: identity.taskId ?? 'task-1',
    attemptId: identity.attemptId ?? 'attempt-1',
    providerPrincipalDigest: identity.providerPrincipalDigest ?? 'principal-a',
    fence: 'fence-1',
    sequence: 1,
    observedAt: '2026-08-01T00:00:00.000Z',
  };
}

function endObservation(identity: IntervalIdentity): ProviderExecutionObservationInput {
  return {
    ...startObservation(identity),
    type: 'end',
    sequence: 2,
    observedAt: '2026-08-01T00:01:00.000Z',
    outcome: 'completed',
  };
}

function openInterval(store: ProviderExecutionObservationStore, identity: IntervalIdentity): void {
  const accepted = store.put({ source: 'provider-runtime', observation: startObservation(identity) });
  expect(accepted).toMatchObject({ accepted: true, contradiction: null });
}

/** The exact generation being settled: three attempts, one tenant. */
const SETTLING_ATTEMPTS = [
  { taskId: 'task-1', attemptId: 'attempt-1' },
  { taskId: 'task-2', attemptId: 'attempt-2' },
  { taskId: 'task-3', attemptId: 'attempt-3' },
] as const;

/**
 * Seeds one store with the row-3296 shape: intervals the settling generation
 * owns, plus foreign/historical intervals that must survive it untouched.
 */
function seedStore(dbPath: string, projectRoot: string): ProviderExecutionObservationStore {
  const store = new ProviderExecutionObservationStore(projectRoot, { dbPath });
  openInterval(store, { executionId: 'owned-1', taskId: 'task-1', attemptId: 'attempt-1' });
  openInterval(store, { executionId: 'owned-2', taskId: 'task-2', attemptId: 'attempt-2' });
  openInterval(store, {
    executionId: 'owned-3-other-principal',
    taskId: 'task-3',
    attemptId: 'attempt-3',
    providerPrincipalDigest: 'principal-b',
  });
  // Superseded attempt of the same task — a different generation, not ours.
  openInterval(store, { executionId: 'foreign-attempt', taskId: 'task-1', attemptId: 'attempt-0' });
  // Another tenant/run entirely.
  openInterval(store, { executionId: 'foreign-run', runId: 'run-b' });
  // Legacy v1-migrated evidence: readable, never run-owned.
  openInterval(store, { executionId: 'legacy-unowned', taskId: 'task-9', attemptId: 'attempt-9' });
  // Already-closed evidence must stay closed and never be re-marked.
  openInterval(store, { executionId: 'closed-1', taskId: 'task-1', attemptId: 'attempt-1' });
  store.put({
    source: 'provider-runtime',
    observation: endObservation({ executionId: 'closed-1', taskId: 'task-1', attemptId: 'attempt-1' }),
  });
  store.close();

  const raw = new Database(dbPath);
  raw.prepare('UPDATE provider_execution_intervals SET run_id = NULL WHERE execution_id = ?')
    .run('legacy-unowned');
  raw.close();
  return new ProviderExecutionObservationStore(projectRoot, { dbPath });
}

function intervalState(dbPath: string): Record<string, { retired: number; closed: boolean }> {
  const raw = new Database(dbPath, { readonly: true });
  try {
    const rows = raw.prepare(
      'SELECT execution_id, retired, end_json FROM provider_execution_intervals',
    ).all() as Array<{ execution_id: string; retired: number; end_json: string | null }>;
    return Object.fromEntries(rows.map(row => [
      row.execution_id,
      { retired: row.retired, closed: row.end_json !== null },
    ]));
  } finally {
    raw.close();
  }
}

describe('provider execution observation generation retirement', () => {
  it('retires only the settling generation and leaves foreign history untouched', () => {
    const root = fixtureRoot();
    const dbPath = join(root, 'observations.db');
    const store = seedStore(dbPath, root);
    try {
      const reconciliation = store.reconcileGenerationRetirement({
        runId: 'run-a',
        attempts: SETTLING_ATTEMPTS,
        reason: 'run-generation-settled',
      });

      expect(reconciliation.runId).toBe('run-a');
      expect(reconciliation.reason).toBe('run-generation-settled');
      expect(reconciliation.retired.map(interval => interval.executionId).sort())
        .toEqual(['owned-1', 'owned-2', 'owned-3-other-principal']);
      expect(reconciliation.retired[0]).toMatchObject({
        taskId: 'task-1',
        attemptId: 'attempt-1',
        providerPrincipalDigest: 'principal-a',
        fence: 'fence-1',
        reason: 'run-generation-settled',
      });
      // Superseded attempt, foreign run and legacy-unowned rows stay open.
      expect(reconciliation.foreignOpenIntervals).toBe(3);

      const state = intervalState(dbPath);
      expect(state['owned-1']).toEqual({ retired: 1, closed: false });
      expect(state['owned-3-other-principal']).toEqual({ retired: 1, closed: false });
      expect(state['foreign-attempt']).toEqual({ retired: 0, closed: false });
      expect(state['foreign-run']).toEqual({ retired: 0, closed: false });
      expect(state['legacy-unowned']).toEqual({ retired: 0, closed: false });
      expect(state['closed-1']).toEqual({ retired: 0, closed: true });
    } finally {
      store.close();
    }
  });

  it('is idempotent: a second reconciliation of the same generation is a no-op', () => {
    const root = fixtureRoot();
    const dbPath = join(root, 'observations.db');
    const store = seedStore(dbPath, root);
    try {
      const scope = {
        runId: 'run-a',
        attempts: SETTLING_ATTEMPTS,
        reason: 'run-generation-settled',
      } as const;
      store.reconcileGenerationRetirement(scope);
      const before = intervalState(dbPath);

      const second = store.reconcileGenerationRetirement(scope);

      expect(second.retired).toEqual([]);
      expect(second.foreignOpenIntervals).toBe(3);
      expect(intervalState(dbPath)).toEqual(before);
    } finally {
      store.close();
    }
  });

  it('never deletes evidence and never moves the schema version', () => {
    const root = fixtureRoot();
    const dbPath = join(root, 'observations.db');
    const store = seedStore(dbPath, root);
    try {
      const before = intervalState(dbPath);
      store.reconcileGenerationRetirement({
        runId: 'run-a',
        attempts: SETTLING_ATTEMPTS,
        reason: 'run-generation-settled',
      });
      const after = intervalState(dbPath);

      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      // Retired intervals remain readable forensic evidence, not deleted rows.
      expect(store.listIntervals('principal-a').map(interval => interval.executionId))
        .toContain('owned-1');
      expect(store.listIntervals('principal-a').find(i => i.executionId === 'owned-1'))
        .toMatchObject({ retired: true, ownership: 'run-owned', end: null });

      const raw = new Database(dbPath, { readonly: true });
      try {
        expect(raw.pragma('user_version', { simple: true }))
          .toBe(PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION);
      } finally {
        raw.close();
      }
    } finally {
      store.close();
    }
  });

  it('honors the provider fence and rejects an untyped or unowned generation', () => {
    const root = fixtureRoot();
    const dbPath = join(root, 'observations.db');
    const store = seedStore(dbPath, root);
    try {
      const fenced = store.reconcileGenerationRetirement({
        runId: 'run-a',
        attempts: SETTLING_ATTEMPTS,
        providerPrincipalDigests: ['principal-a'],
        reason: 'run-generation-settled',
      });
      expect(fenced.retired.map(interval => interval.executionId).sort())
        .toEqual(['owned-1', 'owned-2']);
      // The fenced-out principal is left open for its own provider's pass.
      expect(intervalState(dbPath)['owned-3-other-principal'])
        .toEqual({ retired: 0, closed: false });

      expect(() => store.reconcileGenerationRetirement({
        runId: '  ',
        attempts: SETTLING_ATTEMPTS,
        reason: 'run-generation-settled',
      })).toThrow(TypeError);
      expect(() => store.reconcileGenerationRetirement({
        runId: 'run-a',
        attempts: [],
        reason: 'run-generation-settled',
      })).toThrow(TypeError);
    } finally {
      store.close();
    }
  });
});

describe('finalizer settlement reconciliation seam', () => {
  it('derives the run identity from the same authority the spawn site binds', () => {
    const root = fixtureRoot();
    expect(resolveProviderExecutionObservationRunId(root)).toBe(
      createHash('sha256').update(realpathSync.native(root)).digest('hex'),
    );
  });

  it('never creates observation authority when a project has none', () => {
    const root = fixtureRoot();
    expect(reconcileSettledProviderExecutionObservations({
      projectRoot: root,
      attempts: SETTLING_ATTEMPTS,
      reason: 'run-generation-settled',
    })).toBeNull();
  });

  it('settles a run with open intervals and stays a no-op on re-finalize', () => {
    const root = fixtureRoot();
    const runId = resolveProviderExecutionObservationRunId(root);
    const store = new ProviderExecutionObservationStore(root);
    openInterval(store, { executionId: 'owned-1', runId, taskId: 'task-1', attemptId: 'attempt-1' });
    openInterval(store, { executionId: 'historical', runId, taskId: 'task-490', attemptId: 'attempt-490' });
    store.close();

    const settled = reconcileSettledProviderExecutionObservations({
      projectRoot: root,
      attempts: [{ taskId: 'task-1', attemptId: 'attempt-1' }],
      reason: 'run-generation-settled',
    });
    expect(settled).toMatchObject({ runId, foreignOpenIntervals: 1 });
    expect(settled?.retired.map(interval => interval.executionId)).toEqual(['owned-1']);

    const refinalize = reconcileSettledProviderExecutionObservations({
      projectRoot: root,
      attempts: [{ taskId: 'task-1', attemptId: 'attempt-1' }],
      reason: 'run-generation-settled',
    });
    expect(refinalize).toMatchObject({ retired: [], foreignOpenIntervals: 1 });
  });

  it('owns nothing when the settling generation has no exact attempt identity', () => {
    const root = fixtureRoot();
    const store = new ProviderExecutionObservationStore(root);
    openInterval(store, { executionId: 'owned-1' });
    store.close();

    expect(reconcileSettledProviderExecutionObservations({
      projectRoot: root,
      attempts: [{ taskId: 'task-1', attemptId: '' }],
      reason: 'run-generation-settled',
    })).toBeNull();
  });
});
