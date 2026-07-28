import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  loadRunHandle,
  loadStartAttempt,
  saveApprovedSnapshot,
  type StoredApprovedSnapshot,
} from '../../src/core/run-flow-store.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import {
  admitExactRunAttempt,
  createCanonicalExactSprintExecutor,
  ExactPlanStartError,
  materializeExactPlanTaskArtifacts,
  prepareAndSpawnExactRun,
  settleExactRunAttempt,
  type ExactStartLineageInput,
} from '../../src/orchestra/exact-plan-start-service.js';
import {
  inspectStructuredCriteriaProjectionAdoption,
} from '../../src/orchestra/task-artifact-projection.js';

function snapshot(root: string, flowId = 'flow-1'): StoredApprovedSnapshot {
  const approved: StoredApprovedSnapshot = {
    flowId,
    revision: 1,
    planDigest: 'digest-1',
    approvedBy: { id: 'approver' },
    approvedAt: '2026-07-28T09:59:00.000Z',
    proposal: {
      flowId,
      tenant: 'tenant-1',
      project: root,
      actor: { id: 'planner' },
      origin: 'api',
      revision: 1,
      intentSummary: 'exact test',
    },
    planLineage: {
      tenantId: 'tenant-1',
      actor: { id: 'planner' },
      origin: 'api',
      correlationId: 'plan-correlation',
      idempotencyKey: 'plan-idempotency',
      sourceRef: 'source-plan',
    },
    sprint: {
      id: 'sprint-1',
      number: 1,
      status: SprintStatus.PLANNING,
      phase: SprintPhase.PLAN,
      workers: ['w-1'],
      tasks: [{
        id: '1-001',
        title: 'Exact',
        description: 'Exact task',
        model: 'claude-sonnet-5',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'test',
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] },
        dependencies: [],
        goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
        status: TaskStatus.PENDING,
      }],
    },
  };
  return approved;
}

function lineage(idempotencyKey = 'start-idempotency'): ExactStartLineageInput {
  return {
    tenantId: 'tenant-1',
    actor: { id: 'approver' },
    origin: 'terminal',
    correlationId: 'start-correlation',
    causationId: 'plan-correlation',
    idempotencyKey,
    sourceId: 'terminal-session',
    authorization: { kind: 'approved-actor' },
  };
}

const identityDeps = {
  isAlive: () => true,
  startToken: (pid: number) => `s${pid}`,
};

