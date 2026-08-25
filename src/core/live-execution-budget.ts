import type { StreamLogEvent } from './log-event.js';
import type { ExecutionBudget } from './work-model.js';
import type { ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import {
  type AttendedExecutionApprovalAuthority,
  assertVerifiedAttendedExecutionApproval,
  type AttendedExecutionApprovalExpectedDispatch,
  type VerifiedAttendedExecutionApproval,
} from './attended-execution-approval.js';
import {
  assertExecutionLandingPolicyConfig,
  deriveExecutionLandingTurnAllocation,
} from './execution-budget-policy.js';
import { createExecutionAdmissionError } from './errors.js';

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
  state: 'within-budget' | 'landing-requested' | 'exceeded' | 'unmeasurable';
  reasons: string[];
  counters: LiveUsageCounters;
  observation?: LiveUsageObservation;
  /** Exact host-applied delta for this distinct observation; absent for duplicates/unmeasurable events. */
  appliedDelta?: LiveUsageObservation['counts'];
  /** Neutral evidence: consecutive distinct observations that applied cache-read tokens. */
  consecutiveCacheReadEvents: number;
}

export interface LiveUsageGuardStateV1 {
  version: 1;
  counters: LiveUsageCounters;
  seenDedupeKeys: string[];
  measurableEvents: number;
  incrementalUsageEvents: number;
}

export interface LiveUsageGuardStateV2 {
  version: 2;
  counters: LiveUsageCounters;
  seenDedupeKeys: string[];
  measurableEvents: number;
  incrementalUsageEvents: number;
  consecutiveCacheReadEvents: number;
  lastAppliedDelta?: LiveUsageObservation['counts'];
}

export type LiveUsageGuardState = LiveUsageGuardStateV1 | LiveUsageGuardStateV2;

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
  const rawInputTokens = firstCount(usage, 'input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokenCount', 'prompt_eval_count');
  const outputTokens = firstCount(usage, 'output_tokens', 'outputTokens', 'completion_tokens', 'candidatesTokenCount', 'eval_count');
  const cacheReadTokens = firstCount(
    usage,
    'cache_read_input_tokens',
    'cacheReadTokens',
    'cache_read_tokens',
    'cached_input_tokens',
    'cachedContentTokenCount',
  );
  const cacheCreationTokens = firstCount(usage, 'cache_creation_input_tokens', 'cacheCreationTokens', 'cache_write_tokens');
  // 7093 TOKEN-ACCOUNTING-TRUTH: `counts.inputTokens` is FRESH input — the
  // same provider-neutral contract normalizeUsage/codex-adapter enforce
  // (sprint-497 rule, codex.ts). OpenAI/codex schemas report input INCLUSIVE
  // of the cached subset (`cached_input_tokens` /
  // `prompt_tokens_details.cached_tokens` / Gemini `cachedContentTokenCount`
  // inside `promptTokenCount`), whereas Anthropic reports `input_tokens` and
  // `cache_read_input_tokens` as disjoint. Detection is SCHEMA-based, never
  // provider-name-based: only the inclusive-schema cache keys subtract.
  // Before this, the docker budget monitor fed raw inclusive input into the
  // host-runtime-budget counters, so the same result column meant fresh on
  // claude tasks and cache-inclusive on codex tasks (sprint-565 live case:
  // in=1,451,577 with cacheRead=1,336,064 → real fresh 115,513).
  const inclusiveCached = firstCount(usage, 'cached_input_tokens', 'cachedContentTokenCount')
    || count((asRecord(usage['prompt_tokens_details']) ?? {})['cached_tokens']);
  const inputTokens = inclusiveCached > 0
    ? Math.max(rawInputTokens - inclusiveCached, 0)
    : rawInputTokens;
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
  // New logs carry provider-neutral semantics derived once at the host
  // normalization boundary. Provider-field fallback keeps historical evidence
  // replayable without making those field names the live contract.
  const providerEventType = event.usageSemantics?.providerEventType
    ?? (typeof root.providerEventType === 'string'
      ? root.providerEventType
      : typeof root.codexEventType === 'string'
        ? root.codexEventType
        : rootType);
  const isAssistantMessage = rootType === 'assistant' && message !== null;
  const isCumulative = event.usageSemantics?.mode === 'cumulative'
    || rootType === 'result'
    || providerEventType === 'turn.completed'
    || providerEventType === 'response.completed';
  // A session id identifies many calls and is unsafe for incremental dedupe.
  // It is accepted only for the single cumulative/final session snapshot.
  // Codex's terminal turn.completed envelope has no call/session id. One
  // attempt emits one such cumulative envelope, so a stable provider/type/
  // counter tuple deduplicates live-follow and post-exit replay without
  // admitting arbitrary id-less usage objects as measured evidence.
  const terminalCounterKey = (
    event.usageSemantics?.terminal === true
    || providerEventType === 'turn.completed'
  )
    ? [
        event.usageSemantics?.provider ?? 'provider',
        providerEventType,
        counts.inputTokens,
        counts.outputTokens,
        counts.cacheReadTokens,
        counts.cacheCreationTokens,
      ].join(':')
    : null;
  const key = observationKey(root, message)
    ?? event.usageSemantics?.identity
    ?? (isCumulative && typeof root.session_id === 'string' ? root.session_id : null)
    ?? terminalCounterKey;
  if (!key) return null;
  const contextTokens = counts.inputTokens + counts.cacheReadTokens + counts.cacheCreationTokens;
  const reportsCompletedTurn = event.usageSemantics?.countsAsTurn === true
    || providerEventType === 'turn.completed';

  return {
    dedupeKey: `${isCumulative ? 'snapshot' : 'call'}:${key}`,
    mode: isCumulative ? 'cumulative' : 'incremental',
    counts,
    contextTokens,
    countsAsTurn: isAssistantMessage || !isCumulative || reportsCompletedTurn,
    ...(event.usageSemantics?.reportedTurns !== undefined
      ? { reportedTurns: event.usageSemantics.reportedTurns }
      : isCumulative && count(root.num_turns) > 0
        ? { reportedTurns: count(root.num_turns) }
        : {}),
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
export type ExecutionLandingCapability =
  | 'cooperative-landing'
  | 'checkpoint-stop'
  | 'unsupported';

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
    const error = createExecutionAdmissionError(
      `Live execution budget requires measured streaming usage; executor "${executor}" does not declare that capability. Spawn blocked before provider work.`,
    );
    Object.defineProperty(error, 'suggestion', {
      value: 'Set execution_budget.unmetered_backend.action to hold, or use Docker with a measured-stream-capable provider path.',
    });
    throw error;
  }
}

