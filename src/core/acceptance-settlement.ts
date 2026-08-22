import type { AcceptanceConfirmationConflictReasonCode, AcceptanceConfirmationReceipt } from './acceptance-confirmation-contract.js';
import type { AcceptanceOutcome } from './acceptance-matrix.js';

export type AcceptanceDisposition = 'active' | 'rejected' | 'pending';
export type AcceptanceDebtDisposition = 'none' | 'active' | 'resolved';
export const ACCEPTANCE_SETTLEMENT_REASON_CODES = Object.freeze([
  'MATRIX_VERDICT_MISMATCH', 'SOURCE_CONFIRMED_ACTIVE', 'SOURCE_QUALIFIED_ACTIVE_DEBT',
  'SOURCE_FAILED_REJECTED', 'UNDECIDABLE_POLICY_ACCEPTED_WITH_DEBT',
  'UNDECIDABLE_POLICY_REJECTED', 'CONFIRMATION_MISSING', 'CONFIRMATION_UNAUTHENTICATED',
  'CONFIRMATION_PREPARED', 'CONFIRMATION_EXPIRED', 'CONFIRMATION_REJECTED',
  'CONFIRMATION_APPLIED',
] as const);
export type AcceptanceSettlementReasonCode = typeof ACCEPTANCE_SETTLEMENT_REASON_CODES[number];

/** Authentication is performed by the Task-1 contract boundary, never inferred here. */
export type AcceptanceConfirmationEvidence =
  | { readonly status: 'MISSING' }
  | { readonly status: 'UNAUTHENTICATED'; readonly reasonCode: AcceptanceConfirmationConflictReasonCode }
  | { readonly status: 'AUTHENTICATED'; readonly receipt: AcceptanceConfirmationReceipt; readonly expired: boolean };

export interface AcceptanceSettlementInput {
  /** Immutable evaluation truth. Confirmation never overwrites it. */
  readonly sourceVerdict: AcceptanceOutcome['verdict'];
  readonly matrixDecision: Pick<AcceptanceOutcome, 'verdict' | 'action'>;
  readonly confirmation: AcceptanceConfirmationEvidence;
}
export interface AcceptanceSettlement {
  readonly sourceVerdict: AcceptanceOutcome['verdict'];
  readonly acceptanceDisposition: AcceptanceDisposition;
  readonly debtDisposition: AcceptanceDebtDisposition;
  readonly receiptDisposition: 'NONE' | AcceptanceConfirmationReceipt['state'];
  readonly reasonCode: AcceptanceSettlementReasonCode;
  readonly confirmationConflictReasonCode?: AcceptanceConfirmationConflictReasonCode;
}

function settle(sourceVerdict: AcceptanceOutcome['verdict'], acceptanceDisposition: AcceptanceDisposition,
  debtDisposition: AcceptanceDebtDisposition, receiptDisposition: AcceptanceSettlement['receiptDisposition'],
  reasonCode: AcceptanceSettlementReasonCode,
  confirmationConflictReasonCode?: AcceptanceConfirmationConflictReasonCode): AcceptanceSettlement {
  return Object.freeze({ sourceVerdict, acceptanceDisposition, debtDisposition, receiptDisposition, reasonCode,
    ...(confirmationConflictReasonCode === undefined ? {} : { confirmationConflictReasonCode }) });
}
function receiptState(evidence: AcceptanceConfirmationEvidence): AcceptanceSettlement['receiptDisposition'] {
  return evidence.status === 'AUTHENTICATED' ? evidence.receipt.state : 'NONE';
}

/** Pure, deterministic settlement over the complete normative truth table. */
export function reduceAcceptanceSettlement(input: AcceptanceSettlementInput): AcceptanceSettlement {
  const { sourceVerdict, matrixDecision, confirmation } = input;
  const receiptDisposition = receiptState(confirmation);
  if (matrixDecision.verdict !== sourceVerdict) {
    return settle(sourceVerdict, 'rejected', 'active', receiptDisposition, 'MATRIX_VERDICT_MISMATCH');
  }
  // Normative floors precede policy and confirmation. Keeping this switch
  // exhaustive makes a future source verdict an explicit settlement change.
  switch (sourceVerdict) {
    case 'FAILED':
      return settle(sourceVerdict, 'rejected', 'active', receiptDisposition, 'SOURCE_FAILED_REJECTED');
    case 'QUALIFIED':
      return settle(sourceVerdict, 'active', 'active', receiptDisposition, 'SOURCE_QUALIFIED_ACTIVE_DEBT');
    case 'CONFIRMED':
      return settle(sourceVerdict, matrixDecision.action === 'REJECT' ? 'rejected' : 'active',
        'none', receiptDisposition, 'SOURCE_CONFIRMED_ACTIVE');
    case 'UNDECIDABLE':
      break;
  }
  // UNDECIDABLE is the sole owner of resolvable acceptance debt.
  switch (matrixDecision.action) {
    case 'ACCEPT':
      return settle(sourceVerdict, 'active', 'active', receiptDisposition, 'UNDECIDABLE_POLICY_ACCEPTED_WITH_DEBT');
    case 'REJECT':
      return settle(sourceVerdict, 'rejected', 'active', receiptDisposition, 'UNDECIDABLE_POLICY_REJECTED');
    case 'ROUTE':
      break;
  }
  if (confirmation.status === 'MISSING') {
    return settle(sourceVerdict, 'pending', 'active', 'NONE', 'CONFIRMATION_MISSING');
  }
  if (confirmation.status === 'UNAUTHENTICATED') {
    return settle(sourceVerdict, 'pending', 'active', 'NONE', 'CONFIRMATION_UNAUTHENTICATED', confirmation.reasonCode);
  }
  if (confirmation.receipt.state === 'PREPARED') {
    return settle(sourceVerdict, 'pending', 'active', 'PREPARED', 'CONFIRMATION_PREPARED');
  }
  if (confirmation.expired) {
    return settle(sourceVerdict, 'pending', 'active', 'APPLIED', 'CONFIRMATION_EXPIRED');
  }
  if (confirmation.receipt.terminalEvent.decision === 'REJECTED') {
    return settle(sourceVerdict, 'rejected', 'active', 'APPLIED', 'CONFIRMATION_REJECTED');
  }
  return settle(sourceVerdict, 'active', 'resolved', 'APPLIED', 'CONFIRMATION_APPLIED');
}
