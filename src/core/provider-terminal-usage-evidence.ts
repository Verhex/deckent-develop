import { createExecutionAuthorityError } from './errors.js';
import type { TokenUsage } from './token-usage.js';

export interface ProviderTerminalUsageEvidence {
  readonly source: 'provider-adapter';
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly totalTokens: number;
  readonly reasoningTokens?: number;
  readonly capturedAt: string;
}

function safeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function createProviderTerminalUsageEvidence(input: Readonly<{
  provider: string;
  model: string;
  usage: TokenUsage;
  capturedAt: string;
}>): ProviderTerminalUsageEvidence {
  if (!input.provider || !input.model || !Number.isFinite(Date.parse(input.capturedAt))) {
    throw createExecutionAuthorityError('Provider terminal usage identity is invalid');
  }
  if (input.usage.source !== 'provider-adapter') {
    throw createExecutionAuthorityError('Provider terminal usage requires provider-adapter evidence');
  }
  const counters = [
    input.usage.inputTokens,
    input.usage.outputTokens,
    input.usage.cacheReadTokens,
    input.usage.cacheCreationTokens,
    input.usage.totalTokens,
    ...(input.usage.reasoningTokens === undefined ? [] : [input.usage.reasoningTokens]),
  ];
  if (!counters.every(safeCount)) {
    throw createExecutionAuthorityError('Provider terminal usage counters must be safe non-negative integers');
  }
  if (input.usage.cacheWriteTokens !== undefined
    && (!safeCount(input.usage.cacheWriteTokens)
      || input.usage.cacheWriteTokens !== input.usage.cacheCreationTokens)) {
    throw createExecutionAuthorityError('Provider terminal usage cache identity is inconsistent');
  }
  const baseTotal = input.usage.inputTokens + input.usage.outputTokens;
  const cacheInclusiveTotal = baseTotal
    + input.usage.cacheReadTokens + input.usage.cacheCreationTokens;
  if (!Number.isSafeInteger(baseTotal) || !Number.isSafeInteger(cacheInclusiveTotal)
    || (input.usage.totalTokens !== baseTotal
      && input.usage.totalTokens !== cacheInclusiveTotal)) {
    throw createExecutionAuthorityError('Provider terminal usage totalTokens identity is inconsistent');
  }
  return Object.freeze({
    source: 'provider-adapter' as const,
    provider: input.provider,
    model: input.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    cacheCreationTokens: input.usage.cacheCreationTokens,
    totalTokens: input.usage.totalTokens,
    ...(input.usage.reasoningTokens === undefined
      ? {} : { reasoningTokens: input.usage.reasoningTokens }),
    capturedAt: input.capturedAt,
  });
}