/**
 * ADR-G-037 final pre-dispatch landing gate. Metering and landing are separate
 * capabilities; an unattended remote call needs both. The attended hard-only
 * escape hatch is valid only with owner policy plus durable approval evidence.
 */
export function assertExecutionLandingSupport(input: {
  budget: ExecutionBudget | undefined;
  policy: ExecutionLandingPolicyConfig | undefined;
  mode: ExecutionAdmissionMode | undefined;
  capability: ExecutionLandingCapability | undefined;
  executor: string;
  /**
   * Legacy provenance only. A string reference never authorizes dispatch; the
   * verified grant below is the sole attended hard-stop authority.
   */
  approvalEvidenceRef?: string;
  approvalAuthority?: AttendedExecutionApprovalAuthority;
  approvalGrant?: VerifiedAttendedExecutionApproval;
  approvalExpectedDispatch?: AttendedExecutionApprovalExpectedDispatch;
  executionCostClass?: 'remote' | 'local';
}): VerifiedAttendedExecutionApproval | undefined {
  if (input.executionCostClass === 'local') return undefined;
  if (!hasLiveUsageCeiling(input.budget)) return undefined;
  const mode = input.mode ?? 'unattended';
  const capability = input.capability ?? 'unsupported';
  if (!input.policy) {
    throw createExecutionAdmissionError(
      `Execution landing policy is required for remote executor "${input.executor}". Spawn blocked before provider work.`,
    );
  }
  assertExecutionLandingPolicyConfig(input.policy, 'execution landing policy');
  if (capability !== 'unsupported') return undefined;
  if (
    mode === 'attended'
    && input.policy.attended_unsupported === 'allow-hard-stop'
  ) {
    if (!input.approvalExpectedDispatch) {
      throw createExecutionAdmissionError(
        `Attended remote executor "${input.executor}" requires an exact final dispatch binding. Spawn blocked before provider work.`,
      );
    }
    const grant = input.approvalGrant
      ?? (input.approvalAuthority && input.approvalEvidenceRef
        ? input.approvalAuthority.verifyAndClaim(
          input.approvalEvidenceRef,
          input.approvalExpectedDispatch,
        )
        : undefined);
    assertVerifiedAttendedExecutionApproval(grant, input.approvalExpectedDispatch);
    return grant;
  }
  throw createExecutionAdmissionError(
    mode === 'unattended'
      ? `Unattended remote executor "${input.executor}" does not support budget landing. Spawn blocked before provider work.`
      : `Attended remote executor "${input.executor}" requires explicit allow-hard-stop policy and approval evidence when budget landing is unsupported. Spawn blocked before provider work.`,
  );
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
  private consecutiveCacheReadEvents: number;
  private lastAppliedDelta: LiveUsageObservation['counts'] | undefined;

  constructor(
    private readonly budget: ExecutionBudget,
    restored?: LiveUsageGuardState,
    private readonly landingPolicy?: ExecutionLandingPolicyConfig,
  ) {
    this.seen = new Set(restored?.seenDedupeKeys ?? []);
    this.counters = restored ? { ...restored.counters } : { ...ZERO_COUNTERS };
    this.measurableEvents = restored?.measurableEvents ?? 0;
    this.incrementalUsageEvents = restored?.incrementalUsageEvents ?? 0;
    this.consecutiveCacheReadEvents = restored?.version === 2
      ? restored.consecutiveCacheReadEvents
      : 0;
    this.lastAppliedDelta = restored?.version === 2
      ? restored.lastAppliedDelta
      : undefined;
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
    this.lastAppliedDelta = { ...applied };
    this.consecutiveCacheReadEvents = applied.cacheReadTokens > 0
      ? this.consecutiveCacheReadEvents + 1
      : 0;
    addCounters(this.counters, applied);
    if (observation.countsAsTurn) this.counters.turns += 1;
    if (observation.reportedTurns !== undefined) {
      this.counters.turns = Math.max(this.counters.turns, observation.reportedTurns);
    }
    if (observation.mode === 'incremental') {
      this.counters.maxContextTokens = Math.max(this.counters.maxContextTokens, observation.contextTokens);
    }
    return this.decision('within-budget', observation, applied);
  }

  snapshot(): LiveBudgetDecision {
    return this.decision(this.measurableEvents > 0 ? 'within-budget' : 'unmeasurable');
  }

  exportState(): LiveUsageGuardState {
    return {
      version: 2,
      counters: { ...this.counters },
      seenDedupeKeys: [...this.seen],
      measurableEvents: this.measurableEvents,
      incrementalUsageEvents: this.incrementalUsageEvents,
      consecutiveCacheReadEvents: this.consecutiveCacheReadEvents,
      ...(this.lastAppliedDelta ? { lastAppliedDelta: { ...this.lastAppliedDelta } } : {}),
    };
  }

  private decision(
    emptyState: LiveBudgetDecision['state'],
    observation?: LiveUsageObservation,
    appliedDelta?: LiveUsageObservation['counts'],
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
    const landingReasons: string[] = [];
    if (reasons.length === 0 && this.landingPolicy) {
      const workRatio = 1 - this.landingPolicy.reserve_ratio;
      for (const [limit, actual, label] of checks) {
        if (typeof limit !== 'number') continue;
        const threshold = label === 'turn'
          ? deriveExecutionLandingTurnAllocation(
            limit,
            this.landingPolicy.reserve_ratio,
          ).workTurns
          : limit * workRatio;
        if (actual >= threshold) {
          landingReasons.push(
            `${label} landing threshold reached (${actual} >= ${threshold}; reserve_ratio=${this.landingPolicy.reserve_ratio})`,
          );
        }
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
        consecutiveCacheReadEvents: this.consecutiveCacheReadEvents,
        ...(observation ? { observation } : {}),
        ...(appliedDelta ? { appliedDelta: { ...appliedDelta } } : {}),
      };
    }
    if (emptyState === 'unmeasurable' && this.measurableEvents === 0) {
      return {
        state: 'unmeasurable',
        reasons: ['measured usage evidence unavailable'],
        counters: { ...this.counters },
        consecutiveCacheReadEvents: this.consecutiveCacheReadEvents,
        ...(observation ? { observation } : {}),
      };
    }
    return {
      state: reasons.length > 0
        ? 'exceeded'
        : landingReasons.length > 0
          ? 'landing-requested'
          : emptyState,
      reasons: reasons.length > 0 ? reasons : landingReasons,
      counters: { ...this.counters },
      consecutiveCacheReadEvents: this.consecutiveCacheReadEvents,
      ...(observation ? { observation } : {}),
      ...(appliedDelta ? { appliedDelta: { ...appliedDelta } } : {}),
    };
  }
}
