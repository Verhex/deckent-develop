/**
 * The billing authority for a dynamic FIX belongs to its logical root task,
 * rather than to the mutable sprint task array that may not contain the FIX.
 */
export type LineageBillingAuthority =
  | 'metered'
  | 'subscription'
  | 'local'
  | 'free-tier'
  | 'unknown'
  | 'hybrid';

export interface LineageUsageAuthorityTask {
  readonly id: string;
  readonly billingAuthority: LineageBillingAuthority;
}

export interface LineageUsageAttempt {
  /** Immutable execution-attempt identity. */
  readonly id: string;
  /** The task that owns this attempt. */
  readonly taskId: string;
  /** Direct parent task for a dynamically generated FIX. */
  readonly fixForTaskId?: string;
  /** Durable root identity when the parent task is no longer present. */
  readonly logicalRootTaskId?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /** Provider-reported or calculated reference value; never an invoice. */
  readonly referenceCostUsd: number;
  /** Exact metered invoice value, when the settlement authority recorded one. */
  readonly invoicedCostUsd?: number;
}

export interface LineageUsageAuthorityInput {
  /** Original sprint tasks; dynamically generated FIX tasks may be absent. */
  readonly tasks: readonly LineageUsageAuthorityTask[];
  /** Every settled attempt, including dynamically generated FIX attempts. */
  readonly attempts: readonly LineageUsageAttempt[];
}

export interface AggregatedAttemptTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export type LineageBilledUsd =
  | { readonly state: 'known'; readonly usd: number }
  | {
    readonly state: 'unknown';
    readonly reason:
      | 'missing-logical-root'
      | 'unknown-billing-authority'
      | 'hybrid-billing-authority'
      | 'missing-metered-invoice';
  };

export interface LineageUsageAuthorityAggregate {
  readonly logicalRootTaskId: string;
  readonly billingAuthority: LineageBillingAuthority | null;
  /** Input order is retained so every contributing attempt remains auditable. */
  readonly attempts: readonly LineageUsageAttempt[];
  readonly tokenUsage: AggregatedAttemptTokenUsage;
  /** Sum of reference values, intentionally separate from billed USD. */
  readonly referenceCostUsd: number;
  readonly billedUsd: LineageBilledUsd;
}

function resolveLogicalRootTaskId(
  attempt: LineageUsageAttempt,
  attemptsByTaskId: ReadonlyMap<string, LineageUsageAttempt>,
): string {
  if (attempt.logicalRootTaskId) return attempt.logicalRootTaskId;

  let parentTaskId = attempt.fixForTaskId;
  const visitedTaskIds = new Set<string>([attempt.taskId]);
  while (parentTaskId) {
    if (visitedTaskIds.has(parentTaskId)) return attempt.taskId;
    visitedTaskIds.add(parentTaskId);

    const parentAttempt = attemptsByTaskId.get(parentTaskId);
    if (!parentAttempt) return parentTaskId;
    if (parentAttempt.logicalRootTaskId) return parentAttempt.logicalRootTaskId;
    parentTaskId = parentAttempt.fixForTaskId;
    if (!parentTaskId) return parentAttempt.taskId;
  }
  return attempt.taskId;
}

function billedUsdFor(
  authority: LineageBillingAuthority | null,
  attempts: readonly LineageUsageAttempt[],
): LineageBilledUsd {
  if (authority === null) {
    return Object.freeze({ state: 'unknown', reason: 'missing-logical-root' });
  }
  if (authority === 'unknown') {
    return Object.freeze({ state: 'unknown', reason: 'unknown-billing-authority' });
  }
  if (authority === 'hybrid') {
    return Object.freeze({ state: 'unknown', reason: 'hybrid-billing-authority' });
  }
  if (authority === 'subscription' || authority === 'local' || authority === 'free-tier') {
    return Object.freeze({ state: 'known', usd: 0 });
  }

  if (attempts.some(attempt => attempt.invoicedCostUsd === undefined)) {
    return Object.freeze({ state: 'unknown', reason: 'missing-metered-invoice' });
  }
  return Object.freeze({
    state: 'known',
    usd: attempts.reduce((total, attempt) => total + attempt.invoicedCostUsd!, 0),
  });
}

/**
 * Aggregate all attempts by their logical root without inferring billing from
 * provider names, reference prices, or the presence of dynamic FIX task files.
 */
export function aggregateLineageUsageAuthority(
  input: LineageUsageAuthorityInput,
): readonly LineageUsageAuthorityAggregate[] {
  const tasksById = new Map(input.tasks.map(task => [task.id, task]));
  const attemptsByTaskId = new Map(input.attempts.map(attempt => [attempt.taskId, attempt]));
  const attemptsByRootId = new Map<string, LineageUsageAttempt[]>();

  for (const attempt of input.attempts) {
    const rootTaskId = resolveLogicalRootTaskId(attempt, attemptsByTaskId);
    const lineageAttempts = attemptsByRootId.get(rootTaskId) ?? [];
    lineageAttempts.push(attempt);
    attemptsByRootId.set(rootTaskId, lineageAttempts);
  }

  return Object.freeze([...attemptsByRootId.entries()].map(([logicalRootTaskId, attempts]) => {
    const billingAuthority = tasksById.get(logicalRootTaskId)?.billingAuthority ?? null;
    const tokenUsage = Object.freeze(attempts.reduce<AggregatedAttemptTokenUsage>(
      (total, attempt) => ({
        inputTokens: total.inputTokens + attempt.inputTokens,
        outputTokens: total.outputTokens + attempt.outputTokens,
        cacheReadTokens: total.cacheReadTokens + attempt.cacheReadTokens,
        cacheCreationTokens: total.cacheCreationTokens + attempt.cacheCreationTokens,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    ));

    return Object.freeze({
      logicalRootTaskId,
      billingAuthority,
      attempts: Object.freeze([...attempts]),
      tokenUsage,
      referenceCostUsd: attempts.reduce((total, attempt) => total + attempt.referenceCostUsd, 0),
      billedUsd: billedUsdFor(billingAuthority, attempts),
    });
  }));
}
