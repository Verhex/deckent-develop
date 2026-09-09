import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskStatus, type Task } from '../../src/core/types.js';
import {
  createExactNormalDockerExecutionRegistry,
  executeSpawnTask,
} from '../../src/orchestra/scheduler-effects.js';
import { createHistoricalForeignTaskPredicate } from '../../src/orchestra/sprint-controller.js';
import type {
  SpawnBackend,
  SpawnBackendRecoveryReport,
} from '../../src/orchestra/spawn-backend.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('scheduler effects repair disposition gate', () => {
  it('returns typed no-mint without resolving a prompt or dispatching', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-no-mint-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    writeFileSync(join(root, '.tasks', 'task-root.result'), JSON.stringify({
      taskId: 'root', workerId: 'host', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: 'host rejection',
      preDispatchSettlement: { state: 'NOT_DISPATCHED', reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE', attemptId: 'a', evidenceRef: 'e' },
    }));
    const task = { id: 'root-fix', fixForTaskId: 'root', isPriorityFix: true, status: TaskStatus.PENDING } as Task;
    const resolveAgentPrompt = vi.fn(async () => undefined);

    await expect(executeSpawnTask({ task }, {
      projectRoot: root, sprintFallbackId: 's', config: undefined,
      resolveAgentPrompt, resolveSkillPrompts: async () => [], buildWriteTargets: () => [],
    })).resolves.toMatchObject({ kind: 'no-mint', taskId: 'root-fix', fixForTaskId: 'root' });
    expect(resolveAgentPrompt).not.toHaveBeenCalled();
  });
});

describe('exact registry historical unsettleable retirement', () => {
  it('removes the entry so no consumer can read it back as an authority hold', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-historical-retire-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    const registry = createExactNormalDockerExecutionRegistry(root);
    const taskId = '728-001';
    registry.registerHold(taskId, 'exact-terminal-awaiting-settlement');

    expect(registry.readTaskResultAuthority(taskId).state).toBe('authority-hold');
    expect(registry.snapshotExactTerminalAuthorities().has(taskId)).toBe(true);

    registry.retireHistoricalUnsettleableAttempt(
      taskId,
      'production-wiring-verifier-asset-invalid',
    );

    // A held entry is what sprint-lifecycle.ts:200-206 and
    // sprint-spawner.ts:1994-2003 turn into E077. Retirement must remove it
    // from the registry, not park it in another held state.
    expect(registry.snapshotExactTerminalAuthorities().has(taskId)).toBe(false);
    expect(registry.readTaskResultAuthority(taskId).state).toBe('pending-settlement');
    expect(registry.readExactTerminalAuthority(taskId)).toMatchObject({
      state: 'hold', reasonCode: 'exact-registry-entry-unavailable',
    });
    expect(registry.snapshotHistoricalUnsettleableAttempts().get(taskId))
      .toMatchObject({ reasonCode: 'production-wiring-verifier-asset-invalid' });
    expect(registry.snapshotHistoricalUnsettleableAttempts().get(taskId)?.retiredAt)
      .toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });
});

