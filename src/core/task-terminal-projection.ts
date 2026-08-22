/**
 * Terminal truth for one logical task.  This module deliberately consumes
 * explicit identities only: filenames, timestamps and observation order are
 * not evidence of either freshness or attempt ownership.
 */
export type TaskTerminalKind =
  | 'DONE'
  | 'NO_GO'
  | 'ABORTED'
  | 'CASCADE_SKIPPED'
  | 'NEVER_DISPATCHED';

export interface TaskTerminalProjection {
  readonly logicalTaskId: string;
  readonly generation: number;
  readonly winnerAttemptId: string | null;
  readonly terminal: TaskTerminalKind | null;
  /** Task-JSON compatibility fields; the discriminant above remains canonical. */
  readonly status: 'DONE' | 'NO_GO' | 'ABORTED' | null;
  readonly cascadeSkipped: boolean;
  readonly neverDispatched: boolean;
}

interface TaskTerminalEvidenceBase {
  readonly logicalTaskId: string;
  readonly generation: number;
}

export type TaskTerminalEvidence =
  | (TaskTerminalEvidenceBase & {
      readonly kind: 'attempt-result';
      readonly attemptId: string;
      readonly outcome: 'DONE' | 'NO_GO';
    })
  | (TaskTerminalEvidenceBase & {
      readonly kind: 'gate-terminal';
      readonly attemptId: string | null;
      readonly outcome: 'ABORTED' | 'CASCADE_SKIPPED' | 'NEVER_DISPATCHED';
    });

export type TaskTerminalProjectionHoldReason =
  | 'foreign-logical-task'
  | 'stale-generation'
  | 'foreign-generation'
  | 'non-winning-attempt'
  | 'terminal-conflict';

export type TaskTerminalProjectionResult =
  | { readonly decision: 'applied' | 'idempotent'; readonly projection: TaskTerminalProjection }
  | {
      readonly decision: 'hold';
      readonly reasonCode: TaskTerminalProjectionHoldReason;
      readonly projection: TaskTerminalProjection;
    };

function assertIdentity(value: string): void {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('Task terminal identity must be a non-blank canonical string');
  }
}

function assertGeneration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('Task terminal generation must be a positive safe integer');
  }
}

function freezeProjection(projection: TaskTerminalProjection): TaskTerminalProjection {
  return Object.freeze({ ...projection });
}

/** Create the authority snapshot to which all later evidence must be bound. */
export function createTaskTerminalProjection(input: {
  readonly logicalTaskId: string;
  readonly generation: number;
  readonly winnerAttemptId: string | null;
}): TaskTerminalProjection {
  assertIdentity(input.logicalTaskId);
  assertGeneration(input.generation);
  if (input.winnerAttemptId !== null) assertIdentity(input.winnerAttemptId);
  return freezeProjection({
    ...input,
    terminal: null,
    status: null,
    cascadeSkipped: false,
    neverDispatched: false,
  });
}

function projectedTerminal(
  current: TaskTerminalProjection,
  terminal: TaskTerminalKind,
): TaskTerminalProjection {
  return freezeProjection({
    ...current,
    terminal,
    status: terminal === 'DONE'
      ? 'DONE'
      : terminal === 'ABORTED'
        ? 'ABORTED'
        : 'NO_GO',
    cascadeSkipped: terminal === 'CASCADE_SKIPPED',
    neverDispatched: terminal === 'NEVER_DISPATCHED',
  });
}

/**
 * Pure monotonic reducer for the task JSON terminal projection.
 *
 * A generation mismatch is never adopted, and an attempt-bound observation is
 * accepted only from the preselected winner.  Once terminal, exact replay is
 * idempotent and every contradictory result or gate observation is held.
 */
export function reduceTaskTerminalProjection(
  current: TaskTerminalProjection,
  evidence: TaskTerminalEvidence,
): TaskTerminalProjectionResult {
  assertIdentity(current.logicalTaskId);
  assertGeneration(current.generation);
  assertIdentity(evidence.logicalTaskId);
  assertGeneration(evidence.generation);
  if (evidence.attemptId !== null) assertIdentity(evidence.attemptId);

  const hold = (reasonCode: TaskTerminalProjectionHoldReason): TaskTerminalProjectionResult =>
    Object.freeze({ decision: 'hold', reasonCode, projection: current });

  if (evidence.logicalTaskId !== current.logicalTaskId) return hold('foreign-logical-task');
  if (evidence.generation < current.generation) return hold('stale-generation');
  if (evidence.generation > current.generation) return hold('foreign-generation');
  if (evidence.attemptId !== null && evidence.attemptId !== current.winnerAttemptId) {
    return hold('non-winning-attempt');
  }

  const terminal: TaskTerminalKind = evidence.kind === 'attempt-result'
    ? evidence.outcome
    : evidence.outcome;
  if (current.terminal !== null) {
    return current.terminal === terminal
      ? Object.freeze({ decision: 'idempotent', projection: current })
      : hold('terminal-conflict');
  }

  const projection = projectedTerminal(current, terminal);
  return Object.freeze({ decision: 'applied', projection });
}
