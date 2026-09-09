// ─── Historical archived attempts must never re-enter cold exact recovery ────
//
// Measured 2026-09-05: every new sprint start ran
// `reconcileSpawnBackendBeforeRestore` → `DockerSpawnBackend.reconcilePendingAttempts`
// → `reconcileExactDockerCustodyAdmissions`, which iterates EVERY dispatch admission
// the project custody store ever recorded. Admissions are never retired after
// archive, so sprint-724's fully terminal `724-001` was re-read forever. Its cold
// accepted result was recovered, replayed through today's evaluation derivation
// (changed 2026-09-08, commit 89e6fe123) and produced
// `evaluation-replay-mismatch` → `DECKENT_E077` — killing each new sprint before
// planning. Replaying an ARCHIVED attempt against current derivation is not an
// integrity check; it is the MASTER-PLAN 664 failure class again.
//
// Coverage:
//   1. An admitted, released, provider-exited attempt whose custody chain is
//      complete through `archive` is reported as `historicalArchived` and never
//      enters `closedAbsentAfterExit` / `exactEntries`, with no hold.
//   2. The SAME attempt without the archive chain (chain ends at accepted-result)
//      keeps today's behaviour: it is recovered as an `accepted` exact entry.
//
// Hermetic: node:child_process + file-lock mocked; the project root is a
// per-test `mkdtemp` directory; the custody store is the in-memory helper
// fixture, so the archive chain under test is a REAL digest-linked chain built
// through `TaskAttemptCustodyStore.appendChain`, not a stubbed reader.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(() => 0),
  inspectStaleSpawnLocks: vi.fn(() => []),
  releaseInspectedSpawnLock: vi.fn(() => false),
  SpawnLockError: class extends Error {},
}));

