import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acceptanceConfirmationDigest,
  deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage,
  type AcceptanceConfirmationReceipt,
} from '../../src/core/acceptance-confirmation-contract.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import type { FederatedPendingItem } from '../../src/core/approval-inbox-federation.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import {
  mirrorFederatedItemToBroker,
  reconcileFederatedAcceptanceDecision,
} from '../../src/orchestra/approval-decision-federation.js';
import type {
  AcceptanceConfirmationPort,
  AcceptanceDebtPort,
  AcceptanceReconciliationPort,
  AcceptanceRouteRecord,
  VerifiedAcceptanceDecision,
} from '../../src/orchestra/acceptance-confirmation-service.js';

const hash = (value: string) => acceptanceConfirmationDigest(value);
const lineage: AcceptanceConfirmationLineage = {
  tenantId: 'tenant-a', projectId: 'project-a', attemptId: 'attempt-a', generation: 3,
  sprintId: 'sprint-617', taskId: '617-004', evaluationDigest: hash('evaluation'),
  resultDigest: hash('result'), policyDigest: hash('policy'), sourceDigest: hash('source'),
};
const route: AcceptanceRouteRecord = {
  confirmationId: deriveAcceptanceConfirmationId(lineage), lineage, sourceVerdict: 'UNDECIDABLE',
};
const item: FederatedPendingItem = {
  origin: 'confirmation', id: route.confirmationId, summary: 'acceptance confirmation',
  decideHintKey: 'approvals.federated.hint_confirmation', requestedAt: '2026-08-22T10:00:00.000Z',
  expiresAt: '2026-08-22T12:00:00.000Z', tenantId: lineage.tenantId,
  lifecycleGeneration: String(lineage.generation), policySnapshotDigest: lineage.policyDigest,
  sourceRequestDigest: lineage.sourceDigest, sourceContractVersion: '1.0',
  sourceSchema: 'acceptance-confirmation', sourceReference: 'acceptance:617-004:attempt-a',
};

function broker(): ApprovalBroker {
  const root = mkdtempSync(join(tmpdir(), 'federated-acceptance-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return new ApprovalBroker(root, {
    lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
    clock: () => new Date(item.requestedAt!),
  });
}

function decision(verdict: VerifiedAcceptanceDecision['verdict'] = 'CONFIRMED'): VerifiedAcceptanceDecision {
  return {
    confirmationId: route.confirmationId, lineage, verdict,
    decidedAt: '2026-08-22T10:30:00.000Z', authorityReceipt: 'human:signed',
  };
}

function harness(initialDecision: VerifiedAcceptanceDecision | undefined = decision()) {
  let terminal = initialDecision;
  let applied = false;
  let crashOnce = false;
  const mutations: string[] = [];
  const receipts = new Map<string, AcceptanceConfirmationReceipt>();
  const confirmations: AcceptanceConfirmationPort = {
    createFirstWriterWins: vi.fn(),
    readFresh: vi.fn(async () => ({ route, ...(terminal ? { decision: structuredClone(terminal) } : {}) })),
  };
  const debts: AcceptanceDebtPort = {
    createFirstWriterWins: vi.fn(),
    transitionExact: vi.fn(async input => {
      mutations.push('debt CAS');
      expect(input.route).toEqual(route);
      expect(input.preparedReceipt.state).toBe('PREPARED');
      if (crashOnce) { crashOnce = false; throw new Error('crash after PREPARED'); }
      if (applied) return 'already-applied';
      applied = true;
      return 'applied';
    }),
  };
  const receiptPort: AcceptanceReconciliationPort = {
    appendFirstWriterWins: vi.fn(async receipt => {
      const key = `${receipt.confirmationId}:${receipt.state}`;
      const existing = receipts.get(key);
      if (existing) return { state: 'replayed', receipt: existing };
      const stored = structuredClone(receipt);
      receipts.set(key, stored);
      mutations.push(receipt.state);
      return { state: 'created', receipt: stored };
    }),
    read: vi.fn(async (id, state) => receipts.get(`${id}:${state}`)),
  };
  return {
    deps: { confirmations, debts, receipts: receiptPort, verifyAuthority: vi.fn(() => true) },
    mutations, receipts,
    crashNext() { crashOnce = true; },
    setDecision(value: VerifiedAcceptanceDecision | undefined) { terminal = value; },
  };
}

