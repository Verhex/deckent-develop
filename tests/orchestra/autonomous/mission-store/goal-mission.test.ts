import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  createGoalMission,
  advanceGoalMission,
  buildGoalDeps,
  GoalInvocationHeldError,
} from '../../../../src/orchestra/autonomous/mission-store/goal-mission.js';
import type {
  GoalInvocationConsumerCheckpointV1,
  GoalInvocationConsumerReceiptSettlementV1,
  NewWorkItem,
  WorkItem,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';
import { PRODUCTION_V2_ADMISSION } from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type { GoalAcceptanceContractV1 } from '../../../../src/orchestra/autonomous/mission-store/mission-acceptance.js';
import type { InvocationReceiptRef } from '../../../../src/core/invocation-receipt.js';
import { settleMissionItem } from '../../../helpers/mission-store.js';

const dirs: string[] = [];
function newStore() {
  const d = mkdtempSync(join(tmpdir(), 'goal-'));
  dirs.push(d);
  const s = new SqliteMissionStore(d);
  s.migrate();
  return s;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function invocationHold(reasonCode: 'authority_unavailable' | 'fallback_exhausted' = 'authority_unavailable') {
  return new GoalInvocationHeldError({
    schemaVersion: 1,
    reasonCode,
    evidenceRefs: [`host-role-admission:${reasonCode}`],
    invocationReceiptRef: null,
    heldAt: '2026-07-22T02:00:00.000Z',
  });
}

const outputDigest = 'a'.repeat(64);
const receiptEventHash = 'b'.repeat(64);
function receiptRef(invocationId: string): InvocationReceiptRef {
  return { schemaVersion: 1, tenantId: 'local', projectId: 'project-test', invocationId };
}
function settlement(ref: InvocationReceiptRef): GoalInvocationConsumerReceiptSettlementV1 {
  return {
    schemaVersion: 1,
    invocationReceiptRef: ref,
    receiptEventId: `${ref.invocationId}-consumer`,
    receiptEventHash,
  };
}

class OneAckFaultStore extends SqliteMissionStore {
  constructor(root: string, private readonly purpose: 'goal-authoring' | 'goal-acceptance') {
    super(root);
  }
  private failed = false;
  override acknowledgeGoalInvocationConsumer(
    checkpoint: GoalInvocationConsumerCheckpointV1,
    receiptSettlement: GoalInvocationConsumerReceiptSettlementV1,
  ): boolean {
    if (!this.failed && checkpoint.purpose === this.purpose) {
      this.failed = true;
      throw new Error('injected checkpoint acknowledgement failure');
    }
    return super.acknowledgeGoalInvocationConsumer(checkpoint, receiptSettlement);
  }
}

describe('createGoalMission', () => {
  it('creates a kind=goal mission (renderAs goal) with goal + acceptance persisted', () => {
    const store = newStore();
    const mission = createGoalMission(store, {
      id: 'goal-1',
      title: 'Ship the feature',
      goal: 'All endpoints return 200',
      createdBy: 'terminal-operator',
      acceptance: 'integration tests green',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
      acceptanceAuthoredBy: { surface: 'cli', actorId: 'terminal-operator' },
      tenant: 'acme',
      deliverTo: 'user@example.com',
    });

    expect(mission.id).toBe('goal-1');
    expect(mission.kind).toBe('goal');
    expect(mission.renderAs).toBe('goal');
    expect(mission.status).toBe('pending');
    expect(mission.tenant).toBe('acme');
    expect(mission.deliverTo).toBe('user@example.com');
    expect(mission.createdBy).toBe('terminal-operator');

    const stored = store.getMission('goal-1')!;
    expect(stored.spec?.['goal']).toBe('All endpoints return 200');
    expect(stored.spec?.['acceptanceContract']).toMatchObject({
      schemaVersion: 1,
      authoredAt: '2026-07-22T00:00:00.000Z',
      authoredBy: { surface: 'cli', actorId: 'terminal-operator' },
      criteria: [{ text: 'integration tests green', critical: true }],
    });
    expect((stored.spec?.['acceptanceContract'] as { digest: string }).digest).toMatch(/^[a-f0-9]{64}$/);

    store.close();
  });
});

describe('advanceGoalMission', () => {
  it('reconciles an authored effect committed before receipt ack after SQLite reopen without duplicate work', async () => {
    const root = mkdtempSync(join(tmpdir(), 'goal-consumer-author-'));
    dirs.push(root);
    const first = new OneAckFaultStore(root, 'goal-authoring');
    first.migrate();
    createGoalMission(first, { id: 'g-author-reopen', title: 'Author reopen', goal: 'ship' });
    const ref = receiptRef('goal-author-reopen-invocation');
    const settle = vi.fn(() => settlement(ref));
    let handleTaken = false;
    await expect(advanceGoalMission(first, 'g-author-reopen', {
      author: async () => [{ id: 'g-author-reopen-item', missionId: '', kind: 'task' }],
      accept: async () => false,
      takeInvocationConsumer: (_context, purpose) => {
        if (purpose !== 'goal-authoring' || handleTaken) return null;
        handleTaken = true;
        return { outputDigest, invocationReceiptRef: ref, settleConsumer: settle };
      },
      reconcileInvocationConsumer: (checkpoint) => settlement(checkpoint.invocationReceiptRef),
    })).resolves.toBe('held');
    expect(first.listItems('g-author-reopen')).toHaveLength(1);
    expect(first.listPendingGoalInvocationConsumers('g-author-reopen')).toHaveLength(1);
    expect(settle).not.toHaveBeenCalled();
    first.close();

    const reopened = new SqliteMissionStore(root);
    reopened.migrate();
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const reconcile = vi.fn((checkpoint: GoalInvocationConsumerCheckpointV1) =>
      settlement(checkpoint.invocationReceiptRef));
    await expect(advanceGoalMission(reopened, 'g-author-reopen', {
      author,
      accept: async () => false,
      reconcileInvocationConsumer: reconcile,
    })).resolves.toBe('waiting');
    expect(author).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reopened.listPendingGoalInvocationConsumers('g-author-reopen')).toEqual([]);
    expect(reopened.listItems('g-author-reopen').map((item) => item.id))
      .toEqual(['g-author-reopen-item']);
    reopened.close();
  });

  it.each(['cancelled', 'failed', 'completed'] as const)(
    'preserves a reopened terminal %s mission and its result when consumer reconciliation is held',
    async (status) => {
      const root = mkdtempSync(join(tmpdir(), `goal-consumer-terminal-${status}-`));
      dirs.push(root);
      const first = new SqliteMissionStore(root);
      first.migrate();
      createGoalMission(first, {
        id: `g-terminal-${status}`,
        title: `Terminal ${status}`,
        goal: 'preserve durable terminal truth',
      });
      const ref = receiptRef(`goal-terminal-${status}-invocation`);
      first.stageGoalInvocationConsumer({
        schemaVersion: 1,
        tenantId: 'local',
        projectId: 'project-test',
        missionId: `g-terminal-${status}`,
        round: 1,
        purpose: 'goal-authoring',
        invocationReceiptRef: ref,
        outputDigest,
        effect: { kind: 'authored-batch', items: [] },
      });
      const terminalResult = { ok: status === 'completed', terminalAuthority: `result:${status}` };
      first.updateMissionStatus(`g-terminal-${status}`, status, terminalResult);
      first.close();

      const reopened = new SqliteMissionStore(root);
      reopened.migrate();
      const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
      const accept = vi.fn(async () => false);
      await expect(advanceGoalMission(reopened, `g-terminal-${status}`, {
        author,
        accept,
        reconcileInvocationConsumer: () => { throw new Error('receipt ledger unavailable'); },
      })).resolves.toBe('held');
      expect(reopened.getMission(`g-terminal-${status}`)).toMatchObject({
        status,
        lastResult: terminalResult,
      });
      expect(reopened.listPendingGoalInvocationConsumers(`g-terminal-${status}`)).toHaveLength(1);
      expect(author).not.toHaveBeenCalled();
      expect(accept).not.toHaveBeenCalled();
      reopened.close();
    },
  );

  it('does not reactivate a mission cancelled while consumer reconciliation is awaiting', async () => {
    const store = newStore();
    createGoalMission(store, {
      id: 'g-reconcile-cancel-race',
      title: 'Reconciliation cancellation race',
      goal: 'preserve concurrent terminal truth',
    });
    store.updateMissionStatus('g-reconcile-cancel-race', 'active');
    store.stageGoalInvocationConsumer({
      schemaVersion: 1,
      tenantId: 'local',
      projectId: 'project-test',
      missionId: 'g-reconcile-cancel-race',
      round: 1,
      purpose: 'goal-authoring',
      invocationReceiptRef: receiptRef('goal-reconcile-cancel-race'),
      outputDigest,
      effect: { kind: 'authored-batch', items: [] },
    });
    const terminalResult = { ok: false, terminalAuthority: 'concurrent-owner-cancellation' };
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => false);
    await expect(advanceGoalMission(store, 'g-reconcile-cancel-race', {
      author,
      accept,
      reconcileInvocationConsumer: async () => {
        store.updateMissionStatus('g-reconcile-cancel-race', 'cancelled', terminalResult);
        await Promise.resolve();
        throw new Error('receipt ledger unavailable after cancellation');
      },
    })).resolves.toBe('held');
    expect(store.getMission('g-reconcile-cancel-race')).toMatchObject({
      status: 'cancelled',
      lastResult: terminalResult,
    });
    expect(store.listPendingGoalInvocationConsumers('g-reconcile-cancel-race')).toHaveLength(1);
    expect(author).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it('reuses an acknowledged empty author stage when acceptance is held', async () => {
    const root = mkdtempSync(join(tmpdir(), 'goal-consumer-empty-'));
    dirs.push(root);
    const first = new SqliteMissionStore(root);
    first.migrate();
    createGoalMission(first, { id: 'g-empty-reopen', title: 'Empty reopen', goal: 'ship' });
    const ref = receiptRef('goal-empty-author-invocation');
    let handleTaken = false;
    await expect(advanceGoalMission(first, 'g-empty-reopen', {
      author: async () => [],
      accept: async () => { throw invocationHold(); },
      takeInvocationConsumer: (_context, purpose) => {
        if (purpose !== 'goal-authoring' || handleTaken) return null;
        handleTaken = true;
        return { outputDigest, invocationReceiptRef: ref, settleConsumer: () => settlement(ref) };
      },
      reconcileInvocationConsumer: (checkpoint) => settlement(checkpoint.invocationReceiptRef),
    })).resolves.toBe('held');
    expect(first.getGoalInvocationConsumer('g-empty-reopen', 1, 'goal-authoring'))
      .toMatchObject({ acknowledged: true, effect: { kind: 'authored-batch', items: [] } });
    first.close();

    const reopened = new SqliteMissionStore(root);
    reopened.migrate();
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    await expect(advanceGoalMission(reopened, 'g-empty-reopen', {
      author,
      accept: async () => false,
    })).resolves.toBe('exhausted');
    expect(author).not.toHaveBeenCalled();
    reopened.close();
  });

  it('persists acceptance evaluation before ack and finalizes the identical decision after reopen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'goal-consumer-accept-'));
    dirs.push(root);
    const first = new OneAckFaultStore(root, 'goal-acceptance');
    first.migrate();
    const mission = createGoalMission(first, {
      id: 'g-accept-reopen', title: 'Accept reopen', goal: 'ship', acceptance: 'done',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
    });
    first.enqueueItem({ id: 'g-accept-evidence', missionId: mission.id, kind: 'task' });
    settleMissionItem(first, 'g-accept-evidence', 'done', { ok: true });
    const contract = mission.spec?.['acceptanceContract'] as GoalAcceptanceContractV1;
    const authorRef = receiptRef('goal-empty-before-acceptance');
    const acceptanceRef = receiptRef('goal-acceptance-reopen-invocation');
    const evaluation = {
      outcome: 'accepted' as const,
      criteria: [{
        criterionId: contract.criteria[0]!.id,
        verdict: 'met' as const,
        evidenceRefs: ['work-item:g-accept-evidence'],
        rationale: 'the durable work item completed',
      }],
      evaluator: { role: 'brain' as const, instanceId: 'goal-evaluator-reopen' },
      invocationReceiptRef: acceptanceRef,
      decidedAt: '2026-07-22T00:05:00.000Z',
    };
    const handles = new Map([
      ['goal-authoring', { outputDigest, invocationReceiptRef: authorRef,
        settleConsumer: () => settlement(authorRef) }],
      ['goal-acceptance', { outputDigest: 'c'.repeat(64), invocationReceiptRef: acceptanceRef,
        settleConsumer: () => settlement(acceptanceRef) }],
    ]);
    await expect(advanceGoalMission(first, 'g-accept-reopen', {
      author: async () => [],
      accept: async () => evaluation,
      takeInvocationConsumer: (_context, purpose) => handles.get(purpose) ?? null,
      reconcileInvocationConsumer: (checkpoint) => settlement(checkpoint.invocationReceiptRef),
      verifyAcceptanceReceipt: () => ({ verified: true, errors: [] }),
    })).resolves.toBe('held');
    expect(first.listAcceptanceDecisions('g-accept-reopen')).toEqual([]);
    expect(first.listPendingGoalInvocationConsumers('g-accept-reopen'))
      .toMatchObject([{ purpose: 'goal-acceptance', effect: { evaluation } }]);
    first.close();

    const reopened = new SqliteMissionStore(root);
    reopened.migrate();
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => evaluation);
    await expect(advanceGoalMission(reopened, 'g-accept-reopen', {
      author,
      accept,
      reconcileInvocationConsumer: (checkpoint) => settlement(checkpoint.invocationReceiptRef),
      verifyAcceptanceReceipt: () => ({ verified: true, errors: [] }),
    })).resolves.toBe('accepted');
    expect(author).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(reopened.listAcceptanceDecisions('g-accept-reopen'))
      .toMatchObject([{ decision: { decidedAt: evaluation.decidedAt }, effectiveOutcome: 'accepted' }]);
    reopened.close();
  });

  it('rolls back a checkpoint with its conflicting batch and rejects sibling payload reuse', () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-checkpoint-a', title: 'A', goal: 'a' });
    createGoalMission(store, { id: 'g-checkpoint-b', title: 'B', goal: 'b' });
    store.enqueueItem({ id: 'global-conflict', missionId: 'g-checkpoint-b', kind: 'task' });
    const ref = receiptRef('goal-checkpoint-conflict');
    expect(() => store.stageGoalInvocationConsumer({
      schemaVersion: 1,
      tenantId: 'local',
      projectId: 'project-test',
      missionId: 'g-checkpoint-a',
      round: 1,
      purpose: 'goal-authoring',
      invocationReceiptRef: ref,
      outputDigest,
      effect: { kind: 'authored-batch', items: [
        { id: 'global-conflict', missionId: 'g-checkpoint-a', kind: 'task' },
      ] },
    })).toThrow('MISSION_GOAL_CONSUMER_CHECKPOINT_CONFLICT');
    expect(store.getGoalInvocationConsumer('g-checkpoint-a', 1, 'goal-authoring')).toBeNull();

    store.stageGoalInvocationConsumer({
      schemaVersion: 1,
      tenantId: 'local',
      projectId: 'project-test',
      missionId: 'g-checkpoint-a',
      round: 1,
      purpose: 'goal-authoring',
      invocationReceiptRef: ref,
      outputDigest,
      effect: { kind: 'authored-batch', items: [] },
    });
    expect(() => store.stageGoalInvocationConsumer({
      schemaVersion: 1,
      tenantId: 'local',
      projectId: 'project-test',
      missionId: 'g-checkpoint-a',
      round: 1,
      purpose: 'goal-authoring',
      invocationReceiptRef: ref,
      outputDigest: 'd'.repeat(64),
      effect: { kind: 'authored-batch', items: [] },
    })).toThrow('MISSION_GOAL_CONSUMER_CHECKPOINT_CONFLICT');
    store.close();
  });
  it('passes the exact immutable acceptance contract to the author prompt seam', async () => {
    const store = newStore();
    createGoalMission(store, {
      id: 'g-author-contract',
      title: 'Author with contract',
      goal: 'ship',
      acceptance: 'all targeted tests pass',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
    });
    const author = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'g-author-contract-1', missionId: '', kind: 'task', spec: { description: 'run tests' } },
    ]);

    await expect(advanceGoalMission(store, 'g-author-contract', {
      author,
      accept: async () => false,
    })).resolves.toBe('authored');

    expect(author).toHaveBeenCalledTimes(1);
    const contract = author.mock.calls[0]![2];
    expect(contract.criteria[0]!.text).toBe('all targeted tests pass');
    expect(contract.digest).toMatch(/^[a-f0-9]{64}$/);
    store.close();
  });

  it('atomically persists criterion evidence and completes only with evaluator receipt provenance', async () => {
    const store = newStore();
    createGoalMission(store, {
      id: 'g-evidenced',
      title: 'Evidenced acceptance',
      goal: 'ship',
      acceptance: 'targeted tests pass',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
    });
    store.enqueueItem({ id: 'g-evidenced-test', missionId: 'g-evidenced', kind: 'task' });
    settleMissionItem(store, 'g-evidenced-test', 'done', { ok: true, reason: '27 tests passed' });
    const receiptRef: InvocationReceiptRef = {
      schemaVersion: 1,
      invocationId: 'inv-goal-accept-1',
      tenantId: 'local',
      projectId: 'project-test',
    };

    const outcome = await advanceGoalMission(store, 'g-evidenced', {
      author: async () => [],
      accept: async (_goal, _items, contract) => ({
        outcome: 'accepted',
        criteria: [{
          criterionId: contract!.criteria[0]!.id,
          verdict: 'met',
          evidenceRefs: ['work-item:g-evidenced-test'],
          rationale: 'the durable task result records the targeted test pass',
        }],
        evaluator: { role: 'brain', instanceId: 'goal-evaluator-1' },
        invocationReceiptRef: receiptRef,
        decidedAt: '2026-07-22T00:05:00.000Z',
      }),
      verifyAcceptanceReceipt: () => ({ verified: true, errors: [] }),
    });

    expect(outcome).toBe('accepted');
    const records = store.listAcceptanceDecisions('g-evidenced');
    expect(records).toHaveLength(1);
    expect(records[0]!.effectiveOutcome).toBe('accepted');
    expect(records[0]!.decision.criteria[0]!.evidence[0]).toMatchObject({
      kind: 'work-item-result',
      ref: 'work-item:g-evidenced-test',
      workItemId: 'g-evidenced-test',
      status: 'done',
    });
    expect(records[0]!.decision.criteria[0]!.evidence[0]!.resultDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(store.getMission('g-evidenced')!.lastResult).toMatchObject({
      ok: true,
      acceptanceValidationErrors: [],
      acceptanceDecision: { invocationReceiptRef: receiptRef },
    });
    store.close();
  });

  it('fails closed and persists unknown when explicit acceptance lacks receipt/evidence provenance', async () => {
    const store = newStore();
    createGoalMission(store, {
      id: 'g-no-receipt',
      title: 'No receipt',
      goal: 'ship',
      acceptance: 'tests pass',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
    });

    const outcome = await advanceGoalMission(store, 'g-no-receipt', {
      author: async () => [],
      accept: async () => true,
    });

    expect(outcome).toBe('exhausted');
    const record = store.listAcceptanceDecisions('g-no-receipt')[0]!;
    expect(record.effectiveOutcome).toBe('unknown');
    expect(record.validationErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('missing criterion result'),
      expect.stringContaining('evaluator instanceId'),
      expect.stringContaining('InvocationReceiptRef'),
    ]));
    expect(store.getMission('g-no-receipt')!.status).toBe('failed');
    expect(store.getMission('g-no-receipt')!.lastResult?.reason).toContain('GOAL_ACCEPTANCE_EVIDENCE_INVALID');
    store.close();
  });

  it('authors the next work-items when there are no open items', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-author', title: 'Author round', goal: 'do work' });

    const author = vi.fn(async (_goal: string, _prior: WorkItem[]): Promise<NewWorkItem[]> => [
      { id: 'g-author-step-1', missionId: 'g-author', kind: 'task', spec: { description: 'step 1' } },
    ]);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-author', { author, accept });

    expect(outcome).toBe('authored');
    expect(author).toHaveBeenCalledTimes(1);
    expect(author).toHaveBeenCalledWith('do work', []);
    expect(accept).not.toHaveBeenCalled();

    const items = store.listItems('g-author');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('g-author-step-1');
    expect(items[0].status).toBe('pending');
    expect(items[0].missionId).toBe('g-author');

    store.close();
  });

  it('stamps missionId on enqueue even when author returns a foreign missionId', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-stamp', title: 'Stamp', goal: 'g' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'g-stamp-1', missionId: 'WRONG', kind: 'task' },
    ]);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-stamp', { author, accept });

    expect(outcome).toBe('authored');
    const items = store.listItems('g-stamp');
    expect(items).toHaveLength(1);
    expect(items[0].missionId).toBe('g-stamp');

    store.close();
  });

  it('completes the mission (accepted) when author is empty and accept returns true', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-accept', title: 'Accept', goal: 'reach it' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => true);

    const outcome = await advanceGoalMission(store, 'g-accept', { author, accept });

    expect(outcome).toBe('accepted');
    expect(author).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledWith('reach it', []);

    const mission = store.getMission('g-accept')!;
    expect(mission.status).toBe('completed');
    expect(mission.completedAt).not.toBeNull();
    expect(mission.lastResult).toEqual({ ok: true });

    store.close();
  });

  it('fails the mission (exhausted) when author is empty and accept returns false', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-exhaust', title: 'Exhaust', goal: 'unreachable' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-exhaust', { author, accept });

    expect(outcome).toBe('exhausted');
    const mission = store.getMission('g-exhaust')!;
    expect(mission.status).toBe('failed');
    expect(mission.lastResult).toEqual({ ok: false, reason: 'goal not reached, no further work' });

    store.close();
  });

  it('persists a typed author HOLD without exhausting or finalizing the mission', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-author-hold', title: 'Hold author', goal: 'ship' });
    const accept = vi.fn(async () => true);

    await expect(advanceGoalMission(store, 'g-author-hold', {
      author: async () => { throw invocationHold(); },
      accept,
    })).resolves.toBe('held');

    const mission = store.getMission('g-author-hold')!;
    expect(mission.status).toBe('pending');
    expect(mission.completedAt).toBeNull();
    expect(mission.lastResult).toEqual({
      ok: false,
      reason: 'GOAL_INVOCATION_HOLD:authority_unavailable',
      goalInvocationHold: {
        schemaVersion: 1,
        reasonCode: 'authority_unavailable',
        evidenceRefs: ['host-role-admission:authority_unavailable'],
        invocationReceiptRef: null,
        heldAt: '2026-07-22T02:00:00.000Z',
      },
    });
    expect(accept).not.toHaveBeenCalled();
    store.close();
  });

  it('persists a typed accepter HOLD but propagates an ordinary author failure', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-accept-hold', title: 'Hold accept', goal: 'ship' });
    await expect(advanceGoalMission(store, 'g-accept-hold', {
      author: async () => [],
      accept: async () => { throw invocationHold('fallback_exhausted'); },
    })).resolves.toBe('held');
    expect(store.getMission('g-accept-hold')!.status).toBe('pending');
    expect(store.getMission('g-accept-hold')!.lastResult?.['goalInvocationHold'])
      .toMatchObject({ reasonCode: 'fallback_exhausted' });

    createGoalMission(store, { id: 'g-programmer-error', title: 'Error', goal: 'ship' });
    await expect(advanceGoalMission(store, 'g-programmer-error', {
      author: async () => { throw new Error('parser bug'); },
      accept: async () => false,
    })).rejects.toThrow('parser bug');
    expect(store.getMission('g-programmer-error')!.lastResult).toBeNull();
    store.close();
  });

  it('rejects a malformed HOLD before it can change mission state', () => {
    expect(() => new GoalInvocationHeldError({
      schemaVersion: 1,
      reasonCode: 'authority_unavailable',
      evidenceRefs: ['not-an-evidence-ref'],
      invocationReceiptRef: null,
      heldAt: 'not-a-time',
    })).toThrow('GOAL_INVOCATION_HOLD_INVALID');
  });

  it('is a no-op (waiting) while an open work-item is still pending/running', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-wait', title: 'Wait', goal: 'g' });
    // Seed an open (pending) item — the scheduler has not settled it yet.
    store.enqueueItem({ id: 'g-wait-open', missionId: 'g-wait', kind: 'task' });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => true);

    const outcome = await advanceGoalMission(store, 'g-wait', { author, accept });

    expect(outcome).toBe('waiting');
    expect(author).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();

    const mission = store.getMission('g-wait')!;
    expect(mission.status).toBe('pending'); // unchanged

    store.close();
  });

  it('is a no-op (waiting) while recovered work is parked for owner reconciliation', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-parked', title: 'Parked', goal: 'g' });
    store.enqueueItem({ id: 'g-parked-open', missionId: 'g-parked', kind: 'task' });
    settleMissionItem(store, 'g-parked-open', 'parked', {
      ok: false,
      reason: 'RECOVERY_RECONCILIATION_REQUIRED',
    });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => true);

    await expect(advanceGoalMission(store, 'g-parked', { author, accept })).resolves.toBe('waiting');
    expect(author).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(store.getMission('g-parked')!.status).toBe('pending');

    store.close();
  });

  it('trips the maxRounds guard → exhausted/failed without authoring', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-max', title: 'Max', goal: 'g' });
    // Two already-settled items; with maxRounds=2 the cumulative cap is reached.
    store.enqueueItem({ id: 'g-max-1', missionId: 'g-max', kind: 'task' });
    store.enqueueItem({ id: 'g-max-2', missionId: 'g-max', kind: 'task' });
    settleMissionItem(store, 'g-max-1', 'done', { ok: true });
    settleMissionItem(store, 'g-max-2', 'done', { ok: true });

    const author = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'g-max-3', missionId: 'g-max', kind: 'task' },
    ]);
    const accept = vi.fn(async () => false);

    const outcome = await advanceGoalMission(store, 'g-max', { author, accept, maxRounds: 2 });

    expect(outcome).toBe('exhausted');
    expect(author).not.toHaveBeenCalled();
    const mission = store.getMission('g-max')!;
    expect(mission.status).toBe('failed');
    expect(mission.lastResult).toEqual({ ok: false, reason: 'goal not reached, max rounds exhausted' });

    store.close();
  });

  it('throws when the mission does not exist', async () => {
    const store = newStore();
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accept = vi.fn(async () => false);

    await expect(advanceGoalMission(store, 'missing', { author, accept })).rejects.toThrow(/goal mission not found/);

    store.close();
  });

  it('rejects an unsupported authored batch before any item is enqueued', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-admission', title: 'Admission', goal: 'g' });
    const author = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'first-valid', missionId: '', kind: 'task', spec: { description: 'valid' } },
      {
        id: 'second-unwired', missionId: '', kind: 'capability',
        spec: { capabilityTarget: { capability: 'db.query' } },
      },
    ]);

    const outcome = await advanceGoalMission(store, 'g-admission', {
      author,
      accept: async () => false,
      admission: PRODUCTION_V2_ADMISSION,
    });

    expect(outcome).toBe('exhausted');
    expect(store.listItems('g-admission')).toEqual([]);
    expect(store.getMission('g-admission')!.status).toBe('failed');
    expect(store.getMission('g-admission')!.lastResult?.reason).toContain('CAPABILITY_BROKER_UNWIRED');
    store.close();
  });

  it('stamps and atomically persists the production fence on an authored goal round', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-fenced', title: 'Fenced goal', goal: 'g' });

    const outcome = await advanceGoalMission(store, 'g-fenced', {
      author: async () => [{
        id: 'g-fenced-1', missionId: '', kind: 'task', spec: { description: 'admitted work' },
      }],
      accept: async () => false,
      admission: PRODUCTION_V2_ADMISSION,
    });

    expect(outcome).toBe('authored');
    const item = store.listItems('g-fenced')[0]!;
    expect(item.missionId).toBe('g-fenced');
    expect(item.admissionFence?.registryDigest).toBe(PRODUCTION_V2_ADMISSION.registryDigest);
    expect(store.__rawGet('SELECT COUNT(*) AS count FROM work_item_admission_fences')).toEqual({ count: 1 });
    store.close();
  });
});

