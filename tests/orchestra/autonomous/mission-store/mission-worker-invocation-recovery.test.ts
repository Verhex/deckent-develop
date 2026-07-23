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
  deriveMissionWorkerInvocationIdentity,
} from '../../../../src/orchestra/autonomous/mission-store/mission-worker-invocation-coordinator.js';
import {
  MissionWorkerInvocationRecoveryReconciler,
} from '../../../../src/orchestra/autonomous/mission-store/mission-worker-invocation-recovery.js';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import type {
  MissionDispatchClaim,
  MissionEngineLease,
  MissionRecoveredDispatchAttemptV1,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

const roots: string[] = [];
const missionStores: SqliteMissionStore[] = [];
const receiptStores: InvocationReceiptStore[] = [];

afterEach(() => {
  for (const store of missionStores.splice(0)) {
    try { store.close(); } catch { /* already closed */ }
  }
  for (const store of receiptStores.splice(0)) {
    try { store.close(); } catch { /* already closed */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(): {
  root: string;
  missionStore: SqliteMissionStore;
  receiptStore: InvocationReceiptStore;
  claim: MissionDispatchClaim;
  takeover: MissionEngineLease;
  recovery: MissionRecoveredDispatchAttemptV1;
} {
  const root = mkdtempSync(join(tmpdir(), 'mission-worker-recovery-'));
  roots.push(root);
  const missionStore = new SqliteMissionStore(root);
  missionStores.push(missionStore);
  missionStore.migrate();
  missionStore.createMission({
    id: 'mission-1',
    kind: 'list',
    tenant: 'tenant-1',
    title: 'Recovery',
    renderAs: 'checklist',
  });
  missionStore.enqueueItem({
    id: 'task-1',
    missionId: 'mission-1',
    kind: 'task',
    spec: { description: 'uncertain provider effect' },
  });
  const original = missionStore.acquireEngineLease('engine-original', 30_000)!;
  const claim = missionStore.claimItemWithAuthority(
    'task-1',
    'scheduler-original',
    undefined,
    original,
  )!;
  missionStore.__rawExec('UPDATE mission_engine_lease SET expires_at_ms=0');
  const takeover = missionStore.acquireEngineLease('engine-takeover', 30_000)!;
  const [recovery] = missionStore.recover(takeover);
  expect(recovery).toBeDefined();

  const receiptStore = new InvocationReceiptStore(root, { idFactory: () => 'project-1' });
  receiptStores.push(receiptStore);
  return { root, missionStore, receiptStore, claim, takeover, recovery: recovery! };
}

function declareWorkerReceipt(
  receiptStore: InvocationReceiptStore,
  claim: MissionDispatchClaim,
  overrides: Partial<InvocationReceipt> = {},
): InvocationReceipt {
  const { fenceToken: _secret, ...binding } = claim;
  const identity = deriveMissionWorkerInvocationIdentity('tenant-1', receiptStore.projectId, binding);
  const selection = {
    provider: 'claude',
    model: 'claude-fable-5',
    source: 'wire' as const,
    reasonCode: 'none' as const,
  };
  const receipt: InvocationReceipt = {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: identity.invocationId,
    idempotencyKey: identity.idempotencyKey,
    tenantId: 'tenant-1',
    projectId: receiptStore.projectId,
    runId: claim.missionId,
    taskId: claim.workItemId,
    callId: identity.callId,
    role: 'worker',
    purpose: 'worker-execution',
    configured: selection,
    requested: selection,
    resolved: selection,
    called: selection,
    backend: { transport: 'cli', executionBackend: 'docker' },
    auth: { mode: 'subscription', accountRefHash: null },
    fallbackChain: [],
    reachability: { state: 'known', evidenceRef: 'reachability:test' },
    limits: { state: 'known', evidenceRefs: ['limit:test'] },
    createdAt: claim.claimedAt,
    ...overrides,
  };
  receiptStore.declare(receipt);
  return receipt;
}

describe('MissionWorkerInvocationRecoveryReconciler', () => {
  it('closes only the exact open worker receipt and durably acknowledges it', () => {
    const { missionStore, receiptStore, claim, takeover, recovery } = setup();
    const receipt = declareWorkerReceipt(receiptStore, claim);
    receiptStore.append(receipt, receipt.invocationId, {
      eventId: 'dispatch-started',
      type: 'dispatch_started',
      occurredAt: claim.claimedAt,
      payload: { attempt: 1 },
    });

    const summary = new MissionWorkerInvocationRecoveryReconciler(receiptStore)
      .reconcile(missionStore, [recovery], takeover);

    expect(summary).toEqual({ inspected: 1, reconciled: 1, alreadyTerminal: 0, pending: 0 });
    expect(receiptStore.get(receipt, receipt.invocationId)).toMatchObject({
      transportOutcome: 'unknown',
      events: [
        { type: 'dispatch_started' },
        {
          type: 'transport_settled',
          payload: { reasonCode: 'coordinator_restart_orphan' },
        },
      ],
    });
    expect(missionStore.listPendingDispatchRecoveries()).toEqual([]);
    const acknowledgement = JSON.parse(missionStore.__rawGet(
      'SELECT payload_json FROM mission_dispatch_recovery_acknowledgements',
    ).payload_json);
    expect(missionStore.acknowledgeDispatchRecovery(acknowledgement, takeover)).toBe(false);
    expect(() => missionStore.acknowledgeDispatchRecovery({
      ...acknowledgement,
      receiptEventId: 'conflicting-terminal',
    }, takeover)).toThrow(/ACK_CONFLICT/u);
    expect(() => missionStore.__rawExec(
      "UPDATE mission_dispatch_recoveries SET attempt_id='tampered'",
    )).toThrow(/immutable/u);
    expect(() => missionStore.__rawExec(
      "DELETE FROM mission_dispatch_recovery_acknowledgements",
    )).toThrow(/immutable/u);
    expect(JSON.stringify(recovery)).not.toContain(claim.fenceToken);
  });

  it('keeps missing or identity-mismatched receipts pending without inventing terminal truth', () => {
    const missing = setup();
    const reconciler = new MissionWorkerInvocationRecoveryReconciler(missing.receiptStore);
    expect(reconciler.reconcile(
      missing.missionStore,
      [missing.recovery],
      missing.takeover,
    )).toMatchObject({ pending: 1, reconciled: 0 });
    expect(missing.missionStore.listPendingDispatchRecoveries()).toHaveLength(1);

    const mismatch = setup();
    const receipt = declareWorkerReceipt(mismatch.receiptStore, mismatch.claim, {
      runId: 'foreign-mission',
    });
    mismatch.receiptStore.append(receipt, receipt.invocationId, {
      eventId: 'mismatch-dispatch',
      type: 'dispatch_started',
      occurredAt: mismatch.claim.claimedAt,
      payload: { attempt: 1 },
    });
    expect(new MissionWorkerInvocationRecoveryReconciler(mismatch.receiptStore).reconcile(
      mismatch.missionStore,
      [mismatch.recovery],
      mismatch.takeover,
    )).toMatchObject({ pending: 1, reconciled: 0 });
    expect(mismatch.receiptStore.get(receipt, receipt.invocationId)?.events).toHaveLength(1);
  });

  it('acknowledges an exact pre-existing terminal receipt without appending a duplicate', () => {
    const { missionStore, receiptStore, claim, takeover, recovery } = setup();
    const receipt = declareWorkerReceipt(receiptStore, claim);
    receiptStore.append(receipt, receipt.invocationId, {
      eventId: 'terminal-dispatch',
      type: 'dispatch_started',
      occurredAt: claim.claimedAt,
      payload: { attempt: 1 },
    });
    receiptStore.append(receipt, receipt.invocationId, {
      eventId: 'terminal-settlement',
      type: 'transport_settled',
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
    });

    expect(new MissionWorkerInvocationRecoveryReconciler(receiptStore).reconcile(
      missionStore,
      [recovery],
      takeover,
    )).toEqual({ inspected: 1, reconciled: 0, alreadyTerminal: 1, pending: 0 });
    expect(receiptStore.get(receipt, receipt.invocationId)?.events).toHaveLength(2);
    expect(missionStore.listPendingDispatchRecoveries()).toEqual([]);
  });

  it('resumes the capture-to-receipt saga after both durable stores restart', () => {
    const initial = setup();
    const receipt = declareWorkerReceipt(initial.receiptStore, initial.claim);
    initial.receiptStore.append(receipt, receipt.invocationId, {
      eventId: 'restart-dispatch',
      type: 'dispatch_started',
      occurredAt: initial.claim.claimedAt,
      payload: { attempt: 1 },
    });
    initial.missionStore.close();
    initial.receiptStore.close();

    const missionStore = new SqliteMissionStore(initial.root);
    missionStores.push(missionStore);
    missionStore.migrate();
    const receiptStore = new InvocationReceiptStore(initial.root);
    receiptStores.push(receiptStore);
    const pending = missionStore.listPendingDispatchRecoveries();
    expect(pending).toEqual([initial.recovery]);

    expect(new MissionWorkerInvocationRecoveryReconciler(receiptStore).reconcile(
      missionStore,
      pending,
      initial.takeover,
    )).toMatchObject({ reconciled: 1, pending: 0 });
    expect(missionStore.listPendingDispatchRecoveries()).toEqual([]);
    expect(receiptStore.get(receipt, receipt.invocationId)?.transportOutcome).toBe('unknown');
  });
});
