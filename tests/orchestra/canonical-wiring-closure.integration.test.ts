import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildStatusJsonSnapshot } from '../../src/cli/commands/status.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import { readProviderConcurrencyRuntime } from '../../src/core/provider-concurrency-runtime-reader.js';
import {
  publishCanonicalRunStatusReadModel,
  readCanonicalRunStatusReadModel,
} from '../../src/core/run-status-read-model.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
} from '../../src/core/task-result-settlement.js';
import { projectTerminalPublicationStatus as projectMcpTerminalPublication } from '../../src/mcp/tools/status.js';
import { captureShadowSchedulerSnapshot } from '../../src/orchestra/scheduler-driver.js';
import { reduceSchedulerTick } from '../../src/orchestra/scheduler-reducer.js';
import {
  buildFinalizerTerminalTruth,
  publishFencedSprintTerminalReceipt,
} from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: 'canonical closure canary',
    model: 'gpt-5.6-terra',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'bounded integration proof',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'closed', noGoCriteria: 'open', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-999',
    createdAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  } as Task;
}

function result(taskId: string, verdict: 'DONE' | 'NO_GO'): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: verdict === 'DONE',
    coverage: 100,
    selfAssessment: verdict,
    notes: 'bounded closure proof',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${taskId}`,
      baselineRef: `baseline:${taskId}`,
      scopeDigest: 'a'.repeat(64),
    },
  } as TaskResult;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical production-wiring closure canary', () => {
  it('joins repaired lineage, collision serialization, provider observation and terminal CLI/MCP truth', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-wiring-closure-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });

    const failed = task('canary-001', { status: TaskStatus.NO_GO });
    const repaired = task('canary-001-fix', {
      isPriorityFix: true,
      fixForTaskId: failed.id,
      updatedAt: '2026-07-31T12:01:00.000Z',
    });
    for (const item of [failed, repaired]) {
      writeFileSync(join(root, '.tasks', `task-${item.id}.json`), JSON.stringify(item));
    }

    const owner = task('canary-owner', {
      status: TaskStatus.EXECUTING,
      scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
    });
    const competitor = task('canary-competitor', {
      status: TaskStatus.PENDING,
      scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
    });
    const independent = task('canary-independent', {
      status: TaskStatus.PENDING,
      scope: { directories: [], filesRead: [], filesWrite: ['src/independent.ts'] },
    });
    const schedulerSprint = {
      id: 'sprint-999', number: 999, status: SprintStatus.ACTIVE,
      phase: SprintPhase.EXECUTE, tasks: [owner, competitor, independent],
      workers: [], planningMode: 'structured',
    } as Sprint;
    const scheduler = reduceSchedulerTick(captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 1 },
      strategy: 'continuous', nowMs: 1, costStop: false, slotBudget: 1,
      dependencyPipelineEnabled: true, sprint: schedulerSprint, remainingQueue: [],
      assignedTaskIds: new Set([owner.id]), collectedIds: new Set(), completedTaskIds: [],
    }));
    expect(scheduler.orderedEffects).toContainEqual({
      kind: 'Blocked', taskId: competitor.id, reason: 'scope-collision', blockingId: owner.id,
    });
    expect(scheduler.orderedEffects).toContainEqual({
      kind: 'SpawnTask', taskId: independent.id, reason: 'pending-slot-fill',
    });

    // The concurrency runtime only counts intervals owned by a CURRENTLY
    // dispatched host attempt — mint the exact settlement authority for the
    // repaired task and bind the observation to its attemptId (same producer
    // chain as the docker spawn path).
    const settlementRef = createTaskResultSettlementRef(root, repaired.id);
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    claimTaskResultSettlementAttemptAtomic(settlementRef);
    writeTaskResultSettlementPreparedAtomic(settlementRef, repaired.model);
    writeTaskResultSettlementDispatchAtomic(settlementRef, 'f'.repeat(64));
    const observations = new ProviderExecutionObservationStore(root);
    observations.put({ source: 'provider-runtime', observation: {
      type: 'start', executionId: 'exec-canary', runId: 'run-canary', taskId: repaired.id,
      attemptId: settlementRef.attemptId, providerPrincipalDigest: 'principal-canary',
      fence: 'fence-canary', sequence: 1, observedAt: '2026-07-31T12:00:00.000Z',
    } });
    observations.close();

    const truth = buildFinalizerTerminalTruth({
      tasks: [failed, repaired],
      evaluations: new Map([
        [failed.id, TaskEvaluation.NO_GO],
        [repaired.id, TaskEvaluation.DONE],
      ]),
      results: [result(failed.id, 'NO_GO'), result(repaired.id, 'DONE')],
    });
    const sprint = {
      id: 'sprint-999', number: 999, tasks: [failed, repaired],
    } as Parameters<typeof publishFencedSprintTerminalReceipt>[0]['sprint'];
    publishFencedSprintTerminalReceipt({
      projectRoot: root, sprint, truth, runId: 'run-canary', coordinatorGeneration: 1,
      now: () => '2026-07-31T12:02:00.000Z',
    });
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-999', phase: 'COMPLETE', status: 'COMPLETE',
    }));
    expect(truth.logicalProgress).toMatchObject({ done: 1, total: 1, attemptCount: 2 });

    // Status surfaces now consume the PERSISTED run-status read model (the
    // canonical publisher the finalizer runs) — publish it exactly like
    // production does after the terminal receipt lands.
    publishCanonicalRunStatusReadModel(root);
    expect(readCanonicalRunStatusReadModel(root)?.logicalProgress).toMatchObject({
      done: 1, active: 0, blocked: 0, total: 1, attemptCount: 2,
    });

    const status = buildStatusJsonSnapshot(root, join(root, '.dashboard'), {
      providerConcurrencyRuntime: readProviderConcurrencyRuntime,
    });
    expect(status).toMatchObject({
      active: false,
      lifecycle: 'COMPLETE',
      terminalPublication: { state: 'receipt-observed' },
      providerConcurrency: [{
        providerPrincipalDigest: 'principal-canary', admission: 'HOLD',
        admittedCeiling: 'unknown', currentAttained: 1, peakAttained: 1,
      }],
    });
    expect(projectMcpTerminalPublication(root, status.authority)).toMatchObject({
      state: 'receipt-observed',
      receipt: { sprintId: 'sprint-999' },
    });
  });
});
