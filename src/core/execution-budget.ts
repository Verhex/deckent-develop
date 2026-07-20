import type { Task, TaskResult } from './task-types.js';
import type { LiveBudgetDecision } from './live-execution-budget.js';

export interface ExecutionBudgetVerdict {
  state: 'within-budget' | 'exceeded' | 'unknown';
  reasons: string[];
  consumedTokens: number | null;
  consumedUsd: number | null;
}

export interface RunCostBudgetVerdict {
  state: 'within-budget' | 'exceeded' | 'unknown';
  cumulativeUsd: number;
}

const MEASURED_USAGE_SOURCES = new Set([
  'provider-adapter',
  'session-store',
  'envelope',
  'cli-log',
]);

/** Budget enforcement accepts only provider/host-measured usage, never estimates or worker claims. */
export function isMeasuredUsageEvidence(source: string | undefined): boolean {
  return typeof source === 'string' && MEASURED_USAGE_SOURCES.has(source);
}

/** Pure sprint-level cost ceiling decision used by the live dispatch gate. */
export function evaluateRunCostBudget(input: {
  cumulativeUsd: number;
  nextCost?: TaskResult['cost'];
  nextUsage?: TaskResult['tokenUsage'];
  sprintBudgetUsd: number | null;
}): RunCostBudgetVerdict {
  const nextUsd = input.nextCost?.usd;
  const costEvidenceTrusted = !!input.nextCost
    && !input.nextCost.pricingSource.startsWith('unknown-model:')
    && typeof nextUsd === 'number'
    && Number.isFinite(nextUsd)
    && nextUsd >= 0
    && (input.nextCost.pricingSource === 'provider-envelope'
      || isMeasuredUsageEvidence(input.nextUsage?.source));
  const cumulativeUsd = input.cumulativeUsd + (costEvidenceTrusted ? nextUsd : 0);
  if (
    input.sprintBudgetUsd === null
    || !costEvidenceTrusted
  ) {
    return { state: 'unknown', cumulativeUsd };
  }
  return {
    state: cumulativeUsd > input.sprintBudgetUsd ? 'exceeded' : 'within-budget',
    cumulativeUsd,
  };
}

/**
 * Evaluate durable provider usage against a task's owner-supplied ceilings.
 * Cache read/write count toward maxTokens: they consume provider capacity and
 * are exactly the repeated-context load a token budget is meant to constrain.
 */
export function evaluateExecutionBudget(
  task: Pick<Task, 'budget'>,
  result: Pick<TaskResult, 'tokenUsage' | 'cost'>,
  terminalLiveDecision?: LiveBudgetDecision,
): ExecutionBudgetVerdict {
  const budget = task.budget;
  const hasAnyCeiling = !!budget && Object.values(budget).some(
    value => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );
  if (!budget || !hasAnyCeiling) {
    return { state: 'within-budget', reasons: [], consumedTokens: null, consumedUsd: null };
  }

  const usage = result.tokenUsage;
  const usageEvidenceMeasured = !!usage && isMeasuredUsageEvidence(usage.source);
  const consumedTokens = usageEvidenceMeasured
    ? usage.inputTokens + usage.outputTokens
      + (usage.cacheReadTokens ?? 0) + (usage.cacheCreationTokens ?? 0)
    : null;
  const costEvidenceUnknown = !result.cost
    || result.cost.pricingSource.startsWith('unknown-model:')
    || !Number.isFinite(result.cost.usd)
    || result.cost.usd < 0
    || (result.cost.pricingSource !== 'provider-envelope' && !usageEvidenceMeasured);
  const consumedUsd = costEvidenceUnknown ? null : result.cost!.usd;
  const reasons: string[] = [];
  let missingEvidence = false;
  let exceeded = false;

  if (budget.maxTokens !== undefined) {
    if (consumedTokens === null) {
      missingEvidence = true;
      reasons.push(`measured token usage unavailable (source=${usage?.source ?? 'missing'})`);
    }
    else if (consumedTokens > budget.maxTokens) {
      exceeded = true;
      reasons.push(`token budget exceeded (${consumedTokens} > ${budget.maxTokens})`);
    }
  }
  const measuredTokenChecks: Array<[number | undefined, number | null, string]> = [
    [budget.maxInputTokens, usageEvidenceMeasured ? usage!.inputTokens : null, 'input token'],
    [budget.maxOutputTokens, usageEvidenceMeasured ? usage!.outputTokens : null, 'output token'],
    [budget.maxCacheReadTokens, usageEvidenceMeasured ? (usage!.cacheReadTokens ?? 0) : null, 'cache-read token'],
    [budget.maxCacheCreationTokens, usageEvidenceMeasured ? (usage!.cacheCreationTokens ?? 0) : null, 'cache-creation token'],
  ];
  for (const [limit, actual, label] of measuredTokenChecks) {
    if (limit === undefined) continue;
    if (actual === null) {
      missingEvidence = true;
      reasons.push(`measured ${label} usage unavailable (source=${usage?.source ?? 'missing'})`);
    } else if (actual > limit) {
      exceeded = true;
      reasons.push(`${label} budget exceeded (${actual} > ${limit})`);
    }
  }
  // Aggregate result envelopes do not preserve distinct call count or peak
  // per-call context. Those ceilings are enforced by the live circuit breaker;
  // absent its durable summary, post-result evidence remains UNKNOWN.
  if (budget.maxTurns !== undefined) {
    if (!terminalLiveDecision || terminalLiveDecision.state === 'unmeasurable') {
      missingEvidence = true;
      reasons.push('measured turn-count summary unavailable in final result');
    } else if (terminalLiveDecision.counters.turns > budget.maxTurns) {
      exceeded = true;
      reasons.push(`turn budget exceeded (${terminalLiveDecision.counters.turns} > ${budget.maxTurns})`);
    }
  }
  if (budget.maxContextTokens !== undefined) {
    if (!terminalLiveDecision || terminalLiveDecision.state === 'unmeasurable') {
      missingEvidence = true;
      reasons.push('measured per-call context summary unavailable in final result');
    } else if (terminalLiveDecision.counters.maxContextTokens > budget.maxContextTokens) {
      exceeded = true;
      reasons.push(`per-call context token budget exceeded (${terminalLiveDecision.counters.maxContextTokens} > ${budget.maxContextTokens})`);
    }
  }
  if (budget.maxUsd !== undefined) {
    if (consumedUsd === null) {
      missingEvidence = true;
      reasons.push('authoritative cost evidence unavailable');
    }
    else if (consumedUsd > budget.maxUsd) {
      exceeded = true;
      reasons.push(`USD budget exceeded (${consumedUsd} > ${budget.maxUsd})`);
    }
  }

  return {
    state: exceeded ? 'exceeded' : (missingEvidence ? 'unknown' : 'within-budget'),
    reasons,
    consumedTokens,
    consumedUsd,
  };
}