describe('exact-plan start attempt lifecycle', () => {
  it('orders PREPARED → START_REQUESTED → process birth and publishes handle only at ADMITTED', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-'));
    const approved = snapshot(root);
    saveApprovedSnapshot(root, approved);
    const order: string[] = [];

    const prepared = prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparedAt: '2026-07-28T10:00:00.000Z',
      spawnedAt: '2026-07-28T10:00:10.000Z',
      leaseUntil: '2026-07-28T10:01:00.000Z',
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      onPrepared: () => order.push('START_REQUESTED'),
      spawnProcess: () => {
        order.push('SPAWN');
        expect(loadRunHandle(root, 'flow-1')).toBeUndefined();
        return { pid: 200, startToken: 's200' };
      },
    });
    expect(prepared.status).toBe('process-spawned');
    if (prepared.status !== 'process-spawned') throw new Error('unexpected fixture result');
    expect(order).toEqual(['START_REQUESTED', 'SPAWN']);
    expect(loadRunHandle(root, 'flow-1')).toBeUndefined();

    const materialized = materializeExactPlanTaskArtifacts(root, {
      capability: prepared.capability,
      approvedSnapshot: approved,
    });
    expect(materialized.created).toEqual(['1-001']);
    const handle = { flowId: 'flow-1', jobId: 'job-1', logRef: 'log-1' };
    const admitted = admitExactRunAttempt({
      root,
      capability: prepared.capability,
      approvedSnapshot: approved,
      process: prepared.attempt.process!,
      handle,
      identityDeps,
      onAdmitted: () => {
        expect(loadRunHandle(root, 'flow-1')?.handle).toEqual(handle);
        order.push('RUN_STARTED');
      },
    });
    expect(admitted.attempt.state).toBe('ADMITTED');
    expect(admitted.lifecyclePublication.status).toBe('published');
    expect(order.at(-1)).toBe('RUN_STARTED');

    const terminal = settleExactRunAttempt({
      root,
      capability: prepared.capability,
      process: prepared.attempt.process!,
      settlement: {
        state: 'COMPLETED',
        code: 'RUN_COMPLETE',
        settledAt: '2026-07-28T10:02:00.000Z',
      },
      identityDeps,
    });
    expect(terminal.attempt.state).toBe('COMPLETED');
  });

  it('permits unavailable-token immediate capability admission but refuses adoption without it', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-portable-'));
    const approved = snapshot(root);
    const prepared = prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: null, evidence: 'unavailable' },
      spawnProcess: () => ({ pid: 200, startToken: null }),
    });
    if (prepared.status !== 'process-spawned') throw new Error('unexpected fixture result');
    const base = {
      root,
      capability: prepared.capability,
      approvedSnapshot: approved,
      process: prepared.attempt.process!,
      handle: { flowId: 'flow-1', jobId: 'job-1', logRef: 'log-1' },
    };
    expect(() => admitExactRunAttempt(base)).toThrow(ExactPlanStartError);
    expect(admitExactRunAttempt({
      ...base,
      freshCapability: {
        attemptId: prepared.capability.attemptId,
        ownerNonce: prepared.capability.ownerNonce,
      },
    }).attempt.state).toBe('ADMITTED');
  });

  it('never overwrites a conflicting task artifact', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-drift-'));
    const approved = snapshot(root);
    const prepared = prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      spawnProcess: () => ({ pid: 200, startToken: 's200' }),
    });
    if (prepared.status !== 'process-spawned') throw new Error('unexpected fixture result');
    const path = join(root, '.tasks', 'task-1-001.json');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(path, JSON.stringify({ id: 'drift' }), 'utf8');
    expect(() => materializeExactPlanTaskArtifacts(root, {
      capability: prepared.capability,
      approvedSnapshot: approved,
    })).toThrow(ExactPlanStartError);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ id: 'drift' });
  });

  it('migrates only an adoption-bound missing structured-criteria projection before admission', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-adoption-'));
    const base = snapshot(root);
    const canonicalTask = {
      ...base.sprint.tasks[0]!,
      sprintId: base.sprint.id,
      createdAt: '2026-07-27T00:00:00.000Z',
      goNogo: {
        ...base.sprint.tasks[0]!.goNogo,
        items: [{
          id: 'criterion-go-proof',
          polarity: 'go' as const,
          statement: 'pass',
          evidenceRequirements: ['pass'],
        }],
      },
    };
    const canonicalSprint = { ...base.sprint, tasks: [canonicalTask] };
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const legacyTask = structuredClone(canonicalTask);
    delete legacyTask.goNogo.items;
    const path = join(tasksDir, 'task-1-001.json');
    writeFileSync(path, JSON.stringify(legacyTask, null, 2), 'utf8');
    const inspected = inspectStructuredCriteriaProjectionAdoption(
      root,
      canonicalSprint.id,
      canonicalSprint.tasks,
    );
    const approved: StoredApprovedSnapshot = {
      ...base,
      sprint: canonicalSprint,
      projectionAdoption: {
        schemaVersion: 1,
        kind: 'structured-criteria-projection',
        sprintId: canonicalSprint.id,
        taskCount: 1,
        expectedPlanDigest: base.planDigest,
        legacyProjectionDigest: inspected.legacyProjectionDigest,
        canonicalProjectionDigest: inspected.canonicalProjectionDigest,
        authorizedBy: base.approvedBy,
        authorizedAt: base.approvedAt,
        justification: 'Owner-approved additive criteria recovery',
      },
    };
    const prepared = prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      spawnProcess: () => ({ pid: 200, startToken: 's200' }),
    });
    if (prepared.status !== 'process-spawned') throw new Error('unexpected fixture result');

    expect(materializeExactPlanTaskArtifacts(root, {
      capability: prepared.capability,
      approvedSnapshot: approved,
    })).toMatchObject({
      migrated: ['1-001'],
      idempotent: ['1-001'],
    });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(canonicalTask);
  });

  it('facade returns settled only after admission and terminal settlement', async () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-facade-'));
    const approved = snapshot(root);
    saveApprovedSnapshot(root, approved);
    const lifecycle: string[] = [];
    const executor = createCanonicalExactSprintExecutor({
      identityDeps,
      lifecycle: {
        publishStartRequested: () => lifecycle.push('START_REQUESTED'),
        publishRunStarted: () => lifecycle.push('RUN_STARTED'),
      },
      spawnDetached: vi.fn(() => ({ pid: 200, startToken: 's200' })),
      executeInProcess: async (context) => {
        context.onExactPlanMaterialize();
        context.onExecutionAdmitted({
          flowId: context.exactRef.flowId,
          jobId: 'job-facade',
          logRef: 'log-facade',
        });
        return { terminalState: 'COMPLETED', reasonCode: 'DONE' };
      },
    });
    const outcome = await executor.execute({
      projectRoot: root,
      config: {} as never,
      source: {
        kind: 'exact-ref',
        ref: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
        ingress: { kind: 'terminal', id: 'terminal-session' },
      },
      lineage: lineage('facade-idempotency'),
      executionMode: 'in-process',
    });
    expect(outcome.status).toBe('settled');
    if (outcome.status === 'settled') {
      expect(outcome.attempt.state).toBe('COMPLETED');
      expect(outcome.settlement.state).toBe('COMPLETED');
    }
    expect(lifecycle).toEqual(['START_REQUESTED', 'RUN_STARTED']);
    expect(loadStartAttempt(root, outcome.status === 'settled' ? outcome.attempt.attemptId : '')?.state)
      .toBe('COMPLETED');
  });
});
