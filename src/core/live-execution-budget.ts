import type { StreamLogEvent } from './log-event.js';
import type { ExecutionBudget } from './work-model.js';

export interface LiveUsageCounters {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  maxContextTokens: number;
}

export interface LiveUsageObservation {
  dedupeKey: string;
  mode: 'incremental' | 'cumulative';
  counts: Omit<LiveUsageCounters, 'turns' | 'totalTokens' | 'maxContextTokens'>;
  contextTokens: number;
  countsAsTurn: boolean;
  /** Provider cumulative turn count, when the final envelope reports one. */
  reportedTurns?: number;
}

export interface LiveBudgetDecision {
  state: 'within-budget' | 'exceeded' | 'unmeasurable';
  reasons: string[];
  counters: LiveUsageCounters;
  observation?: LiveUsageObservation;
}

export interface LiveUsageGuardState {
  version: 1;
  counters: LiveUsageCounters;
  seenDedupeKeys: string[];
  measurableEvents: number;
  incrementalUsageEvents: number;
}

const ZERO_COUNTERS: LiveUsageCounters = {
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalTokens: 0,
  maxContextTokens: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function firstCount(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    if (record[key] !== undefined) return count(record[key]);
  }
  return 0;
}

function usageCounts(usage: Record<string, unknown>): LiveUsageObservation['counts'] {
  const inputTokens = firstCount(usage, 'input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokenCount', 'prompt_eval_count');
  const outputTokens = firstCount(usage, 'output_tokens', 'outputTokens', 'completion_tokens', 'candidatesTokenCount', 'eval_count');
  const cacheReadTokens = firstCount(usage, 'cache_read_input_tokens', 'cacheReadTokens', 'cache_read_tokens', 'cached_input_tokens');
  const cacheCreationTokens = firstCount(usage, 'cache_creation_input_tokens', 'cacheCreationTokens', 'cache_write_tokens');
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}

function hasCounts(counts: LiveUsageObservation['counts']): boolean {
  return counts.inputTokens > 0
    || counts.outputTokens > 0
    || counts.cacheReadTokens > 0
    || counts.cacheCreationTokens > 0;
}

function observationKey(root: Record<string, unknown>, message: Record<string, unknown> | null): string | null {
  const candidates = [
    message?.id,
    root.request_id,
    root.requestId,
    root.turn_id,
    root.turnId,
    root.id,
    root.uuid,
  ];
  const found = candidates.find(value => typeof value === 'string' && value.length > 0);
  return typeof found === 'string' ? found : null;
}

/**
 * Convert a normalized provider stream event into one measured usage sample.
 * Repeated Claude content blocks share `message.id`; that id is the dedupe key.
 * A provider final/result envelope is a cumulative snapshot, not another turn.
 */
export function extractLiveUsageObservation(event: StreamLogEvent): LiveUsageObservation | null {
  let root = asRecord(event.content);
  if (!root) return null;
  // Replay/restart may feed a host-written canonical LogEvent back through the
  // normalizer, producing one extra wrapper level. Unwrap only with the host
  // stamps present; arbitrary nested `content.usage` is not trusted evidence.
  if (
    typeof root.ts === 'string'
    && typeof root.seq === 'number'
    && Number.isInteger(root.seq)
    && root.seq > 0
  ) {
    root = asRecord(root.content) ?? root;
  }
  const message = asRecord(root.message);
  const messageUsage = message ? asRecord(message.usage) : null;
  const directUsage = asRecord(root.usage) ?? asRecord(root.usageMetadata);
  const usage = messageUsage ?? directUsage ?? (
    root.input_tokens !== undefined
      || root.prompt_eval_count !== undefined
      || root.output_tokens !== undefined
      ? root
      : null
  );
  if (!usage) return null;

  const counts = usageCounts(usage);
  if (!hasCounts(counts)) return null;

  const rootType = typeof root.type === 'string' ? root.type : '';
  const isAssistantMessage = rootType === 'assistant' && message !== null;
  const isCumulative = rootType === 'result'
    || rootType === 'turn.completed'
    || rootType === 'response.completed';
  // A session id identifies many calls and is unsafe for incremental dedupe.
  // It is accepted only for the single cumulative/final session snapshot.
  const key = observationKey(root, message)
    ?? (isCumulative && typeof root.session_id === 'string' ? root.session_id : null);
  if (!key) return null;
  const contextTokens = counts.inputTokens + counts.cacheReadTokens + counts.cacheCreationTokens;

  return {
    dedupeKey: `${isCumulative ? 'snapshot' : 'call'}:${key}`,
    mode: isCumulative ? 'cumulative' : 'incremental',
    counts,
    contextTokens,
    countsAsTurn: isAssistantMessage || !isCumulative,
    ...(isCumulative && count(root.num_turns) > 0 ? { reportedTurns: count(root.num_turns) } : {}),
  };
}

