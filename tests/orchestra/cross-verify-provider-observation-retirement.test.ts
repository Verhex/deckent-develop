import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
  ProviderExecutionObservationStore,
} from '../../src/core/provider-execution-observation-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  taskResultSettlementActiveClaimDigest,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import {
  PROVIDER_EXECUTION_OBSERVATION_DIR_NAME,
  buildDockerProviderExecutionObservationShell,
  dockerProviderExecutionId,
  ingestDockerProviderExecutionObservations,
} from '../../src/orchestra/spawn-backend-docker.js';
import { retireSettledCrossVerifyProviderObservation } from '../../src/orchestra/cross-verify-runner.js';

const roots: string[] = [];
const principal = 'a'.repeat(64);

function begin(root: string, taskId: string): TaskResultSettlementRefV1 {
  const ref = createTaskResultSettlementRefForAttempt(root, taskId, randomUUID());
  writeTaskResultSettlementAttemptAtomic(ref);
  claimTaskResultSettlementAttemptAtomic(ref);
  return ref;
}

function close(ref: TaskResultSettlementRefV1): void {
  const taskId = ref.taskId;
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref,
    exitCode: 1,
    result: { taskId, workerId: `worker-${taskId}`, filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: 'host-settled verifier failure' },
  }));
  writeTaskResultSettlementClosureAtomic(ref, { containerDisposition: 'stopped-removed', locksReleased: true });
}

async function openInterval(root: string, ref: TaskResultSettlementRefV1, store: ProviderExecutionObservationStore): Promise<void> {
  const tasksDir = join(root, '.tasks');
  const observationDirectory = join(tasksDir, PROVIDER_EXECUTION_OBSERVATION_DIR_NAME);
  mkdirSync(observationDirectory, { recursive: true });
  const executionId = dockerProviderExecutionId({ projectRootSha256: ref.projectRootSha256, taskId: ref.taskId, attemptId: ref.attemptId });
  const binding = { executionId, runId: ref.projectRootSha256, taskId: ref.taskId, attemptId: ref.attemptId, providerPrincipalDigest: principal };
  const script = ['fsync_file() { :; }', ...buildDockerProviderExecutionObservationShell(binding, { observationDirectory }), 'record_provider_execution_start || exit 79'].join('\n');
  const exitCode = await new Promise<number | null>(resolve => {
    execFile('sh', ['-c', script], { env: { ...process.env, DECKENT_PROVIDER_EXECUTION_FENCE: taskResultSettlementActiveClaimDigest(ref) } }, error => resolve(error && 'code' in error && typeof error.code === 'number' ? error.code : error ? null : 0));
  });
  expect(exitCode).toBe(0);
  expect(ingestDockerProviderExecutionObservations({ tasksDir, settlementRef: ref, binding, store })).toMatchObject({ ingested: 1, rejected: 0 });
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('XVerify provider-observation retirement', () => {
  it('retires only the exact closed verifier attempt, preserves a foreign row, and replays as a no-op', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-provider-observation-'));
    roots.push(root);
    const store = new ProviderExecutionObservationStore(root);
    try {
      const exact = begin(root, '636-005-xverify');
      await openInterval(root, exact, store);
      close(exact);
      const foreign = begin(root, '636-005-foreign');
      await openInterval(root, foreign, store);
      close(foreign);
      expect(retireSettledCrossVerifyProviderObservation({ projectRoot: root, settlementRef: exact })).toEqual({ state: 'retired', retired: 1 });
      expect(store.listIntervals(principal)).toEqual(expect.arrayContaining([
        expect.objectContaining({ attemptId: exact.attemptId, end: expect.any(Object) }),
        expect.objectContaining({ attemptId: foreign.attemptId, end: null }),
      ]));
      expect(retireSettledCrossVerifyProviderObservation({ projectRoot: root, settlementRef: exact })).toEqual({ state: 'retired', retired: 0 });
    } finally { store.close(); }
  });

  it('holds rather than retiring from an open settlement claim', () => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-provider-observation-open-'));
    roots.push(root);
    const ref = begin(root, '636-005-xverify');
    expect(retireSettledCrossVerifyProviderObservation({ projectRoot: root, settlementRef: ref })).toEqual({ state: 'hold', reasonCode: 'xverify-provider-observation-settlement-not-closed' });
  });

  it('fails closed when the exact settlement cannot be read', () => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-provider-observation-corrupt-settlement-'));
    roots.push(root);
    const ref = begin(root, '638-005-xverify');
    writeFileSync(taskResultSettlementPath(ref), '{ malformed settlement', 'utf-8');

    expect(retireSettledCrossVerifyProviderObservation({ projectRoot: root, settlementRef: ref })).toEqual({
      state: 'hold',
      reasonCode: 'xverify-provider-observation-settlement-read-failed',
    });
  });

  it('fails closed when the existing observation database cannot be opened', () => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-provider-observation-corrupt-db-'));
    roots.push(root);
    const ref = begin(root, '638-005-xverify');
    close(ref);
    const store = new ProviderExecutionObservationStore(root);
    store.close();
    writeFileSync(join(root, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH), 'not a sqlite database', 'utf-8');

    expect(retireSettledCrossVerifyProviderObservation({ projectRoot: root, settlementRef: ref })).toEqual({
      state: 'hold',
      reasonCode: 'xverify-provider-observation-retirement-failed',
    });
  });
});
