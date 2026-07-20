import { describe, expect, it } from 'vitest';

import {
  extractProviderBillingEvidence,
  reconcileProviderBilling,
} from '../../src/core/provider-billing-evidence.js';

describe('provider billing evidence', () => {
  it('captures the provider-final total and normalized per-model usage', () => {
    const raw = [
      'provider stderr noise',
      JSON.stringify({
        type: 'result',
        total_cost_usd: 19.57630525,
        modelUsage: {
          'claude-sonnet-5': {
            inputTokens: 9853,
            outputTokens: 100804,
            cacheReadInputTokens: 29598013,
            cacheCreationInputTokens: 352211,
            costUSD: 19.56969025,
            contextWindow: 200000,
          },
          'claude-haiku-4-5': { inputTokens: 100, outputTokens: 20, costUSD: 0.006615 },
        },
      }),
    ].join('\n');

    const evidence = extractProviderBillingEvidence('claude', raw, '2026-07-20T00:00:00.000Z');

    expect(evidence).toEqual({
      source: 'provider-envelope',
      provider: 'claude',
      currency: 'USD',
      providerReportedUsd: 19.57630525,
      capturedAt: '2026-07-20T00:00:00.000Z',
      modelUsage: {
        'claude-sonnet-5': {
          inputTokens: 9853,
          outputTokens: 100804,
          cacheReadTokens: 29598013,
          cacheCreationTokens: 352211,
          costUsd: 19.56969025,
          contextWindow: 200000,
        },
        'claude-haiku-4-5': { inputTokens: 100, outputTokens: 20, costUsd: 0.006615 },
      },
    });
  });

  it('keeps the last billed envelope and ignores usage-only events', () => {
    const raw = [
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 1 } }),
      JSON.stringify({ type: 'result', total_cost_usd: 2, modelUsage: {} }),
      JSON.stringify({ type: 'result', total_cost_usd: 3, modelUsage: {} }),
    ].join('\n');
    expect(extractProviderBillingEvidence('claude', raw)?.providerReportedUsd).toBe(3);
  });

  it('unwraps the canonical host-written usage LogEvent used by Docker capture', () => {
    const raw = [
      JSON.stringify({
        ts: '2026-07-20T08:20:32.168Z',
        seq: 1,
        type: 'tool_use',
        content: { total_cost_usd: 0.000001 },
      }),
      JSON.stringify({
        ts: '2026-07-20T08:20:32.194Z',
        seq: 909,
        type: 'usage',
        content: {
          type: 'result',
          total_cost_usd: 19.57630525,
          modelUsage: {
            'claude-sonnet-5': { costUSD: 19.56969025 },
          },
        },
      }),
    ].join('\n');

    const evidence = extractProviderBillingEvidence('claude', raw);
    expect(evidence?.providerReportedUsd).toBe(19.57630525);
    expect(evidence?.modelUsage['claude-sonnet-5']?.costUsd).toBe(19.56969025);
  });

  it('does not trust arbitrary nested billing-looking content', () => {
    expect(extractProviderBillingEvidence('claude', JSON.stringify({
      type: 'text',
      content: { total_cost_usd: 0.000001 },
    }))).toBeNull();
    expect(extractProviderBillingEvidence('claude', JSON.stringify({
      type: 'usage',
      content: { total_cost_usd: 0.000001 },
    }))).toBeNull();
  });

  it('marks the Sprint-455 local/provider gap as variance', () => {
    const evidence = extractProviderBillingEvidence(
      'claude', JSON.stringify({ type: 'result', total_cost_usd: 19.57630525 }),
    )!;
    const result = reconcileProviderBilling(evidence, 11.74181415);
    expect(result.state).toBe('variance');
    expect(result.relativeVariance).toBeGreaterThan(0.39);
    expect(result.threshold).toBe(0.15);
  });

  it('rejects malformed or negative provider totals', () => {
    expect(extractProviderBillingEvidence('claude', '{bad')).toBeNull();
    expect(extractProviderBillingEvidence('claude', JSON.stringify({ total_cost_usd: -1 }))).toBeNull();
  });
});
