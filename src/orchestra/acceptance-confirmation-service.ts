import {
  applyAcceptanceConfirmationReceipt,
  canonicalAcceptanceConfirmationJson,
  createAcceptanceConfirmationTerminalEvent,
  deriveAcceptanceConfirmationId,
  prepareAcceptanceConfirmationReceipt,
  validateAcceptanceConfirmationReceipt,
  type AcceptanceConfirmationLineage,
  type AcceptanceConfirmationReceipt,
} from '../core/acceptance-confirmation-contract.js';
import { reduceAcceptanceSettlement, type AcceptanceSettlement } from '../core/acceptance-settlement.js';

export interface AcceptanceRouteRecord {
  readonly confirmationId: string;
  readonly lineage: AcceptanceConfirmationLineage;
  readonly sourceVerdict: 'UNDECIDABLE';
}
export interface VerifiedAcceptanceDecision {
  readonly confirmationId: string;
  readonly lineage: AcceptanceConfirmationLineage;
  readonly verdict: 'CONFIRMED' | 'QUALIFIED' | 'FAILED';
  readonly decidedAt: string;
  readonly authorityReceipt: string;
}
export interface AcceptanceConfirmationPort {
  createFirstWriterWins(record: AcceptanceRouteRecord): Promise<
    { readonly state: 'created' | 'replayed'; readonly record: AcceptanceRouteRecord }
    | { readonly state: 'conflict' }>;
  readFresh(confirmationId: string): Promise<{
    readonly route: AcceptanceRouteRecord;
    readonly decision?: VerifiedAcceptanceDecision;
  } | undefined>;
}
export interface AcceptanceDebtPort {
  createFirstWriterWins(record: AcceptanceRouteRecord): Promise<
    { readonly state: 'created' | 'replayed'; readonly record: AcceptanceRouteRecord }
    | { readonly state: 'conflict' }>;
  transitionExact(input: {
    readonly route: AcceptanceRouteRecord;
    readonly settlement: AcceptanceSettlement;
    readonly preparedReceipt: AcceptanceConfirmationReceipt;
  }): Promise<'applied' | 'already-applied' | 'lineage-mismatch' | 'not-found'>;
}
export interface AcceptanceReconciliationPort {
  appendFirstWriterWins(receipt: AcceptanceConfirmationReceipt): Promise<
    { readonly state: 'created' | 'replayed'; readonly receipt: AcceptanceConfirmationReceipt }
    | { readonly state: 'conflict' }>;
  read(confirmationId: string, state: 'PREPARED' | 'APPLIED'): Promise<AcceptanceConfirmationReceipt | undefined>;
}
export type VerifyAcceptanceAuthority = (decision: VerifiedAcceptanceDecision) => Promise<boolean> | boolean;
export type AcceptanceServiceResult =
  | { readonly state: 'DONE'; readonly replayed: boolean; readonly receipt: AcceptanceConfirmationReceipt }
  | { readonly state: 'HOLD'; readonly reasonCode: AcceptanceHoldReasonCode; readonly receiptRef: string }
  | { readonly state: 'DENIED'; readonly reasonCode: 'AUTHORITY_VERIFICATION_FAILED'; readonly receiptRef: string };
export type AcceptanceHoldReasonCode =
  | 'INVALID_ROUTE_LINEAGE' | 'CONFIRMATION_FWW_CONFLICT' | 'DEBT_FWW_CONFLICT'
  | 'ROUTE_DEBT_WRITE_PENDING' | 'VERIFIED_DECISION_UNAVAILABLE'
  | 'CONFIRMATION_LINEAGE_MISMATCH' | 'TERMINAL_EVENT_INVALID'
  | 'PREPARED_RECEIPT_CONFLICT' | 'DEBT_LINEAGE_MISMATCH' | 'DEBT_NOT_FOUND'
  | 'APPLIED_RECEIPT_CONFLICT' | 'BROKEN_RECEIPT_CHAIN';
export interface AcceptanceConfirmationServiceDeps {
  readonly confirmations: AcceptanceConfirmationPort;
  readonly debts: AcceptanceDebtPort;
  readonly receipts: AcceptanceReconciliationPort;
  readonly verifyAuthority: VerifyAcceptanceAuthority;
}

const hold = (reasonCode: AcceptanceHoldReasonCode, receiptRef: string): AcceptanceServiceResult =>
  Object.freeze({ state: 'HOLD', reasonCode, receiptRef });
function sameRoute(a: AcceptanceRouteRecord, b: AcceptanceRouteRecord): boolean {
  return a.confirmationId === b.confirmationId
    && deriveAcceptanceConfirmationId(a.lineage) === deriveAcceptanceConfirmationId(b.lineage)
    && a.sourceVerdict === b.sourceVerdict;
}
function validRoute(record: AcceptanceRouteRecord): boolean {
  return record.confirmationId === deriveAcceptanceConfirmationId(record.lineage)
    && record.sourceVerdict === 'UNDECIDABLE';
}

