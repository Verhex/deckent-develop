import { createExecutionAuthorityError } from './errors.js';

/** Durable billing evidence captured from a provider's final response envelope. */
export interface ProviderModelBillingUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
  contextWindow?: number;
}

export interface ProviderBillingReconciliation {
  localEstimateUsd: number;
  providerReportedUsd: number;
  absoluteVarianceUsd: number;
  relativeVariance: number;
  threshold: number;
  state: 'matched' | 'variance';
}

export interface ProviderBillingEvidence {
  source: 'provider-envelope';
  provider: string;
  currency: 'USD';
  providerReportedUsd: number;
  modelUsage: Record<string, ProviderModelBillingUsage>;
  capturedAt: string;
  reconciliation?: ProviderBillingReconciliation;
  /** Exact host-owned execution lineage included in an aggregated total. */
  lineage?: {
    coverage: 'complete' | 'partial';
    attemptIds: string[];
    evidenceRefs: string[];
    missingAttemptIds?: string[];
  };
}

function nonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseCandidate(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Accept either a pristine provider envelope or the canonical host-written
 * LogEvent wrapper used by Docker/tmux capture. Only a real `usage` LogEvent
 * with the host stamps (`ts` + `seq`) may be unwrapped; arbitrary nested
 * `content.total_cost_usd` objects are not billing evidence.
 */
function billingEnvelope(candidate: unknown): Record<string, unknown> | null {
  const direct = asRecord(candidate);
  if (!direct) return null;
  if (nonNegative(direct.total_cost_usd) !== undefined) return direct;

  const isCanonicalUsageEvent = direct.type === 'usage'
    && typeof direct.ts === 'string'
    && typeof direct.seq === 'number'
    && Number.isInteger(direct.seq)
    && direct.seq > 0;
  if (!isCanonicalUsageEvent) return null;

  const content = asRecord(direct.content);
  return content && nonNegative(content.total_cost_usd) !== undefined ? content : null;
}

function normalizeModelUsage(value: unknown): Record<string, ProviderModelBillingUsage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: Record<string, ProviderModelBillingUsage> = {};
  for (const [model, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const usage: ProviderModelBillingUsage = {};
    const inputTokens = nonNegative(entry.inputTokens);
    const outputTokens = nonNegative(entry.outputTokens);
    const cacheReadTokens = nonNegative(entry.cacheReadTokens)
      ?? nonNegative(entry.cacheReadInputTokens);
    const cacheCreationTokens = nonNegative(entry.cacheCreationTokens)
      ?? nonNegative(entry.cacheCreationInputTokens);
    const costUsd = nonNegative(entry.costUSD) ?? nonNegative(entry.costUsd);
    const contextWindow = nonNegative(entry.contextWindow);
    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
    if (cacheReadTokens !== undefined) usage.cacheReadTokens = cacheReadTokens;
    if (cacheCreationTokens !== undefined) usage.cacheCreationTokens = cacheCreationTokens;
    if (costUsd !== undefined) usage.costUsd = costUsd;
    if (contextWindow !== undefined) usage.contextWindow = contextWindow;
    if (Object.keys(usage).length > 0) normalized[model] = usage;
  }
  return normalized;
}

/**
 * Extract the last provider envelope carrying an authoritative billed total.
 * Raw output may be one pretty JSON object or mixed stdout/stderr JSONL.
 */
export function extractProviderBillingEvidence(
  provider: string,
  rawOutput: string,
  capturedAt: string = new Date().toISOString(),
): ProviderBillingEvidence | null {
  if (typeof rawOutput !== 'string' || rawOutput.trim().length === 0) return null;
  const candidates: unknown[] = [];
  const whole = parseCandidate(rawOutput.trim());
  if (whole !== undefined) candidates.push(whole);
  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    const parsed = parseCandidate(trimmed);
    if (parsed !== undefined) candidates.push(parsed);
  }

  let found: ProviderBillingEvidence | null = null;
  for (const candidate of candidates) {
    const envelope = billingEnvelope(candidate);
    if (!envelope) continue;
    const total = nonNegative(envelope.total_cost_usd);
    if (total === undefined) continue;
    found = {
      source: 'provider-envelope',
      provider,
      currency: 'USD',
      providerReportedUsd: total,
      modelUsage: normalizeModelUsage(envelope.modelUsage),
      capturedAt,
    };
  }
  return found;
}

