import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcceptanceSettlement } from '../../src/core/acceptance-settlement.js';
import {
  deriveAcceptanceConfirmationId,
  type AcceptanceConfirmationLineage,
} from '../../src/core/acceptance-confirmation-contract.js';

const debtTransactions = vi.hoisted(() => ({ create: vi.fn(), transition: vi.fn() }));
vi.mock('../../src/core/debt-store.js', () => ({
  createAcceptanceRouteDebt: debtTransactions.create,
  transitionAcceptanceRouteDebt: debtTransactions.transition,
}));

import {
  recordAcceptanceRouteDebt,
  transitionAcceptanceRouteDebt,
  type RecordAcceptanceRouteDebtInput,
} from '../../src/orchestra/debt-manager.js';

const sha = (digit: string): string => digit.repeat(64);
const lineage: AcceptanceConfirmationLineage = {
  tenantId: 'tenant-a', projectId: 'project-a', sprintId: 'sprint-614', taskId: 'task-614-001',
  attemptId: 'attempt-a', generation: 2, resultDigest: sha('1'), evaluationDigest: sha('2'),
  policyDigest: sha('3'), sourceDigest: sha('4'),
};
const route: RecordAcceptanceRouteDebtInput = {
  confirmationId: deriveAcceptanceConfirmationId(lineage), lineage, sprintId: 'sprint-614',
};
const debtId = 'debt-' + route.confirmationId;

function settlement(overrides: Partial<AcceptanceSettlement> = {}): AcceptanceSettlement {
  return {
    sourceVerdict: 'UNDECIDABLE', acceptanceDisposition: 'pending', debtDisposition: 'active',
    receiptDisposition: 'NONE', reasonCode: 'CONFIRMATION_MISSING', ...overrides,
  };
}

describe('acceptance route debt canonical adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debtTransactions.create.mockReturnValue({ state: 'CREATED', entry: {} });
    debtTransactions.transition.mockReturnValue(true);
  });

  it('delegates create to transactional FWW with exact tenant/project lineage', () => {
    expect(recordAcceptanceRouteDebt('/project', route)).toBe(true);
    expect(debtTransactions.create).toHaveBeenCalledOnce();
    expect(debtTransactions.create).toHaveBeenCalledWith('/project', expect.objectContaining({
      id: debtId, tenantId: 'tenant-a', projectId: 'project-a',
      confirmationId: route.confirmationId, lineage, status: 'active',
      metadata: { class: 'acceptance-route', provisional: true, originSprintId: 'sprint-614', sprintsOpen: 0 },
    }));
    debtTransactions.create.mockReturnValueOnce({ state: 'REPLAYED', entry: {} });
    expect(recordAcceptanceRouteDebt('/project', route)).toBe(false);
    debtTransactions.create.mockReturnValueOnce({ state: 'CONFLICT' });
    expect(recordAcceptanceRouteDebt('/project', {
      ...route, lineage: { ...lineage, projectId: 'project-b' },
    })).toBe(false);
  });

  it('rejects a caller-supplied confirmation id that does not match the full lineage', () => {
    expect(recordAcceptanceRouteDebt('/project', {
      ...route, confirmationId: 'confirmation-from-another-lineage',
    })).toBe(false);
    expect(debtTransactions.create).not.toHaveBeenCalled();

    const outcome = transitionAcceptanceRouteDebt('/project', {
      ...route, confirmationId: 'confirmation-from-another-lineage',
      settlement: settlement({
        acceptanceDisposition: 'active', debtDisposition: 'resolved', receiptDisposition: 'APPLIED',
        reasonCode: 'CONFIRMATION_APPLIED',
      }),
    });
    expect(outcome).toEqual({
      status: 'lineage_mismatch', debtId: 'debt-confirmation-from-another-lineage',
    });
    expect(debtTransactions.transition).not.toHaveBeenCalled();
  });

  it('allows only canonical reducer APPLIED resolution to invoke the CAS', () => {
    const resolved = settlement({
      acceptanceDisposition: 'active', debtDisposition: 'resolved', receiptDisposition: 'APPLIED',
      reasonCode: 'CONFIRMATION_APPLIED',
    });
    expect(transitionAcceptanceRouteDebt('/project', {
      ...route, settlement: resolved, resolvedInSprintId: 'sprint-615',
    })).toEqual({ status: 'resolved', debtId });
    expect(debtTransactions.transition).toHaveBeenCalledWith('/project', expect.objectContaining({
      id: debtId, tenantId: 'tenant-a', projectId: 'project-a',
      confirmationId: route.confirmationId, lineage, expectedStatus: 'active', nextStatus: 'resolved',
      expectedMetadata: {
        class: 'acceptance-route', provisional: true, originSprintId: 'sprint-614', sprintsOpen: 0,
      },
      nextMetadata: expect.objectContaining({
        provisional: false, resolvedInSprintId: 'sprint-615',
        resolutionAuthority: 'acceptance-settlement-reducer',
      }),
    }));
  });

  it('performs no write for QUALIFIED or expired settlements', () => {
    const qualified = settlement({
      sourceVerdict: 'QUALIFIED', acceptanceDisposition: 'active', debtDisposition: 'active',
      reasonCode: 'SOURCE_QUALIFIED_ACTIVE_DEBT',
    });
    const expired = settlement({ receiptDisposition: 'APPLIED', reasonCode: 'CONFIRMATION_EXPIRED' });
    expect(transitionAcceptanceRouteDebt('/project', { ...route, settlement: qualified }).status).toBe('active');
    expect(transitionAcceptanceRouteDebt('/project', { ...route, settlement: expired }).status).toBe('active');
    expect(debtTransactions.transition).not.toHaveBeenCalled();
  });

  it('does not let a rewritten source verdict imitate the exact resolve settlement', () => {
    const rewritten = settlement({
      sourceVerdict: 'CONFIRMED', acceptanceDisposition: 'active', debtDisposition: 'resolved',
      receiptDisposition: 'APPLIED', reasonCode: 'CONFIRMATION_APPLIED',
    });
    expect(transitionAcceptanceRouteDebt('/project', { ...route, settlement: rewritten }))
      .toEqual({ status: 'active', debtId });
    expect(debtTransactions.transition).not.toHaveBeenCalled();
  });

  it('leaves unrelated and generic debt byte-identical and fails closed on CAS mismatch', () => {
    const genericDebt = Buffer.from('generic-debt-byte-image');
    const unrelatedDebt = Buffer.from('unrelated-debt-byte-image');
    const genericBefore = Buffer.from(genericDebt);
    const unrelatedBefore = Buffer.from(unrelatedDebt);
    debtTransactions.transition.mockReturnValueOnce(false);
    const foreignLineage = { ...lineage, tenantId: 'tenant-b' };
    const foreignConfirmationId = deriveAcceptanceConfirmationId(foreignLineage);
    const outcome = transitionAcceptanceRouteDebt('/project', {
      ...route, confirmationId: foreignConfirmationId, lineage: foreignLineage,
      settlement: settlement({
        acceptanceDisposition: 'active', debtDisposition: 'resolved', receiptDisposition: 'APPLIED',
        reasonCode: 'CONFIRMATION_APPLIED',
      }),
    });
    expect(outcome).toEqual({ status: 'lineage_mismatch', debtId: `debt-${foreignConfirmationId}` });
    expect(genericDebt.equals(genericBefore)).toBe(true);
    expect(unrelatedDebt.equals(unrelatedBefore)).toBe(true);
    expect(debtTransactions.transition).toHaveBeenCalledOnce();
  });
});
