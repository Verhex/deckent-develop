import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createInitialProviderExecutionObservationState,
  foldProviderExecutionObservations,
  getProviderExecutionAttainedConcurrency,
} from '../../src/core/provider-execution-observation.js';
import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAttemptAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import {
  PROVIDER_EXECUTION_OBSERVATION_DIR_NAME,
  buildDockerProviderExecutionObservationShell,
  dockerProviderExecutionId,
  ingestDockerProviderExecutionObservations,
  resolveDockerProviderPrincipalDigest,
} from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];
const PRINCIPAL = 'a'.repeat(64);

interface Fixture {
  readonly root: string;
  readonly tasksDir: string;
  readonly observationDir: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly executionId: string;
  readonly fence: string;
  readonly store: ProviderExecutionObservationStore;
}

function fixture(taskId = '487-016'): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'docker-provider-observation-wire-'));
  roots.push(root);
  const tasksDir = join(root, '.tasks');
  const observationDir = join(tasksDir, PROVIDER_EXECUTION_OBSERVATION_DIR_NAME);
  mkdirSync(observationDir, { recursive: true });
  const settlementRef = createTaskResultSettlementRef(root, taskId);
  writeTaskResultSettlementAttemptAtomic(settlementRef);
  claimTaskResultSettlementAttemptAtomic(settlementRef);
  return {
    root,
    tasksDir,
    observationDir,
    settlementRef,
    executionId: dockerProviderExecutionId({
      projectRootSha256: settlementRef.projectRootSha256,
      taskId: settlementRef.taskId,
      attemptId: settlementRef.attemptId,
    }),
    fence: taskResultSettlementActiveClaimDigest(settlementRef),
    store: new ProviderExecutionObservationStore(root, { dbPath: join(root, 'observations.db') }),
  };
}

/**
 * Run the REAL container-side emission fragment so the wire is proven against
 * the bytes production writes, not a hand-authored payload.
 */
function emit(f: Fixture, body: readonly string[]): Promise<number | null> {
  const script = [
    'fsync_file() { :; }',
    ...buildDockerProviderExecutionObservationShell(
      {
        executionId: f.executionId,
        runId: f.settlementRef.projectRootSha256,
        taskId: f.settlementRef.taskId,
        attemptId: f.settlementRef.attemptId,
        providerPrincipalDigest: PRINCIPAL,
      },
      { observationDirectory: f.observationDir },
    ),
    ...body,
  ].join('\n');
  return new Promise(resolve => {
    execFile(
      'sh',
      ['-c', script],
      { env: { ...process.env, DECKENT_PROVIDER_EXECUTION_FENCE: f.fence }, encoding: 'utf-8' },
      error => resolve(
        error && 'code' in error && typeof error.code === 'number' ? error.code : error ? null : 0,
      ),
    );
  });
}

function ingest(f: Fixture) {
  return ingestDockerProviderExecutionObservations({
    tasksDir: f.tasksDir,
    settlementRef: f.settlementRef,
    binding: {
      executionId: f.executionId,
      runId: f.settlementRef.projectRootSha256,
      taskId: f.settlementRef.taskId,
      attemptId: f.settlementRef.attemptId,
      providerPrincipalDigest: PRINCIPAL,
    },
    store: f.store,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Docker provider observation production wire', () => {
  it('ingests nothing before the provider is invoked', async () => {
    const f = fixture();
    // Auth bootstrap and container setup run with the fragment installed but
    // without record_provider_execution_start — that window is not provider time.
    expect(await emit(f, ['CONTAINER_SETUP=done'])).toBe(0);

    expect(ingest(f)).toEqual({ ingested: 0, duplicates: 0, contradictions: 0, rejected: 0 });
    expect(f.store.listIntervals(PRINCIPAL)).toEqual([]);
    f.store.close();
  });

  it('opens the interval at provider invocation and never closes it from container exit', async () => {
    const f = fixture();
    expect(await emit(f, ['record_provider_execution_start || exit 79'])).toBe(0);

    expect(ingest(f)).toMatchObject({ ingested: 1, rejected: 0, contradictions: 0 });
    const intervals = f.store.listIntervals(PRINCIPAL);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toMatchObject({
      executionId: f.executionId,
      runId: f.settlementRef.projectRootSha256,
      taskId: f.settlementRef.taskId,
      attemptId: f.settlementRef.attemptId,
      fence: f.fence,
      end: null,
    });

    // A second host settlement pass (container already gone) must stay idempotent
    // and must not synthesize an end from container lifecycle.
    expect(ingest(f)).toMatchObject({ ingested: 0, duplicates: 1 });
    expect(f.store.listIntervals(PRINCIPAL)[0].end).toBeNull();
    f.store.close();
  });

  it('closes the interval as aborted when the provider settles on TERM', async () => {
    const f = fixture();
    expect(await emit(f, [
      'record_provider_execution_start || exit 79',
      // Exactly what the on_provider_term trap runs in the generated worker script.
      'record_provider_execution_end aborted || exit 79',
    ])).toBe(0);

    expect(ingest(f)).toMatchObject({ ingested: 2, rejected: 0, contradictions: 0 });
    const intervals = f.store.listIntervals(PRINCIPAL);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].end).toMatchObject({ type: 'end', outcome: 'aborted', fence: f.fence });
    f.store.close();
  });

  it('rejects container-forged run, principal, and fence ownership instead of manufacturing overlap', async () => {
    const f = fixture();
    expect(await emit(f, [
      'record_provider_execution_start || exit 79',
      'record_provider_execution_end completed || exit 79',
    ])).toBe(0);
    expect(ingest(f)).toMatchObject({ ingested: 2 });

    // Same file path, different attempt identity — a stale/replayed container.
    const startPath = join(f.observationDir, `${f.executionId}.start.json`);
    const foreign = {
      ...JSON.parse(readFileSync(startPath, 'utf-8')) as Record<string, unknown>,
      runId: 'run-from-another-owner',
      providerPrincipalDigest: 'b'.repeat(64),
      fence: 'e'.repeat(64),
    };
    writeFileSync(startPath, JSON.stringify(foreign), 'utf-8');
    const endPath = join(f.observationDir, `${f.executionId}.end.json`);
    rmSync(endPath);

    expect(ingest(f)).toMatchObject({ ingested: 0, rejected: 1 });
    const intervals = f.store.listIntervals(PRINCIPAL);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].attemptId).toBe(f.settlementRef.attemptId);
    expect(intervals[0].end).toMatchObject({ outcome: 'completed' });

    const state = foldProviderExecutionObservations(
      createInitialProviderExecutionObservationState(),
      intervals.flatMap(interval => (interval.end === null ? [interval.start] : [interval.start, interval.end])),
    );
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(0);
    f.store.close();
  });

  it('persists a principal pseudonym without exposing credential material', async () => {
    const f = fixture();
    const credentialPath = join(f.root, 'creds.json');
    const secret = 'sk-live-DO-NOT-LEAK-0123456789';
    writeFileSync(credentialPath, JSON.stringify({ token: secret }), 'utf-8');
    const digest = resolveDockerProviderPrincipalDigest({
      provider: 'claude',
      authMode: 'subscription',
      credentialSources: { credentials: credentialPath },
    });
    expect(digest).not.toContain(secret);
    expect(/^[a-f0-9]{64}$/u.test(digest)).toBe(true);

    expect(await emit(f, ['record_provider_execution_start || exit 79'])).toBe(0);
    expect(ingest(f)).toMatchObject({ ingested: 1 });
    const serialized = JSON.stringify(f.store.listIntervals(PRINCIPAL));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(credentialPath);
    f.store.close();
  });
});