export async function createAndRouteAcceptanceConfirmation(
  deps: AcceptanceConfirmationServiceDeps, record: AcceptanceRouteRecord,
): Promise<AcceptanceServiceResult> {
  if (!validRoute(record)) return hold('INVALID_ROUTE_LINEAGE', `${record.confirmationId || 'unknown'}:confirmation`);
  const confirmation = await deps.confirmations.createFirstWriterWins(record);
  if (confirmation.state === 'conflict' || !sameRoute(confirmation.record, record)) {
    return hold('CONFIRMATION_FWW_CONFLICT', `${record.confirmationId}:confirmation`);
  }
  try {
    const debt = await deps.debts.createFirstWriterWins(record);
    if (debt.state === 'conflict' || !sameRoute(debt.record, record)) {
      return hold('DEBT_FWW_CONFLICT', `${record.confirmationId}:debt`);
    }
    return hold('VERIFIED_DECISION_UNAVAILABLE', `${record.confirmationId}:debt`);
  } catch {
    return hold('ROUTE_DEBT_WRITE_PENDING', `${record.confirmationId}:debt`);
  }
}

async function settleFresh(deps: AcceptanceConfirmationServiceDeps, confirmationId: string): Promise<AcceptanceServiceResult> {
  const fresh = await deps.confirmations.readFresh(confirmationId);
  const decision = fresh?.decision;
  if (!fresh || !decision) return hold('VERIFIED_DECISION_UNAVAILABLE', `${confirmationId}:prepared`);
  if (decision.confirmationId !== confirmationId || !validRoute(fresh.route)
    || deriveAcceptanceConfirmationId(fresh.route.lineage) !== deriveAcceptanceConfirmationId(decision.lineage)) {
    return hold('CONFIRMATION_LINEAGE_MISMATCH', `${confirmationId}:prepared`);
  }
  if (!(await deps.verifyAuthority(decision))) {
    return { state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED', receiptRef: `${confirmationId}:prepared` };
  }
  const event = createAcceptanceConfirmationTerminalEvent({
    lineage: decision.lineage, decision: decision.verdict === 'CONFIRMED' ? 'ACCEPTED' : 'REJECTED',
    terminalAt: decision.decidedAt,
  });
  if (!event.ok) return hold('TERMINAL_EVENT_INVALID', `${confirmationId}:prepared`);
  const prepared = prepareAcceptanceConfirmationReceipt({
    terminalEvent: event.value, preparedAt: decision.decidedAt, expectedLineage: decision.lineage,
  });
  if (!prepared.ok) return hold('TERMINAL_EVENT_INVALID', `${confirmationId}:prepared`);
  const applied = applyAcceptanceConfirmationReceipt({
    preparedReceipt: prepared.value, appliedAt: decision.decidedAt, expectedLineage: decision.lineage,
  });
  if (!applied.ok) return hold('BROKEN_RECEIPT_CHAIN', `${confirmationId}:applied`);
  const persistedApplied = await deps.receipts.read(confirmationId, 'APPLIED');
  if (persistedApplied) {
    const verified = validateAcceptanceConfirmationReceipt(persistedApplied);
    if (!verified.ok || persistedApplied.state !== 'APPLIED'
      || canonicalAcceptanceConfirmationJson(persistedApplied) !== canonicalAcceptanceConfirmationJson(applied.value)) {
      return hold('BROKEN_RECEIPT_CHAIN', `${confirmationId}:applied`);
    }
    return Object.freeze({ state: 'DONE', replayed: true, receipt: persistedApplied });
  }
  const preparedOutcome = await deps.receipts.appendFirstWriterWins(prepared.value);
  if (preparedOutcome.state === 'conflict'
    || canonicalAcceptanceConfirmationJson(preparedOutcome.receipt) !== canonicalAcceptanceConfirmationJson(prepared.value)) {
    return hold('PREPARED_RECEIPT_CONFLICT', `${confirmationId}:prepared`);
  }
  const preparedWinner = preparedOutcome.receipt;
  const settlement = reduceAcceptanceSettlement({
    sourceVerdict: fresh.route.sourceVerdict,
    matrixDecision: { verdict: 'UNDECIDABLE', action: 'ROUTE' },
    confirmation: { status: 'AUTHENTICATED', receipt: applied.value, expired: false },
  });
  const transition = await deps.debts.transitionExact({ route: fresh.route, settlement, preparedReceipt: preparedWinner });
  if (transition === 'lineage-mismatch' || transition === 'not-found') {
    return hold(transition === 'not-found' ? 'DEBT_NOT_FOUND' : 'DEBT_LINEAGE_MISMATCH', `${confirmationId}:prepared`);
  }
  const appliedOutcome = await deps.receipts.appendFirstWriterWins(applied.value);
  if (appliedOutcome.state === 'conflict'
    || canonicalAcceptanceConfirmationJson(appliedOutcome.receipt) !== canonicalAcceptanceConfirmationJson(applied.value)) {
    return hold('APPLIED_RECEIPT_CONFLICT', `${confirmationId}:applied`);
  }
  return Object.freeze({ state: 'DONE', replayed: transition === 'already-applied', receipt: appliedOutcome.receipt });
}
export const settleAcceptanceConfirmation = settleFresh;

export async function reconcileAcceptanceConfirmation(
  deps: AcceptanceConfirmationServiceDeps, confirmationId: string,
): Promise<AcceptanceServiceResult> {
  return settleFresh(deps, confirmationId);
}
