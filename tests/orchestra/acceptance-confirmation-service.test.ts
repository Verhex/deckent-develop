import { describe, expect, it, vi } from 'vitest';
import {
  acceptanceConfirmationDigest, deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage, type AcceptanceConfirmationReceipt,
} from '../../src/core/acceptance-confirmation-contract.js';
import {
  createAndRouteAcceptanceConfirmation, reconcileAcceptanceConfirmation, settleAcceptanceConfirmation,
  type AcceptanceConfirmationPort, type AcceptanceDebtPort, type AcceptanceReconciliationPort,
  type AcceptanceRouteRecord, type VerifiedAcceptanceDecision,
} from '../../src/orchestra/acceptance-confirmation-service.js';

const hash = (value: string) => acceptanceConfirmationDigest(value);
const lineage: AcceptanceConfirmationLineage = {
  tenantId: 'tenant-a', projectId: 'project-a', attemptId: 'attempt-a', generation: 1,
  sprintId: 'sprint-616', taskId: '616-005', evaluationDigest: hash('evaluation'),
  resultDigest: hash('result'), policyDigest: hash('policy'), sourceDigest: hash('source'),
};
const route: AcceptanceRouteRecord = {
  confirmationId: deriveAcceptanceConfirmationId(lineage), lineage, sourceVerdict: 'UNDECIDABLE',
};
const decision: VerifiedAcceptanceDecision = {
  confirmationId: route.confirmationId, lineage, verdict: 'CONFIRMED',
  decidedAt: '2026-08-22T10:01:00.000Z', authorityReceipt: 'signed:owner',
};

function harness() {
  let confirmation: AcceptanceRouteRecord | undefined;
  let debt: AcceptanceRouteRecord | undefined;
  let verified: VerifiedAcceptanceDecision | undefined = decision;
  let debtApplied = false;
  const receipts = new Map<string, AcceptanceConfirmationReceipt>();
  const mutations: string[] = [];
  const confirmations: AcceptanceConfirmationPort = {
    createFirstWriterWins: vi.fn(async record => {
      if (!confirmation) { confirmation = structuredClone(record); mutations.push('confirmation'); return { state: 'created', record: confirmation }; }
      return JSON.stringify(confirmation) === JSON.stringify(record)
        ? { state: 'replayed', record: confirmation } : { state: 'conflict' };
    }),
    readFresh: vi.fn(async () => confirmation
      ? { route: structuredClone(confirmation), ...(verified ? { decision: structuredClone(verified) } : {}) }
      : undefined),
  };
  const debts: AcceptanceDebtPort = {
    createFirstWriterWins: vi.fn(async record => {
      if (!debt) { debt = structuredClone(record); mutations.push('debt-create'); return { state: 'created', record: debt }; }
      return JSON.stringify(debt) === JSON.stringify(record)
        ? { state: 'replayed', record: debt } : { state: 'conflict' };
    }),
    transitionExact: vi.fn(async input => {
      mutations.push('debt-transition');
      expect(input.preparedReceipt.state).toBe('PREPARED');
      expect(input.settlement.receiptDisposition).toBe('APPLIED');
      expect(input.settlement.reasonCode).toBe('CONFIRMATION_APPLIED');
      if (!debt || input.route.lineage.attemptId !== debt.lineage.attemptId) return 'lineage-mismatch';
      if (debtApplied) return 'already-applied';
      debtApplied = true; return 'applied';
    }),
  };
  const receiptPort: AcceptanceReconciliationPort = {
    appendFirstWriterWins: vi.fn(async receipt => {
      const key = `${route.confirmationId}:${receipt.state}`;
      const current = receipts.get(key);
      if (!current) {
        const stored = structuredClone(receipt); receipts.set(key, stored); mutations.push(receipt.state);
        return { state: 'created', receipt: stored };
      }
      return { state: 'replayed', receipt: current };
    }),
    read: vi.fn(async (confirmationId, state) => receipts.get(`${confirmationId}:${state}`)),
  };
  return {
    deps: { confirmations, debts, receipts: receiptPort, verifyAuthority: vi.fn(() => true) },
    mutations, receipts, setVerified(value: VerifiedAcceptanceDecision | undefined) { verified = value; },
  };
}

