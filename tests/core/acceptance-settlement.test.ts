import { describe, expect, it } from 'vitest';
import { applyAcceptanceConfirmationReceipt, createAcceptanceConfirmationTerminalEvent,
  prepareAcceptanceConfirmationReceipt, type AcceptanceConfirmationAppliedReceipt,
  type AcceptanceConfirmationPreparedReceipt } from '../../src/core/acceptance-confirmation-contract.js';
import { ACCEPTANCE_SETTLEMENT_REASON_CODES, reduceAcceptanceSettlement,
  type AcceptanceConfirmationEvidence, type AcceptanceSettlement,
  type AcceptanceSettlementReasonCode } from '../../src/core/acceptance-settlement.js';
import type { AcceptanceOutcome } from '../../src/core/acceptance-matrix.js';

const digest = (c: string): string => c.repeat(64);
const lineage = { tenantId: 'tenant-a', projectId: 'project-a', sprintId: 'sprint-616', taskId: 'task-002',
  attemptId: 'attempt-a', generation: 1, evaluationDigest: digest('d'),
  resultDigest: digest('a'), policyDigest: digest('b'), sourceDigest: digest('c') };
function receipts(decision: 'ACCEPTED' | 'REJECTED'): { prepared: AcceptanceConfirmationPreparedReceipt;
  applied: AcceptanceConfirmationAppliedReceipt } {
  const event = createAcceptanceConfirmationTerminalEvent({ lineage, decision, terminalAt: '2026-08-21T00:00:00.000Z' });
  if (!event.ok) throw new Error(event.error.message);
  const prepared = prepareAcceptanceConfirmationReceipt({ terminalEvent: event.value,
    preparedAt: '2026-08-21T00:00:01.000Z', expectedLineage: lineage });
  if (!prepared.ok) throw new Error(prepared.error.message);
  const applied = applyAcceptanceConfirmationReceipt({ preparedReceipt: prepared.value,
    appliedAt: '2026-08-21T00:00:02.000Z', expectedLineage: lineage });
  if (!applied.ok) throw new Error(applied.error.message);
  return { prepared: prepared.value, applied: applied.value };
}
const accepted = receipts('ACCEPTED');
const rejected = receipts('REJECTED');
const matrix = (verdict: AcceptanceOutcome['verdict'], action: AcceptanceOutcome['action']) => ({ verdict, action } as const);
const missing = { status: 'MISSING' } as const;

const verdicts = ['CONFIRMED', 'QUALIFIED', 'UNDECIDABLE', 'FAILED'] as const;
const actions = ['ACCEPT', 'ROUTE', 'REJECT'] as const;
const evidence = [
  ['missing', missing],
  ['unauthenticated', { status: 'UNAUTHENTICATED', reasonCode: 'IDENTITY_MISMATCH' }],
  ['prepared accepted', { status: 'AUTHENTICATED', receipt: accepted.prepared, expired: false }],
  ['expired accepted', { status: 'AUTHENTICATED', receipt: accepted.applied, expired: true }],
  ['applied rejected', { status: 'AUTHENTICATED', receipt: rejected.applied, expired: false }],
  ['applied accepted', { status: 'AUTHENTICATED', receipt: accepted.applied, expired: false }],
] as const satisfies readonly (readonly [string, AcceptanceConfirmationEvidence])[];

