export type LogicalProgressStatus = 'done' | 'active' | 'blocked';

/** One execution attempt. A FIX points at the attempt it repairs. */
export interface LogicalProgressAttempt {
  /** Stable producer-assigned identity shared by every attempt in a repair lineage. */
  readonly logicalTaskId: string;
  /** Exact execution identity. Opaque: its contents never encode logical identity. */
  readonly id: string;
  readonly status: LogicalProgressStatus;
  readonly fixForAttemptId?: string;
  /** Optional producer sequence used only to choose the current attempt in a lineage. */
  readonly sequence?: number;
}

/**
 * A total must describe logical tasks. Supplying a raw-attempt denominator is
 * explicitly rejected, even when it happens to equal the logical total.
 */
export type LogicalProgressDenominator =
  | { readonly kind: 'logical-task'; readonly total: number }
  | { readonly kind: 'attempt'; readonly total: number };

/** @deprecated Producers must supply `LogicalProgressAttempt.logicalTaskId`. */
interface LegacyLogicalProgressAttempt extends Omit<LogicalProgressAttempt, 'logicalTaskId'> {
  readonly logicalTaskId?: never;
}

export interface LogicalProgressProjectionInput {
  readonly attempts: readonly (LogicalProgressAttempt | LegacyLogicalProgressAttempt)[];
  readonly denominator?: LogicalProgressDenominator;
}

export interface LogicalProgressLineage {
  readonly logicalTaskId: string;
  readonly attemptIds: readonly string[];
  readonly attemptCount: number;
  readonly status: LogicalProgressStatus;
}

export interface LogicalProgressProjection {
  readonly done: number;
  readonly active: number;
  readonly blocked: number;
  readonly total: number;
  /** Raw execution attempts; intentionally distinct from `total`. */
  readonly attemptCount: number;
  readonly lineages: readonly LogicalProgressLineage[];
}

export type LogicalProgressProjectionResult =
  | { readonly ok: true; readonly projection: LogicalProgressProjection }
  | {
    readonly ok: false;
    readonly diagnostic:
      | 'duplicate-attempt-id'
      | 'invalid-logical-task-id'
      | 'conflicting-logical-task-id'
      | 'invalid-logical-denominator'
      | 'mixed-denominator-attempts'
      | 'mixed-denominator-total';
  };

function hasCanonicalIdentity(
  attempt: LogicalProgressAttempt | LegacyLogicalProgressAttempt,
): attempt is LogicalProgressAttempt {
  return typeof attempt.logicalTaskId === 'string' && attempt.logicalTaskId.length > 0;
}

function attemptDepth(
  attempt: LogicalProgressAttempt,
  attemptsById: ReadonlyMap<string, LogicalProgressAttempt>,
): number {
  let depth = 0;
  let current = attempt;
  const seen = new Set<string>([attempt.id]);
  while (current.fixForAttemptId) {
    const parent = attemptsById.get(current.fixForAttemptId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
    depth += 1;
  }
  return depth;
}

function compareAttempts(
  left: LogicalProgressAttempt,
  right: LogicalProgressAttempt,
  attemptsById: ReadonlyMap<string, LogicalProgressAttempt>,
): number {
  const depthDelta = attemptDepth(left, attemptsById) - attemptDepth(right, attemptsById);
  if (depthDelta !== 0) return depthDelta;
  const sequenceDelta = (left.sequence ?? 0) - (right.sequence ?? 0);
  return sequenceDelta !== 0 ? sequenceDelta : left.id.localeCompare(right.id);
}

/**
 * Fold original/FIX/FIX-FIX attempts into logical task lineages.
 *
 * This returns a typed diagnostic rather than substituting or clamping an
 * incompatible denominator. Every accepted lineage contributes exactly once,
 * so `0 <= done + active + blocked <= total` holds by construction.
 */
export function projectLogicalProgress(
  input: LogicalProgressProjectionInput,
): LogicalProgressProjectionResult {
  const attemptsById = new Map<string, LogicalProgressAttempt>();
  for (const attempt of input.attempts) {
    if (!hasCanonicalIdentity(attempt)) {
      return { ok: false, diagnostic: 'invalid-logical-task-id' };
    }
    if (attemptsById.has(attempt.id)) {
      return { ok: false, diagnostic: 'duplicate-attempt-id' };
    }
    attemptsById.set(attempt.id, attempt);
  }

  for (const attempt of attemptsById.values()) {
    if (!attempt.fixForAttemptId) continue;
    const repairedAttempt = attemptsById.get(attempt.fixForAttemptId);
    if (repairedAttempt && repairedAttempt.logicalTaskId !== attempt.logicalTaskId) {
      return { ok: false, diagnostic: 'conflicting-logical-task-id' };
    }
  }

  if (input.denominator?.kind === 'attempt') {
    return { ok: false, diagnostic: 'mixed-denominator-attempts' };
  }

  if (
    input.denominator
    && (!Number.isSafeInteger(input.denominator.total) || input.denominator.total < 0)
  ) {
    return { ok: false, diagnostic: 'invalid-logical-denominator' };
  }

  const grouped = new Map<string, LogicalProgressAttempt[]>();
  for (const attempt of attemptsById.values()) {
    const { logicalTaskId } = attempt;
    const lineage = grouped.get(logicalTaskId) ?? [];
    lineage.push(attempt);
    grouped.set(logicalTaskId, lineage);
  }

  const lineages = [...grouped.entries()]
    .map(([logicalTaskId, attempts]) => {
      const sorted = [...attempts].sort(
        (left, right) => compareAttempts(left, right, attemptsById),
      );
      const current = sorted.at(-1)!;
      return Object.freeze({
        logicalTaskId,
        attemptIds: Object.freeze(sorted.map(attempt => attempt.id)),
        attemptCount: sorted.length,
        status: current.status,
      });
    })
    .sort((left, right) => left.logicalTaskId.localeCompare(right.logicalTaskId));

  if (input.denominator && input.denominator.total !== lineages.length) {
    return { ok: false, diagnostic: 'mixed-denominator-total' };
  }

  let done = 0;
  let active = 0;
  let blocked = 0;
  for (const lineage of lineages) {
    if (lineage.status === 'done') done += 1;
    else if (lineage.status === 'active') active += 1;
    else blocked += 1;
  }

  return {
    ok: true,
    projection: Object.freeze({
      done,
      active,
      blocked,
      total: lineages.length,
      attemptCount: input.attempts.length,
      lineages: Object.freeze(lineages),
    }),
  };
}
