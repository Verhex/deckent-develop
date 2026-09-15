import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import { createExactNormalDockerExecutionRegistry } from '../../src/orchestra/scheduler-effects.js';
import { prepareExactSprintLifecycle } from '../../src/orchestra/sprint-lifecycle.js';
import { resolveOuterStagedSettlementBarrier } from '../../src/orchestra/sprint-phases.js';
import { TaskEvaluation, TaskStatus, type Task } from '../../src/core/task-types.js';
import type { SpawnBackendRecoveryReport } from '../../src/orchestra/spawn-backend.js';

describe('held exact containment before outer barrier', () => {
  it.each((['absent', 'present', 'unknown'] as const).flatMap(state => [
    { state, fails: false }, { state, fails: true },
  ]))('uses daemon $state independently of retained/catch bookkeeping (fails=$fails)', async ({ state, fails }) => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-held-contain-'));
    try {
      const backend = new DockerSpawnBackend(root);
      const internals = backend as unknown as {
        containers: Map<string, unknown>;
        openExactDockerRecoveryStore: () => unknown;
        reconstructExactDockerRecoveryScope: () => unknown;
        readExactAbortedPartialDisposition: () => unknown;
        readExactReleasedUnacceptedDisposition: () => unknown;
        observeExactDockerDaemonContainerState: () => Promise<string>;
        reconcileExactDockerCustodyAdmissions: (report: SpawnBackendRecoveryReport, options: {mode: 'contain'}) => Promise<void>;
      };
      const identity = { taskId: 'a' };
      const ref = { identity, dispatchRequestId: 'dispatch-a', refDigest: `sha256:${'a'.repeat(64)}` };
      internals.containers.set('a', { containerId: 'container-a' });
      expect(backend.workerInventoryState('a')).toBe('active');
      vi.spyOn(internals, 'openExactDockerRecoveryStore').mockReturnValue({ policy: {}, store: {
        listDispatchAdmissionsForRecovery: () => ({ heldAdmissions: [], entries: [{ state: 'admitted', ref }] }),
        readDispatchAuthority: () => ({ state: 'terminal', authority: { state: 'RELEASED', backendExecutionId: 'container-a' } }),
      } });
      vi.spyOn(internals, 'reconstructExactDockerRecoveryScope').mockReturnValue({ identity });
      vi.spyOn(internals, 'readExactAbortedPartialDisposition').mockReturnValue(null);
      vi.spyOn(internals, 'readExactReleasedUnacceptedDisposition').mockImplementation(() => {
        if (fails) throw new Error('release disposition unreadable');
        return { retained: true };
      });
      vi.spyOn(internals, 'observeExactDockerDaemonContainerState').mockResolvedValue(state);
      vi.spyOn(backend, 'reconcilePendingAttempts').mockImplementation(async () => {
        const report: SpawnBackendRecoveryReport = { adopted: [], closedNotDispatched: [], closedAbsentAfterExit: [], retiredLanded: [], resumedContinuations: [], held: [] };
        await internals.reconcileExactDockerCustodyAdmissions(report, { mode: 'contain' });
        return report;
      });
      const registry = createExactNormalDockerExecutionRegistry(root);
      registry.registerHold('a', 'EFFECT_RELEASE_HOLD', backend);
      const contain = prepareExactSprintLifecycle(registry, 'contain', { currentTaskIds: new Set(['a', 'b', 'c']) });
      if (state !== 'absent') {
        await expect(contain).rejects.toThrow('EXACT_CONTAINMENT_INCOMPLETE');
        expect(backend.workerInventoryState('a')).toBe(state === 'present' ? 'active' : 'unknown');
        return;
      }
      await expect(contain).resolves.toBeUndefined();
      expect(backend.workerInventoryState('a')).toBe('absent');
      expect(internals.containers.has('a')).toBe(true);
      expect(registry.readTaskResultAuthority('a').state).toBe('authority-hold');
      const barrier = resolveOuterStagedSettlementBarrier({ sprintId: 'sprint-fixture',
        tasks: [{ id: 'a', status: TaskStatus.PAUSED }, { id: 'b', status: TaskStatus.DONE }, { id: 'c', status: TaskStatus.PENDING }] as Task[],
        evaluations: new Map([['a', TaskEvaluation.EFFECT_HOLD], ['b', TaskEvaluation.DONE]]), results: [],
      });
      expect(barrier).toMatchObject({ state: 'BLOCKED', effectHeldTaskIds: ['a'], preservedSettledTaskIds: ['b'] });
      internals.containers.set('a', { containerId: 'new-attempt-container' });
      expect(backend.workerInventoryState('a')).toBe('unknown');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