import { spawn, spawnSync } from 'node:child_process';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import {
  createExactNormalDockerExecutionRegistry,
} from '../../src/orchestra/scheduler-effects.js';
import {
  createTaskResultSettlementV2Fixture,
  type TaskResultAcceptedV2Fixture,
} from '../helpers/task-result-settlement-v2-fixture.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function projectRoot(): string {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-archived-'));
  roots.push(base);
  const root = join(base, 'project');
  mkdirSync(join(root, '.tasks'), { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return root;
}

/**
 * Wire one admitted / released / provider-exited exact admission on top of a
 * real custody-store fixture, so the reconciler reads the fixture's genuine
 * chain receipts while every unrelated Store query stays explicit.
 */
function recoveryHarness(
  fixture: TaskResultAcceptedV2Fixture,
  daemon: 'container-absent' | 'unstubbed' = 'unstubbed',
) {
  const identity = fixture.identity;
  const admissionRef = {
    schemaVersion: 2 as const,
    kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    dispatchRequestId: `dreq-${'2'.repeat(64)}`,
    dispatchRequestMaterialDigest: digest('2'),
    identity,
    admissionReceiptDigest: digest('3'),
    refDigest: digest('4'),
  };
  const providerStartReceipt = { ref: digest('b'), digest: digest('c') };
  const authority = {
    state: 'RELEASED' as const,
    admissionRef,
    receiptDigest: digest('6'),
    releaseReceiptDigest: digest('7'),
    releaseEvidenceDigest: digest('8'),
    projectionFence: digest('9'),
    backendExecutionId: 'container-1',
    mountReceiptDigest: digest('a'),
    releaseEvidence: { releasedAt: '2026-09-01T00:00:00.000Z' },
  };
  const store = {
    // Real, digest-linked chain authority — the subject of this test.
    readChain: fixture.store.readChain.bind(fixture.store),
    listDispatchAdmissionsForRecovery: vi.fn(() => ({
      entries: [{
        state: 'admitted' as const,
        ref: admissionRef,
        admission: { admittedAt: '2026-09-01T00:00:00.000Z' },
        reservation: {},
      }],
      heldAdmissions: [],
    })),
    readEffectCommittedReleasePendingDispatch: vi.fn((): unknown => null),
    readStartedFailedDispatch: vi.fn((): unknown => null),
    readDispatchAuthority: vi.fn(() => ({ state: 'terminal' as const, authority })),
    readDispatchObservationByClass: vi.fn((input: { observationClass: string }) => (
      input.observationClass === 'PROVIDER_START'
        ? {
            receipt: {
              receiptDigest: providerStartReceipt.ref,
              evidenceDigest: providerStartReceipt.digest,
            },
            bytes: Buffer.from('{}'),
          }
        : null
    )),
  };
  const scope = {
    store,
    policy: fixture.policy,
    identity,
    admission: { admittedAt: '2026-09-01T00:00:00.000Z' },
    admissionRef,
    execution: { executionLandingPolicy: Object.freeze({ reserve_ratio: 0.25 }) },
    state: 'RELEASED',
  };
  const custodyRef = {
    dispatchRequestId: admissionRef.dispatchRequestId,
    identity,
    admissionReceiptDigest: admissionRef.admissionReceiptDigest,
    admissionRefDigest: admissionRef.refDigest,
    providerStartReceipt,
  };
  const backend = new DockerSpawnBackend(projectRoot());
  const internals = backend as unknown as Record<string, unknown>;
  internals.openExactDockerRecoveryStore = vi.fn(() => ({
    store,
    policy: fixture.policy,
  }));
  internals.reconstructExactDockerRecoveryScope = vi.fn(() => scope);
  internals.exactReleasedCustodyProjection = vi.fn(() => custodyRef);
  internals.exactCanonicalIngressAuthority = vi.fn(() => ({ kind: 'ingress-authority' }));
  internals.rereadExactProviderStartObservation = vi.fn(() => ({
    containerId: authority.backendExecutionId,
    observedAt: '2026-09-01T00:00:01.000Z',
  }));
  internals.readExactDockerRecoveryProviderExecution = vi.fn(
    () => ({ ref: digest('d'), digest: digest('e') }),
  );
  internals.readExactDockerRecoveryProviderExit = vi.fn(() => ({
    containerId: authority.backendExecutionId,
    exitCode: 0,
    observedAt: '2026-09-01T00:00:02.000Z',
  }));
  const readColdExactDockerAcceptedResult = vi.fn(
    () => ({ kind: 'cold-accepted-result' }),
  );
  internals.readColdExactDockerAcceptedResult = readColdExactDockerAcceptedResult;
  // Containment probes the daemon through the injected workspace command
  // runner. `docker inspect` on a removed container answers exit 1 with an
  // empty stdout and the daemon's "no such object" line — the exact shape
  // `isExactDockerContainerAbsent` accepts.
  const workspaceCommands = vi.fn(async () => Object.freeze({
    status: 1,
    signal: null,
    stdout: new Uint8Array(),
    stderr: Buffer.from(`error: no such object: ${authority.backendExecutionId}`),
    error: false,
    overflow: false,
  }));
  if (daemon === 'container-absent') {
    internals.exactWorkspaceCommandRunner = workspaceCommands;
  }
  return {
    backend, identity, store, readColdExactDockerAcceptedResult, workspaceCommands,
  };
}

describe('docker restart reconciliation of terminally archived attempts', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockSpawnSync.mockReset();
    mockSpawn.mockReturnValue({
      stdout: { on: vi.fn(), resume: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    } as unknown as ChildProcess);
    mockSpawnSync.mockReturnValue({
      stdout: '',
      stderr: 'Error: No such container',
      status: 1,
      signal: null,
      pid: 1,
      output: ['', '', ''],
    } as unknown as ReturnType<typeof spawnSync>);
  });

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
    else process.env.DECKENT_HOME = originalDeckentHome;
    vi.restoreAllMocks();
  });

  it('skips an attempt whose custody chain is complete through archive', async () => {
    const fixture = createTaskResultSettlementV2Fixture();
    const harness = recoveryHarness(fixture);

    const report = await harness.backend.reconcilePendingAttempts();

    expect(report.historicalArchived).toEqual([harness.identity.taskId]);
    expect(report.closedAbsentAfterExit).not.toContain(harness.identity.taskId);
    expect(report.adopted).not.toContain(harness.identity.taskId);
    expect((report.exactEntries ?? []).map(entry => entry.taskId))
      .not.toContain(harness.identity.taskId);
    expect(report.held).toEqual([]);
    expect(harness.readColdExactDockerAcceptedResult).not.toHaveBeenCalled();
  });

  // Pin the deliberate containment delta: the skip lands BEFORE the
  // `mode: 'contain'` branch, so an archived attempt is no longer inspected /
  // stopped as if a container could still exist for it. There is nothing to
  // contain in terminal history.
  it('reports an archived attempt as history in containment mode too', async () => {
    const fixture = createTaskResultSettlementV2Fixture();
    const harness = recoveryHarness(fixture);

    const report = await harness.backend.reconcilePendingAttempts({ mode: 'contain' });

    expect(report.historicalArchived).toEqual([harness.identity.taskId]);
    expect(report.adopted).not.toContain(harness.identity.taskId);
    expect(report.held).toEqual([]);
  });

  // The 2026-09-09 `EXACT_LIFECYCLE_CONTAIN_HOLD` shape: a released,
  // provider-exited attempt whose custody chain stops at `accepted-result`
  // (sprint-728's `728-001`) is NOT archived, so containment is attempted, the
  // effect resources it named are long gone and the entry holds. The hold must
  // carry the daemon fact so the registry can decide without re-inferring it.
  it('reports a containment hold with the daemon container proven absent', async () => {
    const fixture = createTaskResultSettlementV2Fixture({ terminal: 'accepted-only' });
    const harness = recoveryHarness(fixture, 'container-absent');

    const report = await harness.backend.reconcilePendingAttempts({ mode: 'contain' });

    expect(report.historicalArchived).toBeUndefined();
    expect(report.adopted).not.toContain(harness.identity.taskId);
    expect(report.held).toEqual([expect.objectContaining({
      kind: 'spawn-backend-recovery-hold',
      backend: 'docker',
      taskId: harness.identity.taskId,
      authorityState: 'DISPATCH_TERMINAL',
      reasonCode: 'TERMINAL_RECONCILIATION_REQUIRED',
      daemonContainerState: 'absent',
    })]);
    expect(harness.workspaceCommands).toHaveBeenCalled();
  });

  // End-to-end for the fix: the registry given a truthful historical-foreign
  // predicate consumes exactly that hold and no longer throws. (The predicate's
  // own fail-closed proof lives in `scheduler-effects.test.ts`.)
  it('lets the registry retire that hold as foreign, already-contained history', async () => {
    const fixture = createTaskResultSettlementV2Fixture({ terminal: 'accepted-only' });
    const harness = recoveryHarness(fixture, 'container-absent');
    const registry = createExactNormalDockerExecutionRegistry(projectRoot());
    registry.rehydrateRecovery({
      adopted: [], closedNotDispatched: [], closedAbsentAfterExit: [],
      retiredLanded: [], resumedContinuations: [], exactEntries: [], held: [],
    }, harness.backend);
    // Seeded so the skip is proven to DELETE the entry: a survivor owned by
    // this backend would reach the containment inventory sweep and throw
    // `EXACT_CONTAINMENT_INCOMPLETE` instead.
    registry.registerHold(harness.identity.taskId, 'seeded-prior-hold', harness.backend);
    expect(registry.readTaskResultAuthority(harness.identity.taskId).state)
      .toBe('authority-hold');

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: (taskId: string) => taskId === harness.identity.taskId,
    })).resolves.toHaveLength(1);

    expect(registry.readTaskResultAuthority(harness.identity.taskId).state)
      .not.toBe('authority-hold');
    expect(registry.snapshotExactTerminalAuthorities().has(harness.identity.taskId))
      .toBe(false);
    expect(registry.snapshotHistoricalUnsettleableAttempts()
      .has(harness.identity.taskId)).toBe(true);
  });

  it('still recovers the same attempt when the archive chain is absent', async () => {
    const fixture = createTaskResultSettlementV2Fixture({ terminal: 'accepted-only' });
    const harness = recoveryHarness(fixture);

    const report = await harness.backend.reconcilePendingAttempts();

    expect(report.historicalArchived).toBeUndefined();
    expect(report.closedAbsentAfterExit).toContain(harness.identity.taskId);
    expect(report.exactEntries).toEqual([expect.objectContaining({
      kind: 'accepted',
      taskId: harness.identity.taskId,
    })]);
    expect(report.held).toEqual([]);
    expect(harness.readColdExactDockerAcceptedResult).toHaveBeenCalledTimes(1);
  });
});
