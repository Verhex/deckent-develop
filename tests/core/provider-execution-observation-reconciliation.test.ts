import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyProviderExecutionObservationReconciliation,
  inventoryProviderExecutionObservationReconciliation,
  planProviderExecutionObservationReconciliation,
  ProviderExecutionObservationReconciliationError,
} from '../../src/core/provider-execution-observation-reconciliation.js';
import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const homes: string[] = [];
const originalHome = process.env.DECKENT_HOME;
const ATTEMPT = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  if (originalHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-reconciliation-'));
  const home = mkdtempSync(join(tmpdir(), 'deckent-reconciliation-home-'));
  roots.push(root); homes.push(home); process.env.DECKENT_HOME = home;
  const dbPath = join(root, 'observations.db');
  const store = new ProviderExecutionObservationStore(root, { dbPath });
  const put = (executionId: string, taskId: string, attemptId: string, runId: string, principal = 'principal-a') => {
    store.put({ source: 'provider-runtime', observation: {
      type: 'start', executionId, taskId, attemptId, runId, providerPrincipalDigest: principal,
      fence: 'fence-a', sequence: Number(executionId.slice(-1)) + 1, observedAt: '2026-08-23T00:00:00.000Z',
    } });
  };
  return { root, dbPath, store, put };
}

function closeExact(root: string, taskId: string, attemptId: string): void {
  const ref = createTaskResultSettlementRefForAttempt(root, taskId, attemptId);
  writeTaskResultSettlementAttemptAtomic(ref, '2026-08-23T00:00:00.000Z');
  claimTaskResultSettlementAttemptAtomic(ref, '2026-08-23T00:00:01.000Z');
  writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 0, settledAt: '2026-08-23T00:00:02.000Z', result: { taskId } }));
  writeTaskResultSettlementClosureAtomic(ref, { containerDisposition: 'absent-after-exit', locksReleased: true, closedAt: '2026-08-23T00:00:03.000Z' });
}

