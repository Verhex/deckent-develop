import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationReceipt,
} from '../../../../src/core/invocation-receipt.js';
import { InvocationReceiptStore } from '../../../../src/core/invocation-receipt-store.js';
import {
  advanceGoalMission,
  createGoalMission,
} from '../../../../src/orchestra/autonomous/mission-store/goal-mission.js';
import {
  readGoalAcceptanceContract,
  verifyGoalAcceptanceInvocationReceipt,
  type GoalAcceptanceEvaluation,
} from '../../../../src/orchestra/autonomous/mission-store/mission-acceptance.js';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { settleMissionItem } from '../../../helpers/mission-store.js';

const roots: string[] = [];
function makeRoot(): string {
  const value = mkdtempSync(join(tmpdir(), 'goal-receipt-truth-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function receipt(
  store: InvocationReceiptStore,
  missionId: string,
  overrides: Partial<InvocationReceipt> = {},
): InvocationReceipt {
  const selection = { provider: 'claude', model: 'claude-fable-5', source: 'config' as const, reasonCode: 'none' as const };
  return {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: `inv-${missionId}`,
    idempotencyKey: `${missionId}:goal-acceptance:1`,
    tenantId: 'tenant-a',
    projectId: store.projectId,
    runId: missionId,
    taskId: null,
    callId: `${missionId}:accept:1`,
    role: 'auditor',
    purpose: 'goal-acceptance',
    configured: selection,
    requested: selection,
    resolved: { ...selection, source: 'router' },
    called: { ...selection, source: 'wire' },
    backend: { transport: 'cli', executionBackend: 'docker' },
    auth: { mode: 'subscription', accountRefHash: null },
    fallbackChain: [],
    reachability: { state: 'known', evidenceRef: 'provider-reachability:goal-acceptance' },
    limits: { state: 'known', evidenceRefs: ['provider-limit:goal-acceptance'] },
    createdAt: '2026-07-22T01:00:00.000Z',
    ...overrides,
  };
}

function settleAccepted(store: InvocationReceiptStore, input: InvocationReceipt): void {
  store.declare(input);
  store.append(input, input.invocationId, {
    eventId: `${input.invocationId}:start`, type: 'dispatch_started', payload: { attempt: 1 },
  });
  store.append(input, input.invocationId, {
    eventId: `${input.invocationId}:transport`, type: 'transport_settled',
    payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 12 },
  });
  store.append(input, input.invocationId, {
    eventId: `${input.invocationId}:consumer`, type: 'consumer_settled',
    payload: { outcome: 'accepted', reasonCode: 'none' },
  });
}

describe('Goal-v2 acceptance InvocationReceipt truth', () => {
  it('settles only after a restarted ledger verifies exact scope, provenance, and terminal outcomes', async () => {
    const root = makeRoot();
    const missionStore = new SqliteMissionStore(root);
    missionStore.migrate();
    createGoalMission(missionStore, {
      id: 'goal-live-receipt', title: 'Receipt truth', goal: 'ship',
      acceptance: 'tests pass', acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
      tenant: 'tenant-a',
    });
    missionStore.enqueueItem({ id: 'goal-live-test', missionId: 'goal-live-receipt', kind: 'task' });
    settleMissionItem(missionStore, 'goal-live-test', 'done', { ok: true, reason: 'tests passed' });

    let ledger = new InvocationReceiptStore(root, { idFactory: () => 'project-goal' });
    const input = receipt(ledger, 'goal-live-receipt');
    settleAccepted(ledger, input);
    ledger.close();
    ledger = new InvocationReceiptStore(root);

    const contract = readGoalAcceptanceContract(missionStore.getMission('goal-live-receipt')!)!;
    const evaluation: GoalAcceptanceEvaluation = {
      outcome: 'accepted',
      criteria: [{
        criterionId: contract.criteria[0]!.id,
        verdict: 'met',
        evidenceRefs: ['work-item:goal-live-test'],
        rationale: 'durable test result',
      }],
      evaluator: { role: 'auditor', instanceId: 'auditor-live-1' },
      invocationReceiptRef: {
        schemaVersion: 1, invocationId: input.invocationId,
        tenantId: input.tenantId, projectId: input.projectId,
      },
      decidedAt: '2026-07-22T01:01:00.000Z',
    };
    await expect(advanceGoalMission(missionStore, 'goal-live-receipt', {
      author: async () => [],
      accept: async () => evaluation,
      verifyAcceptanceReceipt: (mission, claim) =>
        verifyGoalAcceptanceInvocationReceipt(ledger, mission, claim),
    })).resolves.toBe('accepted');

    expect(missionStore.listAcceptanceDecisions('goal-live-receipt')[0]).toMatchObject({
      effectiveOutcome: 'accepted',
      decision: {
        evaluator: { role: 'auditor', instanceId: 'auditor-live-1' },
        invocationValidationErrors: [],
      },
    });
    ledger.close();
    missionStore.close();
  });

  it.each([
    ['missing receipt', (value: GoalAcceptanceEvaluation) => ({ ...value, invocationReceiptRef: { ...value.invocationReceiptRef!, invocationId: 'missing' } })],
    ['cross-tenant ref', (value: GoalAcceptanceEvaluation) => ({ ...value, invocationReceiptRef: { ...value.invocationReceiptRef!, tenantId: 'tenant-b' } })],
    ['wrong evaluator role', (value: GoalAcceptanceEvaluation) => ({ ...value, evaluator: { ...value.evaluator, role: 'brain' as const } })],
  ])('fails closed for %s', async (_label, mutate) => {
    const root = makeRoot();
    const missionStore = new SqliteMissionStore(root);
    missionStore.migrate();
    createGoalMission(missionStore, {
      id: 'goal-reject-ref', title: 'Reject ref', goal: 'ship',
      acceptance: 'tests pass', acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z', tenant: 'tenant-a',
    });
    missionStore.enqueueItem({ id: 'goal-reject-test', missionId: 'goal-reject-ref', kind: 'task' });
    settleMissionItem(missionStore, 'goal-reject-test', 'done', { ok: true });
    const ledger = new InvocationReceiptStore(root, { idFactory: () => 'project-goal' });
    const input = receipt(ledger, 'goal-reject-ref');
    settleAccepted(ledger, input);
    const contract = readGoalAcceptanceContract(missionStore.getMission('goal-reject-ref')!)!;
    const base: GoalAcceptanceEvaluation = {
      outcome: 'accepted',
      criteria: [{ criterionId: contract.criteria[0]!.id, verdict: 'met', evidenceRefs: ['work-item:goal-reject-test'], rationale: 'result' }],
      evaluator: { role: 'auditor', instanceId: 'auditor-1' },
      invocationReceiptRef: { schemaVersion: 1, invocationId: input.invocationId, tenantId: input.tenantId, projectId: input.projectId },
      decidedAt: '2026-07-22T01:01:00.000Z',
    };
    const outcome = await advanceGoalMission(missionStore, 'goal-reject-ref', {
      author: async () => [], accept: async () => mutate(base),
      verifyAcceptanceReceipt: (mission, claim) => verifyGoalAcceptanceInvocationReceipt(ledger, mission, claim),
    });
    expect(outcome).toBe('exhausted');
    expect(missionStore.listAcceptanceDecisions('goal-reject-ref')[0]!.effectiveOutcome).toBe('unknown');
    expect(missionStore.listAcceptanceDecisions('goal-reject-ref')[0]!.validationErrors)
      .toEqual(expect.arrayContaining([expect.stringContaining('invocation provenance:')]));
    ledger.close();
    missionStore.close();
  });

  it('rejects wrong purpose, unknown authority evidence, non-terminal transport, failed calls, and corrupt ledgers', () => {
    const root = makeRoot();
    const ledger = new InvocationReceiptStore(root, { idFactory: () => 'project-goal' });
    const mission = { id: 'goal-matrix', tenant: 'tenant-a' };
    const evaluationFor = (input: InvocationReceipt): GoalAcceptanceEvaluation => ({
      outcome: 'accepted', criteria: [],
      evaluator: { role: 'auditor', instanceId: 'auditor-matrix' },
      invocationReceiptRef: {
        schemaVersion: 1, invocationId: input.invocationId,
        tenantId: input.tenantId, projectId: input.projectId,
      },
      decidedAt: '2026-07-22T01:10:00.000Z',
    });

    const wrongPurpose = receipt(ledger, mission.id, {
      invocationId: 'inv-wrong-purpose', idempotencyKey: 'goal-matrix:wrong-purpose',
      purpose: 'audit-evaluation',
    });
    settleAccepted(ledger, wrongPurpose);
    expect(verifyGoalAcceptanceInvocationReceipt(ledger, mission, evaluationFor(wrongPurpose)).errors)
      .toContain('invocation receipt purpose mismatch');

    const unknownEvidence = receipt(ledger, mission.id, {
      invocationId: 'inv-unknown-evidence', idempotencyKey: 'goal-matrix:unknown-evidence',
      reachability: { state: 'unknown', evidenceRef: null },
      limits: { state: 'unknown', evidenceRefs: [] },
    });
    settleAccepted(ledger, unknownEvidence);
    expect(verifyGoalAcceptanceInvocationReceipt(ledger, mission, evaluationFor(unknownEvidence)).errors)
      .toEqual(expect.arrayContaining([
        'invocation receipt reachability is not known',
        'invocation receipt limits are not known',
      ]));

    const nonTerminal = receipt(ledger, mission.id, {
      invocationId: 'inv-non-terminal', idempotencyKey: 'goal-matrix:non-terminal',
    });
    ledger.declare(nonTerminal);
    ledger.append(nonTerminal, nonTerminal.invocationId, {
      eventId: 'inv-non-terminal:start', type: 'dispatch_started', payload: { attempt: 1 },
    });
    expect(verifyGoalAcceptanceInvocationReceipt(ledger, mission, evaluationFor(nonTerminal)).errors)
      .toEqual(expect.arrayContaining([
        'invocation receipt transport is not succeeded',
        'invocation receipt consumer is not accepted',
      ]));

    const failed = receipt(ledger, mission.id, {
      invocationId: 'inv-failed', idempotencyKey: 'goal-matrix:failed',
    });
    ledger.declare(failed);
    ledger.append(failed, failed.invocationId, {
      eventId: 'inv-failed:start', type: 'dispatch_started', payload: { attempt: 1 },
    });
    ledger.append(failed, failed.invocationId, {
      eventId: 'inv-failed:transport', type: 'transport_settled',
      payload: { outcome: 'failed', exitCode: 1, signal: null, reasonCode: 'nonzero_exit', durationMs: 8 },
    });
    ledger.append(failed, failed.invocationId, {
      eventId: 'inv-failed:consumer', type: 'consumer_settled',
      payload: { outcome: 'rejected', reasonCode: 'nonzero_exit' },
    });
    expect(verifyGoalAcceptanceInvocationReceipt(ledger, mission, evaluationFor(failed)).errors)
      .toEqual(expect.arrayContaining([
        'invocation receipt transport is not succeeded',
        'invocation receipt consumer is not accepted',
      ]));

    expect(verifyGoalAcceptanceInvocationReceipt({
      projectId: ledger.projectId,
      get: () => { throw new Error('tampered'); },
    }, mission, evaluationFor(failed))).toEqual({
      verified: false,
      errors: ['invocation receipt ledger integrity failure'],
    });
    ledger.close();
  });
});