describe('buildGoalDeps', () => {
  it('adapts planner→author: planner is invoked and its items are enqueued', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-bd', title: 'BuildDeps', goal: 'reach it' });

    const planner = vi.fn(async (_goal: string, _prior: WorkItem[]): Promise<NewWorkItem[]> => [
      { id: 'g-bd-1', missionId: 'g-bd', kind: 'task', spec: { description: 'planned step' } },
    ]);
    const accepter = vi.fn(async () => false);

    const goalDeps = buildGoalDeps({ planner, accepter });
    const outcome = await advanceGoalMission(store, 'g-bd', goalDeps);

    expect(outcome).toBe('authored');
    expect(planner).toHaveBeenCalledTimes(1);
    expect(planner).toHaveBeenCalledWith('reach it', []);
    expect(accepter).not.toHaveBeenCalled();

    const items = store.listItems('g-bd');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('g-bd-1');
    expect(items[0].status).toBe('pending');
    expect(items[0].missionId).toBe('g-bd');

    store.close();
  });

  it('adapts accepter→accept: when the planner is dry, the accepter decides completion', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-bd-acc', title: 'Accept', goal: 'reach' });

    const planner = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accepter = vi.fn(async () => true);

    const outcome = await advanceGoalMission(store, 'g-bd-acc', buildGoalDeps({ planner, accepter }));

    expect(outcome).toBe('accepted');
    expect(planner).toHaveBeenCalledTimes(1);
    expect(accepter).toHaveBeenCalledTimes(1);
    expect(accepter).toHaveBeenCalledWith('reach', []);
    expect(store.getMission('g-bd-acc')!.status).toBe('completed');

    store.close();
  });

  it('forwards maxRounds to the loop guard (planner not consulted past the cap)', async () => {
    const store = newStore();
    createGoalMission(store, { id: 'g-bd-max', title: 'Max', goal: 'g' });
    store.enqueueItem({ id: 'g-bd-max-1', missionId: 'g-bd-max', kind: 'task' });
    settleMissionItem(store, 'g-bd-max-1', 'done', { ok: true });

    const planner = vi.fn(async (): Promise<NewWorkItem[]> => [
      { id: 'never', missionId: 'g-bd-max', kind: 'task' },
    ]);
    const accepter = vi.fn(async () => false);

    const outcome = await advanceGoalMission(
      store,
      'g-bd-max',
      buildGoalDeps({ planner, accepter, maxRounds: 1 }),
    );

    expect(outcome).toBe('exhausted');
    expect(planner).not.toHaveBeenCalled();
    expect(store.getMission('g-bd-max')!.status).toBe('failed');

    store.close();
  });
});
