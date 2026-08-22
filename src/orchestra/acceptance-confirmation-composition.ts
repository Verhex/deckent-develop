import { realpathSync } from 'node:fs';
import { acceptanceConfirmationDigest, applyAcceptanceConfirmationReceipt,
  createAcceptanceConfirmationTerminalEvent, deriveAcceptanceConfirmationId,
  prepareAcceptanceConfirmationReceipt, type AcceptanceConfirmationLineage,
  type AcceptanceConfirmationReceipt } from '../core/acceptance-confirmation-contract.js';
import { AcceptanceReconciliationStore } from '../core/acceptance-reconciliation-store.js';
import type { ApprovalLifecycleClock } from '../core/approval-lifecycle-policy.js';
import type { ResolvedApprovalLifecycleConfig } from '../core/config-types.js';
import { readAcceptanceConfirmation, readAcceptanceConfirmationTerminalTruth,
  readConfirmation, settleConfirmation } from '../core/confirmation-store.js';
import { createAcceptanceRouteDebt, getDebtItems,
  transitionAcceptanceRouteDebt } from '../core/debt-store.js';
import { createAcceptanceDecisionAuthorityVerifier,
  writeLlmAcceptanceDecisionBindingFirstWriterWins,
  type AcceptanceDecisionAuthorityFactory } from '../core/acceptance-decision-authority.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import { createAndRouteAcceptanceConfirmation, reconcileAcceptanceConfirmation,
  settleAcceptanceConfirmation, type AcceptanceConfirmationPort,
  type AcceptanceConfirmationServiceDeps, type AcceptanceDebtPort,
  type AcceptanceReconciliationPort, type AcceptanceRouteRecord,
  type AcceptanceServiceResult, type VerifiedAcceptanceDecision,
  type VerifyAcceptanceAuthority } from './acceptance-confirmation-service.js';

export interface AcceptanceConfirmationAuthority {
  readonly projectRoot: string; readonly tenantId: string; readonly projectId: string;
  readonly lifecycle: ResolvedApprovalLifecycleConfig; readonly clock: ApprovalLifecycleClock;
  readonly verifyAuthority?: VerifyAcceptanceAuthority;
  readonly decisionAuthority?: AcceptanceDecisionAuthorityFactory;
}
export type AcceptanceConfirmationCompositionResult = AcceptanceServiceResult | {
  readonly state: 'HOLD'; readonly reasonCode: 'COMPOSITION_AUTHORITY_MISMATCH' | 'COMPOSITION_CLOSED';
  readonly receiptRef: string;
};
export interface AcceptanceConfirmationDecisionInput {
  readonly confirmationId: string;
  readonly verdict: 'CONFIRMED' | 'FAILED';
  readonly decidedBy: 'human' | 'llm';
  readonly reason: string;
  readonly authorityReceipt: string;
  readonly settlementRef?: TaskResultSettlementRefV1;
}
export interface AcceptanceConfirmationComposition {
  readonly authority: Readonly<AcceptanceConfirmationAuthority>;
  readonly service: AcceptanceConfirmationServiceDeps;
  readonly reconciler: { reconcile(id: string): Promise<AcceptanceConfirmationCompositionResult> };
  createAndRoute(record: AcceptanceRouteRecord): Promise<AcceptanceConfirmationCompositionResult>;
  decideAndSettle(input: AcceptanceConfirmationDecisionInput): Promise<AcceptanceConfirmationCompositionResult>;
  settle(id: string): Promise<AcceptanceConfirmationCompositionResult>;
  close(): void;
}
interface Stored { readonly lineage: AcceptanceConfirmationLineage; readonly sprintId: string;
  readonly decision?: VerifiedAcceptanceDecision }
const sameLineage = (a: AcceptanceConfirmationLineage, b: AcceptanceConfirmationLineage) =>
  deriveAcceptanceConfirmationId(a) === deriveAcceptanceConfirmationId(b);
const sameRoute = (a: AcceptanceRouteRecord, b: AcceptanceRouteRecord) =>
  a.confirmationId === b.confirmationId && a.sourceVerdict === b.sourceVerdict && sameLineage(a.lineage, b.lineage);
