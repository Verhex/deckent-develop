import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
} from '../../src/core/task-attempt-custody-store.js';
import { createTaskAttemptCustodyPosixAdapter } from '../../src/core/task-attempt-custody-posix-adapter.js';
import { attendedExecutionProjectId } from '../../src/core/attended-execution-approval.js';
import {
  createExactDockerCustodyPolicy,
  preflightExactDockerCustodyRoot,
  reconcileExactDockerPendingReservationsForSprint,
  resolveExactDockerCustodyRoot,
} from '../../src/orchestra/spawn-backend-docker.js';
import { preflightPlanningExecutionAuthority } from '../../src/orchestra/spawn-backend.js';

function fixture(): { root: string; project: string; state: string } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-planning-custody-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const state = join(root, 'host-state');
  mkdirSync(project);
  return { root, project, state };
}

function treeSnapshot(root: string): readonly string[] {
  const rows: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const info = lstatSync(path);
      const label = relative(root, path);
      if (info.isDirectory()) {
        rows.push(`d:${label}:${info.mode & 0o777}`);
        visit(path);
      } else {
        rows.push(`f:${label}:${info.mode & 0o777}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
      }
    }
  };
  visit(root);
  return Object.freeze(rows);
}

describe('exact Docker custody planning preflight', () => {
  it('rejects a host state root physically nested under the project before dispatch', () => {
    const { project } = fixture();

    expect(() => preflightExactDockerCustodyRoot(project, {
      stateDir: join(project, '.deckent', 'host-state'),
    })).toThrowError(expect.objectContaining({
      code: 'HOST_ROOT_INSIDE_PROJECT',
      operation: 'open-root',
    }));
  });

  it.skipIf(process.platform !== 'linux')(
    'returns native physical-separation authority for an outside private state root',
    () => {
      const { project, state } = fixture();
      const proof = preflightExactDockerCustodyRoot(project, { stateDir: state });

      expect(proof.platform).toBe('posix');
      expect(proof.projectId).toMatch(/^[a-f0-9]{64}$/u);
      expect(proof.rootId).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(proof.capabilityEvidenceDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'reads interrupted admission publication as a graph hold without mutating its Store tree',
    () => {
      const { project, state } = fixture();
      const absoluteRoot = resolveExactDockerCustodyRoot(project, { stateDir: state });
      const adapter = createTaskAttemptCustodyPosixAdapter();
      const publish = adapter.publishBytesFirstWriter.bind(adapter);
      let interruptedAdmissionPublication = false;
      vi.spyOn(adapter, 'publishBytesFirstWriter').mockImplementation((input) => {
        if (input.relativePath.endsWith('/admission.json')) {
          interruptedAdmissionPublication = true;
          throw new Error('injected admission publication interruption');
        }
        return publish(input);
      });
      const store = TaskAttemptCustodyStore.open({
        adapter,
        absoluteRoot,
        canonicalProjectRoot: project,
        projectId: attendedExecutionProjectId(project),
        create: true,
      });
      const policy = createExactDockerCustodyPolicy();
      const reserve = () => store.reserveDispatchAdmission({
        dispatchRequestId: `dreq-${'1'.repeat(64)}`,
        dispatchRequestMaterial: { taskId: '714-001' },
        taskId: '714-001',
        taskSnapshot: { id: '714-001', scope: { filesRead: [], filesWrite: ['docs/result.md'] } },
        policy,
        reservedAt: '2026-09-04T08:08:00.000Z',
        predecessor: null,
      });
      let admissionError: unknown;
      try { reserve(); } catch (error) { admissionError = error; }
      // Keep the exact error visible in failed reports; an earlier native hold
      // must not masquerade as the publication interruption exercised here.
      expect(admissionError).toBeInstanceOf(TaskAttemptCustodyHold);
      expect(admissionError).toMatchObject({ code: 'PUBLISHED_UNCONFIRMED' });
      expect(interruptedAdmissionPublication).toBe(true);
      const before = treeSnapshot(absoluteRoot);

      let preflightError: unknown;
      try {
        preflightPlanningExecutionAuthority({ projectRoot: project, backend: 'docker', stateDir: state });
      } catch (error) { preflightError = error; }
      expect(preflightError, JSON.stringify(preflightError)).toMatchObject({
        code: 'EXACT_CUSTODY_RECOVERY_REQUIRED',
        unresolved: [expect.objectContaining({
          taskId: '714-001',
          dispatchRequestId: `dreq-${'1'.repeat(64)}`,
          // Admission directories and task snapshot already exist: this is a
          // partial graph, not a reservation whose admission has never begun.
          reasonCode: 'ADMISSION_GRAPH_HOLD',
          custodyHoldCode: 'INCOMPLETE_PUBLICATION',
        })],
      });
      expect(treeSnapshot(absoluteRoot)).toEqual(before);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'reads a durable reservation before admission begins without mutating its Store tree',
    () => {
      const { project, state } = fixture();
      const absoluteRoot = resolveExactDockerCustodyRoot(project, { stateDir: state });
      const store = TaskAttemptCustodyStore.open({
        adapter: createTaskAttemptCustodyPosixAdapter(),
        absoluteRoot,
        canonicalProjectRoot: project,
        projectId: attendedExecutionProjectId(project),
        create: true,
      });
      const policy = createExactDockerCustodyPolicy();
      const stopBeforeAdmission = new Error('fixture stopped after durable reservation');
      // The real reserve producer writes the material and reservation. Stop at
      // its public admission boundary, without fabricating any custody record.
      const createAdmission = vi.spyOn(store, 'createAdmission').mockImplementation(() => {
        throw stopBeforeAdmission;
      });
      expect(() => store.reserveDispatchAdmission({
        dispatchRequestId: `dreq-${'2'.repeat(64)}`,
        dispatchRequestMaterial: { taskId: '714-002' },
        taskId: '714-002',
        taskSnapshot: { id: '714-002', scope: { filesRead: [], filesWrite: ['docs/result.md'] } },
        policy,
        reservedAt: '2026-09-04T08:08:00.000Z',
        predecessor: null,
      })).toThrow(stopBeforeAdmission);
      expect(createAdmission).toHaveBeenCalledTimes(1);
      expect(store.readDispatchAdmission({ dispatchRequestId: `dreq-${'2'.repeat(64)}`, policy }).state)
        .toBe('reserved-pending-admission');
      const before = treeSnapshot(absoluteRoot);
      let preflightError: unknown;
      try {
        preflightPlanningExecutionAuthority({ projectRoot: project, backend: 'docker', stateDir: state });
      } catch (error) { preflightError = error; }
      expect(preflightError, JSON.stringify(preflightError)).toMatchObject({
        code: 'EXACT_CUSTODY_RECOVERY_REQUIRED',
        unresolved: [{
          dispatchRequestId: `dreq-${'2'.repeat(64)}`,
          taskId: '714-002',
          reasonCode: 'ADMISSION_RECONCILIATION_REQUIRED',
          custodyHoldCode: null,
        }],
      });
      expect(treeSnapshot(absoluteRoot)).toEqual(before);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'keeps explicit authenticated reservation recovery separate from read-only planning preflight',
    () => {
      const { project, state } = fixture();
      const absoluteRoot = resolveExactDockerCustodyRoot(project, { stateDir: state });
      const adapter = createTaskAttemptCustodyPosixAdapter();
      const publish = adapter.publishBytesFirstWriter.bind(adapter);
      vi.spyOn(adapter, 'publishBytesFirstWriter').mockImplementation((input) => {
        if (input.relativePath.endsWith('/reservation-transition.json')) {
          throw new Error('injected transition publication interruption');
        }
        return publish(input);
      });
      const store = TaskAttemptCustodyStore.open({
        adapter,
        absoluteRoot,
        canonicalProjectRoot: project,
        projectId: attendedExecutionProjectId(project),
        create: true,
      });
      const policy = createExactDockerCustodyPolicy();
      expect(() => store.reserveDispatchAdmission({
        dispatchRequestId: `dreq-${'3'.repeat(64)}`,
        dispatchRequestMaterial: { taskId: '714-003' },
        taskId: '714-003',
        taskSnapshot: { id: '714-003', scope: { filesRead: [], filesWrite: ['docs/result.md'] } },
        policy,
        reservedAt: '2026-09-04T08:08:00.000Z',
        predecessor: null,
      })).toThrowError(expect.objectContaining({ code: 'PUBLISHED_UNCONFIRMED' }));

      const recovery = reconcileExactDockerPendingReservationsForSprint({
        projectRoot: project,
        sprintId: 'sprint-714',
        recoveryAuthority: {
          executionId: 'sprint-714',
          taskId: 'sprint-714',
          attemptId: 'sprint-714:recovery:0',
          fenceToken: 'fence-714',
          approvalRef: 'approval:714',
          idempotencyKey: 'recover-714-once',
        },
        reconciledAt: '2026-09-04T09:00:00.000Z',
        stateDir: state,
      });
      expect(recovery.reconciled).toEqual([
        expect.objectContaining({ taskId: '714-003', state: 'admitted' }),
      ]);
      expect(preflightPlanningExecutionAuthority({
        projectRoot: project,
        backend: 'docker',
        stateDir: state,
      })).toMatchObject({ state: 'ready', backend: 'docker' });
    },
  );
});