describe('federated acceptance origin settlement', () => {
  it('preserves mirror lineage and settles only through PREPARED -> debt CAS -> APPLIED', async () => {
    const approvalBroker = broker();
    const mirror = await mirrorFederatedItemToBroker(approvalBroker, item, { tenantId: lineage.tenantId });
    expect(mirror).toMatchObject({
      source: { reference: item.sourceReference, requestDigest: lineage.sourceDigest },
      details: {
        sourceLifecycleGeneration: String(lineage.generation),
        sourcePolicySnapshotDigest: lineage.policyDigest,
        sourceRequestDigest: lineage.sourceDigest,
        sourceReference: item.sourceReference,
        sourceProjectionPredecessor: expect.any(String),
      },
    });
    const h = harness();
    await expect(reconcileFederatedAcceptanceDecision(h.deps, mirror, item)).resolves.toMatchObject({
      state: 'DONE', replayed: false,
      receipt: { state: 'APPLIED', preparedReceiptDigest: expect.any(String) },
    });
    expect(h.mutations).toEqual(['PREPARED', 'debt CAS', 'APPLIED']);
    const prepared = h.receipts.get(`${route.confirmationId}:PREPARED`)!;
    const appliedReceipt = h.receipts.get(`${route.confirmationId}:APPLIED`)!;
    expect(appliedReceipt.preparedReceiptDigest).toBe(prepared.receiptDigest);
  });

  it('returns canonical non-null HOLD references for lineage mismatch and expiry', async () => {
    const approvalBroker = broker();
    const mirror = await mirrorFederatedItemToBroker(approvalBroker, item, { tenantId: lineage.tenantId });
    await expect(reconcileFederatedAcceptanceDecision(harness().deps, mirror, {
      ...item, sourceReference: 'acceptance:617-004:successor',
    })).resolves.toEqual({
      state: 'HOLD', reasonCode: 'CONFIRMATION_LINEAGE_MISMATCH',
      receiptRef: `${route.confirmationId}:prepared`,
    });

    const expired = harness();
    expired.setDecision(undefined);
    await expect(reconcileFederatedAcceptanceDecision(expired.deps, mirror, item)).resolves.toEqual({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
      receiptRef: `${route.confirmationId}:prepared`,
    });
    expect(expired.mutations).toEqual([]);
  });

  it('retries after PREPARED and gives a changed late decision no effect', async () => {
    const approvalBroker = broker();
    const mirror = await mirrorFederatedItemToBroker(approvalBroker, item, { tenantId: lineage.tenantId });
    const h = harness();
    h.crashNext();
    await expect(reconcileFederatedAcceptanceDecision(h.deps, mirror, item))
      .rejects.toThrow('crash after PREPARED');
    const prepared = h.receipts.get(`${route.confirmationId}:PREPARED`)!;
    h.setDecision(decision('FAILED'));
    await expect(reconcileFederatedAcceptanceDecision(h.deps, mirror, item)).resolves.toEqual({
      state: 'HOLD', reasonCode: 'PREPARED_RECEIPT_CONFLICT',
      receiptRef: `${route.confirmationId}:prepared`,
    });
    expect(h.receipts.get(`${route.confirmationId}:PREPARED`)).toEqual(prepared);
    expect(h.receipts.has(`${route.confirmationId}:APPLIED`)).toBe(false);
    expect(h.mutations).toEqual(['PREPARED', 'debt CAS']);
  });
});
