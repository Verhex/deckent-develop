import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  resolveOuterStagedSettlementBarrier,
  describeStagedSettlementBlock,
  type OuterStagedSettlementBlocked,
} from '../../src/orchestra/sprint-phases.js';
import {
  resolveSprintTerminalHandoff,
  sprintTerminalReceiptPath,
} from '../../src/orchestra/sprint-controller.js';
import {
  createProductionWiringPlanEvidence,
  TaskEvaluation,
  TaskStatus,
  type SprintMetrics,
  type Task,
  type TaskResult,
} from '../../src/core/types.js';
import type { ProductionWiringContractV1 } from '../../src/core/production-wiring-contract.js';

const completeEvidence = {
  state: 'complete',
  basis: 'host-attested-execution',
  evidenceRefs: ['host:consumer-execution'],
} as const;

function baseContract(
  overrides: Partial<ProductionWiringContractV1> = {},
): ProductionWiringContractV1 {
  return {
    version: 1,
    changeKind: 'runtime-change',
    producer: { producerId: 'wiring settlement decision', evidence: completeEvidence },
    canonicalConsumer: {
      consumerId: 'Sprint phase/controller terminal gate',
      relationship: 'invokes-producer',
      evidence: completeEvidence,
    },
    affectedIngresses: ['Sprint', 'RunFlow'].map(ingressId => ({
      ingressId,
      kind: 'ingress' as const,
      evidence: completeEvidence,
    })),
    enablementAuthority: {
      authorityId: 'production mutation',
      mechanism: 'policy',
      evidence: completeEvidence,
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'production-wiring-outer-barrier',
      kind: 'consumer-execution',
      evidence: completeEvidence,
    }],
    ...overrides,
  };
}

function stagedContract(closureTaskIds: readonly string[] = ['t-closure']): ProductionWiringContractV1 {
  return baseContract({
    changeKind: 'foundation',
    disposition: {
      kind: 'staged-foundation',
      foundationTaskId: 't-foundation',
      dagId: 'dag-487',
      closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'dag-487' })),
      outerSettlementBarrier: {
        kind: 'block-until-exact-closure-settles',
        dagId: 'dag-487',
        closureTaskIds: [...closureTaskIds],
      },
    },
  });
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `task ${id}`,
    description: 'staged settlement fixture',
    type: 'code-development',
    status: TaskStatus.DONE,
    priority: 'HIGH',
    model: 'claude-opus-5',
    provider: 'claude',
    dependencies: [],
    scope: { directories: [], filesRead: [], filesWrite: [] },
    goNogo: { goCriteria: [], noGoCriteria: [] },
    ...overrides,
  } as Task;
}

function foundationTask(closureTaskIds?: readonly string[]): Task {
  return task('t-foundation', {
    productionWiring: createProductionWiringPlanEvidence(stagedContract(closureTaskIds)),
  });
}

function result(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/orchestra/sprint-phases.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'closure',
  } as TaskResult;
}

function barrier(input: {
  tasks: readonly Task[];
  evaluations: ReadonlyMap<string, TaskEvaluation>;
  results?: readonly TaskResult[];
}) {
  return resolveOuterStagedSettlementBarrier({
    sprintId: 'sprint-487',
    tasks: input.tasks,
    evaluations: input.evaluations,
    results: input.results ?? [],
  });
}

