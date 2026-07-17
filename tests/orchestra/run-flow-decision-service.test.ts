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
import {
  savePlannedSprint,
  loadApprovedSnapshot,
  readFlowEvents,
} from '../../src/core/run-flow-store.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';
import type { RunHandle } from '../../src/core/run-flow-contract.js';

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

  it('start spawns exactly once, records RUN_STARTED, then refuses a re-start honestly', () => {
    const flowId = generateFlowId('decide-start');
    appendProposalToCompletionChain({ root, flowId, through: 'APPROVAL_GRANTED' });
    savePlannedSprint(root, flowId, { revision: 1, sprint: testSprint() });

    const spawns: string[] = [];
    const spawnStart = (_sprint: Sprint, fid: string): RunHandle => {
      spawns.push(fid);
      return { flowId: fid, jobId: `job-${fid}`, logRef: `log-${fid}` };
    };

    const result = startRunFlow(root, flowId, { spawnStart });
    expect(result.status).toBe('started');
    expect(result.context.state).toBe('DETACHED_RUNNING');
    expect(spawns).toEqual([flowId]);
    const types = readFlowEvents(root, flowId).map((e) => e.type);
    expect(types).toContain('START_REQUESTED');
    expect(types).toContain('RUN_STARTED');

    // The flow left APPROVED — a second start is a typed state-refusal, and
    // no second process is ever spawned.
    let caught: unknown;
    try {
      startRunFlow(root, flowId, { spawnStart });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RunFlowDecisionError);
    expect((caught as RunFlowDecisionError).code).toBe('NOT_APPROVED');
    expect(spawns).toEqual([flowId]);
  });

  it('start on a non-approved flow refuses with NOT_APPROVED', () => {
    const flowId = generateFlowId('decide-start-early');
    appendProposalToCompletionChain({ root, flowId, through: 'PREVIEW_READY' });

    expect(() =>
      startRunFlow(root, flowId, {
        spawnStart: () => {
          throw new Error('spawnStart must never run for a non-approved flow');
        },
      }),
    ).toThrowError(/not APPROVED/);
  });
});
