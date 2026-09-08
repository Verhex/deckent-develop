import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveApprovedSnapshot, type StoredApprovedSnapshot } from '../../../src/core/run-flow-store.js';
import { SprintPhase, SprintStatus } from '../../../src/core/sprint-types.js';
import { TaskStatus } from '../../../src/core/task-types.js';
import { createLiveExactSprintExecutor } from '../../../src/cli/helpers/exact-sprint-runtime.js';
import {
  _resetRunFlowCoordinatorsForTests,
  getRunFlowCoordinator,
} from '../../../src/orchestra/run-flow-coordinator-registry.js';
import { runSprint } from '../../../src/orchestra/sprint-controller.js';

vi.mock('../../../src/orchestra/sprint-controller.js', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('../../../src/orchestra/sprint-controller.js')>();
  return { ...original, runSprint: vi.fn() };
});

const fixtureRoots = new Set<string>();

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'live-exact-runtime-'));
  fixtureRoots.add(root);
  return root;
}

function approvedSnapshot(root: string): StoredApprovedSnapshot {
  return {
    flowId: 'flow-live',
    revision: 1,
    planDigest: 'digest-live',
    approvedBy: { id: 'operator' },
    approvedAt: '2026-09-08T00:00:00.000Z',
    sourceAuthority: {
      schemaVersion: 1,
      sourceKind: 'directives',
      contentSha256: '1'.repeat(64),
      configSha256: '2'.repeat(64),
      proposalSha256: '3'.repeat(64),
      planningInputSha256: '4'.repeat(64),
      scopeInputSha256: '5'.repeat(64),
      lineageSha256: '6'.repeat(64),
    },
    proposal: {
      flowId: 'flow-live', tenant: 'tenant-1', project: root, actor: { id: 'operator' },
      origin: 'terminal', revision: 1, intentSummary: 'run exact approved work',
    },
    planLineage: {
      tenantId: 'tenant-1', actor: { id: 'operator' }, origin: 'terminal',
      correlationId: 'plan-correlation', idempotencyKey: 'plan-idempotency', sourceRef: 'source-plan',
    },
    sprint: {
      id: 'sprint-live', number: 1, status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
      workers: ['worker-1'],
      tasks: [{
        id: '1-001', title: 'Exact', description: 'Exact work', model: 'claude-sonnet-5',
        effort: 'normal', priority: 'NORMAL', reason: 'fixture',
        scope: { directories: [], filesRead: [], filesWrite: ['src/exact.ts'] }, dependencies: [],
        goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        status: TaskStatus.PENDING,
      }],
    },
  };
}

function seedApprovedFlow(root: string, snapshot: StoredApprovedSnapshot): void {
  const coordinator = getRunFlowCoordinator(root);
  coordinator.proposeFlow({
    proposal: snapshot.proposal!,
    commandId: `fixture:${snapshot.flowId}:propose`,
  });
  coordinator.recordPreview({
    preview: {
      flowId: snapshot.flowId,
      revision: snapshot.revision,
      planDigest: snapshot.planDigest,
      taskSummaries: [],
      policyDecision: 'allow',
      gateResult: 'pass',
    },
    commandId: `fixture:${snapshot.flowId}:preview`,
  });
  coordinator.grantApproval({
    flowId: snapshot.flowId,
    revision: snapshot.revision,
    planDigest: snapshot.planDigest,
    approvedBy: snapshot.approvedBy,
    commandId: `fixture:${snapshot.flowId}:approve`,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  _resetRunFlowCoordinatorsForTests();
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
  fixtureRoots.clear();
});

describe('createLiveExactSprintExecutor', () => {
  it('projects settled completion through the real coordinator and keeps duplicate replay terminal', async () => {
    const root = createFixtureRoot();
    const snapshot = approvedSnapshot(root);
    seedApprovedFlow(root, snapshot);
    saveApprovedSnapshot(root, snapshot);
    vi.mocked(runSprint).mockImplementation(async (_root, _config, options) => {
      options?.onExecutionAdmitted?.(approvedSnapshot(root).sprint);
      return { ...approvedSnapshot(root).sprint, status: SprintStatus.COMPLETE };
    });
    const executor = createLiveExactSprintExecutor({});
    const input = {
      projectRoot: root,
      config: {} as never,
      source: {
        kind: 'exact-ref' as const,
        ref: { schemaVersion: 1 as const, flowId: 'flow-live', revision: 1, planDigest: 'digest-live' },
        ingress: { kind: 'terminal' as const, id: 'terminal-session' },
      },
      lineage: {
        tenantId: 'tenant-1', actor: { id: 'operator' }, origin: 'terminal' as const,
        correlationId: 'start-correlation', causationId: 'plan-correlation',
        idempotencyKey: 'start-idempotency',
        sourceId: 'terminal-session', authorization: { kind: 'approved-actor' as const },
      },
      executionMode: 'in-process' as const,
    };

    const outcome = await executor.execute(input);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      status: 'settled', settlement: { state: 'COMPLETED' },
    });
    expect(getRunFlowCoordinator(root).getFlow('flow-live').state).toBe('COMPLETED');
    await expect(executor.execute(input)).resolves.toMatchObject({
      status: 'duplicate', attempt: { state: 'COMPLETED' },
    });
    expect(getRunFlowCoordinator(root).getFlow('flow-live').state).toBe('COMPLETED');
    expect(runSprint).toHaveBeenCalledTimes(1);
  });

  it('denies a caller whose causation does not bind the approved plan lineage', async () => {
    const root = createFixtureRoot();
    saveApprovedSnapshot(root, approvedSnapshot(root));
    const executor = createLiveExactSprintExecutor({});

    const outcome = await executor.execute({
      projectRoot: root,
      config: {} as never,
      source: {
        kind: 'exact-ref',
        ref: { schemaVersion: 1, flowId: 'flow-live', revision: 1, planDigest: 'digest-live' },
        ingress: { kind: 'terminal', id: 'terminal-session' },
      },
      lineage: {
        tenantId: 'tenant-1', actor: { id: 'operator' }, origin: 'terminal',
        correlationId: 'start-correlation', causationId: 'wrong-plan-correlation',
        idempotencyKey: 'wrong-causation', sourceId: 'terminal-session',
        authorization: { kind: 'approved-actor' },
      },
      executionMode: 'in-process',
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      status: 'denied',
      reasonCode: 'EXACT_START_LINEAGE_DENIED',
    });
    expect(runSprint).not.toHaveBeenCalled();
  });
});