// ─── Foreign, already-contained history must not brick a live run ────────────
//
// Measured 2026-09-09: sprint-729 (flow `4c5c9721`) and sprint-730 (flow
// `561882f2`) both died with `RUN_FAILED: EXACT_LIFECYCLE_CONTAIN_HOLD`. The
// FIX-phase containment barrier re-reads EVERY dispatch admission in the
// project custody store; `728-001` — released, provider-exited, custody chain
// stopping at `02-accepted-result`, owning sprint-728 ABORTED three days
// earlier, container and both effect volumes long deleted — could not be
// contained, so its hold threw and killed a run that had nothing to do with it.
//
// The skip is admitted ONLY with proof on every axis: containment mode, a
// terminal dispatch authority, a daemon that reports the backend execution
// ABSENT, no live worker inventory, and a caller-proven historical-foreign
// origin. Anything less keeps the byte-identical throw.
describe('exact registry containment holds from foreign terminal history', () => {
  const heldReport = (
    taskId: string,
    daemonContainerState?: 'absent' | 'present' | 'unknown',
  ): SpawnBackendRecoveryReport => ({
    adopted: [],
    closedNotDispatched: [],
    closedAbsentAfterExit: [],
    retiredLanded: [],
    resumedContinuations: [],
    exactEntries: [],
    held: [{
      kind: 'spawn-backend-recovery-hold',
      backend: 'docker',
      dispatchRequestId: `dreq-${taskId}`,
      taskId,
      admissionRefDigest: `sha256:${'6'.repeat(64)}`,
      authorityState: 'DISPATCH_TERMINAL',
      reasonCode: 'TERMINAL_RECONCILIATION_REQUIRED',
      custodyHoldCode: 'REHYDRATE_AUTHORITY_MISMATCH',
      ...(daemonContainerState ? { daemonContainerState } : {}),
    }],
  });

  function harness(report: SpawnBackendRecoveryReport) {
    const root = mkdtempSync(join(tmpdir(), 'deckent-contain-hold-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    const registry = createExactNormalDockerExecutionRegistry(root);
    const backend = {
      name: 'docker',
      workerInventoryState: (): 'active' | 'absent' | 'unknown' => 'unknown',
      reconcilePendingAttempts: vi.fn(async () => report),
    } as unknown as SpawnBackend;
    // Registers the backend as this registry's recovery owner without seeding
    // any entry, exactly as a production start does before reconciliation.
    registry.rehydrateRecovery({
      adopted: [], closedNotDispatched: [], closedAbsentAfterExit: [],
      retiredLanded: [], resumedContinuations: [], exactEntries: [], held: [],
    }, backend);
    return { registry, backend, root };
  }

  // sprint-728 is durably terminal; sprint-731 is the run being reconciled.
  const foreignHistory = (projectRoot: string) => createHistoricalForeignTaskPredicate(
    projectRoot,
    'sprint-731',
    sprintId => (sprintId === 'sprint-728' ? 'terminal' : 'unknown'),
  );

  it('skips a foreign terminal task whose daemon container is absent', async () => {
    const { registry, backend, root } = harness(heldReport('728-001', 'absent'));
    // Seed the entry so the skip is proven to DELETE it rather than merely to
    // leave an entry that never existed. A surviving entry owned by this
    // backend would also reach the `mode === 'contain'` inventory sweep below
    // and throw `EXACT_CONTAINMENT_INCOMPLETE` three lines later.
    registry.registerHold('728-001', 'seeded-prior-hold', backend);
    expect(registry.readTaskResultAuthority('728-001').state).toBe('authority-hold');

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).resolves.toHaveLength(1);

    // Never registered: a `hold` entry reads back as `authority-hold` and
    // re-bricks every later start, so recording it is not equivalent.
    expect(registry.readTaskResultAuthority('728-001').state).not.toBe('authority-hold');
    expect(registry.snapshotExactTerminalAuthorities().has('728-001')).toBe(false);
    expect(registry.snapshotHistoricalUnsettleableAttempts().get('728-001'))
      .toMatchObject({ reasonCode: 'contain-skipped-historical:REHYDRATE_AUTHORITY_MISMATCH' });
  });

  it('throws byte-identically for a hold on the current run task', async () => {
    const { registry, root } = harness(heldReport('731-002', 'absent'));

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({
      code: 'DECKENT_E091',
      message: 'EXACT_LIFECYCLE_CONTAIN_HOLD',
    });
    expect(registry.readTaskResultAuthority('731-002').state).toBe('authority-hold');
  });

  it('throws when the owning run of the held task cannot be proven', async () => {
    const { registry, root } = harness(heldReport('legacy-task', 'absent'));

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
    expect(registry.readTaskResultAuthority('legacy-task').state).toBe('authority-hold');
  });

  it('throws when the owning run is listed but not durably terminal', async () => {
    const { registry, root } = harness(heldReport('729-001', 'absent'));

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
  });

  // A FUTURE/concurrent ordinal is not history, whatever its disposition reads.
  it('throws for a hold on a later sprint than the run being reconciled', async () => {
    const { registry, root } = harness(heldReport('731-001', 'absent'));

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
    expect(registry.readTaskResultAuthority('731-001').state).toBe('authority-hold');
  });

  it.each([
    ['present', 'present' as const],
    ['unknown', 'unknown' as const],
    ['unobserved', undefined],
  ])('throws when the daemon container state is %s', async (_label, state) => {
    const { registry, root } = harness(heldReport('728-001', state));

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
    expect(registry.readTaskResultAuthority('728-001').state).toBe('authority-hold');
  });

  it('throws when no predicate is injected (legacy call sites unchanged)', async () => {
    const { registry } = harness(heldReport('728-001', 'absent'));

    await expect(registry.reconcileExactLifecycle('contain'))
      .rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
    expect(registry.readTaskResultAuthority('728-001').state).toBe('authority-hold');
  });

  it('never skips in resume mode', async () => {
    const { registry, root } = harness(heldReport('728-001', 'absent'));

    await expect(registry.reconcileExactLifecycle('resume', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_RESUME_HOLD' });
    expect(registry.readTaskResultAuthority('728-001').state).toBe('authority-hold');
  });

  it('keeps the throw when the backend still inventories a live worker', async () => {
    const { registry, backend, root } = harness(heldReport('728-001', 'absent'));
    (backend as unknown as Record<string, unknown>).workerInventoryState = () => 'active';

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
  });
});

// ─── `historical` means EARLIER, never future or concurrent ─────────────────
//
// `!==` would admit a task whose owning ordinal is AHEAD of the run being
// reconciled (current sprint-730, task `731-001`) whenever its origin happens
// to read `terminal`. A run that has not started yet, or a sibling
// coordinator's, is not this run's history: the boundary is strictly earlier.
describe('historical foreign task predicate ordinal boundary', () => {
  const predicate = (currentSprintId: string | null) =>
    createHistoricalForeignTaskPredicate(
      '/test/project',
      currentSprintId,
      () => 'terminal',
    );

  it('admits only an earlier sprint than the current run', () => {
    const isHistorical = predicate('sprint-730');
    expect(isHistorical('728-001')).toBe(true);
    expect(isHistorical('730-001')).toBe(false);
    expect(isHistorical('731-001')).toBe(false);
  });

  it('treats a zero-padded current sprint id as the same sprint', () => {
    // `getNextSprintId` mints `sprint-007` while its task ids carry `7-001`.
    expect(predicate('sprint-007')('7-001')).toBe(false);
    expect(predicate('sprint-007')('6-001')).toBe(true);
    expect(predicate('sprint-007')('8-001')).toBe(false);
  });

  it('fails closed on an unprovable current run or task origin', () => {
    expect(predicate(null)('728-001')).toBe(false);
    expect(predicate('not-a-sprint-id')('728-001')).toBe(false);
    expect(predicate('sprint-730')('cold-settlement-hold-001')).toBe(false);
    expect(predicate('sprint-730')('1700000000000-001')).toBe(false);
  });

  it('still requires a durably terminal owning run', () => {
    const isHistorical = createHistoricalForeignTaskPredicate(
      '/test/project',
      'sprint-730',
      () => 'not-terminal',
    );
    expect(isHistorical('728-001')).toBe(false);
  });
});

// ─── The run's OWN archived attempt must satisfy the containment sweep ───────
//
// Measured 2026-09-09 (sprint-731, flow `fd218d1c`): `731-001` was evaluated,
// settled and archived (custody chain 01→06 complete, container long exited)
// BEFORE the FIX-phase containment barrier ran. The docker backend reported it
// as `historicalArchived` but recorded no worker absence, the sweep below read
// its inventory back as `unknown` and the run died with
// `EXACT_CONTAINMENT_INCOMPLETE` — one line after the previous fix had
// correctly retired foreign `728-001`.
//
// The backend now inventories an archived attempt `absent` only after the
// daemon proves the container gone. The sweep's own semantics are unchanged:
// `absent` is REQUIRED, `unknown` still throws, and an archived attempt whose
// container the daemon still knows is a hold that history retirement never
// consumes — even for a strictly earlier ordinal.
describe('exact registry containment sweep over archived attempts', () => {
  const taskId = '731-001';
  const accepted = {
    reader: { kind: 'accepted-result-reader', taskId },
    acceptedResultRef: `sha256:${'1'.repeat(64)}`,
    acceptedResultChainDigest: `sha256:${'2'.repeat(64)}`,
    resultDigest: `sha256:${'3'.repeat(64)}`,
  };
  const query = {
    custodyRef: {
      identity: { taskId, attemptId: 'attempt-1', generation: 1, projectId: 'project' },
      admissionReceiptDigest: `sha256:${'4'.repeat(64)}`,
    },
  };
  const emptyReport = (): SpawnBackendRecoveryReport => ({
    adopted: [], closedNotDispatched: [], closedAbsentAfterExit: [],
    retiredLanded: [], resumedContinuations: [], exactEntries: [], held: [],
  });

  function harness(
    inventoryAfterContain: 'absent' | 'unknown',
    containReport: SpawnBackendRecoveryReport,
  ) {
    const root = mkdtempSync(join(tmpdir(), 'deckent-archived-sweep-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'));
    const registry = createExactNormalDockerExecutionRegistry(root);
    let contained = false;
    const backend = {
      name: 'docker',
      // `absent` is recorded by the backend only during containment, exactly
      // as `exactReconciledWorkerAbsence` is populated in production.
      workerInventoryState: (): 'active' | 'absent' | 'unknown' =>
        (contained ? inventoryAfterContain : 'unknown'),
      readExactDockerAcceptedResult: () => accepted,
      reconcilePendingAttempts: vi.fn(async () => {
        contained = true;
        return containReport;
      }),
    } as unknown as SpawnBackend;
    // Seed the CURRENT run's accepted entry, owned by this backend, exactly
    // as the EXECUTE/EVALUATE phases leave it before FIX runs containment.
    registry.rehydrateRecovery({
      ...emptyReport(),
      exactEntries: [{ kind: 'accepted', taskId, query, accepted }],
    } as unknown as SpawnBackendRecoveryReport, backend);
    // An accepted entry awaiting settlement — the shape the sweep iterates.
    expect(registry.readExactTerminalAuthority(taskId)).toMatchObject({
      state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
    });
    return { registry, backend, root };
  }

  // sprint-728 is durably terminal; sprint-731 is the run being reconciled.
  const foreignHistory = (projectRoot: string) => createHistoricalForeignTaskPredicate(
    projectRoot,
    'sprint-731',
    sprintId => (sprintId === 'sprint-728' ? 'terminal' : 'unknown'),
  );

  it('completes containment when the archived current-run attempt inventories absent', async () => {
    const { registry, backend, root } = harness('absent', {
      ...emptyReport(), historicalArchived: [taskId],
    });

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).resolves.toHaveLength(1);

    expect(vi.mocked(backend.reconcilePendingAttempts!)).toHaveBeenCalledWith({ mode: 'contain' });
    // The entry is the run's own settled result: it is neither retired as
    // history nor held — it simply passes the sweep by observed absence.
    expect(registry.readExactTerminalAuthority(taskId)).toMatchObject({
      state: 'hold', reasonCode: 'exact-terminal-awaiting-settlement',
    });
    expect(registry.snapshotHistoricalUnsettleableAttempts().has(taskId)).toBe(false);
  });

  // Regression guard for the sweep itself: `historicalArchived` alone is never
  // proof of containment; the inventory must read `absent`.
  it('still throws EXACT_CONTAINMENT_INCOMPLETE when the archived attempt inventories unknown', async () => {
    const { registry, root } = harness('unknown', {
      ...emptyReport(), historicalArchived: [taskId],
    });

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({
      code: 'DECKENT_E091',
      message: 'EXACT_CONTAINMENT_INCOMPLETE',
    });
    expect(registry.readExactTerminalAuthority(taskId)).toMatchObject({
      state: 'hold', reasonCode: 'EXACT_CONTAINMENT_INCOMPLETE',
    });
  });

  it('never retires an archived attempt whose container is present, even from an earlier run', async () => {
    const { registry, root } = harness('absent', {
      ...emptyReport(),
      held: [{
        kind: 'spawn-backend-recovery-hold',
        backend: 'docker',
        dispatchRequestId: 'dreq-728-001',
        taskId: '728-001',
        admissionRefDigest: `sha256:${'6'.repeat(64)}`,
        authorityState: 'DISPATCH_TERMINAL',
        reasonCode: 'ARCHIVED_ATTEMPT_CONTAINER_PRESENT',
        daemonContainerState: 'present',
      }],
    });

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({
      code: 'DECKENT_E091',
      message: 'EXACT_LIFECYCLE_CONTAIN_HOLD',
    });
    expect(registry.readTaskResultAuthority('728-001').state).toBe('authority-hold');
    expect(registry.readExactTerminalAuthority('728-001')).toMatchObject({
      state: 'hold', reasonCode: 'ARCHIVED_ATTEMPT_CONTAINER_PRESENT',
    });
    expect(registry.snapshotHistoricalUnsettleableAttempts().has('728-001')).toBe(false);
  });

  it('never retires an archived attempt whose container state is unknown', async () => {
    const { registry, root } = harness('absent', {
      ...emptyReport(),
      held: [{
        kind: 'spawn-backend-recovery-hold',
        backend: 'docker',
        dispatchRequestId: 'dreq-728-001',
        taskId: '728-001',
        admissionRefDigest: `sha256:${'6'.repeat(64)}`,
        authorityState: 'DISPATCH_TERMINAL',
        reasonCode: 'ARCHIVED_ATTEMPT_CONTAINER_STATE_UNKNOWN',
        daemonContainerState: 'unknown',
      }],
    });

    await expect(registry.reconcileExactLifecycle('contain', {
      isHistoricalForeignTask: foreignHistory(root),
    })).rejects.toMatchObject({ message: 'EXACT_LIFECYCLE_CONTAIN_HOLD' });
    expect(registry.readTaskResultAuthority('728-001').state).toBe('authority-hold');
  });
});
