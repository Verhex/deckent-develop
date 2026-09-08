import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import {
  loadRunFlowRecoveryManifest,
  loadRunHandle,
  loadStartAttempt,
  saveApprovedSnapshot,
  savePlannedSprint,
  type StoredApprovedSnapshot,
} from '../../src/core/run-flow-store.js';
import { canonicalJson } from '../../src/core/audit-writer.js';
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
import { parsePlannerResponse } from '../../src/orchestra/planner.js';

function snapshot(root: string, flowId = 'flow-1'): StoredApprovedSnapshot {
  const approved: StoredApprovedSnapshot = {
    flowId,
    revision: 1,
    planDigest: 'digest-1',
    approvedBy: { id: 'approver' },
    approvedAt: '2026-07-28T09:59:00.000Z',
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
  it('refuses a legacy intent snapshot before PREPARED or process birth', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-legacy-intent-'));
    const base = snapshot(root);
    const approved: StoredApprovedSnapshot = {
      ...base,
      sourceAuthority: { ...base.sourceAuthority!, sourceKind: 'intent' },
    };
    const spawnProcess = vi.fn(() => ({ pid: 200, startToken: 's200' }));

    expect(() => prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      spawnProcess,
    })).toThrowError(expect.objectContaining({
      code: 'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
    }));
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(loadStartAttempt(root, 'flow-1', 1)).toBeUndefined();
  });

  it('refuses an authority downgrade with no source binding before PREPARED', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-authority-downgrade-'));
    const { sourceAuthority: _sourceAuthority, ...approved } = snapshot(root);
    const spawnProcess = vi.fn(() => ({ pid: 200, startToken: 's200' }));

    expect(() => prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      spawnProcess,
    })).toThrowError(expect.objectContaining({
      code: 'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
    }));
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(loadStartAttempt(root, 'flow-1', 1)).toBeUndefined();
  });

  it('refuses v5 planning context downgraded to legacy directives before PREPARED or process birth', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-authority-tamper-'));
    const base = snapshot(root);
    const planningEvidence = { kind: 'not-applicable' as const, sourceKind: 'directives' as const };
    const approved: StoredApprovedSnapshot = {
      ...base,
      planDigestVersion: 5,
      planDigestContext: {
        configuredProvider: null,
        configuredModel: null,
        configuredBackend: null,
        configuredAuthMode: 'subscription',
        fallbackProvider: null,
        fallbackPolicy: null,
        executionBudgetPolicy: null,
        planningEvidence,
        sourceAuthoritySha256: '0'.repeat(64),
      },
      sourceAuthority: {
        ...base.sourceAuthority!,
        schemaVersion: 1,
      },
    };
    const spawnProcess = vi.fn(() => ({ pid: 200, startToken: 's200' }));

    expect(() => prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      spawnProcess,
    })).toThrowError(expect.objectContaining({
      code: 'EXACT_START_PLANNER_EVIDENCE_HOLD',
    }));
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(loadStartAttempt(root, 'flow-1', 1)).toBeUndefined();
  });

  it('requires the exact planned v5 authority before lower exact-ref start', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-planned-authority-'));
    const base = snapshot(root);
    const planningEvidence = { kind: 'not-applicable' as const, sourceKind: 'directives' as const };
    const sourceAuthority = {
      ...base.sourceAuthority!,
      schemaVersion: 2 as const,
      planningEvidence,
    };
    const approved: StoredApprovedSnapshot = {
      ...base,
      planDigestVersion: 5,
      planDigestContext: {
        configuredProvider: null,
        configuredModel: null,
        configuredBackend: null,
        configuredAuthMode: 'subscription',
        fallbackProvider: null,
        fallbackPolicy: null,
        executionBudgetPolicy: null,
        planningEvidence,
        sourceAuthoritySha256: createHash('sha256')
          .update(canonicalJson(sourceAuthority)).digest('hex'),
      },
      sourceAuthority,
    };
    const spawnProcess = vi.fn(() => ({ pid: 200, startToken: 's200' }));
    const attempt = () => prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage(),
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' as const },
      identityDeps,
      spawnProcess,
    });

    expect(attempt).toThrowError(expect.objectContaining({
      code: 'EXACT_START_PLANNER_EVIDENCE_HOLD',
    }));
    savePlannedSprint(root, 'flow-1', {
      revision: 1,
      sprint: approved.sprint,
      planDigest: approved.planDigest,
      planDigestVersion: 5,
      planDigestContext: approved.planDigestContext!,
      sourceAuthority: { ...sourceAuthority, contentSha256: 'f'.repeat(64) },
    });
    expect(attempt).toThrowError(expect.objectContaining({
      code: 'EXACT_START_PLANNER_EVIDENCE_HOLD',
    }));
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(loadStartAttempt(root, 'flow-1', 1)).toBeUndefined();
  });

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

  it('defers a fresh exact-Docker task projection until per-task release', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-deferred-task-'));
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

    expect(materializeExactPlanTaskArtifacts(root, {
      capability: prepared.capability,
      approvedSnapshot: approved,
      publicationMode: 'defer',
    })).toEqual({
      taskIds: ['1-001'],
      created: [],
      idempotent: [],
      deferred: ['1-001'],
      existingContentDigests: {},
    });
    expect(existsSync(join(root, '.tasks', 'task-1-001.json'))).toBe(false);
  });

  it('commits a canonical recovery manifest before a retry process can be born', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-recovery-manifest-'));
    const approved = snapshot(root);
    const first = prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage('first-attempt'),
      attemptId: 'attempt-one',
      preparedAt: '2026-07-28T10:00:00.000Z',
      spawnedAt: '2026-07-28T10:00:10.000Z',
      leaseUntil: '2026-07-28T10:01:00.000Z',
      preparerProcess: { pid: 100, startToken: 's100', evidence: 'verified' },
      identityDeps,
      spawnProcess: () => ({ pid: 200, startToken: 's200' }),
    });
    if (first.status !== 'process-spawned') throw new Error('unexpected fixture result');
    settleExactRunAttempt({
      root,
      capability: first.capability,
      process: first.attempt.process!,
      settlement: {
        state: 'FAILED',
        code: 'FIRST_ATTEMPT_FAILED',
        settledAt: '2026-07-28T10:02:00.000Z',
      },
      identityDeps,
    });

    let manifestObservedBeforeSpawn = false;
    const second = prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage('retry-attempt'),
      retryFromAttemptId: first.attempt.attemptId,
      attemptId: 'attempt-two',
      preparedAt: '2026-07-28T10:03:00.000Z',
      spawnedAt: '2026-07-28T10:03:10.000Z',
      leaseUntil: '2026-07-28T10:04:00.000Z',
      preparerProcess: { pid: 101, startToken: 's101', evidence: 'verified' },
      identityDeps,
      onPrepared: ({ attempt }) => {
        const manifest = loadRunFlowRecoveryManifest(root, attempt.flowId, attempt.generation);
        expect(manifest).toMatchObject({
          attemptId: 'attempt-two',
          predecessorAttemptId: 'attempt-one',
          predecessorState: 'FAILED',
          predecessorSettlement: {
            state: 'FAILED',
            code: 'FIRST_ATTEMPT_FAILED',
          },
        });
        manifestObservedBeforeSpawn = true;
      },
      spawnProcess: () => {
        expect(manifestObservedBeforeSpawn).toBe(true);
        return { pid: 201, startToken: 's201' };
      },
    });

    expect(second.status).toBe('process-spawned');
    if (second.status === 'process-spawned') {
      expect(second.attempt.generation).toBe(2);
    }

    const db = new Database(join(
      root,
      '.deckent',
      'runtime',
      'run-flow-store',
      'run-flow-authority.sqlite',
    ));
    try {
      db.exec('DROP TRIGGER run_flow_recovery_manifests_no_delete');
      db.prepare(`
        DELETE FROM run_flow_recovery_manifests
        WHERE flow_id = ? AND generation = ?
      `).run('flow-1', 2);
    } finally {
      db.close();
    }

    const forbiddenSpawn = vi.fn(() => ({ pid: 202, startToken: 's202' }));
    expect(() => prepareAndSpawnExactRun({
      root,
      exactRef: { schemaVersion: 1, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
      approvedSnapshot: approved,
      lineage: lineage('manifest-missing-replay'),
      preparerProcess: { pid: 102, startToken: 's102', evidence: 'verified' },
      identityDeps,
      spawnProcess: forbiddenSpawn,
    })).toThrowError(expect.objectContaining({
      code: 'EXACT_START_RECOVERY_MANIFEST_HOLD',
    }));
    expect(forbiddenSpawn).not.toHaveBeenCalled();
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

  it('blocks closed-scope drift before creating any task artifact', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-closed-scope-'));
    const base = snapshot(root);
    const approved: StoredApprovedSnapshot = {
      ...base,
      planDigestContext: {
        configuredProvider: null,
        configuredModel: null,
        configuredBackend: null,
        configuredAuthMode: 'subscription',
        fallbackProvider: null,
        fallbackPolicy: null,
        executionBudgetPolicy: null,
        configuredMaxWorkers: 1,
        writeScopePolicy: {
          mode: 'closed-allowlist',
          filesWrite: ['src/a.ts'],
        },
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

    expect(() => materializeExactPlanTaskArtifacts(root, {
      capability: prepared.capability,
      approvedSnapshot: approved,
    })).toThrowError(expect.objectContaining({
      code: 'EXACT_START_TASK_ARTIFACT_DRIFT',
    }));
    expect(() => readFileSync(join(root, '.tasks', 'task-1-001.json'), 'utf8')).toThrow();
  });

  it('materializes a digest-bound planned-new output while rejecting pre-start creation drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-planned-new-'));
    const base = snapshot(root);
    const approved: StoredApprovedSnapshot = {
      ...base,
      sprint: {
        ...base.sprint,
        tasks: [{
          ...base.sprint.tasks[0]!,
          scope: {
            ...base.sprint.tasks[0]!.scope,
            filesWrite: ['new/output.ts'],
          },
        }],
      },
      planDigestContext: {
        configuredProvider: null,
        configuredModel: null,
        configuredBackend: null,
        configuredAuthMode: 'subscription',
        fallbackProvider: null,
        fallbackPolicy: null,
        executionBudgetPolicy: null,
        configuredMaxWorkers: 1,
        writeScopePolicy: {
          mode: 'closed-allowlist',
          filesWrite: ['new/output.ts'],
          plannedNewFiles: ['new/output.ts'],
        },
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

    expect(() => materializeExactPlanTaskArtifacts(root, {
      capability: prepared.capability,
      approvedSnapshot: approved,
    })).not.toThrow();
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
        publishSettlement: ({ settlement }) => lifecycle.push(`SETTLED:${settlement.state}`),
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
    expect(lifecycle).toEqual(['START_REQUESTED', 'RUN_STARTED', 'SETTLED:COMPLETED']);
    expect(loadStartAttempt(root, outcome.status === 'settled' ? outcome.attempt.attemptId : '')?.state)
      .toBe('COMPLETED');
  });

  it.each([
    { admitted: false, expectedCode: 'EXACT_RUNTIME_FAILED_BEFORE_ADMISSION' },
    { admitted: true, expectedCode: 'EXACT_RUNTIME_FAILED_AFTER_ADMISSION' },
  ])('publishes a persisted runtime failure after admission=$admitted', async ({ admitted, expectedCode }) => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-failure-publication-'));
    const approved = snapshot(root);
    saveApprovedSnapshot(root, approved);
    const publications: string[] = [];
    const executor = createCanonicalExactSprintExecutor({
      identityDeps,
      lifecycle: {
        publishStartRequested: () => undefined,
        publishRunStarted: () => undefined,
        publishSettlement: ({ attempt, settlement }) => {
          expect(attempt.settlement).toEqual(settlement);
          publications.push(settlement.code);
        },
      },
      spawnDetached: vi.fn(() => ({ pid: 200, startToken: 's200' })),
      executeInProcess: async (context) => {
        if (admitted) {
          context.onExecutionAdmitted({ flowId: 'flow-1', jobId: 'job-failure', logRef: 'log-failure' });
        }
        throw new Error('fixture runtime failure');
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
      lineage: lineage(`failure-${admitted}`),
      executionMode: 'in-process',
    });
    expect(outcome).toMatchObject({ status: 'failed', reasonCode: expectedCode });
    expect(publications).toEqual([expectedCode]);
  });

  it('holds after a persisted settlement when terminal lifecycle publication fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-publication-hold-'));
    const approved = snapshot(root);
    saveApprovedSnapshot(root, approved);
    const executor = createCanonicalExactSprintExecutor({
      identityDeps,
      lifecycle: {
        publishStartRequested: () => undefined,
        publishRunStarted: () => undefined,
        publishSettlement: () => { throw new Error('projection unavailable'); },
      },
      spawnDetached: vi.fn(() => ({ pid: 200, startToken: 's200' })),
      executeInProcess: async (context) => {
        context.onExecutionAdmitted({ flowId: 'flow-1', jobId: 'job-hold', logRef: 'log-hold' });
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
      lineage: lineage('publication-hold'),
      executionMode: 'in-process',
    });
    expect(outcome).toMatchObject({
      status: 'held',
      reasonCode: 'EXACT_START_LIFECYCLE_PUBLICATION_HOLD',
      attempt: { state: 'COMPLETED', settlement: { state: 'COMPLETED', code: 'DONE' } },
    });
  });

  it('publishes blocked no-admission truth and republishes it idempotently on duplicate replay', async () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-no-admission-'));
    const approved = snapshot(root);
    saveApprovedSnapshot(root, approved);
    const publications: string[] = [];
    const executor = createCanonicalExactSprintExecutor({
      identityDeps,
      lifecycle: {
        publishStartRequested: () => undefined,
        publishRunStarted: () => undefined,
        publishSettlement: ({ settlement }) => publications.push(settlement.code),
      },
      spawnDetached: vi.fn(() => ({ pid: 200, startToken: 's200' })),
      executeInProcess: async () => ({ terminalState: 'COMPLETED', reasonCode: 'UNREACHABLE' }),
    });
    const input = {
      projectRoot: root,
      config: {} as never,
      source: {
        kind: 'exact-ref' as const,
        ref: { schemaVersion: 1 as const, flowId: 'flow-1', revision: 1, planDigest: 'digest-1' },
        ingress: { kind: 'terminal' as const, id: 'terminal-session' },
      },
      lineage: lineage('no-admission'),
      executionMode: 'in-process' as const,
    };
    await expect(executor.execute(input)).resolves.toMatchObject({
      status: 'held',
      reasonCode: 'EXACT_START_ADMISSION_REQUIRED',
    });
    await expect(executor.execute(input)).resolves.toMatchObject({ status: 'duplicate' });
    expect(publications).toEqual([
      'EXACT_START_ADMISSION_REQUIRED',
      'EXACT_START_ADMISSION_REQUIRED',
    ]);
  });

  it('facade preserves an unplanned planner-evidence refusal as held with no process birth', async () => {
    const root = mkdtempSync(join(tmpdir(), 'exact-start-unplanned-evidence-'));
    const lifecycle = {
      publishStartRequested: vi.fn(),
      publishRunStarted: vi.fn(),
    };
    const spawnDetached = vi.fn(() => ({ pid: 200, startToken: 's200' }));
    const executeInProcess = vi.fn(async () => ({
      terminalState: 'COMPLETED' as const,
      reasonCode: 'DONE',
    }));
    const executor = createCanonicalExactSprintExecutor({
      identityDeps,
      lifecycle,
      spawnDetached,
      executeInProcess,
    });

    const normalizedPlan = parsePlannerResponse(JSON.stringify({
      reasoning: 'fixture',
      tasks: [{
        title: 'Task', description: 'Do the exact task.', model: 'gpt-5.6-sol',
        effort: 'normal', priority: 'NORMAL', reason: 'fixture',
        scope: { directories: [], filesRead: [], filesWrite: ['docs/evidence.md'] },
        dependencies: [],
        goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      }],
    }));
    if (!normalizedPlan) throw new Error('planner fixture did not normalize');

    const outcome = await executor.execute({
      projectRoot: root,
      config: {
        activeModeConfig: { max_workers: 1, default_model: 'gpt-5.6-sol' },
        language: 'en',
      } as never,
      source: {
        kind: 'unplanned',
        proposal: {
          flowId: 'flow-unplanned',
          tenant: 'tenant-1',
          project: root,
          actor: { id: 'planner' },
          origin: 'terminal',
          revision: 1,
          intentSummary: 'plan through injected fixture planner',
        },
        planSource: {
          sourceKind: 'intent',
          baseContext: {
            directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
            existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
          },
          planner: () => normalizedPlan,
        },
        recommendation: { size: 'small', maxWorkers: 1, modelConstraint: null, reason: 'fixture' },
        ingress: { kind: 'terminal', id: 'terminal-session' },
      },
      lineage: {
        ...lineage('unplanned-evidence-idempotency'),
        actor: { id: 'planner' },
        origin: 'terminal',
      },
      executionMode: 'detached',
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      status: 'held',
      reasonCode: 'PLANNER_EVIDENCE_HOLD',
      detail: 'PLANNER_EVIDENCE_HOLD',
    });
    expect(spawnDetached).not.toHaveBeenCalled();
    expect(executeInProcess).not.toHaveBeenCalled();
    expect(lifecycle.publishStartRequested).not.toHaveBeenCalled();
    expect(lifecycle.publishRunStarted).not.toHaveBeenCalled();
  });
});