const sameDecision = (a: VerifiedAcceptanceDecision, b: VerifiedAcceptanceDecision) =>
  a.confirmationId === b.confirmationId
  && sameLineage(a.lineage, b.lineage)
  && a.verdict === b.verdict
  && a.decidedAt === b.decidedAt
  && a.authorityReceipt === b.authorityReceipt;

/** Single owner of the durable production graph for acceptance confirmation. */
export function openAcceptanceConfirmationComposition(
  supplied: AcceptanceConfirmationAuthority,
): AcceptanceConfirmationComposition {
  if ((supplied.verifyAuthority === undefined) === (supplied.decisionAuthority === undefined)) {
    throw new Error('exactly one acceptance decision authority must be supplied');
  }
  const authority = Object.freeze({ ...supplied, projectRoot: realpathSync(supplied.projectRoot) });
  const verifyAuthority: VerifyAcceptanceAuthority = supplied.decisionAuthority
    ? createAcceptanceDecisionAuthorityVerifier(supplied.decisionAuthority) : supplied.verifyAuthority!;
  const options = { lifecycle: authority.lifecycle, clock: authority.clock };
  const reconciliationStore = new AcceptanceReconciliationStore(authority.projectRoot);
  let closed = false;
  const openedLineages = new Map<string, AcceptanceConfirmationLineage>();
  const load = (id: string, lineageHint?: AcceptanceConfirmationLineage): Stored | undefined => {
    const envelope = readConfirmation(authority.projectRoot, id, options);
    const lineage = lineageHint ?? openedLineages.get(id) ?? envelope?.request.acceptanceLineage;
    if (!lineage || lineage.tenantId !== authority.tenantId || lineage.projectId !== authority.projectId) return undefined;
    const exact = readAcceptanceConfirmation(authority.projectRoot, id, lineage, options);
    if (!exact) return undefined;
    openedLineages.set(id, lineage);
    const truth = readAcceptanceConfirmationTerminalTruth(authority.projectRoot, id, lineage, options);
    const decision = truth && truth.outcome.closureReason !== 'expired'
      && truth.outcome.verdict !== 'UNDECIDABLE' ? Object.freeze({
      confirmationId: id, lineage, verdict: truth.outcome.verdict, decidedAt: truth.outcome.decidedAt,
      authorityReceipt: truth.outcome.receipt ?? truth.outcome.reason,
    }) : undefined;
    return { lineage, sprintId: exact.request.sprintId, ...(decision ? { decision } : {}) };
  };
  const confirmations: AcceptanceConfirmationPort = Object.freeze({
    async createFirstWriterWins(record: AcceptanceRouteRecord) {
      const stored = load(record.confirmationId, record.lineage);
      if (!stored) return { state: 'conflict' as const };
      const route = Object.freeze({ confirmationId: record.confirmationId, lineage: stored.lineage,
        sourceVerdict: 'UNDECIDABLE' as const });
      return sameRoute(route, record)
        ? { state: 'replayed' as const, record: route }
        : { state: 'conflict' as const };
    },
    async readFresh(id: string) {
      const stored = load(id); if (!stored) return undefined;
      return Object.freeze({ route: Object.freeze({ confirmationId: id, lineage: stored.lineage,
        sourceVerdict: 'UNDECIDABLE' as const }), ...(stored.decision ? { decision: stored.decision } : {}) });
    },
  });
  const debts: AcceptanceDebtPort = Object.freeze({
    async createFirstWriterWins(record: AcceptanceRouteRecord) {
      const stored = load(record.confirmationId);
      if (!stored || !sameLineage(stored.lineage, record.lineage)) return { state: 'conflict' as const };
      const result = createAcceptanceRouteDebt(authority.projectRoot, {
        id: `debt-${record.confirmationId}`, tenantId: authority.tenantId, projectId: authority.projectId,
        confirmationId: record.confirmationId, lineage: record.lineage,
        title: `Acceptance confirmation pending: ${record.confirmationId}`.slice(0, 80),
        content: `Acceptance confirmation ${record.confirmationId} is pending for its exact canonical lineage.`,
        status: 'active', priority: 'normal', metadata: { class: 'acceptance-route', provisional: true,
          originSprintId: stored.sprintId, sprintsOpen: 0 }, changedBy: 'brain',
      });
      return result.state === 'CONFLICT' ? { state: 'conflict' as const }
        : { state: result.state === 'CREATED' ? 'created' as const : 'replayed' as const, record };
    },
    async transitionExact(input: Parameters<AcceptanceDebtPort['transitionExact']>[0]) {
      if (input.settlement.debtDisposition !== 'resolved' || input.settlement.receiptDisposition !== 'APPLIED'
        || input.settlement.reasonCode !== 'CONFIRMATION_APPLIED') return 'lineage-mismatch';
      const stored = load(input.route.confirmationId);
      if (!stored || !sameLineage(stored.lineage, input.route.lineage)) return 'lineage-mismatch';
      const expectedMetadata = { class: 'acceptance-route', provisional: true,
        originSprintId: stored.sprintId, sprintsOpen: 0 } as const;
      const applied = transitionAcceptanceRouteDebt(authority.projectRoot, {
        id: `debt-${input.route.confirmationId}`, tenantId: authority.tenantId, projectId: authority.projectId,
        confirmationId: input.route.confirmationId, lineage: input.route.lineage, expectedStatus: 'active',
        nextStatus: 'resolved', expectedMetadata, nextMetadata: { ...expectedMetadata, provisional: false,
          resolutionAuthority: 'acceptance-settlement-reducer' }, changedBy: 'brain',
      });
      if (applied) return 'applied';
      const debt = getDebtItems(authority.projectRoot, { tenantId: authority.tenantId })
        .find(item => item.id === `debt-${input.route.confirmationId}`);
      return debt?.resolved ? 'already-applied' : debt ? 'lineage-mismatch' : 'not-found';
    },
  });
  const canonicalReceipt = (id: string, state: 'PREPARED' | 'APPLIED'): AcceptanceConfirmationReceipt | undefined => {
    const stored = load(id); if (!stored?.decision) return undefined;
    const event = createAcceptanceConfirmationTerminalEvent({ lineage: stored.lineage,
      decision: stored.decision.verdict === 'CONFIRMED' ? 'ACCEPTED' : 'REJECTED', terminalAt: stored.decision.decidedAt });
    if (!event.ok) return undefined;
    const prepared = prepareAcceptanceConfirmationReceipt({ terminalEvent: event.value,
      preparedAt: stored.decision.decidedAt, expectedLineage: stored.lineage });
    if (!prepared.ok || state === 'PREPARED') return prepared.ok ? prepared.value : undefined;
    const applied = applyAcceptanceConfirmationReceipt({ preparedReceipt: prepared.value,
      appliedAt: stored.decision.decidedAt, expectedLineage: stored.lineage });
    return applied.ok ? applied.value : undefined;
  };
  const receipts: AcceptanceReconciliationPort = Object.freeze({
    async appendFirstWriterWins(receipt: AcceptanceConfirmationReceipt) {
      const stored = load(receipt.confirmationId);
      if (!stored || !sameLineage(stored.lineage, receipt.lineage)) return { state: 'conflict' as const };
      const debtProjectionDigest = acceptanceConfirmationDigest({
        domain: 'deckent.acceptance-route-debt.v1',
        tenantId: receipt.lineage.tenantId,
        projectId: receipt.lineage.projectId,
        confirmationId: receipt.confirmationId,
        debtId: `debt-${receipt.confirmationId}`,
      });
      const written = reconciliationStore.append({ confirmationReceipt: receipt,
        debtProjectionDigest });
      return written.state === 'HOLD' ? { state: 'conflict' as const }
        : { state: written.state === 'REPLAYED' ? 'replayed' as const : 'created' as const,
          receipt: written.receipt.confirmationReceipt };
    },
    async read(id: string, state: 'PREPARED' | 'APPLIED') {
      const expected = canonicalReceipt(id, state); if (!expected) return undefined;
      const found = reconciliationStore.read(reconciliationStore.keyFor(expected), state);
      return found.state === 'FOUND' ? found.receipt.confirmationReceipt : undefined;
    },
  });
  const service = Object.freeze({ confirmations, debts, receipts, verifyAuthority });
  const unavailable = (id: string): AcceptanceConfirmationCompositionResult => Object.freeze({ state: 'HOLD',
    reasonCode: closed ? 'COMPOSITION_CLOSED' : 'COMPOSITION_AUTHORITY_MISMATCH', receiptRef: `${id}:prepared` });
  const accepts = (id: string) => !closed && load(id) !== undefined;
  const reconcile = (id: string) => accepts(id) ? reconcileAcceptanceConfirmation(service, id)
    : Promise.resolve(unavailable(id));
  const decideAndSettle = async (
    input: AcceptanceConfirmationDecisionInput,
  ): Promise<AcceptanceConfirmationCompositionResult> => {
    const stored = !closed ? load(input.confirmationId) : undefined;
    if (!stored || !input.authorityReceipt.trim()) return unavailable(input.confirmationId);
    const decidedAt = authority.clock().toISOString();
    const candidate: VerifiedAcceptanceDecision = Object.freeze({
      confirmationId: input.confirmationId,
      lineage: stored.lineage,
      verdict: input.verdict,
      decidedAt,
      authorityReceipt: input.authorityReceipt,
    });
    if (input.decidedBy === 'llm') {
      if (authority.decisionAuthority?.branch !== 'llm' || !input.settlementRef) {
        return Object.freeze({ state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
          receiptRef: `${input.confirmationId}:prepared` });
      }
      try {
        writeLlmAcceptanceDecisionBindingFirstWriterWins({ projectRoot: authority.projectRoot,
          confirmationId: input.confirmationId, lineage: stored.lineage, verdict: input.verdict,
          receiptRef: input.authorityReceipt, settlementRef: input.settlementRef });
      } catch {
        return Object.freeze({ state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
          receiptRef: `${input.confirmationId}:prepared` });
      }
    }
    if (!(await verifyAuthority(candidate))) {
      return Object.freeze({ state: 'DENIED', reasonCode: 'AUTHORITY_VERIFICATION_FAILED',
        receiptRef: `${input.confirmationId}:prepared` });
    }
    if (stored.decision) {
      if (!sameDecision(stored.decision, candidate)) {
        return Object.freeze({ state: 'HOLD', reasonCode: 'CONFIRMATION_FWW_CONFLICT',
          receiptRef: `${input.confirmationId}:prepared` });
      }
      return settleAcceptanceConfirmation(service, input.confirmationId);
    }
    try {
      settleConfirmation(authority.projectRoot, input.confirmationId, {
        verdict: input.verdict,
        decidedBy: input.decidedBy,
        reason: input.reason,
        receipt: input.authorityReceipt,
        decidedAt,
      }, { lifecycle: authority.lifecycle, clock: () => new Date(decidedAt) });
    } catch {
      const winner = load(input.confirmationId)?.decision;
      if (!winner || !sameDecision(winner, candidate)) {
        return Object.freeze({ state: 'HOLD', reasonCode: 'CONFIRMATION_FWW_CONFLICT',
          receiptRef: `${input.confirmationId}:prepared` });
      }
    }
    return settleAcceptanceConfirmation(service, input.confirmationId);
  };
  return Object.freeze({ authority, service, reconciler: Object.freeze({ reconcile }),
    createAndRoute(record: AcceptanceRouteRecord) {
      return !closed && load(record.confirmationId, record.lineage) !== undefined
        && record.lineage.tenantId === authority.tenantId
        && record.lineage.projectId === authority.projectId
        ? createAndRouteAcceptanceConfirmation(service, record) : Promise.resolve(unavailable(record.confirmationId));
    },
    decideAndSettle,
    settle(id: string) { return accepts(id) ? settleAcceptanceConfirmation(service, id) : Promise.resolve(unavailable(id)); },
    close() { if (!closed) { closed = true; reconciliationStore.close(); } },
  });
}
