// ═══ run-flow-decision-service — shared decide/start use-case pins (SURF-6) ══
//
// The service is the ONE approve/reject/start sequence every surface calls
// (API decision+start routes, CLI `deckent runs --approve`, REPL /runs card).
// These pins hold the cross-surface guarantees:
//   * approve persists the durable ApprovedPlanSnapshot (restart-safe),
//   * deterministic commandIds → the SAME decision from two surfaces
//     converges idempotently (no duplicate APPROVAL_GRANTED),
//   * refusals are typed state-facts (RunFlowDecisionError), never silent,
//   * start spawns exactly once and refuses honestly once the flow left
//     APPROVED.
//
// Hermetic: per-test tmpdir roots via the coordinator harness; the store
// assigns every sequence; no spawnSync anywhere.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createHarnessRoot,
  cleanupHarnessRoot,
  appendProposalToCompletionChain,
  generateFlowId,
} from './run-flow-coordinator-harness.js';
import {
  decideRunFlow,
  retireRunFlow,
  startRunFlow,
  RunFlowDecisionError,
} from '../../src/orchestra/run-flow-decision-service.js';
import { _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { getRunFlowCoordinator } from '../../src/orchestra/run-flow-coordinator-registry.js';
import {
  savePlannedSprint,
  loadApprovedSnapshot,
  readFlowEvents,
} from '../../src/core/run-flow-store.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import { openTaskSettlementProjection } from '../../src/core/task-settlement-authority.js';
import {
  computeExecutionPlanDigestV4,
  EXECUTION_PLAN_DIGEST_VERSION,
  type ExecutionPlanDigestContext,
} from '../../src/core/execution-plan-digest.js';
import { getNextSprintId } from '../../src/core/utils.js';

const ACTOR = { id: 'decision-service-test' } as const;

function testSprint(id = 'sprint-decision-test'): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [],
    workers: [],
  };
}

function retirementTask(id: string, sprintId: string) {
  return {
    id,
    title: `Retire ${id}`,
    description: `Retire ${id}`,
    model: 'gpt-5.6-sol',
    effort: 'normal' as const,
    priority: 'NORMAL' as const,
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId,
    provider: 'codex' as const,
    createdAt: '2026-08-24T12:00:00.000Z',
  };
}

function writeRetirementTasks(root: string, tasks: readonly ReturnType<typeof retirementTask>[]): void {
  mkdirSync(join(root, '.tasks'), { recursive: true });
  for (const task of tasks) {
    writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task, null, 2));
  }
}

