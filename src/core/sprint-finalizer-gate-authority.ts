import { createHash } from 'node:crypto';

export const SPRINT_FINALIZER_GATE_AUTHORITY_VERSION = 1 as const;

export type SprintFinalizerGateOutcome = 'PASS' | 'FAIL';

export interface SprintFinalizerGateInput {
  readonly runId: string;
  readonly generation: number;
  readonly taskSetDigest: string;
  readonly attemptWinners: Readonly<Record<string, string>>;
  readonly codeDigest: string;
  readonly configDigest: string;
  readonly observedAt: string;
}

export interface SprintFinalizerGateReceipt {
  readonly version: typeof SPRINT_FINALIZER_GATE_AUTHORITY_VERSION;
  readonly input: SprintFinalizerGateInput;
  readonly inputDigest: string;
  readonly outcome: SprintFinalizerGateOutcome;
  readonly priorRevision: number;
  readonly revision: number;
}

export interface SprintFinalizerGateInvalidationReceipt {
  readonly version: typeof SPRINT_FINALIZER_GATE_AUTHORITY_VERSION;
  readonly kind: 'sprint-finalizer-gate-invalidation';
  readonly invalidatedInputDigest: string;
  readonly replacementInputDigest: string;
  readonly reason: 'INPUT_CHANGED';
  readonly observedAt: string;
  readonly priorRevision: number;
  readonly revision: number;
}

export interface SprintFinalizerGateAuthority {
  readonly version: typeof SPRINT_FINALIZER_GATE_AUTHORITY_VERSION;
  readonly sprintId: string;
  readonly revision: number;
  readonly gate: SprintFinalizerGateReceipt | null;
  readonly archivedGates: readonly SprintFinalizerGateReceipt[];
  readonly invalidations: readonly SprintFinalizerGateInvalidationReceipt[];
}

export type SprintFinalizerGateHoldReason =
  | 'revision-conflict'
  | 'stale-input'
  | 'gate-conflict'
  | 'input-digest-mismatch';

export type SprintFinalizerGatePublishResult =
  | { readonly decision: 'published' | 'idempotent'; readonly state: SprintFinalizerGateAuthority; readonly receipt: SprintFinalizerGateReceipt }
  | { readonly decision: 'hold'; readonly reasonCode: SprintFinalizerGateHoldReason; readonly state: SprintFinalizerGateAuthority };

export type SprintFinalizerGateInvalidationResult =
  | { readonly decision: 'invalidated'; readonly state: SprintFinalizerGateAuthority; readonly receipt: SprintFinalizerGateInvalidationReceipt }
  | { readonly decision: 'hold'; readonly reasonCode: 'revision-conflict' | 'no-current-gate' | 'input-digest-mismatch'; readonly state: SprintFinalizerGateAuthority };

export type SprintFinalizerGateResolution =
  | { readonly decision: 'authoritative'; readonly receipt: SprintFinalizerGateReceipt }
  | { readonly decision: 'not-authoritative'; readonly reasonCode: 'no-current-gate' | 'stale-input'; readonly archivedEvidence: readonly SprintFinalizerGateReceipt[] };

export class SprintFinalizerGateContractError extends Error {
  constructor(readonly code: 'INVALID_IDENTITY' | 'INVALID_GENERATION' | 'INVALID_DIGEST' | 'INVALID_TIMESTAMP' | 'INVALID_REVISION' | 'INVALID_WINNERS') {
    super(code);
    this.name = 'SprintFinalizerGateContractError';
  }
}

const DIGEST = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function identity(value: string): void {
  if (!value || value !== value.trim() || value.length > 512 || CONTROL.test(value)) throw new SprintFinalizerGateContractError('INVALID_IDENTITY');
}
function digest(value: string): void {
  if (!DIGEST.test(value)) throw new SprintFinalizerGateContractError('INVALID_DIGEST');
}
function revision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new SprintFinalizerGateContractError('INVALID_REVISION');
}
function timestamp(value: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new SprintFinalizerGateContractError('INVALID_TIMESTAMP');
}

function validatedInput(value: SprintFinalizerGateInput): SprintFinalizerGateInput {
  identity(value.runId);
  if (!Number.isSafeInteger(value.generation) || value.generation < 1) throw new SprintFinalizerGateContractError('INVALID_GENERATION');
  digest(value.taskSetDigest); digest(value.codeDigest); digest(value.configDigest); timestamp(value.observedAt);
  if (typeof value.attemptWinners !== 'object' || value.attemptWinners === null || Array.isArray(value.attemptWinners)) throw new SprintFinalizerGateContractError('INVALID_WINNERS');
  const winners: Record<string, string> = {};
  for (const key of Object.keys(value.attemptWinners).sort()) {
    identity(key); identity(value.attemptWinners[key]!); winners[key] = value.attemptWinners[key]!;
  }
  return Object.freeze({ ...value, attemptWinners: Object.freeze(winners) });
}

