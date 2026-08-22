import {
  reconcileAcceptanceConfirmation,
  type AcceptanceConfirmationServiceDeps,
  type AcceptanceServiceResult,
} from './acceptance-confirmation-service.js';
import {
  ACCEPTANCE_CONFIRMATION_MAX_CANDIDATES,
  readAcceptanceConfirmationCandidates,
  type AcceptanceConfirmationCandidatePage,
} from '../core/confirmation-store.js';
import {
  openAcceptanceConfirmationComposition,
  type AcceptanceConfirmationAuthority,
} from './acceptance-confirmation-composition.js';

export const ACCEPTANCE_RECONCILIATION_MAX_PAGE_SIZE = ACCEPTANCE_CONFIRMATION_MAX_CANDIDATES;

export type AcceptanceTerminalState = 'PENDING' | 'UNCLEAR' | 'TERMINAL' | 'CORRUPT';
export type AcceptanceReceiptState = 'MISSING' | 'PREPARED' | 'APPLIED' | 'CORRUPT';

export interface IndexedAcceptanceConfirmation {
  readonly tenantId: string;
  readonly confirmationId: string;
  readonly terminalState: AcceptanceTerminalState;
}
export interface IndexedAcceptanceConfirmationPage {
  readonly rows: readonly IndexedAcceptanceConfirmation[];
  readonly nextCursor: string | null;
}
/** The production confirmation-store index; implementations keyset seek by tenant and cursor. */
export interface AcceptanceConfirmationCandidateStore {
  scanTenantPartition(input: { readonly tenantId: string; readonly after: string | null; readonly limit: number }):
    Promise<IndexedAcceptanceConfirmationPage>;
}
export interface AcceptanceReceiptStateProjection {
  readonly tenantId: string;
  readonly confirmationId: string;
  readonly state: AcceptanceReceiptState;
}
/** Receipt authority projection for only the IDs in an already bounded page. */
export interface AcceptanceReceiptCandidateStore {
  readTenantPage(input: { readonly tenantId: string; readonly confirmationIds: readonly string[] }):
    Promise<readonly AcceptanceReceiptStateProjection[]>;
}
export interface AcceptanceConfirmationReconcilerDeps {
  readonly confirmations: AcceptanceConfirmationCandidateStore;
  readonly receiptStates: AcceptanceReceiptCandidateStore;
  readonly service: AcceptanceConfirmationServiceDeps;
}
export type AcceptanceReconciliationObservation =
  | { readonly kind: 'PENDING' | 'UNCLEAR' | 'CORRUPT' | 'APPLIED'; readonly confirmationId: string }
  | { readonly kind: 'FOREIGN_TENANT'; readonly confirmationId: string; readonly observedTenantId: string };
export interface AcceptanceReconciliationRunResult {
  readonly tenantId: string;
  readonly cursor: string | null;
  readonly exhausted: boolean;
  readonly scanned: number;
  readonly reconciled: number;
  readonly held: number;
  readonly denied: number;
  readonly observations: readonly AcceptanceReconciliationObservation[];
  readonly outcomes: readonly { readonly confirmationId: string; readonly result: AcceptanceServiceResult }[];
}
export interface RunAcceptanceConfirmationReconciliationInput {
  readonly tenantId: string;
  readonly cursor?: string | null;
  readonly limit: number;
}

export interface AcceptanceConfirmationProductionReconciler {
  run(input: Omit<RunAcceptanceConfirmationReconciliationInput, 'tenantId'>): Promise<AcceptanceReconciliationRunResult>;
  close(): void;
}

function productionCandidatePage(
  authority: Readonly<AcceptanceConfirmationAuthority>,
  page: AcceptanceConfirmationCandidatePage,
  limit: number,
): IndexedAcceptanceConfirmationPage {
  // Canonical candidates take precedence so advancing the durable keyset can
  // never skip a terminal effect. Remaining capacity carries typed index
  // quarantine observations without widening the bounded page.
  const rows: IndexedAcceptanceConfirmation[] = page.candidates.map(candidate => ({
    tenantId: candidate.request.acceptanceLineage.tenantId,
    confirmationId: candidate.request.id,
    terminalState: candidate.state === 'settled' ? 'TERMINAL' : 'PENDING',
  }));
  for (const quarantined of page.quarantine) {
    if (rows.length === limit) break;
    rows.push({ tenantId: authority.tenantId, confirmationId: quarantined.key, terminalState: 'CORRUPT' });
  }
  return Object.freeze({ rows: Object.freeze(rows), nextCursor: page.nextAfter ?? null });
}