/** True when a budget has a ceiling that can stop a stream before final billing. */
export function hasLiveUsageCeiling(budget: ExecutionBudget | undefined): boolean {
  return !!budget && [
    budget.maxTokens,
    budget.maxTurns,
    budget.maxInputTokens,
    budget.maxOutputTokens,
    budget.maxCacheReadTokens,
    budget.maxCacheCreationTokens,
    budget.maxContextTokens,
  ].some(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

export type LiveUsageBudgetSupport = 'measured-stream';

const EXECUTION_BUDGET_FIELDS = new Set<keyof ExecutionBudget>([
  'maxUsd',
  'maxTokens',
  'maxTurns',
  'maxInputTokens',
  'maxOutputTokens',
  'maxCacheReadTokens',
  'maxCacheCreationTokens',
  'maxContextTokens',
]);

/**
 * Validate the owner-supplied execution budget at the last pre-dispatch
 * boundary. Runtime objects may originate in JSON, so TypeScript's structural
 * type is not evidence that unknown keys or empty objects were rejected.
 */
export function assertExecutionBudgetShape(
  budget: ExecutionBudget | undefined,
  executor: string,
  executionCostClass: 'remote' | 'local' = 'remote',
): asserts budget is ExecutionBudget {
  if (executionCostClass === 'local' && budget === undefined) return;
  if (budget === undefined) {
    throw new Error(
      `Remote execution budget is required for executor "${executor}". Spawn blocked before provider work.`,
    );
  }
  if (budget === null || typeof budget !== 'object' || Array.isArray(budget)) {
    throw new Error('Execution budget must be an object. Spawn blocked before provider work.');
  }
  const entries = Object.entries(budget as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error('Execution budget must contain at least one explicit ceiling. Spawn blocked before provider work.');
  }
  for (const [field, value] of entries) {
    if (!EXECUTION_BUDGET_FIELDS.has(field as keyof ExecutionBudget)) {
      throw new Error(`Unknown execution budget field "${field}". Spawn blocked before provider work.`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Execution budget ${field} must be a non-negative finite number. Spawn blocked before provider work.`);
    }
  }
}

/** Budgeted work must fail before dispatch when the backend cannot meter live usage. */
export function assertLiveUsageBudgetSupport(
  budget: ExecutionBudget | undefined,
  support: LiveUsageBudgetSupport | undefined,
  executor: string,
  executionCostClass: 'remote' | 'local' = 'remote',
): void {
  assertExecutionBudgetShape(budget, executor, executionCostClass);
  if (executionCostClass === 'local' && budget === undefined) return;
  if (typeof budget?.maxUsd === 'number') {
    throw new Error(
      `Live USD budget enforcement requires an immutable pricing snapshot and incremental measured usage; executor "${executor}" does not provide that contract. Spawn blocked before provider work. Use measured token/cache/turn ceilings until live USD accrual is available.`,
    );
  }
  if (hasLiveUsageCeiling(budget) && support !== 'measured-stream') {
    throw new Error(
      `Live execution budget requires measured streaming usage; executor "${executor}" does not declare that capability. Spawn blocked before provider work.`,
    );
  }
}

function addCounters(
  target: LiveUsageCounters,
  counts: LiveUsageObservation['counts'],
): void {
  target.inputTokens += counts.inputTokens;
  target.outputTokens += counts.outputTokens;
  target.cacheReadTokens += counts.cacheReadTokens;
  target.cacheCreationTokens += counts.cacheCreationTokens;
  target.totalTokens = target.inputTokens + target.outputTokens
    + target.cacheReadTokens + target.cacheCreationTokens;
}

function snapshotDelta(
  counters: LiveUsageCounters,
  counts: LiveUsageObservation['counts'],
): LiveUsageObservation['counts'] {
  return {
    inputTokens: Math.max(0, counts.inputTokens - counters.inputTokens),
    outputTokens: Math.max(0, counts.outputTokens - counters.outputTokens),
    cacheReadTokens: Math.max(0, counts.cacheReadTokens - counters.cacheReadTokens),
    cacheCreationTokens: Math.max(0, counts.cacheCreationTokens - counters.cacheCreationTokens),
  };
}

/** Stateful, pure in-memory circuit breaker over host-observed provider events. */
export class LiveExecutionBudgetGuard {
  private readonly seen: Set<string>;
  private readonly counters: LiveUsageCounters;
  private measurableEvents: number;
  private incrementalUsageEvents: number;

  constructor(private readonly budget: ExecutionBudget, restored?: LiveUsageGuardState) {
    this.seen = new Set(restored?.seenDedupeKeys ?? []);
    this.counters = restored ? { ...restored.counters } : { ...ZERO_COUNTERS };
    this.measurableEvents = restored?.measurableEvents ?? 0;
    this.incrementalUsageEvents = restored?.incrementalUsageEvents ?? 0;
  }

  observe(event: StreamLogEvent): LiveBudgetDecision {
    const observation = extractLiveUsageObservation(event);
    if (!observation) return this.decision('unmeasurable');
    if (this.seen.has(observation.dedupeKey)) return this.decision('within-budget', observation);
    this.seen.add(observation.dedupeKey);
    this.measurableEvents += 1;
    if (observation.mode === 'incremental') this.incrementalUsageEvents += 1;

    const applied = observation.mode === 'cumulative'
      ? snapshotDelta(this.counters, observation.counts)
      : observation.counts;
    addCounters(this.counters, applied);
    if (observation.countsAsTurn) this.counters.turns += 1;
    if (observation.reportedTurns !== undefined) {
      this.counters.turns = Math.max(this.counters.turns, observation.reportedTurns);
    }
    if (observation.mode === 'incremental') {
      this.counters.maxContextTokens = Math.max(this.counters.maxContextTokens, observation.contextTokens);
    }
    return this.decision('within-budget', observation);
  }

  snapshot(): LiveBudgetDecision {
    return this.decision(this.measurableEvents > 0 ? 'within-budget' : 'unmeasurable');
  }

  exportState(): LiveUsageGuardState {
    return {
      version: 1,
      counters: { ...this.counters },
      seenDedupeKeys: [...this.seen],
      measurableEvents: this.measurableEvents,
      incrementalUsageEvents: this.incrementalUsageEvents,
    };
  }

  private decision(
    emptyState: LiveBudgetDecision['state'],
    observation?: LiveUsageObservation,
  ): LiveBudgetDecision {
    const reasons: string[] = [];
    const checks: Array<[number | undefined, number, string]> = [
      [this.budget.maxTurns, this.counters.turns, 'turn'],
      [this.budget.maxInputTokens, this.counters.inputTokens, 'input token'],
      [this.budget.maxOutputTokens, this.counters.outputTokens, 'output token'],
      [this.budget.maxCacheReadTokens, this.counters.cacheReadTokens, 'cache-read token'],
      [this.budget.maxCacheCreationTokens, this.counters.cacheCreationTokens, 'cache-creation token'],
      [this.budget.maxTokens, this.counters.totalTokens, 'aggregate token'],
      [this.budget.maxContextTokens, this.counters.maxContextTokens, 'per-call context token'],
    ];
    for (const [limit, actual, label] of checks) {
      if (typeof limit === 'number' && actual > limit) {
        reasons.push(`${label} budget exceeded (${actual} > ${limit})`);
      }
    }
    if (
      reasons.length === 0
      && typeof this.budget.maxContextTokens === 'number'
      && this.incrementalUsageEvents === 0
    ) {
      return {
        state: 'unmeasurable',
        reasons: ['per-call context token evidence unavailable from cumulative-only usage'],
        counters: { ...this.counters },
        ...(observation ? { observation } : {}),
      };
    }
    return {
      state: reasons.length > 0 ? 'exceeded' : emptyState,
      reasons,
      counters: { ...this.counters },
      ...(observation ? { observation } : {}),
    };
  }
}
