export const SPRINT_TERMINAL_PUBLICATION_VERSION = 1 as const;

export type SprintTerminalPublicationVersion =
  typeof SPRINT_TERMINAL_PUBLICATION_VERSION;

export interface SprintTerminalPublicationAuthorityV1 {
  readonly version: SprintTerminalPublicationVersion;
  readonly sprintId: string;
  readonly runId: string;
  readonly coordinatorGeneration: number;
  readonly authorityVersion: number;
}

export interface SprintTerminalPublicationCommandV1 {
  readonly version: SprintTerminalPublicationVersion;
  readonly sprintId: string;
  readonly runId: string;
  readonly coordinatorGeneration: number;
  readonly logicalSettlementDigest: string;
  readonly priorAuthorityVersion: number;
}

export interface SprintTerminalReceiptV1 extends SprintTerminalPublicationCommandV1 {
  readonly authorityVersion: number;
}

export interface SprintTerminalPublicationStateV1
  extends SprintTerminalPublicationAuthorityV1 {
  readonly receipt: SprintTerminalReceiptV1 | null;
}

export type SprintTerminalPublicationHoldReason =
  | 'foreign_ownership'
  | 'stale_generation'
  | 'generation_conflict'
  | 'authority_version_conflict'
  | 'terminal_payload_conflict';

export interface SprintTerminalPublicationPublished {
  readonly decision: 'published';
  readonly state: SprintTerminalPublicationStateV1;
  readonly receipt: SprintTerminalReceiptV1;
}

export interface SprintTerminalPublicationIdempotent {
  readonly decision: 'idempotent';
  readonly state: SprintTerminalPublicationStateV1;
  readonly receipt: SprintTerminalReceiptV1;
}

export interface SprintTerminalPublicationHeld {
  readonly decision: 'hold';
  readonly reasonCode: SprintTerminalPublicationHoldReason;
  readonly state: SprintTerminalPublicationStateV1;
  readonly receipt: SprintTerminalReceiptV1 | null;
}

export type SprintTerminalPublicationResult =
  | SprintTerminalPublicationPublished
  | SprintTerminalPublicationIdempotent
  | SprintTerminalPublicationHeld;

export type SprintTerminalPublicationContractErrorCode =
  | 'INVALID_IDENTITY'
  | 'INVALID_GENERATION'
  | 'INVALID_AUTHORITY_VERSION'
  | 'INVALID_SETTLEMENT_DIGEST'
  | 'INVALID_RECEIPT';

export class SprintTerminalPublicationContractError extends Error {
  constructor(readonly code: SprintTerminalPublicationContractErrorCode) {
    super(code);
    this.name = 'SprintTerminalPublicationContractError';
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

function assertIdentity(value: string): void {
  if (!value || value !== value.trim() || value.length > 512
    || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new SprintTerminalPublicationContractError('INVALID_IDENTITY');
  }
}

function assertGeneration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SprintTerminalPublicationContractError('INVALID_GENERATION');
  }
}

function assertAuthorityVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SprintTerminalPublicationContractError('INVALID_AUTHORITY_VERSION');
  }
}

function assertDigest(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new SprintTerminalPublicationContractError('INVALID_SETTLEMENT_DIGEST');
  }
}

function freezeReceipt(
  receipt: SprintTerminalReceiptV1,
): SprintTerminalReceiptV1 {
  return Object.freeze({ ...receipt });
}

function freezeState(
  state: SprintTerminalPublicationStateV1,
): SprintTerminalPublicationStateV1 {
  return Object.freeze({
    ...state,
    receipt: state.receipt === null ? null : freezeReceipt(state.receipt),
  });
}

function assertAuthority(authority: SprintTerminalPublicationAuthorityV1): void {
  if (authority.version !== SPRINT_TERMINAL_PUBLICATION_VERSION) {
    throw new SprintTerminalPublicationContractError('INVALID_AUTHORITY_VERSION');
  }
  assertIdentity(authority.sprintId);
  assertIdentity(authority.runId);
  assertGeneration(authority.coordinatorGeneration);
  assertAuthorityVersion(authority.authorityVersion);
}

