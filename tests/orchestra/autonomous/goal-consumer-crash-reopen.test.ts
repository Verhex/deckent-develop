import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { InvocationReceiptStore } from '../../../src/core/invocation-receipt-store.js';
import { deriveProviderQuotaScopeRefHash } from '../../../src/core/provider-limit-truth.js';
import { GoalInvocationRuntime } from '../../../src/orchestra/autonomous/mission-store/goal-invocation-runtime.js';
import { advanceGoalMission, createGoalMission } from '../../../src/orchestra/autonomous/mission-store/goal-mission.js';
import type {
  GoalInvocationConsumerCheckpointV1,
  GoalInvocationConsumerReceiptSettlementV1,
  NewWorkItem,
} from '../../../src/orchestra/autonomous/mission-store/mission-types.js';
import { SqliteMissionStore } from '../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { verifyGoalAcceptanceInvocationReceipt, type GoalAcceptanceContractV1 } from '../../../src/orchestra/autonomous/mission-store/mission-acceptance.js';
import { settleMissionItem } from '../../helpers/mission-store.js';

// SUPPORTIVE_TEST_FIXTURE: private SQLite only; no provider/auth/runtime authority.
const roots: string[] = [];
function root(): string { const value = mkdtempSync(join(tmpdir(), 'goal-consumer-crash-')); roots.push(value); return value; }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
/** SUPPORTIVE_TEST_FIXTURE: real receipt+artifact persistence; zero provider calls. */
function seedArtifact(ledger: InvocationReceiptStore, missionId: string, purpose: 'goal-authoring' | 'goal-acceptance', round = 1) {
  const invocationId = `goal-${hash(`tenant-a\0${missionId}\0${round}\0${purpose}`)}`;
  const receiptRef = `invocation-receipt:${hash(`tenant-a\0${ledger.projectId}\0${invocationId}`)}`;
  const identity = { tenantId: 'tenant-a', provider: 'claude', accountRefHash: 'a'.repeat(64), authMode: 'subscription' as const, backend: { transport: 'cli' as const, executionBackend: 'host-subprocess' as const, endpointRefHash: null } };
  const receipt = { schemaVersion: 1 as const, invocationId, idempotencyKey: invocationId, tenantId: 'tenant-a', projectId: ledger.projectId, runId: missionId, taskId: null, callId: `${purpose}:${round}`, role: purpose === 'goal-authoring' ? 'brain' as const : 'auditor' as const, purpose,
    configured: { provider: 'claude', model: 'claude-fable-5', source: 'config' as const, reasonCode: 'none' }, requested: { provider: 'claude', model: 'claude-fable-5', source: 'config' as const, reasonCode: 'none' }, resolved: { provider: 'claude', model: 'claude-fable-5', source: 'config' as const, reasonCode: 'none' }, called: { provider: 'claude', model: 'claude-fable-5', source: 'config' as const, reasonCode: 'none' }, backend: identity.backend, auth: { mode: identity.authMode, accountRefHash: identity.accountRefHash }, fallbackChain: [], reachability: { state: 'known' as const, evidenceRef: 'provider-reachability:test-output' }, limits: { state: 'known' as const, evidenceRefs: ['provider-limit:test-output'] }, createdAt: '2026-09-08T00:00:00.000Z' };
  const reservation = { ...identity, projectId: ledger.projectId, model: 'claude-fable-5', quotaScopeRefHash: deriveProviderQuotaScopeRefHash(identity), reservationId: `r-${invocationId}`, idempotencyKey: `r-${invocationId}`, runId: missionId, taskId: null, callId: receipt.callId, attemptId: 'fixture-attempt', fenceTokenHash: 'f'.repeat(64), receiptRef, reachabilityEvidenceRef: 'provider-reachability:test-output', estimates: [{ windowId: 'tokens', unit: 'tokens' as const, amount: 10 }], estimateEvidenceRefs: ['budget-estimate:test-output'], requestedAt: receipt.createdAt, leaseExpiresAt: '2026-09-08T01:00:00.000Z' };
  const usage = { eventId: `usage-${invocationId}`, type: 'consumed' as const, occurredAt: '2026-09-08T00:01:00.000Z', fenceTokenHash: reservation.fenceTokenHash, evidenceRef: 'provider-usage:test-output', actual: [{ windowId: 'tokens', unit: 'tokens' as const, amount: 1 }] };
  ledger.declare(receipt); ledger.append(receipt, invocationId, { eventId: `dispatch-${invocationId}`, type: 'dispatch_started', occurredAt: receipt.createdAt, payload: { attempt: round, calledProvider: 'claude', calledModel: 'claude-fable-5' } });
  const artifact = ledger.writeOutputArtifact({ ref: { schemaVersion: 1 as const, tenantId: 'tenant-a', projectId: ledger.projectId, invocationId, purpose, provider: 'claude', model: 'claude-fable-5', promptDigest: hash('fixture') }, bytes: Buffer.from('[]'), transportEvent: { eventId: `transport-${invocationId}`, type: 'transport_settled', occurredAt: usage.occurredAt, payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 1 } }, reservationRequest: reservation, usageEvent: usage });
  return { ref: { schemaVersion: 1 as const, tenantId: 'tenant-a', projectId: ledger.projectId, invocationId }, digest: artifact.contentSha256 };
}
function runtime(ledger: InvocationReceiptStore) { return new GoalInvocationRuntime({ receiptLedger: ledger, admissionRuntime: {} as never, executeSelected: async () => { throw new Error('PROVIDER_MUST_NOT_RUN'); } }); }
afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }); });