describe('run-flow-decision-service — shared decide/start (SURF-6)', () => {
  let root: string;

  beforeEach(async () => {
    root = await createHarnessRoot('run-flow-decision-service-');
    _resetRunFlowCoordinatorsForTests();
  });

  afterEach(async () => {
    _resetRunFlowCoordinatorsForTests();
    await cleanupHarnessRoot(root);
  });

  it('approve → APPROVED + the durable snapshot is persisted from the planned sprint', () => {
    const flowId = generateFlowId('decide-approve');
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    const sourceAuthority = {
      schemaVersion: 1 as const,
      sourceKind: 'intent' as const,
      contentSha256: '1'.repeat(64),
      configSha256: '2'.repeat(64),
      proposalSha256: '3'.repeat(64),
      planningInputSha256: '4'.repeat(64),
      scopeInputSha256: '5'.repeat(64),
      lineageSha256: '6'.repeat(64),
    };
    savePlannedSprint(root, flowId, {
      revision: 1,
      sprint: testSprint(),
      sourceAuthority,
    });

    const context = decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });

    expect(context.state).toBe('APPROVED');
    expect(context.approvedSnapshot?.revision).toBe(1);
    expect(context.approvedSnapshot?.approvedBy).toEqual(ACTOR);
    const stored = loadApprovedSnapshot(root, flowId);
    expect(stored?.planDigest).toBe('digest-harness');
    expect((stored?.sprint as Sprint).id).toBe('sprint-decision-test');
    expect(stored?.sourceAuthority).toEqual(sourceAuthority);
  });

  it('the SAME approve from a second surface converges idempotently (deterministic commandId)', () => {
    const flowId = generateFlowId('decide-idempotent');
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    savePlannedSprint(root, flowId, { revision: 1, sprint: testSprint() });

    decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });
    const afterFirst = readFlowEvents(root, flowId).length;

    // e.g. Desktop already approved r1; the CLI operator approves r1 too —
    // the coordinator folds the identical `approve-<flowId>-r1` command as a
    // no-op instead of double-appending or throwing.
    const second = decideRunFlow(root, flowId, { decision: 'approve', actor: { id: 'other-surface' } });

    expect(second.state).toBe('APPROVED');
    expect(readFlowEvents(root, flowId).length).toBe(afterFirst);
  });

  it('approve without a live preview refuses with NO_LIVE_PREVIEW and appends nothing', () => {
    const flowId = generateFlowId('decide-no-preview');
    appendProposalToCompletionChain({ root, flowId, through: 'PROPOSAL_SUBMITTED' });
    const before = readFlowEvents(root, flowId).length;

    let caught: unknown;
    try {
      decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RunFlowDecisionError);
    expect((caught as RunFlowDecisionError).code).toBe('NO_LIVE_PREVIEW');
    expect(readFlowEvents(root, flowId).length).toBe(before);
  });

  it('approve with a missing planned-sprint record refuses with PLANNED_SPRINT_MISSING (route-preserved behavior)', () => {
    const flowId = generateFlowId('decide-no-plan');
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    // deliberately NO savePlannedSprint

    expect(() => decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR })).toThrowError(
      /planned sprint record missing/,
    );
  });

  it('approve refuses a digest-valid v3 structural topology blocker before APPROVAL_GRANTED', () => {
    const flowId = generateFlowId('decide-topology-block');
    const sprint = testSprint();
    sprint.tasks = ['One', 'Two'].map((title, index) => ({
      id: `volatile-${index}`,
      title,
      description: title,
      model: 'qwen3.6:27b',
      effort: 'normal' as const,
      priority: 'NORMAL' as const,
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.PENDING,
      provider: 'ollama' as const,
    }));
    const digestContext = {
      configuredProvider: 'ollama',
      configuredModel: 'qwen3.6:27b',
      configuredBackend: 'subprocess',
      configuredAuthMode: 'subscription',
      fallbackProvider: null,
      fallbackPolicy: null,
      executionBudgetPolicy: null,
      configuredMaxWorkers: 4,
    } satisfies ExecutionPlanDigestContext;
    const digest = computeExecutionPlanDigestV4(sprint, digestContext);
    const coordinator = getRunFlowCoordinator(root);
    coordinator.proposeFlow({
      proposal: {
        flowId,
        tenant: 'local',
        project: 'test',
        actor: ACTOR,
        origin: 'cli',
        revision: 1,
        intentSummary: 'unsafe writers',
      },
    });
    coordinator.recordPreview({
      preview: {
        flowId,
        revision: 1,
        planDigest: digest.digest,
        planDigestVersion: EXECUTION_PLAN_DIGEST_VERSION,
        planDigestContext: digestContext,
        taskSummaries: sprint.tasks.map(task => ({ title: task.title, summary: task.description })),
        policyDecision: 'deny',
        gateResult: 'fail',
        topology: digest.topology,
        topologyGateResult: 'fail',
      },
    });
    savePlannedSprint(root, flowId, {
      revision: 1,
      sprint,
      planDigest: digest.digest,
      planDigestVersion: EXECUTION_PLAN_DIGEST_VERSION,
      planDigestContext: digestContext,
    });

    let caught: unknown;
    try {
      decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RunFlowDecisionError);
    expect((caught as RunFlowDecisionError).code).toBe('TOPOLOGY_BLOCKED');
    expect(readFlowEvents(root, flowId).map(event => event.type)).not.toContain('APPROVAL_GRANTED');
  });

  it('reject → CANCELLED with the rejection recorded durably', () => {
    const flowId = generateFlowId('decide-reject');
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });

    const context = decideRunFlow(root, flowId, {
      decision: 'reject',
      reason: 'not in scope',
      actor: ACTOR,
    });

    expect(context.state).toBe('CANCELLED');
    const events = readFlowEvents(root, flowId);
    expect(events.at(-1)?.type).toBe('APPROVAL_REJECTED');
  });

  it('retires the exact approved task set, projects NOT_DISPATCHED, and replays without duplicates', () => {
    const flowId = generateFlowId('retire-approved-identity');
    const chain = appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    const tasks = [
      retirementTask('626-001', 'sprint-626'),
      retirementTask('626-002', 'sprint-626'),
    ];
    const sprint = { ...testSprint('sprint-626'), number: 626, tasks };
    savePlannedSprint(root, flowId, {
      revision: 1,
      sprint,
      proposal: chain.proposal,
    });
    decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });
    writeRetirementTasks(root, tasks);

    expect(getNextSprintId(root)).toBe('sprint-001');

    const retired = retireRunFlow(root, flowId);

    expect(retired).toMatchObject({
      context: { state: 'CANCELLED', cancelReason: 'aborted' },
      flowTransitionApplied: true,
    });
    expect(retired.taskReceiptRefs).toHaveLength(2);
    expect(getNextSprintId(root)).toBe('sprint-627');
    const projection = openTaskSettlementProjection(root);
    for (const task of tasks) {
      expect(projection.projectTaskExecutionState(task.id, 'PENDING', 'local')).toMatchObject({
        effectiveStatus: 'NOT_DISPATCHED',
        reasonCode: 'projected',
      });
    }
    projection.close();

    const replay = retireRunFlow(root, flowId);
    expect(replay.flowTransitionApplied).toBe(false);
    expect(replay.taskReceiptRefs).toEqual(retired.taskReceiptRefs);
    expect(readFlowEvents(root, flowId).filter(event => event.type === 'FLOW_ABORTED'))
      .toHaveLength(1);
  });

  it('refuses a drifted task projection before changing an approved flow', () => {
    const flowId = generateFlowId('retire-drifted-task');
    const chain = appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    const task = retirementTask('627-001', 'sprint-627');
    const sprint = { ...testSprint('sprint-627'), number: 627, tasks: [task] };
    savePlannedSprint(root, flowId, {
      revision: 1,
      sprint,
      proposal: chain.proposal,
    });
    decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });
    writeRetirementTasks(root, [{ ...task, title: 'drifted' }]);

    expect(() => retireRunFlow(root, flowId)).toThrowError(
      expect.objectContaining({ code: 'RETIRE_TASK_SNAPSHOT_MISMATCH' }),
    );
    expect(getRunFlowCoordinator(root).getFlow(flowId).state).toBe('APPROVED');
    expect(readFlowEvents(root, flowId).map(event => event.type)).not.toContain('FLOW_ABORTED');
  });

  it('start spawns exactly once, remains STARTING until child admission, and refuses an active re-start', () => {
    const flowId = generateFlowId('decide-start');
    const chain = appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });
    savePlannedSprint(root, flowId, {
      revision: 1,
      sprint: testSprint(),
      proposal: chain.proposal,
      lineage: {
        tenantId: chain.proposal.tenant,
        actor: chain.proposal.actor,
        origin: chain.proposal.origin,
        correlationId: flowId,
        idempotencyKey: `plan:${flowId}:r1`,
        sourceRef: 'test-directives',
      },
    });
    decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });

    const spawns: string[] = [];
    const spawnStart = (context: { capability: { flowId: string } }) => {
      spawns.push(context.capability.flowId);
      return { pid: process.pid };
    };
    const lineage = {
      tenantId: 'local',
      actor: ACTOR,
      origin: 'cli' as const,
      correlationId: flowId,
      idempotencyKey: `start:${flowId}`,
      authorization: { kind: 'approved-actor' as const },
    };

    const result = startRunFlow(root, flowId, { spawnStart, lineage });
    expect(result.status).toBe('accepted');
    expect(result.context.state).toBe('STARTING');
    expect(spawns).toEqual([flowId]);
    const types = readFlowEvents(root, flowId).map((e) => e.type);
    expect(types).toContain('START_REQUESTED');
    expect(types).not.toContain('RUN_STARTED');

    expect(() => startRunFlow(root, flowId, { spawnStart, lineage }))
      .toThrow(/active|PROCESS_SPAWNED|in flight/i);
    expect(spawns).toEqual([flowId]);
  });

  it('start on a non-approved flow refuses with NOT_APPROVED', () => {
    const flowId = generateFlowId('decide-start-early');
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });

    expect(() =>
      startRunFlow(root, flowId, {
        lineage: {
          tenantId: 'local',
          actor: ACTOR,
          origin: 'cli',
          correlationId: flowId,
          idempotencyKey: `start:${flowId}`,
          authorization: { kind: 'approved-actor' },
        },
        spawnStart: () => {
          throw new Error('spawnStart must never run for a non-approved flow');
        },
      }),
    ).toThrowError(/not APPROVED/);
  });
});