/**
 * Opens the default production restart reconciler. Callers supply authority,
 * not fixture adapters: candidate keysets and receipt projections are derived
 * from the same durable composition used for confirmation settlement.
 */
export function openAcceptanceConfirmationReconciler(
  authority: AcceptanceConfirmationAuthority,
): AcceptanceConfirmationProductionReconciler {
  const composition = openAcceptanceConfirmationComposition(authority);
  const confirmations: AcceptanceConfirmationCandidateStore = Object.freeze({
    async scanTenantPartition(
      input: Parameters<AcceptanceConfirmationCandidateStore['scanTenantPartition']>[0],
    ) {
      if (input.tenantId !== composition.authority.tenantId) {
        return Object.freeze({ rows: Object.freeze([]), nextCursor: null });
      }
      const page = readAcceptanceConfirmationCandidates(composition.authority.projectRoot, {
        tenantId: composition.authority.tenantId,
        projectId: composition.authority.projectId,
        status: 'settled',
        limit: input.limit,
        ...(input.after === null ? {} : { after: input.after }),
      }, { lifecycle: composition.authority.lifecycle, clock: composition.authority.clock });
      return productionCandidatePage(composition.authority, page, input.limit);
    },
  });
  const receiptStates: AcceptanceReceiptCandidateStore = Object.freeze({
    async readTenantPage(
      input: Parameters<AcceptanceReceiptCandidateStore['readTenantPage']>[0],
    ) {
      if (input.tenantId !== composition.authority.tenantId) return Object.freeze([]);
      const projected = await Promise.all(input.confirmationIds.map(async confirmationId => {
        const [prepared, applied] = await Promise.all([
          composition.service.receipts.read(confirmationId, 'PREPARED'),
          composition.service.receipts.read(confirmationId, 'APPLIED'),
        ]);
        const rows: AcceptanceReceiptStateProjection[] = [];
        if (prepared) rows.push({ tenantId: input.tenantId, confirmationId, state: 'PREPARED' });
        if (applied) rows.push({ tenantId: input.tenantId, confirmationId, state: 'APPLIED' });
        if (!prepared && !applied) rows.push({ tenantId: input.tenantId, confirmationId, state: 'MISSING' });
        return rows;
      }));
      return Object.freeze(projected.flat());
    },
  });
  return Object.freeze({
    run(input: Omit<RunAcceptanceConfirmationReconciliationInput, 'tenantId'>) {
      return runAcceptanceConfirmationReconciliation({ confirmations, receiptStates, service: composition.service }, {
        ...input, tenantId: composition.authority.tenantId,
      });
    },
    close() { composition.close(); },
  });
}

const validKey = (value: string): boolean => value.length > 0 && value.trim() === value;
function validTerminal(state: string): state is AcceptanceTerminalState {
  return state === 'PENDING' || state === 'UNCLEAR' || state === 'TERMINAL' || state === 'CORRUPT';
}
function validReceipt(state: string): state is AcceptanceReceiptState {
  return state === 'MISSING' || state === 'PREPARED' || state === 'APPLIED' || state === 'CORRUPT';
}
function rank(state: AcceptanceReceiptState): number {
  switch (state) {
    case 'MISSING': return 0;
    case 'PREPARED': return 1;
    case 'APPLIED': return 2;
    case 'CORRUPT': return 3;
  }
}

