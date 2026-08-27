import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskEvaluation, TaskStatus, type Task, type TaskResult } from '../../src/core/types.js';
import { classifyFixPhaseTasks } from '../../src/orchestra/result-evaluator.js';
import { partitionFixTasksByFailureDisposition } from '../../src/orchestra/sprint-phases.js';
import { executeSchedulerDecision } from '../../src/orchestra/scheduler-effects.js';
import { reduceSchedulerTick, type SchedulerSnapshot } from '../../src/orchestra/scheduler-reducer.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'root',
    title: 'Disposition gate fixture',
    description: 'Exercise the pre-dispatch repair gate.',
    model: 'claude-sonnet-5',
    effort: 'high',
    priority: 'HIGH',
    reason: 'test fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'green', noGoCriteria: 'red', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-700',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function preDispatchResult(): TaskResult {
  return {
    taskId: 'root',
    workerId: 'host',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'provider admission denied before dispatch',
    preDispatchSettlement: {
      version: 1,
      state: 'NOT_DISPATCHED',
      attemptId: 'host-pre-dispatch:root:attempt',
      reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
      evidenceRef: 'host-pre-dispatch-settlement:provider-unavailable',
    },
  } as TaskResult;
}

describe('FIX pre-dispatch disposition gate', () => {
  it('records the suppression and lands exactly one scheduler NO_MINT instead of minting a repair', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deckent-fix-gate-'));
    roots.push(root);
    await mkdir(join(root, '.tasks'), { recursive: true });

    const result = preDispatchResult();
    const classification = classifyFixPhaseTasks(
      new Map([['root', TaskEvaluation.NOT_DISPATCHED]]),
      new Map([['root', result]]),
    );

    expect(classification.fixCandidateTaskIds).toEqual([]);
    expect(classification.cascadeSkipDispositions).toEqual([
      expect.objectContaining({
        taskId: 'root',
        disposition: 'cascadeSkip',
        code: 'PRE_DISPATCH_FIX_INELIGIBLE',
        allowsFixTask: false,
        settlementRef: result.preDispatchSettlement?.evidenceRef,
      }),
    ]);

    // Adversarial injection of a stale repair candidate cannot turn a recorded
    // pre-dispatch denial into a dispatched repair.
    const injectedRepair = makeTask({
      id: 'root-fix',
      isPriorityFix: true,
      fixForTaskId: 'root',
      repairSettlementReasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
    });
    const partition = partitionFixTasksByFailureDisposition([injectedRepair], [result], undefined);
    expect(partition.eligible).toEqual([]);
    expect(partition.noMint).toEqual([
      expect.objectContaining({
        task: injectedRepair,
        failedTaskId: 'root',
        reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
        evaluation: TaskEvaluation.NOT_DISPATCHED,
      }),
    ]);

    const dependent = makeTask({ id: 'dependent', dependencies: ['root'] });
    const snapshot: SchedulerSnapshot = {
      trigger: { kind: 'watcher', sequence: 1 },
      strategy: 'continuous',
      nowMs: 0,
      costStop: false,
      slotBudget: 2,
      orderedQueue: [injectedRepair],
      tasks: [injectedRepair, dependent],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
      dependencyPipelineEnabled: true,
      deferTerminalDependencyFailure: true,
      effectiveDependencyState: {
        satisfyingIds: new Set(),
        terminalFailureIds: new Set(),
        retryEligibleIds: new Set(['root-fix', 'dependent']),
      },
      collisionBlockedIds: new Set(),
    };
    const decision = reduceSchedulerTick(snapshot);
    expect(decision.orderedEffects.filter(effect => effect.kind === 'NoMintRepair')).toEqual([
      {
        kind: 'NoMintRepair',
        taskId: 'root-fix',
        failedTaskId: 'root',
        reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
        idempotencyKey: 'no-mint:root-fix:PROVIDER_ADAPTER_UNAVAILABLE',
      },
    ]);
    expect(decision.orderedEffects).not.toContainEqual(
      expect.objectContaining({ kind: 'SpawnTask', taskId: 'root-fix' }),
    );

    const taskMap = new Map<string, Task>([
      [injectedRepair.id, injectedRepair],
      [dependent.id, dependent],
    ]);
    const execution = await executeSchedulerDecision(decision, {
      projectRoot: root,
      sprintFallbackId: 'sprint-700',
      config: undefined,
      taskMap,
      assignedTaskIds: new Set(),
      killWorker: () => undefined,
      resolveAgentPrompt: async () => undefined,
      resolveSkillPrompts: async () => [],
      buildWriteTargets: () => [],
    });

    expect(execution.spawnedTaskIds).toEqual([]);
    expect(execution.landedEffects.filter(effect => effect.kind === 'NoMintRepair')).toHaveLength(1);
    expect(execution.cascadeSkippedTaskIds).toEqual(['dependent']);
    const persistedSkip = JSON.parse(await readFile(join(root, '.tasks', 'task-dependent.result'), 'utf8')) as TaskResult;
    expect(persistedSkip).toMatchObject({
      taskId: 'dependent',
      cascadeSkipped: true,
      selfAssessment: 'NO_GO',
    });
  });
});