describe('resolveOuterStagedSettlementBarrier', () => {
  it('authorizes when the exact closure settled DONE with a result of record', () => {
    const verdict = barrier({
      tasks: [foundationTask(), task('t-closure')],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.DONE],
      ]),
      results: [result('t-foundation'), result('t-closure')],
    });

    expect(verdict.state).toBe('AUTHORIZED');
    expect(verdict.stagedFoundationTaskIds).toEqual(['t-foundation']);
    expect(verdict.closures.every(closure => closure.settled)).toBe(true);
  });

  it('leaves sprints without a staged foundation completely unaffected', () => {
    const verdict = barrier({
      tasks: [
        task('t-plain'),
        task('t-wired', { productionWiring: createProductionWiringPlanEvidence(baseContract()) }),
      ],
      evaluations: new Map([['t-plain', TaskEvaluation.DONE], ['t-wired', TaskEvaluation.DONE]]),
      results: [result('t-plain'), result('t-wired')],
    });

    expect(verdict.state).toBe('AUTHORIZED');
    expect(verdict.stagedFoundationTaskIds).toEqual([]);
    expect(verdict.closures).toEqual([]);
  });

  it('blocks a NO_GO exact closure and exposes a resumable command', () => {
    const verdict = barrier({
      tasks: [foundationTask(), task('t-closure', { status: TaskStatus.NO_GO })],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.NO_GO],
      ]),
      results: [result('t-foundation'), result('t-closure')],
    });

    expect(verdict.state).toBe('BLOCKED');
    const blocked = verdict as OuterStagedSettlementBlocked;
    expect(blocked.blockedClosures).toHaveLength(1);
    expect(blocked.blockedClosures[0]!.reasonCode).toBe('closure-task-no-go');
    expect(blocked.resumeCommand).toBe('deckent resume sprint-487');
    expect(describeStagedSettlementBlock(blocked))
      .toBe('t-foundation->t-closure:closure-task-no-go');
  });

  it('blocks a PAUSED closure task', () => {
    const verdict = barrier({
      tasks: [foundationTask(), task('t-closure', { status: TaskStatus.PAUSED })],
      evaluations: new Map([['t-foundation', TaskEvaluation.DONE]]),
      results: [result('t-foundation')],
    });

    expect(verdict.state).toBe('BLOCKED');
    expect((verdict as OuterStagedSettlementBlocked).blockedClosures[0]!.reasonCode)
      .toBe('closure-task-paused');
  });

  it('holds a closure that is only settled behind acknowledged tech debt', () => {
    const verdict = barrier({
      tasks: [foundationTask(), task('t-closure')],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.GO_WITH_TECH_DEBT],
      ]),
      results: [result('t-foundation'), result('t-closure')],
    });

    expect(verdict.state).toBe('BLOCKED');
    expect((verdict as OuterStagedSettlementBlocked).blockedClosures[0]!.reasonCode)
      .toBe('closure-task-hold');
  });

  it('refuses a synthetic DONE with no worker result of record', () => {
    const verdict = barrier({
      tasks: [foundationTask(), task('t-closure')],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.DONE],
      ]),
      results: [result('t-foundation')],
    });

    expect(verdict.state).toBe('BLOCKED');
    const blocked = verdict as OuterStagedSettlementBlocked;
    expect(blocked.blockedClosures[0]!.reasonCode).toBe('closure-task-hold');
    expect(blocked.blockedClosures[0]!.detail).toContain('without a worker result');
  });

  it('holds a closure whose own wiring contract failed to close', () => {
    const failedClosureContract = baseContract({
      producer: {
        producerId: 'closure producer',
        evidence: { state: 'incomplete', evidenceRefs: [] },
      },
    });
    const verdict = barrier({
      tasks: [
        foundationTask(),
        task('t-closure', {
          productionWiring: createProductionWiringPlanEvidence(failedClosureContract),
        }),
      ],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.DONE],
      ]),
      results: [result('t-foundation'), result('t-closure')],
    });

    expect(verdict.state).toBe('BLOCKED');
    const blocked = verdict as OuterStagedSettlementBlocked;
    expect(blocked.blockedClosures[0]!.reasonCode).toBe('closure-task-hold');
    expect(blocked.blockedClosures[0]!.detail).toContain('decision=incomplete');
  });

  it('blocks — never waits — when the exact closure task is absent from the sprint', () => {
    const verdict = barrier({
      tasks: [foundationTask(['t-missing'])],
      evaluations: new Map([['t-foundation', TaskEvaluation.DONE]]),
      results: [result('t-foundation')],
    });

    expect(verdict.state).toBe('BLOCKED');
    expect((verdict as OuterStagedSettlementBlocked).blockedClosures[0]!.reasonCode)
      .toBe('closure-task-absent');
  });

  it('blocks an undispatched closure with no evaluation of record', () => {
    const verdict = barrier({
      tasks: [foundationTask(), task('t-closure', { status: TaskStatus.PENDING })],
      evaluations: new Map([['t-foundation', TaskEvaluation.DONE]]),
      results: [result('t-foundation')],
    });

    expect(verdict.state).toBe('BLOCKED');
    expect((verdict as OuterStagedSettlementBlocked).blockedClosures[0]!.reasonCode)
      .toBe('closure-task-unsettled');
  });

  it('preserves independent settled work while the staged closure is held', () => {
    const verdict = barrier({
      tasks: [
        foundationTask(),
        task('t-closure', { status: TaskStatus.NO_GO }),
        task('t-independent'),
        task('t-debt'),
      ],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.NO_GO],
        ['t-independent', TaskEvaluation.DONE],
        ['t-debt', TaskEvaluation.GO_WITH_TECH_DEBT],
      ]),
      results: [result('t-foundation'), result('t-independent'), result('t-debt')],
    });

    expect(verdict.state).toBe('BLOCKED');
    const blocked = verdict as OuterStagedSettlementBlocked;
    expect(blocked.preservedSettledTaskIds).toEqual(['t-foundation', 't-independent', 't-debt']);
    expect(blocked.preservedSettledTaskIds).not.toContain('t-closure');
  });

  it('reports every blocked closure of a multi-closure staged foundation', () => {
    const verdict = barrier({
      tasks: [
        foundationTask(['t-closure-a', 't-closure-b']),
        task('t-closure-a'),
        task('t-closure-b', { status: TaskStatus.PAUSED }),
      ],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure-a', TaskEvaluation.DONE],
      ]),
      results: [result('t-foundation'), result('t-closure-a')],
    });

    expect(verdict.state).toBe('BLOCKED');
    const blocked = verdict as OuterStagedSettlementBlocked;
    expect(blocked.closures).toHaveLength(2);
    expect(blocked.blockedClosures.map(closure => closure.closureTaskId)).toEqual(['t-closure-b']);
  });
});

