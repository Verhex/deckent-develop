import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR } from './constants.js';
import type { CanonicalRunStatus } from './run-status-authority.js';
import {
  readSprintTerminalReceiptSummary,
  type TerminalPublicationStatus,
} from './sprint-terminal-publication-status.js';
import type { SprintTerminalReceiptV1 } from './sprint-terminal-publication.js';

export const SPRINT_STATUS_RECOVERY_RECONCILIATION_VERSION = 1 as const;

export type SprintStatusRecoveryMismatch =
  | 'projection-stale'
  | 'checkpoint-missing'
  | 'successor-available';

export type SprintStatusRecoveryCommandKind = 'recover' | 'resume' | 'finalize';

export interface SprintStatusRecoveryRemediation {
  readonly kind: SprintStatusRecoveryCommandKind;
  readonly command: string;
}

export interface SprintStatusRecoveryEvidence {
  readonly checkpointPresent: boolean;
  readonly terminalReceipt: SprintTerminalReceiptV1 | null;
  readonly terminalReceiptConflict: TerminalPublicationStatus['conflict'] | null;
}

interface SprintStatusRecoveryBase {
  readonly version: typeof SPRINT_STATUS_RECOVERY_RECONCILIATION_VERSION;
  readonly sprintId: string | null;
  readonly evidence: SprintStatusRecoveryEvidence;
}

export interface SprintStatusRecoveryConsistent extends SprintStatusRecoveryBase {
  readonly state: 'consistent';
  readonly mismatch: null;
  readonly remediation: SprintStatusRecoveryRemediation | null;
}

export interface SprintStatusRecoveryInconsistent extends SprintStatusRecoveryBase {
  readonly state: 'inconsistent';
  readonly mismatch: SprintStatusRecoveryMismatch;
  readonly remediation: SprintStatusRecoveryRemediation;
}

export type SprintStatusRecoveryReconciliation =
  | SprintStatusRecoveryConsistent
  | SprintStatusRecoveryInconsistent;

export interface SprintStatusRecoveryReconciliationInput {
  readonly authority: Pick<CanonicalRunStatus, 'lifecycle' | 'sprintId'>;
  readonly evidence: SprintStatusRecoveryEvidence;
}

function remediation(
  sprintId: string,
  kind: SprintStatusRecoveryCommandKind,
): SprintStatusRecoveryRemediation {
  switch (kind) {
    case 'recover':
      return Object.freeze({ kind, command: `deckent recover ${sprintId}` });
    case 'resume':
      return Object.freeze({ kind, command: `deckent recover ${sprintId} --resume` });
    case 'finalize':
      return Object.freeze({ kind, command: `deckent finalize --sprint ${sprintId} --force` });
  }
}

/**
 * Reconciles an already-read status projection with durable recovery evidence.
 * It is deliberately a projection only: no repair, archive, or cleanup is
 * performed while status is being read.
 */
export function reconcileSprintStatusRecovery(
  input: SprintStatusRecoveryReconciliationInput,
): SprintStatusRecoveryReconciliation {
  const { authority, evidence } = input;
  const base = {
    version: SPRINT_STATUS_RECOVERY_RECONCILIATION_VERSION,
    sprintId: authority.sprintId,
    evidence: Object.freeze({ ...evidence }),
  } as const;

  if (authority.lifecycle !== 'PAUSED' || authority.sprintId === null) {
    return Object.freeze({ ...base, state: 'consistent', mismatch: null, remediation: null });
  }

  if (evidence.terminalReceipt !== null && evidence.checkpointPresent) {
    return Object.freeze({
      ...base,
      state: 'inconsistent',
      mismatch: 'successor-available',
      remediation: remediation(authority.sprintId, 'finalize'),
    });
  }

  if (evidence.terminalReceipt !== null || evidence.terminalReceiptConflict !== null) {
    return Object.freeze({
      ...base,
      state: 'inconsistent',
      mismatch: 'projection-stale',
      remediation: remediation(authority.sprintId, 'finalize'),
    });
  }

  if (!evidence.checkpointPresent) {
    return Object.freeze({
      ...base,
      state: 'inconsistent',
      mismatch: 'checkpoint-missing',
      remediation: remediation(authority.sprintId, 'recover'),
    });
  }

  return Object.freeze({
    ...base,
    state: 'consistent',
    mismatch: null,
    remediation: remediation(authority.sprintId, 'resume'),
  });
}

/** Side-effect-free filesystem adapter for the recovery reconciliation model. */
export function readSprintStatusRecoveryReconciliation(
  projectRoot: string,
  authority: Pick<CanonicalRunStatus, 'lifecycle' | 'sprintId'>,
): SprintStatusRecoveryReconciliation {
  const sprintId = authority.sprintId;
  const terminal = readSprintTerminalReceiptSummary(projectRoot, sprintId);
  return reconcileSprintStatusRecovery({
    authority,
    evidence: {
      checkpointPresent: sprintId !== null
        && existsSync(join(projectRoot, DECKENT_DIR, `${sprintId}-checkpoint.json`)),
      terminalReceipt: terminal.receipt,
      terminalReceiptConflict: terminal.conflict ?? null,
    },
  });
}