describe('provider execution observation reconciliation', () => {
  it('discovers settled candidates across live-shaped runs with a deterministic exact preimage and no synthetic end', () => {
    const { root, dbPath, store, put } = fixture();
    put('execution-2', 'task-z', '22222222-2222-4222-8222-222222222222', 'run-z');
    put('execution-1', 'task-a', ATTEMPT, 'run-a');
    put('execution-3', 'task-hold', '33333333-3333-4333-8333-333333333333', 'run-a');
    closeExact(root, 'task-z', '22222222-2222-4222-8222-222222222222');
    closeExact(root, 'task-a', ATTEMPT);
    const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: 'observations.db' });
    const plan = planProviderExecutionObservationReconciliation({ inventory });
    const repeated = planProviderExecutionObservationReconciliation({ inventory });
    expect(inventory.activeOpenCount).toBe(3);
    expect(plan.runFilter).toBeNull();
    expect(plan.runIds).toEqual(['run-a', 'run-z']);
    expect(plan.candidates.map(value => value.executionId)).toEqual(['execution-1', 'execution-2']);
    expect(plan.planDigest).toBe(repeated.planDigest);
    expect(plan.candidates.every(value => /^[a-f0-9]{64}$/u.test(value.settlementDigest) && /^[a-f0-9]{64}$/u.test(value.closureDigest))).toBe(true);
    const applied = applyProviderExecutionObservationReconciliation({ plan });
    expect(applied).toMatchObject({ state: 'applied', beforeActiveOpenCount: 3, afterActiveOpenCount: 1, retiredCount: 2 });
    expect(store.listIntervals('principal-a')).toHaveLength(3);
    expect(store.listIntervals('principal-a').filter(value => !value.retired && value.end === null).map(value => value.executionId)).toEqual(['execution-3']);
    expect(store.listIntervals('principal-a').filter(value => value.retired).every(value => value.end === null)).toBe(true);
    expect(applyProviderExecutionObservationReconciliation({ plan })).toMatchObject({ state: 'replayed', retiredCount: 0 });
    store.close();
  });

  it('optionally narrows to explicit runs without retiring other settled runs', () => {
    const { root, store, put } = fixture();
    put('execution-1', 'task-a', ATTEMPT, 'run-a');
    put('execution-2', 'task-b', '22222222-2222-4222-8222-222222222222', 'run-b');
    closeExact(root, 'task-a', ATTEMPT);
    closeExact(root, 'task-b', '22222222-2222-4222-8222-222222222222');
    const plan = planProviderExecutionObservationReconciliation({
      inventory: inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: 'observations.db' }),
      runIds: ['run-b', 'run-b'],
    });
    expect(plan.runFilter).toEqual(['run-b']);
    expect(plan.runIds).toEqual(['run-b']);
    expect(plan.candidates.map(value => value.executionId)).toEqual(['execution-2']);
    applyProviderExecutionObservationReconciliation({ plan });
    expect(store.listIntervals('principal-a').find(value => value.executionId === 'execution-1')?.retired).toBe(false);
    expect(store.listIntervals('principal-a').find(value => value.executionId === 'execution-2')?.retired).toBe(true);
    store.close();
  });

  it('enforces bounded discovery and rejects stale lineage rather than broadening retirement', () => {
    const { root, put, store } = fixture();
    put('execution-1', 'task-owned', ATTEMPT, 'run-canonical');
    put('execution-2', 'task-extra', '44444444-4444-4444-8444-444444444444', 'run-canonical');
    expect(() => inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: 'observations.db', bounds: { maxOpenIntervals: 1 } }))
      .toThrowError(expect.objectContaining({ code: 'DISCOVERY_BOUND_EXCEEDED' }));
    closeExact(root, 'task-owned', ATTEMPT);
    const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: 'observations.db' });
    const plan = planProviderExecutionObservationReconciliation({ inventory, canonicalRunId: 'run-canonical' });
    store.put({ source: 'provider-runtime', observation: {
      type: 'start', executionId: 'execution-new', taskId: 'task-new', attemptId: '55555555-5555-4555-8555-555555555555', runId: 'run-canonical', providerPrincipalDigest: 'principal-a', fence: 'fence-a', sequence: 99, observedAt: '2026-08-23T00:01:00.000Z',
    } });
    expect(() => applyProviderExecutionObservationReconciliation({ plan }))
      .toThrowError(ProviderExecutionObservationReconciliationError);
    expect(store.listIntervals('principal-a').find(value => value.executionId === 'execution-1')?.retired).toBe(false);
    store.close();
  });

  it('binds all-runs versus explicit selection and detects newly eligible runs outside the original candidates', () => {
    const { root, store, put } = fixture();
    const attemptB = '22222222-2222-4222-8222-222222222222';
    put('execution-1', 'task-a', ATTEMPT, 'run-a');
    put('execution-2', 'task-b', attemptB, 'run-b');
    closeExact(root, 'task-a', ATTEMPT);
    const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: 'observations.db' });
    const allRuns = planProviderExecutionObservationReconciliation({ inventory });
    const onlyRunA = planProviderExecutionObservationReconciliation({ inventory, runIds: ['run-a'] });
    expect(allRuns.candidates).toEqual(onlyRunA.candidates);
    expect(allRuns.runFilter).toBeNull();
    expect(onlyRunA.runFilter).toEqual(['run-a']);
    expect(allRuns.planDigest).not.toBe(onlyRunA.planDigest);

    // Settlement authority changes independently from observation DB lineage.
    closeExact(root, 'task-b', attemptB);
    expect(() => applyProviderExecutionObservationReconciliation({ plan: allRuns }))
      .toThrowError(expect.objectContaining({ code: 'CONCURRENT_CHANGE' }));
    expect(applyProviderExecutionObservationReconciliation({ plan: onlyRunA }))
      .toMatchObject({ state: 'applied', retiredCount: 1 });
    expect(store.listIntervals('principal-a').find(value => value.executionId === 'execution-2')?.retired).toBe(false);
    store.close();
  });
});