describe('resolveSprintTerminalHandoff staged-settlement gate', () => {
  let projectRoot: string;

  const metrics = {
    totalTasks: 2,
    completedTasks: 1,
    failedTasks: 1,
  } as unknown as SprintMetrics;

  function publishEligibleReceipt(sprintId: string): void {
    const path = sprintTerminalReceiptPath(projectRoot, sprintId);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify({
      version: 1,
      receipt: {
        version: 1,
        sprintId,
        runId: 'run-1',
        coordinatorGeneration: 1,
        authorityVersion: 1,
        logicalSettlementDigest: 'digest-1',
      },
      terminalEvidence: {
        cleanupEligibility: { state: 'CANDIDATE', candidate: true, reasons: [] },
        holds: [],
      },
    }), 'utf-8');
  }

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-outer-barrier-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('HOLDs a terminal publication while a staged closure is blocked', () => {
    const sprintId = 'sprint-487-hold';
    publishEligibleReceipt(sprintId);

    const staged = barrier({
      tasks: [foundationTask(), task('t-closure', { status: TaskStatus.NO_GO })],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.NO_GO],
      ]),
      results: [result('t-foundation'), result('t-closure')],
    });

    const handoff = resolveSprintTerminalHandoff({
      projectRoot,
      sprintId,
      retroOutcome: metrics,
      stagedSettlement: staged,
    });

    expect(handoff.state).toBe('HOLD');
    if (handoff.state !== 'HOLD') throw new Error('expected HOLD');
    expect(handoff.reasonCode).toBe('STAGED_CLOSURE_BLOCKED');
    expect(handoff.detail).toContain('closure-task-no-go');
    expect(handoff.detail).toContain('deckent resume sprint-487');
  });

  it('authorizes the terminal handoff once the staged barrier is authorized', () => {
    const sprintId = 'sprint-487-go';
    publishEligibleReceipt(sprintId);

    const staged = barrier({
      tasks: [foundationTask(), task('t-closure')],
      evaluations: new Map([
        ['t-foundation', TaskEvaluation.DONE],
        ['t-closure', TaskEvaluation.DONE],
      ]),
      results: [result('t-foundation'), result('t-closure')],
    });

    const handoff = resolveSprintTerminalHandoff({
      projectRoot,
      sprintId,
      retroOutcome: metrics,
      stagedSettlement: staged,
    });

    expect(handoff.state).toBe('AUTHORIZED');
  });

  it('keeps legacy behaviour when no staged authority is supplied', () => {
    const sprintId = 'sprint-487-legacy';
    publishEligibleReceipt(sprintId);

    const handoff = resolveSprintTerminalHandoff({
      projectRoot,
      sprintId,
      retroOutcome: metrics,
    });

    expect(handoff.state).toBe('AUTHORIZED');
  });
});