class AckFaultStore extends SqliteMissionStore {
  private failed = false;
  override acknowledgeGoalInvocationConsumer(checkpoint: GoalInvocationConsumerCheckpointV1, value: GoalInvocationConsumerReceiptSettlementV1): boolean {
    if (!this.failed) { this.failed = true; throw new Error('SUPPORTIVE_ACK_FAULT'); }
    return super.acknowledgeGoalInvocationConsumer(checkpoint, value);
  }
}
class DecisionFaultStore extends SqliteMissionStore {
  private failed = false;
  override recordAcceptanceDecision(...args: Parameters<SqliteMissionStore['recordAcceptanceDecision']>) {
    if (!this.failed) { this.failed = true; throw new Error('SUPPORTIVE_DECISION_FAULT'); }
    return super.recordAcceptanceDecision(...args);
  }
}

describe('goal consumer crash/reopen durable boundary', () => {
  it('reopens a successful empty authoring checkpoint without provider or author replay', async () => {
    const dir = root(); const ledger = new InvocationReceiptStore(dir, { idFactory: () => 'fixture-project' });
    const first = new SqliteMissionStore(dir); first.migrate(); createGoalMission(first, { id: 'empty-reopen', title: 'empty', goal: 'g', tenant: 'tenant-a' });
    const seeded = seedArtifact(ledger, 'empty-reopen', 'goal-authoring');
    const checkpoint = first.stageGoalInvocationConsumer({ schemaVersion: 1, tenantId: 'tenant-a', projectId: ledger.projectId, missionId: 'empty-reopen', round: 1, purpose: 'goal-authoring', invocationReceiptRef: seeded.ref, outputDigest: seeded.digest, effect: { kind: 'authored-batch', items: [] } });
    first.acknowledgeGoalInvocationConsumer(checkpoint, runtime(ledger).settlePersistedConsumer(checkpoint)); first.close(); ledger.close();
    const reopenedLedger = new InvocationReceiptStore(dir); const reopened = new SqliteMissionStore(dir); reopened.migrate(); const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    await expect(advanceGoalMission(reopened, 'empty-reopen', { author, accept: async () => false, reconcileInvocationConsumer: c => runtime(reopenedLedger).settlePersistedConsumer(c) })).resolves.toBe('exhausted');
    expect(author).not.toHaveBeenCalled(); expect(reopened.listItems('empty-reopen')).toEqual([]); reopened.close(); reopenedLedger.close();
  });

  it('keeps an effect checkpoint pending when the real receipt append proxy fails', () => {
    const dir = root(); const ledger = new InvocationReceiptStore(dir, { idFactory: () => 'fixture-project' }); const store = new SqliteMissionStore(dir); store.migrate(); createGoalMission(store, { id: 'append-fault', title: 'append', goal: 'g', tenant: 'tenant-a' });
    const seeded = seedArtifact(ledger, 'append-fault', 'goal-authoring'); const checkpoint = store.stageGoalInvocationConsumer({ schemaVersion: 1, tenantId: 'tenant-a', projectId: ledger.projectId, missionId: 'append-fault', round: 1, purpose: 'goal-authoring', invocationReceiptRef: seeded.ref, outputDigest: seeded.digest, effect: { kind: 'authored-batch', items: [{ id: 'append-once', missionId: 'append-fault', kind: 'task' }] } });
    const failing = new Proxy(ledger, { get(target, key, receiver) { if (key === 'append') return () => { throw new Error('SUPPORTIVE_RECEIPT_APPEND_FAULT'); }; return Reflect.get(target, key, receiver); } });
    expect(() => runtime(failing as unknown as InvocationReceiptStore).settlePersistedConsumer(checkpoint)).toThrow('SUPPORTIVE_RECEIPT_APPEND_FAULT');
    expect(store.listPendingGoalInvocationConsumers('append-fault')).toHaveLength(1); expect(store.listItems('append-fault').map(item => item.id)).toEqual(['append-once']); store.close(); ledger.close();
  });

  it('reopens an acknowledged real acceptance receipt into one stable canonical decision', async () => {
    const dir = root(); const ledger = new InvocationReceiptStore(dir, { idFactory: () => 'fixture-project' }); const first = new SqliteMissionStore(dir); first.migrate();
    const mission = createGoalMission(first, { id: 'accept-reopen', title: 'accept', goal: 'g', tenant: 'tenant-a', acceptance: 'done', acceptanceAuthoredAt: '2026-09-08T00:00:00.000Z' });
    const contract = mission.spec?.['acceptanceContract'] as GoalAcceptanceContractV1; first.enqueueItem({ id: 'accept-evidence', missionId: mission.id, kind: 'task' }); settleMissionItem(first, 'accept-evidence', 'done', { ok: true }); const author = seedArtifact(ledger, mission.id, 'goal-authoring', 2); const acceptance = seedArtifact(ledger, mission.id, 'goal-acceptance', 2);
    const authorCheckpoint = first.stageGoalInvocationConsumer({ schemaVersion: 1, tenantId: 'tenant-a', projectId: ledger.projectId, missionId: mission.id, round: 2, purpose: 'goal-authoring', invocationReceiptRef: author.ref, outputDigest: author.digest, effect: { kind: 'authored-batch', items: [] } }); first.acknowledgeGoalInvocationConsumer(authorCheckpoint, runtime(ledger).settlePersistedConsumer(authorCheckpoint));
    const evaluation = { outcome: 'accepted' as const, criteria: contract.criteria.map(criterion => ({ criterionId: criterion.id, verdict: 'met' as const, evidenceRefs: ['work-item:accept-evidence'], rationale: 'fixture durable settled work item' })), evaluator: { role: 'auditor' as const, instanceId: 'fixture' }, invocationReceiptRef: acceptance.ref, decidedAt: '2026-09-08T00:02:00.000Z' };
    const acceptanceCheckpoint = first.stageGoalInvocationConsumer({ schemaVersion: 1, tenantId: 'tenant-a', projectId: ledger.projectId, missionId: mission.id, round: 2, purpose: 'goal-acceptance', invocationReceiptRef: acceptance.ref, outputDigest: acceptance.digest, effect: { kind: 'acceptance-evaluation', evaluation } }); first.acknowledgeGoalInvocationConsumer(acceptanceCheckpoint, runtime(ledger).settlePersistedConsumer(acceptanceCheckpoint)); first.close(); ledger.close();
    const reopenedLedger = new InvocationReceiptStore(dir); const reopened = new SqliteMissionStore(dir); reopened.migrate(); const accept = vi.fn();
    await expect(advanceGoalMission(reopened, mission.id, { author: vi.fn(), accept, reconcileInvocationConsumer: c => runtime(reopenedLedger).settlePersistedConsumer(c), verifyAcceptanceReceipt: (m, value) => verifyGoalAcceptanceInvocationReceipt(reopenedLedger, m, value) })).resolves.toBe('accepted');
    expect(accept).not.toHaveBeenCalled(); expect(reopened.listAcceptanceDecisions(mission.id)).toMatchObject([{ decision: { decidedAt: evaluation.decidedAt, invocationReceiptRef: acceptance.ref }, effectiveOutcome: 'accepted' }]); expect(reopened.listAcceptanceDecisions(mission.id)).toHaveLength(1); reopened.close(); reopenedLedger.close();
  });
  it('reopens an actual artifact-bound accepted receipt after effect commit without duplicate effect', async () => {
    const dir = root(); const ledger = new InvocationReceiptStore(dir, { idFactory: () => 'fixture-project' });
    const first = new AckFaultStore(dir); first.migrate(); createGoalMission(first, { id: 'actual-reopen', title: 'actual', goal: 'g', tenant: 'tenant-a' });
    const seeded = seedArtifact(ledger, 'actual-reopen', 'goal-authoring');
    const checkpoint = first.stageGoalInvocationConsumer({ schemaVersion: 1, tenantId: 'tenant-a', projectId: ledger.projectId, missionId: 'actual-reopen', round: 1, purpose: 'goal-authoring', invocationReceiptRef: seeded.ref, outputDigest: seeded.digest, effect: { kind: 'authored-batch', items: [{ id: 'actual-once', missionId: 'actual-reopen', kind: 'task' }] } });
    const accepted = runtime(ledger).settlePersistedConsumer(checkpoint);
    expect(() => first.acknowledgeGoalInvocationConsumer(checkpoint, accepted)).toThrow('SUPPORTIVE_ACK_FAULT');
    expect(ledger.get(seeded.ref, seeded.ref.invocationId)?.consumerOutcome).toBe('accepted'); expect(first.listItems('actual-reopen')).toHaveLength(1);
    first.close(); ledger.close();
    const reopenedLedger = new InvocationReceiptStore(dir); const reopened = new SqliteMissionStore(dir); reopened.migrate();
    const author = vi.fn(async (): Promise<NewWorkItem[]> => []);
    await expect(advanceGoalMission(reopened, 'actual-reopen', { author, accept: async () => false, reconcileInvocationConsumer: checkpoint => runtime(reopenedLedger).settlePersistedConsumer(checkpoint) })).resolves.toBe('waiting');
    expect(author).not.toHaveBeenCalled(); expect(reopened.listItems('actual-reopen').map(item => item.id)).toEqual(['actual-once']); expect(reopened.listPendingGoalInvocationConsumers('actual-reopen')).toEqual([]);
    reopened.close(); reopenedLedger.close();
  });
  it('rejects a sibling/effect-digest checkpoint conflict before any effect or acknowledgement', () => {
    const dir = root(); const ledger = new InvocationReceiptStore(dir, { idFactory: () => 'fixture-project' }); const store = new SqliteMissionStore(dir); store.migrate();
    createGoalMission(store, { id: 'goal-a', title: 'a', goal: 'a', tenant: 'tenant-a' });
    createGoalMission(store, { id: 'goal-b', title: 'b', goal: 'b', tenant: 'tenant-b' });
    const seeded = seedArtifact(ledger, 'goal-a', 'goal-authoring');
    const checkpoint = store.stageGoalInvocationConsumer({ schemaVersion: 1, tenantId: 'tenant-a', projectId: ledger.projectId, missionId: 'goal-a', round: 1, purpose: 'goal-authoring', invocationReceiptRef: seeded.ref, outputDigest: seeded.digest, effect: { kind: 'authored-batch', items: [] } });
    expect(() => store.stageGoalInvocationConsumer({ ...checkpoint, outputDigest: 'c'.repeat(64), effect: { kind: 'authored-batch', items: [] } })).toThrow('MISSION_GOAL_CONSUMER_CHECKPOINT_CONFLICT');
    expect(() => runtime(ledger).settlePersistedConsumer({ ...checkpoint, outputDigest: 'c'.repeat(64) })).toThrow('GOAL_INVOCATION_CHECKPOINT_RECEIPT_MISMATCH');
    expect(store.listItems('goal-a')).toEqual([]); expect(store.listPendingGoalInvocationConsumers('goal-a')).toHaveLength(1); store.close(); ledger.close();
  });
});