function expectedReason(
  verdict: AcceptanceOutcome['verdict'],
  action: AcceptanceOutcome['action'],
  confirmation: AcceptanceConfirmationEvidence,
): AcceptanceSettlementReasonCode {
  if (verdict === 'FAILED') return 'SOURCE_FAILED_REJECTED';
  if (verdict === 'QUALIFIED') return 'SOURCE_QUALIFIED_ACTIVE_DEBT';
  if (verdict === 'CONFIRMED') return 'SOURCE_CONFIRMED_ACTIVE';
  if (action === 'ACCEPT') return 'UNDECIDABLE_POLICY_ACCEPTED_WITH_DEBT';
  if (action === 'REJECT') return 'UNDECIDABLE_POLICY_REJECTED';
  if (confirmation.status === 'MISSING') return 'CONFIRMATION_MISSING';
  if (confirmation.status === 'UNAUTHENTICATED') return 'CONFIRMATION_UNAUTHENTICATED';
  if (confirmation.receipt.state === 'PREPARED') return 'CONFIRMATION_PREPARED';
  if (confirmation.expired) return 'CONFIRMATION_EXPIRED';
  return confirmation.receipt.terminalEvent.decision === 'REJECTED'
    ? 'CONFIRMATION_REJECTED' : 'CONFIRMATION_APPLIED';
}

describe('acceptance settlement reducer', () => {
  it('resolves only routed UNDECIDABLE with authenticated applied non-expired acceptance', () => {
    expect(reduceAcceptanceSettlement({ sourceVerdict: 'UNDECIDABLE', matrixDecision: matrix('UNDECIDABLE', 'ROUTE'),
      confirmation: { status: 'AUTHENTICATED', receipt: accepted.applied, expired: false } })).toEqual({
      sourceVerdict: 'UNDECIDABLE', acceptanceDisposition: 'active', debtDisposition: 'resolved',
      receiptDisposition: 'APPLIED', reasonCode: 'CONFIRMATION_APPLIED' });
  });
  it('pins the complete 4 verdict x 3 action x 6 evidence truth table with typed reasons', () => {
    const settlements: AcceptanceSettlement[] = [];
    for (const sourceVerdict of verdicts) {
      for (const action of actions) {
        for (const [, confirmation] of evidence) {
          const result = reduceAcceptanceSettlement({ sourceVerdict,
            matrixDecision: matrix(sourceVerdict, action), confirmation });
          settlements.push(result);
          expect(result.sourceVerdict).toBe(sourceVerdict);
          expect(result.reasonCode).toBe(expectedReason(sourceVerdict, action, confirmation));
          expect(ACCEPTANCE_SETTLEMENT_REASON_CODES).toContain(result.reasonCode);
          expect(result.debtDisposition === 'resolved').toBe(
            sourceVerdict === 'UNDECIDABLE' && action === 'ROUTE'
              && confirmation.status === 'AUTHENTICATED'
              && confirmation.receipt.state === 'APPLIED' && !confirmation.expired
              && confirmation.receipt.terminalEvent.decision === 'ACCEPTED',
          );
        }
      }
    }
    expect(settlements).toHaveLength(72);
  });

  it('pins every source/matrix mismatch and never rewrites source truth', () => {
    for (const sourceVerdict of verdicts) {
      for (const matrixVerdict of verdicts.filter(candidate => candidate !== sourceVerdict)) {
        const result = reduceAcceptanceSettlement({ sourceVerdict,
          matrixDecision: matrix(matrixVerdict, 'ACCEPT'),
          confirmation: { status: 'AUTHENTICATED', receipt: accepted.applied, expired: false } });
        expect(result).toEqual({ sourceVerdict, acceptanceDisposition: 'rejected', debtDisposition: 'active',
          receiptDisposition: 'APPLIED', reasonCode: 'MATRIX_VERDICT_MISMATCH' });
      }
    }
  });

  it('preserves the typed authentication conflict and does not mutate its input', () => {
    const input = { sourceVerdict: 'UNDECIDABLE', matrixDecision: matrix('UNDECIDABLE', 'ROUTE'),
      confirmation: { status: 'UNAUTHENTICATED', reasonCode: 'IDENTITY_MISMATCH' } } as const;
    const before = structuredClone(input);
    const result = reduceAcceptanceSettlement(input);
    expect(result).toMatchObject({ reasonCode: 'CONFIRMATION_UNAUTHENTICATED',
      confirmationConflictReasonCode: 'IDENTITY_MISMATCH' });
    expect(input).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