function assertCommand(command: SprintTerminalPublicationCommandV1): void {
  if (command.version !== SPRINT_TERMINAL_PUBLICATION_VERSION) {
    throw new SprintTerminalPublicationContractError('INVALID_AUTHORITY_VERSION');
  }
  assertIdentity(command.sprintId);
  assertIdentity(command.runId);
  assertGeneration(command.coordinatorGeneration);
  assertAuthorityVersion(command.priorAuthorityVersion);
  assertDigest(command.logicalSettlementDigest);
}

function sameCommand(
  receipt: SprintTerminalReceiptV1,
  command: SprintTerminalPublicationCommandV1,
): boolean {
  return receipt.version === command.version
    && receipt.sprintId === command.sprintId
    && receipt.runId === command.runId
    && receipt.coordinatorGeneration === command.coordinatorGeneration
    && receipt.logicalSettlementDigest === command.logicalSettlementDigest
    && receipt.priorAuthorityVersion === command.priorAuthorityVersion;
}

function assertReceiptMatchesState(state: SprintTerminalPublicationStateV1): void {
  const receipt = state.receipt;
  if (receipt === null) return;
  assertCommand(receipt);
  assertAuthorityVersion(receipt.authorityVersion);
  if (receipt.sprintId !== state.sprintId
    || receipt.runId !== state.runId
    || receipt.coordinatorGeneration !== state.coordinatorGeneration
    || receipt.authorityVersion !== state.authorityVersion
    || receipt.authorityVersion !== receipt.priorAuthorityVersion + 1) {
    throw new SprintTerminalPublicationContractError('INVALID_RECEIPT');
  }
}

/**
 * Creates an immutable, unpublished authority snapshot. Persistence remains a
 * caller concern so the same contract works across every runtime adapter.
 */
export function createSprintTerminalPublicationState(
  authority: SprintTerminalPublicationAuthorityV1,
): SprintTerminalPublicationStateV1 {
  assertAuthority(authority);
  return freezeState({ ...authority, receipt: null });
}

/**
 * Applies the terminal receipt CAS without time, process, filesystem, or UI
 * authority. The returned state is a new immutable value; the input is never
 * mutated.
 */
export function transitionSprintTerminalPublication(
  current: SprintTerminalPublicationStateV1,
  command: SprintTerminalPublicationCommandV1,
): SprintTerminalPublicationResult {
  assertAuthority(current);
  assertReceiptMatchesState(current);
  assertCommand(command);

  const state = freezeState(current);
  const hold = (
    reasonCode: SprintTerminalPublicationHoldReason,
  ): SprintTerminalPublicationHeld => Object.freeze({
    decision: 'hold',
    reasonCode,
    state,
    receipt: state.receipt,
  });

  if (command.sprintId !== state.sprintId || command.runId !== state.runId) {
    return hold('foreign_ownership');
  }
  if (command.coordinatorGeneration < state.coordinatorGeneration) {
    return hold('stale_generation');
  }
  if (command.coordinatorGeneration > state.coordinatorGeneration) {
    return hold('generation_conflict');
  }

  if (state.receipt !== null) {
    if (!sameCommand(state.receipt, command)) {
      return hold('terminal_payload_conflict');
    }
    return Object.freeze({
      decision: 'idempotent',
      state,
      receipt: state.receipt,
    });
  }

  if (command.priorAuthorityVersion !== state.authorityVersion) {
    return hold('authority_version_conflict');
  }

  const receipt = freezeReceipt({
    ...command,
    authorityVersion: command.priorAuthorityVersion + 1,
  });
  const publishedState = freezeState({
    ...state,
    authorityVersion: receipt.authorityVersion,
    receipt,
  });
  return Object.freeze({
    decision: 'published',
    state: publishedState,
    receipt: publishedState.receipt!,
  });
}