describe('canonical acceptance confirmation service', () => {
  it('writes confirmation before provisional debt and remains typed HOLD', async () => {
    const h = harness();
    await expect(createAndRouteAcceptanceConfirmation(h.deps, route)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
    });
    expect(h.mutations).toEqual(['confirmation', 'debt-create']);
    await createAndRouteAcceptanceConfirmation(h.deps, route);
    expect(h.mutations).toEqual(['confirmation', 'debt-create']);
  });
  it('recovers partial create from the durable confirmation', async () => {
    const h = harness();
    vi.mocked(h.deps.debts.createFirstWriterWins).mockRejectedValueOnce(new Error('crash'));
    await expect(createAndRouteAcceptanceConfirmation(h.deps, route)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'ROUTE_DEBT_WRITE_PENDING',
    });
    expect(h.mutations).toEqual(['confirmation']);
    await createAndRouteAcceptanceConfirmation(h.deps, route);
    expect(h.mutations).toEqual(['confirmation', 'debt-create']);
  });
  it('fresh-reads and orders canonical PREPARED, debt CAS, canonical APPLIED', async () => {
    const h = harness(); await createAndRouteAcceptanceConfirmation(h.deps, route); h.mutations.length = 0;
    await expect(settleAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'DONE', replayed: false, receipt: { state: 'APPLIED' },
    });
    expect(h.deps.confirmations.readFresh).toHaveBeenCalledWith(route.confirmationId);
    expect(h.deps.verifyAuthority).toHaveBeenCalledWith(decision);
    expect(h.mutations).toEqual(['PREPARED', 'debt-transition', 'APPLIED']);
  });
  it('returns typed HOLD/DENIED without CAS when terminal authority is absent or invalid', async () => {
    const h = harness(); await createAndRouteAcceptanceConfirmation(h.deps, route); h.mutations.length = 0;
    h.setVerified(undefined);
    await expect(settleAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
    });
    h.setVerified(decision); vi.mocked(h.deps.verifyAuthority).mockReturnValue(false);
    await expect(settleAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
    });
    expect(h.mutations).toEqual([]);
  });
  it('replays a crash after PREPARED and never reports DONE before APPLIED', async () => {
    const h = harness(); await createAndRouteAcceptanceConfirmation(h.deps, route);
    vi.mocked(h.deps.debts.transitionExact).mockRejectedValueOnce(new Error('process died'));
    await expect(settleAcceptanceConfirmation(h.deps, route.confirmationId)).rejects.toThrow('process died');
    expect(h.receipts.get(`${route.confirmationId}:PREPARED`)?.state).toBe('PREPARED');
    expect(h.receipts.has(`${route.confirmationId}:APPLIED`)).toBe(false);
    await expect(reconcileAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'DONE', replayed: false, receipt: { state: 'APPLIED' },
    });
    await expect(reconcileAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'DONE', replayed: true, receipt: { state: 'APPLIED' },
    });
    expect(h.deps.confirmations.readFresh).toHaveBeenCalledTimes(3);
    expect(h.deps.verifyAuthority).toHaveBeenCalledTimes(3);
  });
  it('does not trust a persisted APPLIED receipt after fresh terminal authority disappears', async () => {
    const h = harness(); await createAndRouteAcceptanceConfirmation(h.deps, route);
    await settleAcceptanceConfirmation(h.deps, route.confirmationId);
    h.setVerified(undefined);
    await expect(reconcileAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'VERIFIED_DECISION_UNAVAILABLE',
    });
    h.setVerified(decision); vi.mocked(h.deps.verifyAuthority).mockReturnValue(false);
    await expect(reconcileAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
    });
  });
  it('rejects changed fresh terminal bytes against canonical PREPARED FWW', async () => {
    const h = harness(); await createAndRouteAcceptanceConfirmation(h.deps, route);
    vi.mocked(h.deps.debts.transitionExact).mockRejectedValueOnce(new Error('crash'));
    await expect(settleAcceptanceConfirmation(h.deps, route.confirmationId)).rejects.toThrow();
    h.setVerified({ ...decision, verdict: 'FAILED' });
    await expect(reconcileAcceptanceConfirmation(h.deps, route.confirmationId)).resolves.toMatchObject({
      state: 'HOLD', reasonCode: 'PREPARED_RECEIPT_CONFLICT',
    });
  });
});