/** Compose and reconcile one bounded page from durable store observations. */
export async function runAcceptanceConfirmationReconciliation(
  deps: AcceptanceConfirmationReconcilerDeps,
  input: RunAcceptanceConfirmationReconciliationInput,
): Promise<AcceptanceReconciliationRunResult> {
  if (!validKey(input.tenantId)) throw new Error('acceptance reconciliation requires a tenant id');
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > ACCEPTANCE_RECONCILIATION_MAX_PAGE_SIZE) {
    throw new Error(`acceptance reconciliation limit must be 1..${ACCEPTANCE_RECONCILIATION_MAX_PAGE_SIZE}`);
  }
  const cursor = input.cursor ?? null;
  if (cursor !== null && !validKey(cursor)) throw new Error('acceptance reconciliation cursor is invalid');
  const page = await deps.confirmations.scanTenantPartition({ tenantId: input.tenantId, after: cursor, limit: input.limit });
  if (page.rows.length > input.limit) throw new Error('acceptance reconciliation confirmation store exceeded its bounded page');
  if (page.nextCursor !== null && (!validKey(page.nextCursor) || (cursor !== null && page.nextCursor <= cursor))) {
    throw new Error('acceptance reconciliation confirmation store returned a non-monotonic cursor');
  }

  const observations: AcceptanceReconciliationObservation[] = [];
  const terminal = new Set<string>();
  const quarantined = new Set<string>();
  for (const row of page.rows) {
    const id = validKey(row.confirmationId) ? row.confirmationId : '<invalid>';
    if (!validKey(row.tenantId) || !validKey(row.confirmationId) || !validTerminal(row.terminalState)
      || row.terminalState === 'CORRUPT') {
      observations.push({ kind: 'CORRUPT', confirmationId: id });
      if (id !== '<invalid>') { quarantined.add(id); terminal.delete(id); }
    } else if (row.tenantId !== input.tenantId) {
      observations.push({ kind: 'FOREIGN_TENANT', confirmationId: id, observedTenantId: row.tenantId });
      quarantined.add(id); terminal.delete(id);
    } else if (!quarantined.has(id) && row.terminalState === 'TERMINAL') {
      terminal.add(id);
    } else if (!quarantined.has(id)) {
      observations.push({ kind: row.terminalState as 'PENDING' | 'UNCLEAR', confirmationId: id });
    }
  }

  const confirmationIds = [...terminal].sort();
  const receiptRows = confirmationIds.length === 0 ? [] : await deps.receiptStates.readTenantPage({
    tenantId: input.tenantId, confirmationIds,
  });
  // All legal states for each requested key may coexist while the durable
  // projection compacts. Coalesce those duplicates, but retain a hard bound.
  if (receiptRows.length > confirmationIds.length * 4) {
    throw new Error('acceptance reconciliation receipt store exceeded its bounded projection');
  }
  const requested = new Set(confirmationIds);
  const states = new Map<string, AcceptanceReceiptState>();
  for (const row of receiptRows) {
    const id = validKey(row.confirmationId) ? row.confirmationId : '<invalid>';
    if (!validKey(row.tenantId) || !validKey(row.confirmationId) || !validReceipt(row.state)
      || row.tenantId !== input.tenantId || !requested.has(id)) {
      observations.push(row.tenantId !== input.tenantId && validKey(row.tenantId)
        ? { kind: 'FOREIGN_TENANT', confirmationId: id, observedTenantId: row.tenantId }
        : { kind: 'CORRUPT', confirmationId: id });
      if (requested.has(id)) states.set(id, 'CORRUPT');
      continue;
    }
    const current = states.get(id);
    if (!current || rank(row.state) > rank(current)) states.set(id, row.state);
  }

  const outcomes: Array<{ confirmationId: string; result: AcceptanceServiceResult }> = [];
  let reconciled = 0; let held = 0; let denied = 0;
  for (const confirmationId of confirmationIds) {
    const state = states.get(confirmationId) ?? 'MISSING';
    if (state === 'APPLIED' || state === 'CORRUPT') {
      observations.push({ kind: state, confirmationId });
      continue;
    }
    const result = await reconcileAcceptanceConfirmation(deps.service, confirmationId);
    outcomes.push({ confirmationId, result });
    if (result.state === 'DONE') reconciled += 1;
    else if (result.state === 'HOLD') held += 1;
    else denied += 1;
  }
  return Object.freeze({ tenantId: input.tenantId, cursor: page.nextCursor, exhausted: page.nextCursor === null,
    scanned: page.rows.length, reconciled, held, denied, observations, outcomes });
}