/** Digest of every fact whose change requires the finalizer checks to run again. */
export function deriveSprintFinalizerGateInputDigest(input: SprintFinalizerGateInput): string {
  const value = validatedInput(input);
  return createHash('sha256').update(JSON.stringify([
    value.runId, value.generation, value.taskSetDigest,
    Object.entries(value.attemptWinners), value.codeDigest, value.configDigest, value.observedAt,
  ])).digest('hex');
}

function frozenState(state: SprintFinalizerGateAuthority): SprintFinalizerGateAuthority {
  return Object.freeze({ ...state, archivedGates: Object.freeze([...state.archivedGates]), invalidations: Object.freeze([...state.invalidations]) });
}

export function createSprintFinalizerGateAuthority(sprintId: string, initialRevision = 0): SprintFinalizerGateAuthority {
  identity(sprintId); revision(initialRevision);
  return frozenState({ version: 1, sprintId, revision: initialRevision, gate: null, archivedGates: [], invalidations: [] });
}

export function publishSprintFinalizerGate(current: SprintFinalizerGateAuthority, command: {
  readonly input: SprintFinalizerGateInput;
  readonly inputDigest: string;
  readonly outcome: SprintFinalizerGateOutcome;
  readonly expectedRevision: number;
}): SprintFinalizerGatePublishResult {
  revision(current.revision); revision(command.expectedRevision); digest(command.inputDigest);
  const input = validatedInput(command.input);
  const calculated = deriveSprintFinalizerGateInputDigest(input);
  const state = frozenState(current);
  const hold = (reasonCode: SprintFinalizerGateHoldReason): SprintFinalizerGatePublishResult => Object.freeze({ decision: 'hold', reasonCode, state });
  if (calculated !== command.inputDigest) return hold('input-digest-mismatch');
  if (state.gate !== null) {
    if (state.gate.inputDigest !== calculated) return hold('stale-input');
    if (state.gate.outcome !== command.outcome) return hold('gate-conflict');
    return Object.freeze({ decision: 'idempotent', state, receipt: state.gate });
  }
  if (command.expectedRevision !== state.revision) return hold('revision-conflict');
  const receipt = Object.freeze({ version: 1 as const, input, inputDigest: calculated, outcome: command.outcome, priorRevision: state.revision, revision: state.revision + 1 });
  const next = frozenState({ ...state, revision: receipt.revision, gate: receipt });
  return Object.freeze({ decision: 'published', state: next, receipt });
}

/** CAS-invalidates the current winner, retaining it solely as archived evidence. */
export function invalidateSprintFinalizerGate(current: SprintFinalizerGateAuthority, command: {
  readonly expectedRevision: number;
  readonly invalidatedInputDigest: string;
  readonly replacementInputDigest: string;
  readonly observedAt: string;
}): SprintFinalizerGateInvalidationResult {
  revision(command.expectedRevision); digest(command.invalidatedInputDigest); digest(command.replacementInputDigest); timestamp(command.observedAt);
  const state = frozenState(current);
  const hold = (reasonCode: 'revision-conflict' | 'no-current-gate' | 'input-digest-mismatch'): SprintFinalizerGateInvalidationResult => Object.freeze({ decision: 'hold', reasonCode, state });
  if (command.expectedRevision !== state.revision) return hold('revision-conflict');
  if (state.gate === null) return hold('no-current-gate');
  if (state.gate.inputDigest !== command.invalidatedInputDigest || command.replacementInputDigest === command.invalidatedInputDigest) return hold('input-digest-mismatch');
  const receipt = Object.freeze({ version: 1 as const, kind: 'sprint-finalizer-gate-invalidation' as const, invalidatedInputDigest: command.invalidatedInputDigest, replacementInputDigest: command.replacementInputDigest, reason: 'INPUT_CHANGED' as const, observedAt: command.observedAt, priorRevision: state.revision, revision: state.revision + 1 });
  const next = frozenState({ ...state, revision: receipt.revision, gate: null, archivedGates: [...state.archivedGates, state.gate], invalidations: [...state.invalidations, receipt] });
  return Object.freeze({ decision: 'invalidated', state: next, receipt });
}

/** A persisted gate is terminal authority only for the exact current input digest. */
export function resolveSprintFinalizerGate(state: SprintFinalizerGateAuthority, input: SprintFinalizerGateInput): SprintFinalizerGateResolution {
  const inputDigest = deriveSprintFinalizerGateInputDigest(input);
  if (state.gate === null) return Object.freeze({ decision: 'not-authoritative', reasonCode: 'no-current-gate', archivedEvidence: state.archivedGates });
  if (state.gate.inputDigest !== inputDigest) return Object.freeze({ decision: 'not-authoritative', reasonCode: 'stale-input', archivedEvidence: Object.freeze([...state.archivedGates, state.gate]) });
  return Object.freeze({ decision: 'authoritative', receipt: state.gate });
}
