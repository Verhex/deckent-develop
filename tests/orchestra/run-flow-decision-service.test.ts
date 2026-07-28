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
import {
  createHarnessRoot,
  cleanupHarnessRoot,
  appendProposalToCompletionChain,
  generateFlowId,
} from './run-flow-coordinator-harness.js';
import {
  decideRunFlow,
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
import {
  computeExecutionPlanDigestV4,
  EXECUTION_PLAN_DIGEST_VERSION,
  type ExecutionPlanDigestContext,
} from '../../src/core/execution-plan-digest.js';

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
    savePlannedSprint(root, flowId, { revision: 1, sprint: testSprint() });

    const context = decideRunFlow(root, flowId, { decision: 'approve', actor: ACTOR });

    expect(context.state).toBe('APPROVED');
    expect(context.approvedSnapshot?.revision).toBe(1);
    expect(context.approvedSnapshot?.approvedBy).toEqual(ACTOR);
    const stored = loadApprovedSnapshot(root, flowId);
    expect(stored?.planDigest).toBe('digest-harness');
    expect((stored?.sprint as Sprint).id).toBe('sprint-decision-test');
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
