import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR } from './constants.js';
import type { CanonicalRunStatus } from './run-status-authority.js';
import {
  SPRINT_TERMINAL_PUBLICATION_VERSION,
  type SprintTerminalReceiptV1,
} from './sprint-terminal-publication.js';

export interface TerminalPublicationStatus {
  readonly version: typeof SPRINT_TERMINAL_PUBLICATION_VERSION;
  readonly state:
    | 'open'
    | 'terminal-authority-observed'
    | 'receipt-observed'
    | 'receipt-conflict';
  readonly receipt: SprintTerminalReceiptV1 | null;
  readonly conflict?: 'malformed-receipt' | 'sprint-mismatch';
}

function isTerminalReceipt(value: unknown): value is SprintTerminalReceiptV1 {
  if (typeof value !== 'object' || value === null) return false;
  const receipt = value as Record<string, unknown>;
  return receipt.version === SPRINT_TERMINAL_PUBLICATION_VERSION
    && typeof receipt.sprintId === 'string'
    && typeof receipt.runId === 'string'
    && typeof receipt.coordinatorGeneration === 'number'
    && typeof receipt.logicalSettlementDigest === 'string'
    && typeof receipt.priorAuthorityVersion === 'number'
    && typeof receipt.authorityVersion === 'number';
}

function readTerminalReceipt(
  root: string,
  sprintId: string | null,
): {
  readonly receipt: SprintTerminalReceiptV1 | null;
  readonly conflict?: TerminalPublicationStatus['conflict'];
} {
  if (!sprintId) return { receipt: null };
  const receiptPath = join(
    root, DECKENT_DIR, 'recently-works', `${sprintId}-terminal-receipt.json`,
  );
  if (!existsSync(receiptPath)) return { receipt: null };
  try {
    const parsed: unknown = JSON.parse(readFileSync(receiptPath, 'utf-8'));
    const candidate = typeof parsed === 'object' && parsed !== null && 'receipt' in parsed
      ? (parsed as { readonly receipt: unknown }).receipt
      : parsed;
    if (!isTerminalReceipt(candidate)) return { receipt: null, conflict: 'malformed-receipt' };
    if (candidate.sprintId !== sprintId) return { receipt: null, conflict: 'sprint-mismatch' };
    return { receipt: candidate };
  } catch {
    return { receipt: null, conflict: 'malformed-receipt' };
  }
}

/** Shared CLI/MCP receipt projection; lifecycle and receipt are never re-inferred. */
export function projectTerminalPublicationStatus(
  root: string,
  authority: CanonicalRunStatus,
): TerminalPublicationStatus {
  const terminalReceipt = readTerminalReceipt(root, authority.sprintId);
  if (terminalReceipt.conflict) {
    return {
      version: SPRINT_TERMINAL_PUBLICATION_VERSION,
      state: 'receipt-conflict',
      receipt: null,
      conflict: terminalReceipt.conflict,
    };
  }
  if (terminalReceipt.receipt) {
    return {
      version: SPRINT_TERMINAL_PUBLICATION_VERSION,
      state: 'receipt-observed',
      receipt: terminalReceipt.receipt,
    };
  }
  return {
    version: SPRINT_TERMINAL_PUBLICATION_VERSION,
    state: authority.lifecycle === 'COMPLETE' || authority.lifecycle === 'ABORTED'
      ? 'terminal-authority-observed'
      : 'open',
    receipt: null,
  };
}