/** Aggregate exact-attempt provider envelopes without repricing or estimation. */
export function aggregateProviderBillingEvidence(
  attempts: readonly {
    attemptId: string;
    evidenceRef: string;
    billing: ProviderBillingEvidence;
  }[],
  capturedAt: string = new Date().toISOString(),
): ProviderBillingEvidence {
  if (attempts.length === 0) {
    throw createExecutionAuthorityError('Provider billing aggregation requires at least one exact attempt');
  }
  const [first] = attempts;
  const seenAttemptIds = new Set<string>();
  const provider = first!.billing.provider;
  const currency = first!.billing.currency;
  let providerReportedUsd = 0;
  const modelUsage: Record<string, ProviderModelBillingUsage> = {};

  for (const attempt of attempts) {
    if (!attempt.attemptId || !attempt.evidenceRef) {
      throw createExecutionAuthorityError('Provider billing aggregation requires attempt and evidence identities');
    }
    if (seenAttemptIds.has(attempt.attemptId)) {
      throw createExecutionAuthorityError(`Duplicate provider billing attempt: ${attempt.attemptId}`);
    }
    seenAttemptIds.add(attempt.attemptId);
    if (attempt.billing.provider !== provider || attempt.billing.currency !== currency) {
      throw createExecutionAuthorityError('Provider billing aggregation cannot cross provider or currency authority');
    }
    providerReportedUsd += attempt.billing.providerReportedUsd;
    for (const [model, usage] of Object.entries(attempt.billing.modelUsage)) {
      const current = modelUsage[model] ?? {};
      const next: ProviderModelBillingUsage = {};
      for (const field of [
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheCreationTokens',
        'costUsd',
      ] as const) {
        const value = usage[field];
        const previous = current[field];
        if (value !== undefined || previous !== undefined) {
          next[field] = (previous ?? 0) + (value ?? 0);
        }
      }
      const contextWindow = usage.contextWindow;
      const previousContextWindow = current.contextWindow;
      if (contextWindow !== undefined || previousContextWindow !== undefined) {
        next.contextWindow = Math.max(previousContextWindow ?? 0, contextWindow ?? 0);
      }
      modelUsage[model] = next;
    }
  }

  return {
    source: 'provider-envelope',
    provider,
    currency,
    providerReportedUsd,
    modelUsage,
    capturedAt,
    lineage: {
      coverage: 'complete',
      attemptIds: attempts.map(attempt => attempt.attemptId),
      evidenceRefs: attempts.map(attempt => attempt.evidenceRef),
    },
  };
}

export function reconcileProviderBilling(
  evidence: ProviderBillingEvidence,
  localEstimateUsd: number,
  threshold = 0.15,
): ProviderBillingReconciliation {
  const local = Number.isFinite(localEstimateUsd) && localEstimateUsd >= 0 ? localEstimateUsd : 0;
  const absoluteVarianceUsd = Math.abs(evidence.providerReportedUsd - local);
  const relativeVariance = evidence.providerReportedUsd === 0
    ? (local === 0 ? 0 : 1)
    : absoluteVarianceUsd / evidence.providerReportedUsd;
  return {
    localEstimateUsd: local,
    providerReportedUsd: evidence.providerReportedUsd,
    absoluteVarianceUsd,
    relativeVariance,
    threshold,
    state: relativeVariance > threshold ? 'variance' : 'matched',
  };
}
